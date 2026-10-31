'use client';

import { startTransition, useActionState } from 'react';

/**
 * useActionState for a form that must keep what was typed when the server rejects
 * it. React resets a form after an action passed to `action`, so with JavaScript
 * the submit goes through onSubmit instead. `action` still works without it.
 */
export function useFormAction(serverAction) {
  const [state, formAction, pending] = useActionState(serverAction, null);

  function onSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return { state, formAction, pending, onSubmit };
}
