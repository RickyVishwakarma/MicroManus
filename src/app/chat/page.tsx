import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";
import { ChatClient } from "@/components/chat-client";

export default async function NewChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const [balance, keyRow] = await Promise.all([
    getBalance(admin, user.id),
    admin.from("api_keys").select("model").eq("user_id", user.id).maybeSingle(),
  ]);
  if (balance <= 0) redirect("/paywall");
  if (!keyRow.data) redirect("/setup-key");

  return (
    <ChatClient
      threadId={null}
      initialMessages={[]}
      balance={balance}
      model={keyRow.data.model}
    />
  );
}
