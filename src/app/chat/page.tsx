import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <Header email={user.email ?? "signed in"} />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">You&apos;re signed in ✓</h1>
          <p className="mt-2 text-sm text-muted">
            Signed in as {user.email}. The research agent is being wired up —
            this placeholder is replaced in Phase 3.
          </p>
        </div>
      </main>
    </>
  );
}
