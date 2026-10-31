'use client';

import { useActionState, useState } from 'react';

import { forgotPasswordAction } from '@/actions/auth';
import { Alert, Field, FormError, Input, SubmitButton } from '@/components/ui';

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, null);
  // Controlled, because React resets uncontrolled fields after every form action.
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>
      <SubmitButton pendingText="Sending..." className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
