import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

/**
 * Gateway-agnostic checkout: uses Stripe when STRIPE_SECRET_KEY is set,
 * otherwise Razorpay when RAZORPAY_KEY_ID/SECRET are set. Both paths end in
 * the same webhook-driven credit_grants insert.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });

  if (process.env.STRIPE_SECRET_KEY) {
    return stripeCheckout(user.id, user.email ?? undefined, site);
  }
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return razorpayOrder(user.id, user.email ?? undefined);
  }
  return NextResponse.json({ error: "not_configured" }, { status: 503 });
}

async function stripeCheckout(
  userId: string,
  email: string | undefined,
  site: string
) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "MicroManus — 5 research credits",
              description: "5 agent runs on your account",
            },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      metadata: { user_id: userId },
      customer_email: email,
      success_url: `${site}/paywall/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/paywall?canceled=1`,
    });
    return NextResponse.json({ gateway: "stripe", url: session.url });
  } catch (err) {
    console.error("stripe checkout failed:", err);
    return NextResponse.json({ error: "gateway_error" }, { status: 502 });
  }
}

async function razorpayOrder(userId: string, email: string | undefined) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID!;
    const auth = Buffer.from(
      `${keyId}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: 42500, // ₹425 in paise ≈ $5
        currency: "INR",
        receipt: `mm_${Date.now()}`,
        notes: { user_id: userId },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("razorpay order failed:", res.status, await res.text());
      return NextResponse.json({ error: "gateway_error" }, { status: 502 });
    }
    const order = await res.json();
    return NextResponse.json({
      gateway: "razorpay",
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      email: email ?? "",
    });
  } catch (err) {
    console.error("razorpay order failed:", err);
    return NextResponse.json({ error: "gateway_error" }, { status: 502 });
  }
}
