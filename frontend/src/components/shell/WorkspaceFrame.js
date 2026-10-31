'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { logoutAction } from '@/actions/session';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { cx } from '@/components/ui/cx';

import { Brand } from './Brand';

function isCurrent(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function UserBlock({ user }) {
  return (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium text-ink-inverse" title={user.name}>
        {user.name}
      </p>
      <p className="truncate text-xs text-sidebar-ink" title={user.email}>
        {user.email}
      </p>
      <form action={logoutAction} className="mt-3">
        <SubmitButton
          pendingText="Logging out..."
          variant="ghost"
          size="sm"
          className="w-full border-white/20 text-sidebar-ink hover:bg-sidebar-active hover:text-ink-inverse"
        >
          Log out
        </SubmitButton>
      </form>
    </div>
  );
}

/**
 * The sidebar is fixed on desktop and a slide-in drawer on phones, opened from the
 * top bar. `items` is already filtered by permission on the server.
 */
export function WorkspaceFrame({ items, user, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link href="/dashboard" aria-label="Brightloop dashboard">
          <Brand />
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="workspace-sidebar"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-10 items-center justify-center rounded-md border border-line-strong bg-surface text-ink"
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
          </svg>
        </button>
      </div>

      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        id="workspace-sidebar"
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-64 max-w-[85vw] flex-col bg-sidebar lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-dvh lg:w-60 lg:shrink-0',
          open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" onClick={() => setOpen(false)} aria-label="Brightloop dashboard">
            <Brand inverse />
          </Link>
        </div>
        <nav aria-label="Workspace" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cx(
                  'block rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-ink-inverse',
                  current
                    ? 'bg-sidebar-active text-ink-inverse'
                    : 'text-sidebar-ink hover:bg-sidebar-active hover:text-ink-inverse',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <UserBlock user={user} />
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
