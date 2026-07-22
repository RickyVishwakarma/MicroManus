import Link from "next/link";
import { Logo } from "./logo";

export function Header({ email }: { email: string }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo className="h-7 w-7" />
          MicroManus
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/chat"
            className="text-sm text-muted transition hover:text-foreground"
          >
            Chat
          </Link>
          <Link
            href="/usage"
            className="text-sm text-muted transition hover:text-foreground"
          >
            Usage
          </Link>
          <span className="hidden text-sm text-muted sm:inline">{email}</span>
          <form action="/auth/signout" method="post">
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
