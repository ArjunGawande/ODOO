import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth/guards';
import { homeForRole } from '@backend/lib/auth/permissions';

import { LoginForm } from './LoginForm';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }) {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  const { reset } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Log in</h1>
      <p className="mb-5 text-sm text-ink-muted">Welcome back to Brightloop.</p>
      {reset === '1' ? (
        <Alert tone="success" className="mb-4">
          Your password has been set. You can log in now.
        </Alert>
      ) : null}
      <LoginForm />
      <p className="mt-5 text-center text-sm text-ink-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
