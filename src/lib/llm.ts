import type { Provider } from "./models";

/**
 * One client, two wire formats. OpenAI and Moonshot speak
 * /chat/completions. Anthropic is called via its NATIVE /v1/messages API:
 * its OpenAI-compat layer does not support prompt caching and always returns
 * an empty usage.prompt_tokens_details, which would break both the caching
 * requirement and the cached-token cost split. The native path gives us
 * cache_control breakpoints and real cache_read_input_tokens.
 */

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface LLMMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: LLMToolCall[]; // assistant only
  toolCallId?: string; // tool only
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMUsage {
  /** Total prompt tokens INCLUDING cached ones. */
  input: number;
  output: number;
  /** Prompt tokens served from cache (billed at cache-read rate). */
  cached: number;
}

export interface LLMResult {
  text: string;
  toolCalls: LLMToolCall[];
  usage: LLMUsage;
}

export type LLMErrorKind =
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "model_not_found"
  | "provider"
  | "network";

export class LLMError extends Error {
  kind: LLMErrorKind;
  status?: number;
  constructor(message: string, kind: LLMErrorKind, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface LLMConfig {
  provider: Provider;
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
  model: string;
}

export interface CallOptions {
  system: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  /** When false, tools are withheld so the model must answer in text. */
  allowTools?: boolean;
  maxTokens?: number;
}

const CALL_TIMEOUT_MS = 120_000;

export async function callModel(
  cfg: LLMConfig,
  opts: CallOptions
): Promise<LLMResult> {
  if (cfg.provider === "anthropic") return callAnthropic(cfg, opts);
  return callOpenAICompatible(cfg, opts);
}

/** Cheap live check used when the user saves a key. Throws LLMError. */
export async function validateKey(cfg: LLMConfig): Promise<void> {
  await callModel(cfg, {
    system: "Reply with the single word OK.",
    messages: [{ role: "user", content: "Say OK" }],
    maxTokens: 8,
  });
}

// ─── OpenAI / Moonshot ────────────────────────────────────────────────────────

async function callOpenAICompatible(
  cfg: LLMConfig,
  opts: CallOptions
): Promise<LLMResult> {
  const useTools = (opts.allowTools ?? true) && (opts.tools?.length ?? 0) > 0;

  const messages: Record<string, unknown>[] = [
    { role: "system", content: opts.system },
  ];
  for (const m of opts.messages) {
    if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: tc.arguments },
              })),
            }
          : {}),
      });
    } else if (m.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    } else {
      messages.push({ role: "user", content: m.content });
    }
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (useTools) {
    body.tools = opts.tools!.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const data = await postJson(
    `${trimSlash(cfg.baseUrl)}/chat/completions`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    body
  );

  const choice = data.choices?.[0];
  const msg = choice?.message ?? {};
  const usage = data.usage ?? {};
  const cached =
    usage.prompt_tokens_details?.cached_tokens ?? // OpenAI
    usage.cached_tokens ?? // Moonshot
    usage.prompt_cache_hit_tokens ?? // DeepSeek-style, defensive
    0;

  return {
    text: typeof msg.content === "string" ? msg.content : "",
    toolCalls: (msg.tool_calls ?? []).map(
      (tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? "{}",
      })
    ),
    usage: {
      input: usage.prompt_tokens ?? 0, // includes cached tokens
      output: usage.completion_tokens ?? 0,
      cached,
    },
  };
}

// ─── Anthropic native ─────────────────────────────────────────────────────────

type AnthropicBlock = Record<string, unknown>;

async function callAnthropic(
  cfg: LLMConfig,
  opts: CallOptions
): Promise<LLMResult> {
  const useTools = (opts.allowTools ?? true) && (opts.tools?.length ?? 0) > 0;

  const messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[] =
    [];
  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };

  for (const m of opts.messages) {
    if (m.role === "user") {
      push("user", [{ type: "text", text: m.content }]);
    } else if (m.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: safeParse(tc.arguments),
        });
      }
      if (blocks.length) push("assistant", blocks);
    } else {
      // tool result → user turn; consecutive results merge into one turn
      push("user", [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: m.content,
        },
      ]);
    }
  }

  // Cache breakpoints: system prompt + end of conversation, so each loop
  // iteration / follow-up turn re-reads the whole prefix from cache.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg) {
    const lastBlock = lastMsg.content[lastMsg.content.length - 1];
    lastBlock.cache_control = { type: "ephemeral" };
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: [
      {
        type: "text",
        text: opts.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  };
  if (useTools) {
    body.tools = opts.tools!.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const data = await postJson(
    `${trimSlash(cfg.baseUrl)}/messages`,
    { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body
  );

  let text = "";
  const toolCalls: LLMToolCall[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use")
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      });
  }

  const u = data.usage ?? {};
  const cached = u.cache_read_input_tokens ?? 0;
  // Anthropic's input_tokens EXCLUDES cache reads/writes; normalize to the
  // "input includes cached" convention the cost registry expects.
  const input =
    (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + cached;

  return {
    text,
    toolCalls,
    usage: { input, output: u.output_tokens ?? 0, cached },
  };
}

// ─── shared plumbing ──────────────────────────────────────────────────────────

// Transient statuses worth one automatic retry — provider overload/rate spikes
// (common on free tiers) usually clear within a second or two.
const RETRYABLE = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 2;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let lastErr: LLMError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      lastErr = new LLMError(
        timedOut
          ? "The provider took too long to respond."
          : "Could not reach the provider — check the base URL.",
        "network"
      );
      if (attempt < MAX_RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw lastErr;
    }

    if (res.ok) return res.json();

    let detail = "";
    try {
      const j = await res.json();
      detail = j.error?.message ?? j.message ?? JSON.stringify(j).slice(0, 200);
    } catch {
      detail = await res
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => "");
    }

    if (res.status === 401 || res.status === 403)
      throw new LLMError("The provider rejected this API key.", "auth", res.status);
    if (res.status === 404)
      throw new LLMError(
        `That model isn't available on this key: ${detail}`,
        "model_not_found",
        404
      );

    if (res.status === 429)
      lastErr = new LLMError(
        "The provider is rate-limiting this key. Please try again in a moment.",
        "rate_limit",
        429
      );
    else if (res.status === 503 || res.status === 529 || res.status === 500 || res.status === 502)
      lastErr = new LLMError(
        "The model provider is temporarily overloaded. Please try again in a moment.",
        "overloaded",
        res.status
      );
    else
      lastErr = new LLMError(
        `The provider returned an error (${res.status}). ${detail}`.trim(),
        "provider",
        res.status
      );

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(backoff(attempt));
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new LLMError("The provider request failed.", "provider");
}

function backoff(attempt: number): number {
  return 1200 * (attempt + 1) + Math.random() * 400; // ~1.2s, ~2.4s
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}
