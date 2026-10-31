import { Alert } from './Alert';

/**
 * Shows the form-level message of an action result. `state` is what
 * useActionState returns; null, success and field-only errors render nothing.
 */
export function FormError({ state, className }) {
  if (!state || state.ok || !state.message) return null;
  return (
    <Alert tone="danger" className={className}>
      {state.message}
    </Alert>
  );
}
