import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const secret = process.env.STRIPE_SECRET_KEY;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site)
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });

  try {
    const stripe = new Stripe(secret);
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
      metadata: { user_id: user.id },
      customer_email: user.email ?? undefined,
      success_url: `${site}/paywall/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/paywall?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout session failed:", err);
    return NextResponse.json({ error: "stripe_error" }, { status: 502 });
  }
}
