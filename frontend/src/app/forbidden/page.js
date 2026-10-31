import { LinkButton } from '@/components/ui/LinkButton';

export const metadata = { title: 'No access' };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">You don&apos;t have access</h1>
        <p className="mt-2 text-ink-muted">
          Your account doesn&apos;t have permission to view this page.
        </p>
        <LinkButton href="/" className="mt-6">
          Go home
        </LinkButton>
      </div>
    </main>
  );
}
