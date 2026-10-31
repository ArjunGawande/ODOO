import { LinkButton } from '@/components/ui/LinkButton';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">This page doesn&apos;t exist or may have moved.</p>
        <LinkButton href="/" className="mt-6">
          Go home
        </LinkButton>
      </div>
    </main>
  );
}
