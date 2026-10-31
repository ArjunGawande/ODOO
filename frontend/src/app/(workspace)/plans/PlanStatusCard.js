'use client';

import { useActionState } from 'react';

import { Card, FormError, SubmitButton } from '@/components/ui';

/** Archive or restore, with the action's error shown beside the button. */
export function PlanStatusCard({ planId, isActive, archiveAction, restoreAction }) {
  const [state, formAction] = useActionState(isActive ? archiveAction : restoreAction, null);

  return (
    <Card
      title={isActive ? 'Archive this plan' : 'Restore this plan'}
      description={
        isActive
          ? 'It leaves the active list and can no longer be sold. You can restore it later.'
          : 'It returns to the active list and can be edited and sold again.'
      }
    >
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={planId} />
        <FormError state={state} />
        <SubmitButton
          variant={isActive ? 'danger' : 'primary'}
          pendingText={isActive ? 'Archiving...' : 'Restoring...'}
        >
          {isActive ? 'Archive plan' : 'Restore plan'}
        </SubmitButton>
      </form>
    </Card>
  );
}
