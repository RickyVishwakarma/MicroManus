import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import { runAgent } from "@/lib/agent";
import { LLMError, type LLMMessage } from "@/lib/llm";
import type { Provider } from "@/lib/models";

export const maxDuration = 300; // agent runs stream for minutes

const bodySchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
});

interface MessageContent {
  text: string;
  steps?: unknown[];
  error?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = createAdminClient();

  // 1 credit = 1 agent run, checked and spent server-side before anything runs.
  const [balance, keyRow] = await Promise.all([
    getBalance(admin, user.id),
    admin.from("api_keys").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!keyRow.data)
    return NextResponse.json({ error: "no_key" }, { status: 409 });
  if (balance < 1)
    return NextResponse.json({ error: "no_credits" }, { status: 402 });

  // Resolve or create the thread.
  let threadId = parsed.data.threadId ?? null;
  if (threadId) {
    const thread = await admin
      .from("threads")
      .select("id, user_id")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread.data || thread.data.user_id !== user.id)
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  } else {
    const title =
      parsed.data.message.slice(0, 60) +
      (parsed.data.message.length > 60 ? "…" : "");
    const created = await admin
      .from("threads")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (created.error)
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    threadId = created.data.id;
  }

  // Load prior turns for context (text only — tool transcripts are not replayed).
  const prior = await admin
    .from("messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  const history: LLMMessage[] = (prior.data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: (m.content as MessageContent).text ?? "",
  }));
  history.push({ role: "user", content: parsed.data.message });

  // Persist the user message and spend the credit before the run starts.
  await admin.from("messages").insert({
    thread_id: threadId,
    user_id: user.id,
    role: "user",
    content: { text: parsed.data.message } satisfies MessageContent,
  });
  const spend = await admin
    .from("credit_spends")
    .insert({ user_id: user.id, thread_id: threadId, amount: 1 })
    .select("id")
    .single();
  if (spend.error)
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  const spendId = spend.data.id;

  const llm = {
    provider: keyRow.data.provider as Provider,
    baseUrl: keyRow.data.base_url as string,
    model: keyRow.data.model as string,
    apiKey: "",
  };
  try {
    llm.apiKey = decrypt(keyRow.data.encrypted_key);
  } catch {
    await admin.from("credit_spends").delete().eq("id", spendId); // refund
    return NextResponse.json({ error: "key_corrupt" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client went away — the run continues; billing already happened
        }
      };

      send({ type: "thread", id: threadId });

      let billedWork = false;
      try {
        const outcome = await runAgent({
          admin,
          userId: user.id,
          threadId: threadId!,
          llm,
          history,
          emit: (e) => {
            if (e.type === "usage") {
              billedWork = true;
              return; // internal signal, not for the client
            }
            send(e as unknown as Record<string, unknown>);
          },
        });

        const content: MessageContent = {
          text: outcome.text,
          steps: outcome.steps,
          ...(outcome.cut ? { error: `cut_${outcome.cut}` } : {}),
        };
        await admin.from("messages").insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content,
        });
        await admin
          .from("threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId!);

        const newBalance = await getBalance(admin, user.id);
        send({
          type: "assistant",
          text: outcome.text,
          steps: outcome.steps,
          cut: outcome.cut ?? null,
        });
        send({ type: "done", balance: newBalance });
      } catch (err) {
        // Provider failure. If nothing was billed this run, refund the credit.
        let refunded = false;
        if (!billedWork) {
          await admin.from("credit_spends").delete().eq("id", spendId);
          refunded = true;
        }

        const message =
          err instanceof LLMError
            ? err.message
            : "The run failed unexpectedly.";
        const kind = err instanceof LLMError ? err.kind : "server";

        await admin.from("messages").insert({
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: {
            text: refunded
              ? `The run could not start: ${message} Your credit was not used.`
              : `The run failed partway: ${message}`,
            error: kind,
          } satisfies MessageContent,
        });

        send({ type: "error", kind, message, refunded });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
