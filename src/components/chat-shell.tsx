"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "./logo";

interface ThreadRow {
  id: string;
  title: string;
  updated_at: string;
}

export function ChatShell({
  email,
  balance,
  threads,
  children,
}: {
  email: string;
  balance: number;
  threads: ThreadRow[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  // Persist the desktop collapse choice across page navigations (ChatShell
  // remounts per page, so state alone wouldn't survive).
  useEffect(() => {
    setCollapsed(localStorage.getItem("mm_sidebar_collapsed") === "1");
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("mm_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-4">
        <Logo className="h-7 w-7" />
        <span className="font-semibold">MicroManus</span>
        <button
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          className="ml-auto hidden rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-foreground md:block"
        >
          <PanelLeftClose className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3">
        <Link
          href="/chat"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          + New chat
        </Link>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3">
        <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Chats
        </p>
        {threads.length === 0 && (
          <p className="px-1 py-2 text-sm text-muted">
            No chats yet — ask your first research question.
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/chat/${t.id}`}
                onClick={() => setOpen(false)}
                className={`block truncate rounded-lg px-2.5 py-2 text-sm transition ${
                  activeId === t.id
                    ? "bg-accent-soft text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line p-3 text-sm">
        <Link
          href="/paywall"
          onClick={() => setOpen(false)}
          className="group mb-1 flex items-center justify-between rounded-lg px-2 py-2 transition hover:bg-surface-2"
        >
          <span className="flex items-center gap-2">
            <span className="text-muted group-hover:text-foreground">
              Credits
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                balance > 0
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
              }`}
            >
              {balance}
            </span>
          </span>
          <span className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white transition group-hover:bg-accent-hover">
            + Buy credits
          </span>
        </Link>
        <Link
          href="/usage"
          onClick={() => setOpen(false)}
          className="block rounded-lg px-2 py-1.5 text-muted transition hover:text-foreground"
        >
          Usage & costs
        </Link>
        <Link
          href="/setup-key"
          onClick={() => setOpen(false)}
          className="block rounded-lg px-2 py-1.5 text-muted transition hover:text-foreground"
        >
          API key settings
        </Link>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-lg px-2 py-1.5 text-left text-muted transition hover:text-foreground">
            Sign out
          </button>
        </form>
        <p className="truncate px-2 pt-1 text-xs text-muted/70">{email}</p>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-dvh overflow-hidden">
      {/* Desktop sidebar (collapsible) */}
      {!collapsed && <aside className="hidden md:block">{sidebar}</aside>}

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 z-50">{sidebar}</aside>
        </div>
      )}

      {/* Desktop: floating button to reveal a collapsed sidebar */}
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          aria-label="Open sidebar"
          className="absolute left-3 top-3 z-30 hidden items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-muted shadow-sm transition hover:text-foreground md:flex"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-line px-3 py-2.5 md:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          >
            ☰
          </button>
          <Logo className="h-6 w-6" />
          <span className="font-semibold">MicroManus</span>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
              balance > 0
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger"
            }`}
          >
            {balance} cr
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
