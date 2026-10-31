'use client';

import { useActionState, useState } from 'react';

import { signupAction } from '@/actions/auth';
import { Field, FormError, Input, SubmitButton } from '@/components/ui';

export function SignupForm({ passwordRule }) {
  const [state, formAction] = useActionState(signupAction, null);
  // Controlled, because React resets uncontrolled fields after every form action.
  // The password stays uncontrolled so that reset clears it.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      <Field label="Name" htmlFor="name" error={state?.fieldErrors?.name} required>
        <Input
          name="name"
          autoComplete="organization"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint={passwordRule}
        error={state?.fieldErrors?.password}
        required
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Creating account..." className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}
