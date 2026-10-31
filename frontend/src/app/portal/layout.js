import { PortalHeader } from '@/components/shell/PortalHeader';
import { requirePermission } from '@/lib/auth/guards';

// This guard only protects the shell. Every page and action still does its own check.
export default async function PortalLayout({ children }) {
  const user = await requirePermission('portal.view');
  return (
    <div className="min-h-dvh">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
