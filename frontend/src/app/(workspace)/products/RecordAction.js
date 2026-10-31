'use client';

import { useActionState } from 'react';

import {
  archiveProductAction,
  archiveVariantAction,
  restoreProductAction,
  restoreVariantAction,
} from '@/actions/products';
import { FormError, SubmitButton } from '@/components/ui';

const ARCHIVE = { label: 'Archive', pendingText: 'Archiving...', variant: 'danger' };
const RESTORE = { label: 'Restore', pendingText: 'Restoring...', variant: 'secondary' };

const ACTIONS = {
  archiveProduct: { action: archiveProductAction, ...ARCHIVE },
  restoreProduct: { action: restoreProductAction, ...RESTORE },
  archiveVariant: { action: archiveVariantAction, ...ARCHIVE },
  restoreVariant: { action: restoreVariantAction, ...RESTORE },
};

/**
 * One-button form for archive and restore. `kind` is a key of ACTIONS, `fields` the
 * hidden ids it sends and `name` what the button acts on, for screen readers. A
 * refusal, such as a name clash on restore, shows under the button.
 */
export function RecordAction({ kind, fields, name, size = 'sm' }) {
  const { action, label, pendingText, variant } = ACTIONS[kind];
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="inline-block max-w-xs text-left whitespace-normal">
      {Object.entries(fields).map(([field, value]) => (
        <input key={field} type="hidden" name={field} value={value} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        pendingText={pendingText}
        aria-label={`${label} ${name}`}
      >
        {label}
      </SubmitButton>
      <FormError state={state} className="mt-2" />
    </form>
  );
}
