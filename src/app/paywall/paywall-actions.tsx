"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PaywallActions() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [couponState, setCouponState] = useState<
    { kind: "idle" | "pending" | "success" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setCouponState({ kind: "pending" });
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        setCouponState({ kind: "success" });
        router.push("/");
        router.refresh();
        return;
      }
      const message =
        data.error === "already_redeemed"
          ? "This coupon was already redeemed on your account."
          : data.error === "invalid_code"
            ? "That coupon code isn't valid. Check for typos and try again."
            : "Something went wrong redeeming the coupon. Please try again.";
      setCouponState({ kind: "error", message });
    } catch {
      setCouponState({
        kind: "error",
        message: "Network error — check your connection and try again.",
      });
    }
  }

  async function pay() {
    setPayPending(true);
    setPayError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setPayError(
        data.error === "stripe_not_configured"
          ? "Payments aren't configured yet — use the coupon instead."
          : "Could not start checkout. Please try again."
      );
    } catch {
      setPayError("Network error — check your connection and try again.");
    }
    setPayPending(false);
  }

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {/* Coupon */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">Redeem a coupon</h2>
        <p className="mt-1 text-sm text-muted">
          Have an access code? Enter it here.
        </p>
        <form onSubmit={redeem} className="mt-4 flex flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="COUPON_CODE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm uppercase placeholder:normal-case placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
          <button
            disabled={couponState.kind === "pending" || !code.trim()}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {couponState.kind === "pending" ? "Redeeming…" : "Redeem — get 5 credits"}
          </button>
        </form>
        {couponState.kind === "error" && (
          <p className="mt-3 text-sm text-danger">{couponState.message}</p>
        )}
        {couponState.kind === "success" && (
          <p className="mt-3 text-sm text-success">
            5 credits added — taking you in…
          </p>
        )}
      </div>

      {/* Stripe */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-medium">Pay with card</h2>
        <p className="mt-1 text-sm text-muted">
          $5 one-time via Stripe checkout.
        </p>
        <button
          onClick={pay}
          disabled={payPending}
          className="mt-4 w-full rounded-lg border border-accent/60 bg-accent-soft px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {payPending ? "Opening checkout…" : "Pay $5 — get 5 credits"}
        </button>
        {payError && <p className="mt-3 text-sm text-danger">{payError}</p>}
        <p className="mt-3 text-xs text-muted">
          Test mode — no real money moves. Use card{" "}
          <span className="font-mono text-foreground/80">
            4242 4242 4242 4242
          </span>
          , any future expiry, any CVC.
        </p>
      </div>
    </div>
  );
}
