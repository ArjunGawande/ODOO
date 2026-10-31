'use client';

import { useActionState, useState } from 'react';

import { inviteStaffAction } from '@/actions/staff';
import { Field, FormError, Input, SubmitButton } from '@/components/ui';

export function InviteStaffForm() {
  const [state, formAction] = useActionState(inviteStaffAction, null);
  // Controlled, because React resets uncontrolled fields after every form action.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      <Field label="Name" htmlFor="name" error={state?.fieldErrors?.name} required>
        <Input
          name="name"
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
        />
      </Field>
      <SubmitButton pendingText="Sending invite...">Send invite</SubmitButton>
    </form>
  );
}
