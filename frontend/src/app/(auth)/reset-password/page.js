import Link from 'next/link';

import { LinkButton } from '@/components/ui';
import { PASSWORD_RULE } from '@backend/lib/validation/auth';
import { inspectToken } from '@backend/services/password-reset';

import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata = { title: 'Set your password' };

const COPY = {
  reset: {
    title: 'Choose a new password',
    intro: 'This will log you out on all your devices.',
    submit: 'Save new password',
  },
  invite: {
    title: 'Set your password',
    intro: 'Welcome to Brightloop. Choose a password to finish setting up your account.',
    submit: 'Set password',
  },
};

export default async function ResetPasswordPage({ searchParams }) {
  const { token } = await searchParams;
  // A repeated ?token= arrives as an array.
  const rawToken = typeof token === 'string' ? token : '';
  const found = await inspectToken(rawToken);

  if (!found) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold text-ink">This link can&apos;t be used</h1>
        <p className="mb-5 text-sm text-ink-muted">
          It may have expired, been used already, or been replaced by a newer link.
          Request a new one and use the latest email.
        </p>
        <LinkButton href="/forgot-password" className="w-full">
          Request a new link
        </LinkButton>
        <p className="mt-5 text-center text-sm text-ink-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </>
    );
  }

  const copy = COPY[found.purpose];
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">{copy.title}</h1>
      <p className="mb-5 text-sm text-ink-muted">{copy.intro}</p>
      <ResetPasswordForm token={rawToken} passwordRule={PASSWORD_RULE} submitLabel={copy.submit} />
    </>
  );
}
