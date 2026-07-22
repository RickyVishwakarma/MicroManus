import type { SupabaseClient } from "@supabase/supabase-js";
import { getBalance } from "./credits";

export interface ThreadRow {
  id: string;
  title: string;
  updated_at: string;
}

/** Everything the persistent sidebar (ChatShell) needs. */
export async function getSidebarData(
  admin: SupabaseClient,
  userId: string
): Promise<{ balance: number; threads: ThreadRow[] }> {
  const [balance, threads] = await Promise.all([
    getBalance(admin, userId),
    admin
      .from("threads")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  return { balance, threads: (threads.data ?? []) as ThreadRow[] };
}
