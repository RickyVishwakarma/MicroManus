import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { SuccessPoller } from "./success-poller";

/**
 * Credits are granted only by the Stripe webhook, so this page just waits
 * for the balance to appear. It also copes with the user closing the
 * checkout tab — the webhook fires regardless.
 */
export default async function PaywallSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <Header email={user.email ?? ""} />
      <main className="flex flex-1 items-center justify-center px-4">
        <SuccessPoller />
      </main>
    </>
  );
}
