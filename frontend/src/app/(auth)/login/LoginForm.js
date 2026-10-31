'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { loginAction } from '@/actions/auth';
import { Field, FormError, Input, SubmitButton } from '@/components/ui';

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);
  // Controlled, because React resets uncontrolled fields after every form action.
  // The password stays uncontrolled so that reset clears it.
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
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
      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password} required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="text-right">
        <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingText="Logging in..." className="w-full">
        Log in
      </SubmitButton>
    </form>
  );
}
