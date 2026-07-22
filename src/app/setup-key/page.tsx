import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/header";
import { KeyForm } from "./key-form";

export default async function SetupKeyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const existing = await admin
    .from("api_keys")
    .select("provider, model, key_hint")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <Header email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect your model
        </h1>
        <p className="mt-2 text-sm text-muted">
          MicroManus never ships with an LLM key — the agent runs on{" "}
          <span className="text-foreground">your own key</span>, stored
          encrypted (AES-256-GCM) and never shown again. Usage is billed by
          your provider at their rates; the usage page breaks it down per chat.
        </p>
        {existing.data && (
          <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            Currently connected:{" "}
            <span className="text-foreground">{existing.data.model}</span> (key
            ending ····{existing.data.key_hint}). Saving below replaces it.
          </div>
        )}
        <KeyForm hasExisting={Boolean(existing.data)} />
      </main>
    </>
  );
}
