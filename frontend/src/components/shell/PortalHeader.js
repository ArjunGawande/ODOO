import Link from 'next/link';

import { logoutAction } from '@/actions/session';
import { SubmitButton } from '@/components/ui/SubmitButton';

import { Brand } from './Brand';

export function PortalHeader({ user }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/portal" aria-label="Brightloop portal home">
          <Brand />
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden min-w-0 truncate text-sm text-ink-muted sm:block" title={user.email}>
            {user.name}
          </span>
          <form action={logoutAction}>
            <SubmitButton pendingText="Logging out..." variant="secondary" size="sm">
              Log out
            </SubmitButton>
          </form>
        </div>
      </div>
    </header>
  );
}
