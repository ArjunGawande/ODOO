'use client';

import { useActionState } from 'react';

import { deactivateStaffAction, reactivateStaffAction } from '@/actions/staff';
import { SubmitButton } from '@/components/ui';

export function StaffStatusForm({ userId, userName, isActive }) {
  const [state, formAction] = useActionState(
    isActive ? deactivateStaffAction : reactivateStaffAction,
    null,
  );

  function confirmDeactivation(event) {
    if (isActive && !window.confirm(`Deactivate ${userName}? They will be logged out at once.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmDeactivation} className="text-right">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton
        size="sm"
        variant={isActive ? 'danger' : 'secondary'}
        pendingText={isActive ? 'Deactivating...' : 'Reactivating...'}
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </SubmitButton>
      {state?.ok === false && state.message ? (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
