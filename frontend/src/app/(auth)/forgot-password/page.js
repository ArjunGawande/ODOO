import Link from 'next/link';

import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Forgot your password?</h1>
      <p className="mb-5 text-sm text-ink-muted">
        Enter your email and we&apos;ll send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-sm text-ink-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
