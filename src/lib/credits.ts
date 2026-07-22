import type { SupabaseClient } from "@supabase/supabase-js";

/** Balance = sum(grants) − sum(spends). Never a mutable counter. */
export async function getBalance(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const [grants, spends] = await Promise.all([
    admin.from("credit_grants").select("amount").eq("user_id", userId),
    admin.from("credit_spends").select("amount").eq("user_id", userId),
  ]);
  if (grants.error) throw grants.error;
  if (spends.error) throw spends.error;
  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + r.amount, 0);
  return sum(grants.data) - sum(spends.data);
}
