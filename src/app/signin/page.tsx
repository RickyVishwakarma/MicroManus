import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OAuthButtons } from "./oauth-buttons";
import { Logo } from "@/components/logo";
import { Particles } from "@/components/ui/particles";

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
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4">
      <Particles
        color="#8b7cf6"
        quantity={140}
        ease={30}
        className="absolute inset-0 -z-10"
      />
      {/* soft radial glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

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

        <div className="rounded-2xl border border-line bg-surface/80 p-6 shadow-xl backdrop-blur-sm">
          <OAuthButtons />
          <p className="mt-5 text-center text-xs text-muted">
            New accounts start at the paywall — a coupon or a $5 test payment
            unlocks 5 credits. You bring your own LLM key to chat.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted/70">
          Google or GitHub sign-in only. No passwords, no email lists.
        </p>
      </div>
    </div>
  );
}
