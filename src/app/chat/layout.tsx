import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";
import { ChatShell } from "@/components/chat-shell";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const [balance, threads] = await Promise.all([
    getBalance(admin, user.id),
    admin
      .from("threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <ChatShell
      email={user.email ?? ""}
      balance={balance}
      threads={threads.data ?? []}
    >
      {children}
    </ChatShell>
  );
}
