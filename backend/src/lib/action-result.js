// The result shape shared by every server action used with useActionState.

const DEFAULT_INVALID_MESSAGE = 'Please fix the highlighted fields.';

/** { ok: true, message? } */
export function actionOk(message) {
  return message ? { ok: true, message } : { ok: true };
}

/** { ok: false, message?, fieldErrors? }, where fieldErrors is { field: 'message' }. */
export function actionError(message, fieldErrors) {
  const result = { ok: false };
  if (message) result.message = message;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) result.fieldErrors = fieldErrors;
  return result;
}

/**
 * Turns a ZodError into an action error, keeping the first issue for each field.
 * Nested paths are joined with dots. An issue with no path becomes the message.
 */
export function fromZodError(error, message = DEFAULT_INVALID_MESSAGE) {
  const fieldErrors = {};
  let formMessage;
  for (const issue of error.issues) {
    const field = issue.path.join('.');
    if (!field) formMessage ??= issue.message;
    else fieldErrors[field] ??= issue.message;
  }
  return actionError(formMessage ?? message, fieldErrors);
}
