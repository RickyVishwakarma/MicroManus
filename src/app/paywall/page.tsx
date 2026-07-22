import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";
import { Header } from "@/components/header";
import { PaywallActions } from "./paywall-actions";

export default async function PaywallPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const balance = await getBalance(createAdminClient(), user.id);
  const { canceled } = await searchParams;

  return (
    <>
      <Header email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          {balance > 0 ? "Top up credits" : "Unlock MicroManus"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Each research run costs 1 credit. Redeem a coupon or pay $5 — either
          way you get <span className="text-foreground">5 credits</span>.
        </p>

        {balance > 0 && (
          <div className="mt-4 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm">
            You have {balance} credit{balance === 1 ? "" : "s"} —{" "}
            <Link href="/" className="font-medium text-success underline">
              continue to the app →
            </Link>
          </div>
        )}

        {canceled && (
          <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            Checkout was cancelled — no charge was made. You can try again
            below or use a coupon instead.
          </div>
        )}

        <PaywallActions />
      </main>
    </>
  );
}
