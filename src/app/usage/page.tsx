import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCost } from "@/lib/models";
import { Header } from "@/components/header";

interface Row {
  threadId: string;
  title: string;
  models: Set<string>;
  input: number;
  output: number;
  cached: number;
  costInput: number;
  costOutput: number;
  costCache: number;
  total: number;
  calls: number;
}

const usd = (n: number) =>
  n < 0.005 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const num = (n: number) => n.toLocaleString("en-US");

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const [events, threads] = await Promise.all([
    admin
      .from("usage_events")
      .select("thread_id, model, input_tokens, output_tokens, cached_tokens")
      .eq("user_id", user.id),
    admin.from("threads").select("id, title, updated_at").eq("user_id", user.id),
  ]);

  const titles = new Map(
    (threads.data ?? []).map((t) => [t.id, t.title as string])
  );
  const order = (threads.data ?? [])
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((t) => t.id);

  const byThread = new Map<string, Row>();
  for (const e of events.data ?? []) {
    let row = byThread.get(e.thread_id);
    if (!row) {
      row = {
        threadId: e.thread_id,
        title: titles.get(e.thread_id) ?? "Deleted chat",
        models: new Set(),
        input: 0,
        output: 0,
        cached: 0,
        costInput: 0,
        costOutput: 0,
        costCache: 0,
        total: 0,
        calls: 0,
      };
      byThread.set(e.thread_id, row);
    }
    const cost = computeCost(
      e.model,
      e.input_tokens,
      e.output_tokens,
      e.cached_tokens
    );
    row.models.add(e.model);
    row.input += e.input_tokens;
    row.output += e.output_tokens;
    row.cached += e.cached_tokens;
    row.costInput += cost.input;
    row.costOutput += cost.output;
    row.costCache += cost.cache;
    row.total += cost.total;
    row.calls += 1;
  }

  const rows = [...byThread.values()].sort(
    (a, b) => order.indexOf(a.threadId) - order.indexOf(b.threadId)
  );
  const grand = rows.reduce(
    (acc, r) => ({
      input: acc.input + r.input,
      output: acc.output + r.output,
      cached: acc.cached + r.cached,
      costInput: acc.costInput + r.costInput,
      costOutput: acc.costOutput + r.costOutput,
      costCache: acc.costCache + r.costCache,
      total: acc.total + r.total,
    }),
    { input: 0, output: 0, cached: 0, costInput: 0, costOutput: 0, costCache: 0, total: 0 }
  );

  return (
    <>
      <Header email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Usage & costs
            </h1>
            <p className="mt-2 text-sm text-muted">
              LLM spend per chat on your own key, split by token class and
              priced at your model&apos;s published per-million-token rates.
            </p>
          </div>
          <Link
            href="/chat"
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
          >
            ← Back to chat
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-xl border border-line bg-surface px-6 py-12 text-center">
            <p className="font-medium">No usage yet</p>
            <p className="mt-1 text-sm text-muted">
              Run your first research chat and its cost breakdown will appear
              here.
            </p>
            <Link
              href="/chat"
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Start a chat
            </Link>
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Total spend", value: usd(grand.total) },
                { label: "Input tokens", value: num(grand.input), sub: usd(grand.costInput) },
                { label: "Output tokens", value: num(grand.output), sub: usd(grand.costOutput) },
                { label: "Cached tokens", value: num(grand.cached), sub: usd(grand.costCache) },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <p className="text-xs text-muted">{c.label}</p>
                  <p className="mt-1 text-lg font-semibold">{c.value}</p>
                  {c.sub && <p className="text-xs text-muted">{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Per-chat table */}
            <div className="mt-6 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Chat</th>
                    <th className="px-3 py-3 font-medium">Model</th>
                    <th className="px-3 py-3 text-right font-medium">Calls</th>
                    <th className="px-3 py-3 text-right font-medium">Input</th>
                    <th className="px-3 py-3 text-right font-medium">Cached</th>
                    <th className="px-3 py-3 text-right font-medium">Output</th>
                    <th className="px-3 py-3 text-right font-medium">
                      In / Cache / Out cost
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.threadId}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="max-w-[220px] truncate px-4 py-3">
                        <Link
                          href={`/chat/${r.threadId}`}
                          className="hover:underline"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {[...r.models].join(", ")}
                      </td>
                      <td className="px-3 py-3 text-right text-muted">
                        {r.calls}
                      </td>
                      <td className="px-3 py-3 text-right">{num(r.input)}</td>
                      <td className="px-3 py-3 text-right">{num(r.cached)}</td>
                      <td className="px-3 py-3 text-right">{num(r.output)}</td>
                      <td className="px-3 py-3 text-right text-muted">
                        {usd(r.costInput)} / {usd(r.costCache)} /{" "}
                        {usd(r.costOutput)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {usd(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Input counts include cached tokens; the cached share is priced at
              the cache-read rate and the remainder at the input rate. Cached
              tokens appear once your conversation prefix is long enough for
              the provider&apos;s cache to engage.
            </p>
          </>
        )}
      </main>
    </>
  );
}
