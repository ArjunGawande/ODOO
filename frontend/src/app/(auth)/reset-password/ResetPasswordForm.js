'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { resetPasswordAction } from '@/actions/auth';
import { Field, FormError, Input, SubmitButton } from '@/components/ui';

export function ResetPasswordForm({ token, passwordRule, submitLabel }) {
  const [state, formAction] = useActionState(resetPasswordAction, null);
  // A form-level message here means the link stopped working while the page was open.
  const linkFailed = state?.ok === false && Boolean(state.message) && !state.fieldErrors;

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      {linkFailed ? (
        <p className="text-sm">
          <Link href="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new link
          </Link>
        </p>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        htmlFor="password"
        hint={passwordRule}
        error={state?.fieldErrors?.password}
        required
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Saving..." className="w-full">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
