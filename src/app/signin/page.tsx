import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OAuthButtons } from "./oauth-buttons";
import { Logo } from "@/components/logo";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight">MicroManus</h1>
          <p className="mt-2 text-sm text-muted">
            A deep-research agent that browses the web, reasons in a loop, and
            writes reports — with transparent usage-based billing.
          </p>
        </div>

        {error === "auth" && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            Sign-in didn&apos;t complete — the provider handshake failed or was
            cancelled. Please try again.
          </div>
        )}

        <OAuthButtons />

        <p className="mt-6 text-center text-xs text-muted">
          Sign in with Google or GitHub to get started. New accounts start at
          the paywall — a coupon or a $5 test payment unlocks 5 credits.
        </p>
      </div>
    </main>
  );
}
