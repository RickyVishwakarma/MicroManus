import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";

/**
 * Onboarding state machine. Every user lands here and is routed to the one
 * step they actually need:
 *   no session   → /signin
 *   0 credits    → /paywall
 *   no API key   → /setup-key
 *   otherwise    → /chat
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const [balance, keyRow] = await Promise.all([
    getBalance(admin, user.id),
    admin
      .from("api_keys")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (balance <= 0) redirect("/paywall");
  if (!keyRow.data) redirect("/setup-key");
  redirect("/chat");
}
