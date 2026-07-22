import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";
import { ChatClient, type ChatMessage } from "@/components/chat-client";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { id } = await params;
  const admin = createAdminClient();

  const thread = await admin
    .from("threads")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!thread.data || thread.data.user_id !== user.id) notFound();

  const [messages, balance, keyRow] = await Promise.all([
    admin
      .from("messages")
      .select("id, role, content")
      .eq("thread_id", id)
      .order("created_at", { ascending: true }),
    getBalance(admin, user.id),
    admin.from("api_keys").select("model").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <ChatClient
      threadId={id}
      initialMessages={(messages.data ?? []) as ChatMessage[]}
      balance={balance}
      model={keyRow.data?.model ?? null}
    />
  );
}
