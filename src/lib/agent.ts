import type { SupabaseClient } from "@supabase/supabase-js";
import { callModel, LLMError, type LLMConfig, type LLMMessage, type LLMTool } from "./llm";
import { webSearch } from "./tavily";
import { createPdfReport } from "./pdf";

/**
 * ReAct loop: think → tool call → observe → think again. Hard-capped at
 * MAX_ITERATIONS model calls; every call writes a usage_events row BEFORE
 * the next one so crashed runs still bill correctly.
 */
export const MAX_ITERATIONS = 8;
const SOFT_DEADLINE_MS = 240_000; // leave headroom under the route's maxDuration

export interface AgentStep {
  type: "search" | "pdf";
  query?: string; // search
  results?: { title: string; url: string }[]; // search
  name?: string; // pdf
  url?: string; // pdf
}

export interface AgentEvent {
  type: "status" | "step" | "iteration" | "usage";
  text?: string;
  step?: AgentStep;
  n?: number;
}

export interface AgentOutcome {
  text: string;
  steps: AgentStep[];
  /** Set when the loop was cut (iteration cap / deadline). */
  cut?: "iterations" | "deadline";
}

const SYSTEM_PROMPT = `You are MicroManus, a deep-research agent. You work in a loop: think about what information you need, call tools to get it, read the results, and repeat until you can give a complete, well-grounded answer.

Rules:
- For questions about current events, facts you are unsure of, or anything where recency matters, use web_search before answering. Run multiple searches with different queries when a topic has several facets.
- Ground your answers in the search results and cite sources inline as markdown links, e.g. (source: [LA Times](https://...)). Do not fabricate URLs — only cite URLs that appeared in search results.
- When the user asks for a report, a document, or a PDF — or when a long research answer would work better as a document — call create_pdf with a well-structured markdown report (title, sections with ## headings, bullet points, a sources section listing the URLs you cited). After the tool returns, tell the user the report is ready and include the download link it returned as a markdown link.
- For simple conversational messages, just answer directly without tools.
- Keep final answers focused and readable: short paragraphs, headings and bullets where they help.
- You cannot run code, browse interactively, or access anything other than the tools provided.`;

const TOOLS: LLMTool[] = [
  {
    name: "web_search",
    description:
      "Search the web. Returns the top results with title, URL and a content snippet. Use different queries to cover different facets of a topic.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_pdf",
    description:
      "Render a polished PDF report from markdown and get back a download URL. Supports # / ## headings, - bullets, paragraphs, [text](url) links. Use when the user wants a report or document.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Report title" },
        markdown: {
          type: "string",
          description: "Full report body in markdown",
        },
      },
      required: ["title", "markdown"],
    },
  },
];

export async function runAgent(opts: {
  admin: SupabaseClient;
  userId: string;
  threadId: string;
  llm: LLMConfig;
  history: LLMMessage[]; // prior turns, ending with the new user message
  emit: (event: AgentEvent) => void;
}): Promise<AgentOutcome> {
  const { admin, userId, threadId, llm, emit } = opts;
  const messages: LLMMessage[] = [...opts.history];
  const steps: AgentStep[] = [];
  const startedAt = Date.now();

  // Stable date suffix (no timestamps — they would poison the prompt cache).
  const system = `${SYSTEM_PROMPT}\n\nCurrent date: ${new Date().toISOString().slice(0, 10)}`;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const overDeadline = Date.now() - startedAt > SOFT_DEADLINE_MS;
    const lastCall = i === MAX_ITERATIONS - 1 || overDeadline;

    emit({ type: "iteration", n: i + 1 });
    emit({ type: "status", text: i === 0 ? "Thinking…" : "Analyzing results…" });

    if (lastCall && i > 0) {
      messages.push({
        role: "user",
        content:
          "[system notice] Tool budget is exhausted. Write your best final answer now from what you have gathered. Do not call tools.",
      });
    }

    const result = await callModel(llm, {
      system,
      messages,
      tools: TOOLS,
      allowTools: !lastCall,
      // Generous: reasoning models (Gemini 2.5, Kimi thinking) spend part of
      // the output budget on internal thinking before the visible answer.
      maxTokens: 8192,
    });

    // Bill BEFORE doing anything else with the result.
    const usageInsert = await admin.from("usage_events").insert({
      user_id: userId,
      thread_id: threadId,
      model: llm.model,
      input_tokens: result.usage.input,
      output_tokens: result.usage.output,
      cached_tokens: result.usage.cached,
    });
    if (usageInsert.error)
      console.error("usage_events insert failed:", usageInsert.error);
    emit({ type: "usage" }); // signals the route that this run has billed work

    if (result.toolCalls.length === 0) {
      return {
        text: result.text || "I wasn't able to produce an answer.",
        steps,
        cut: overDeadline ? "deadline" : undefined,
      };
    }

    messages.push({
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const output = await executeTool(call.name, call.arguments, {
        userId,
        threadId,
        steps,
        emit,
      });
      messages.push({ role: "tool", toolCallId: call.id, content: output });
    }
  }

  // Should be unreachable (last iteration forbids tools), but never hang.
  return {
    text: "The research run hit its step limit before finishing. Here is what was gathered — ask a follow-up to continue.",
    steps,
    cut: "iterations",
  };
}

async function executeTool(
  name: string,
  args: string,
  ctx: {
    userId: string;
    threadId: string;
    steps: AgentStep[];
    emit: (e: AgentEvent) => void;
  }
): Promise<string> {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(args || "{}");
  } catch {
    return "Error: tool arguments were not valid JSON.";
  }

  try {
    if (name === "web_search") {
      const query = String(input.query ?? "");
      ctx.emit({ type: "status", text: `Searching: ${query}` });
      const results = await webSearch(query);
      const step: AgentStep = {
        type: "search",
        query,
        results: results.map((r) => ({ title: r.title, url: r.url })),
      };
      ctx.steps.push(step);
      ctx.emit({ type: "step", step });
      if (results.length === 0) return "No results found for this query.";
      return results
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
        .join("\n\n");
    }

    if (name === "create_pdf") {
      const title = String(input.title ?? "Report");
      ctx.emit({ type: "status", text: `Building PDF: ${title}` });
      const pdf = await createPdfReport({
        userId: ctx.userId,
        threadId: ctx.threadId,
        title,
        markdown: String(input.markdown ?? ""),
      });
      const step: AgentStep = { type: "pdf", name: pdf.name, url: pdf.url };
      ctx.steps.push(step);
      ctx.emit({ type: "step", step });
      return `PDF created successfully. Download URL: ${pdf.url}\nInclude this link in your answer as [${pdf.name}](${pdf.url}).`;
    }

    return `Error: unknown tool "${name}".`;
  } catch (err) {
    // Tool failures go back to the model so it can adapt; provider failures
    // (LLMError) are NOT caught here — they abort the run upstream.
    if (err instanceof LLMError) throw err;
    const msg = err instanceof Error ? err.message : "unknown error";
    return `Error: ${msg}`;
  }
}
