"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "github";

const GoogleIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
    />
  </svg>
);

const GitHubIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.82 1.11.82 2.23 0 1.61-.02 2.9-.02 3.3 0 .32.22.7.83.58C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0Z" />
  </svg>
);

export function OAuthButtons() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(null);
      setError("Could not start sign-in. Please try again.");
    }
    // On success the browser navigates away to the provider.
  }

  const base =
    "flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm font-medium transition hover:bg-line/60 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-3">
      <button
        className={base}
        onClick={() => signIn("google")}
        disabled={pending !== null}
      >
        {GoogleIcon}
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button
        className={base}
        onClick={() => signIn("github")}
        disabled={pending !== null}
      >
        {GitHubIcon}
        {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
