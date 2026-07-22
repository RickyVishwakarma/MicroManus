import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSidebarData } from "@/lib/sidebar-data";
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

  const { balance, threads } = await getSidebarData(
    createAdminClient(),
    user.id
  );

  return (
    <ChatShell email={user.email ?? ""} balance={balance} threads={threads}>
      {children}
    </ChatShell>
  );
}
