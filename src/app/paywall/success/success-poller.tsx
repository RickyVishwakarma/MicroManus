"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function SuccessPoller() {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "granted" | "slow">("waiting");
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    const startedAt = Date.now();

    async function tick() {
      if (stop.current) return;
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.balance > 0) {
            setState("granted");
            setTimeout(() => {
              router.push("/");
              router.refresh();
            }, 1200);
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      if (Date.now() - startedAt > 30_000) setState("slow");
      setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stop.current = true;
    };
  }, [router]);

  if (state === "granted") {
    return (
      <div className="text-center">
        <div className="text-3xl">✓</div>
        <h1 className="mt-2 text-xl font-semibold">Payment received</h1>
        <p className="mt-1 text-sm text-muted">
          5 credits added — taking you in…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <h1 className="mt-4 text-xl font-semibold">Confirming your payment…</h1>
      <p className="mt-2 text-sm text-muted">
        Stripe is notifying us in the background. This usually takes a few
        seconds.
      </p>
      {state === "slow" && (
        <p className="mt-4 text-sm text-warning">
          Taking longer than usual. Your payment went through — credits will
          appear as soon as the confirmation lands. You can{" "}
          <Link href="/" className="underline">
            head to the app
          </Link>{" "}
          and refresh in a minute.
        </p>
      )}
    </div>
  );
}
