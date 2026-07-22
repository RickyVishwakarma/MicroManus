import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay counterpart of the Stripe webhook: credits are granted HERE and
 * only here, after HMAC signature verification. The unique
 * (user_id, source_ref) index makes webhook retries idempotent.
 * Subscribe this endpoint to the `order.paid` event.
 */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    console.error("razorpay webhook signature mismatch");
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { order?: { entity?: { id?: string; notes?: { user_id?: string } } } };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (event.event === "order.paid") {
    const order = event.payload?.order?.entity;
    const userId = order?.notes?.user_id;
    if (order?.id && userId) {
      const admin = createAdminClient();
      const insert = await admin.from("credit_grants").insert({
        user_id: userId,
        amount: 5,
        source: "razorpay",
        source_ref: order.id,
      });
      if (insert.error && insert.error.code !== "23505") {
        console.error("razorpay grant failed:", insert.error);
        return NextResponse.json({ error: "grant_failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
