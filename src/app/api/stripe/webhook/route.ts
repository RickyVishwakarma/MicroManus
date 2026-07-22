import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Credits are granted HERE and only here — never from the success redirect.
 * The unique (user_id, source_ref) index makes webhook retries idempotent.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whsec)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const stripe = new Stripe(secret);
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature ?? "",
      whsec
    );
  } catch (err) {
    console.error("webhook signature verification failed:", err);
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    if (session.payment_status === "paid" && userId) {
      const admin = createAdminClient();
      const insert = await admin.from("credit_grants").insert({
        user_id: userId,
        amount: 5,
        source: "stripe",
        source_ref: session.id,
      });
      if (insert.error && insert.error.code !== "23505") {
        console.error("stripe grant failed:", insert.error);
        // Non-200 → Stripe retries → idempotent via unique index.
        return NextResponse.json({ error: "grant_failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
