import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/credits";

/** Balance + key summary for client polling (paywall success page, header). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const admin = createAdminClient();
  const [balance, keyRow] = await Promise.all([
    getBalance(admin, user.id),
    admin
      .from("api_keys")
      .select("provider, model, key_hint")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    balance,
    key: keyRow.data
      ? {
          provider: keyRow.data.provider,
          model: keyRow.data.model,
          hint: keyRow.data.key_hint,
        }
      : null,
  });
}
