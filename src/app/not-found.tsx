import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto h-10 w-10 opacity-60" />
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          This page doesn&apos;t exist — or the chat belongs to a different
          account.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          Back to the app
        </Link>
      </div>
    </main>
  );
}
