'use client';

import { useActionState } from 'react';

import { resendInviteAction } from '@/actions/staff';
import { SubmitButton } from '@/components/ui';

export function ResendInviteForm({ userId, userName }) {
  const [state, formAction] = useActionState(resendInviteAction, null);

  return (
    <form action={formAction} className="text-right">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton
        size="sm"
        variant="secondary"
        pendingText="Sending..."
        aria-label={`Resend invite to ${userName}`}
      >
        Resend invite
      </SubmitButton>
      {state?.message ? (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={`mt-1 text-sm font-medium ${state.ok ? 'text-success' : 'text-danger'}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
