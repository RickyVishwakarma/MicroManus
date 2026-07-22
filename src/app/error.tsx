"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto h-10 w-10 opacity-60" />
        <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred. Nothing was lost — your chats and
          credits are safe.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:text-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
