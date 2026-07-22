"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Markdown } from "./markdown";

export interface ChatStep {
  type: "search" | "pdf";
  query?: string;
  results?: { title: string; url: string }[];
  name?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: { text: string; steps?: ChatStep[]; error?: string };
}

interface RunState {
  status: string;
  steps: ChatStep[];
  iteration: number;
}

export function ChatClient({
  threadId,
  initialMessages,
  balance,
  model,
}: {
  threadId: string | null;
  initialMessages: ChatMessage[];
  balance: number;
  model: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [run, setRun] = useState<RunState | null>(null);
  const [fatal, setFatal] = useState<{ kind: string; message: string } | null>(
    null
  );
  const [liveBalance, setLiveBalance] = useState(balance);
  const currentThread = useRef<string | null>(threadId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, run]);

  async function send() {
    const text = input.trim();
    if (!text || run) return;
    setInput("");
    setFatal(null);
    setMessages((m) => [
      ...m,
      { id: `local-${Date.now()}`, role: "user", content: { text } },
    ]);
    setRun({ status: "Starting…", steps: [], iteration: 0 });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: currentThread.current, message: text }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setRun(null);
        if (data.error === "no_credits") {
          router.push("/paywall");
          return;
        }
        if (data.error === "no_key") {
          router.push("/setup-key");
          return;
        }
        setFatal({
          kind: data.error ?? "server",
          message:
            data.error === "thread_not_found"
              ? "This chat no longer exists."
              : "The request failed. Please try again.",
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          handleEvent(event);
          if (event.type === "done" || event.type === "error") finished = true;
        }
      }

      if (!finished) {
        // Stream cut without a terminal event (proxy timeout, network drop).
        setRun(null);
        setFatal({
          kind: "stream_cut",
          message:
            "The connection dropped before the run finished. Reload the page — if the run completed server-side, the answer will be there.",
        });
      }
    } catch {
      setRun(null);
      setFatal({
        kind: "network",
        message: "Network error — check your connection and try again.",
      });
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "thread":
        currentThread.current = event.id as string;
        break;
      case "iteration":
        setRun((r) => (r ? { ...r, iteration: event.n as number } : r));
        break;
      case "status":
        setRun((r) => (r ? { ...r, status: event.text as string } : r));
        break;
      case "step":
        setRun((r) =>
          r ? { ...r, steps: [...r.steps, event.step as ChatStep] } : r
        );
        break;
      case "assistant":
        setMessages((m) => [
          ...m,
          {
            id: `local-a-${Date.now()}`,
            role: "assistant",
            content: {
              text: event.text as string,
              steps: (event.steps as ChatStep[]) ?? [],
              ...(event.cut ? { error: `cut_${event.cut}` } : {}),
            },
          },
        ]);
        break;
      case "done":
        setRun(null);
        setLiveBalance(event.balance as number);
        if (threadId === null && currentThread.current) {
          router.replace(`/chat/${currentThread.current}`);
        }
        router.refresh();
        break;
      case "error": {
        setRun(null);
        const kind = event.kind as string;
        setMessages((m) => [
          ...m,
          {
            id: `local-e-${Date.now()}`,
            role: "assistant",
            content: {
              text: event.message as string,
              error: kind,
            },
          },
        ]);
        if (event.refunded) {
          setFatal({
            kind,
            message:
              kind === "auth"
                ? "Your API key was rejected by the provider — update it and try again. Your credit was not used."
                : "The run could not start, so your credit was not used.",
          });
        }
        router.refresh();
        break;
      }
    }
  }

  const empty = messages.length === 0 && !run;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {empty && (
            <div className="mt-16 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                What should I research?
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                I search the web in a loop, cite sources, and can deliver the
                result as a downloadable PDF report. 1 credit per run
                {model ? (
                  <>
                    {" "}
                    · running on{" "}
                    <span className="text-foreground">{model}</span>
                  </>
                ) : null}
                .
              </p>
              <div className="mx-auto mt-6 flex max-w-lg flex-col gap-2">
                {[
                  "Create a report explaining the recent forest fires in California, what causes them and what can be done to avoid it",
                  "What happened in AI this week? Summarize with sources.",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-6">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {run && <RunView run={run} />}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {fatal && (
            <div className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">
              {fatal.message}{" "}
              {fatal.kind === "auth" && (
                <Link href="/setup-key" className="underline">
                  Update key →
                </Link>
              )}
            </div>
          )}
          {liveBalance <= 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="text-muted">
                You&apos;re out of credits — top up to keep researching.
              </span>
              <Link
                href="/paywall"
                className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white transition hover:bg-accent-hover"
              >
                Get credits
              </Link>
            </div>
          ) : (
            <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2 focus-within:border-accent/60">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={Math.min(6, Math.max(1, input.split("\n").length))}
                placeholder={
                  run ? "Agent is working…" : "Ask a research question…"
                }
                disabled={Boolean(run)}
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/60 disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={Boolean(run) || !input.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {run ? "…" : "Send"}
              </button>
            </div>
          )}
          <p className="mt-1.5 text-center text-xs text-muted/70">
            1 credit per run · {liveBalance} left
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-white">
          {message.content.text}
        </div>
      </div>
    );
  }

  const { text, steps, error } = message.content;
  const isProviderError =
    error && !error.startsWith("cut_") && error !== "assistant";

  return (
    <div className="flex flex-col gap-3">
      {steps && steps.length > 0 && <StepsView steps={steps} />}
      <div
        className={`rounded-2xl rounded-bl-md border px-4 py-3 text-sm ${
          isProviderError
            ? "border-danger/30 bg-danger-soft"
            : "border-line bg-surface"
        }`}
      >
        <Markdown text={text} />
        {error === "cut_deadline" && (
          <p className="mt-3 border-t border-line pt-2 text-xs text-warning">
            ⚠ This run hit the time limit and was wrapped up early.
          </p>
        )}
        {error === "cut_iterations" && (
          <p className="mt-3 border-t border-line pt-2 text-xs text-warning">
            ⚠ This run hit its step limit and was wrapped up early.
          </p>
        )}
      </div>
    </div>
  );
}

function StepsView({ steps }: { steps: ChatStep[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s, i) =>
        s.type === "search" ? (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs"
          >
            <span className="text-muted">Searched:</span>{" "}
            <span className="text-foreground">{s.query}</span>
            {s.results && s.results.length > 0 && (
              <span className="text-muted">
                {" "}
                ·{" "}
                {s.results.slice(0, 3).map((r, j) => (
                  <a
                    key={j}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {hostname(r.url)}
                    {j < Math.min(s.results!.length, 3) - 1 ? ", " : ""}
                  </a>
                ))}
              </span>
            )}
          </div>
        ) : (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm transition hover:border-accent"
          >
            <span className="text-lg">📄</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="text-xs text-muted">
                PDF report — click to download
              </span>
            </span>
          </a>
        )
      )}
    </div>
  );
}

function RunView({ run }: { run: RunState }) {
  return (
    <div className="flex flex-col gap-3">
      {run.steps.length > 0 && <StepsView steps={run.steps} />}
      <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span>{run.status}</span>
        {run.iteration > 0 && (
          <span className="ml-auto text-xs text-muted/70">
            step {run.iteration}/8
          </span>
        )}
      </div>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
