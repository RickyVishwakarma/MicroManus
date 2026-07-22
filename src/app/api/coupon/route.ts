import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";

const COUPON = "SID_DRDROID";
const bodySchema = z.object({ code: z.string().min(1).max(100) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const code = parsed.data.code.trim().toUpperCase();
  if (code !== COUPON)
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const admin = createAdminClient();
  const insert = await admin.from("credit_grants").insert({
    user_id: user.id,
    amount: 5,
    source: "coupon",
    source_ref: COUPON,
  });

  if (insert.error) {
    if (insert.error.code === "23505")
      return NextResponse.json({ error: "already_redeemed" }, { status: 409 });
    console.error("coupon grant failed:", insert.error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const balance = await getBalance(admin, user.id);
  return NextResponse.json({ ok: true, balance });
}
