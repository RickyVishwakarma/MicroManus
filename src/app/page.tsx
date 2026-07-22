import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Onboarding state machine. Every user lands here and is routed to the one
 * step they actually need:
 *   no session        → /signin
 *   0 credits         → /paywall        (Phase 2)
 *   no API key        → /setup-key      (Phase 3)
 *   otherwise         → /chat
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  // Phase 2 will insert the credit-balance check here, Phase 3 the key check.
  redirect("/chat");
}
