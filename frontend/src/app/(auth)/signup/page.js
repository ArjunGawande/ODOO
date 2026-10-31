import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/guards';
import { homeForRole } from '@backend/lib/auth/permissions';
import { PASSWORD_RULE } from '@backend/lib/validation/auth';

import { SignupForm } from './SignupForm';

export const metadata = { title: 'Create an account' };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Create an account</h1>
      <p className="mb-5 text-sm text-ink-muted">
        See your subscriptions and invoices in one place.
      </p>
      <SignupForm passwordRule={PASSWORD_RULE} />
      <p className="mt-5 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
