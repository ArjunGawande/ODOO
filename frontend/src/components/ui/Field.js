import { Children, cloneElement, isValidElement } from 'react';

import { cx } from './cx';

/**
 * Label, control, hint and error. `htmlFor` is the control's id. The single child
 * control receives the id and its aria attributes, so this is enough:
 *
 *   <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
 *     <Input name="email" type="email" required />
 *   </Field>
 */
export function Field({ label, htmlFor, hint, error, required, className, children }) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = cx(errorId, hintId) || undefined;

  const child = Children.count(children) === 1 ? Children.only(children) : null;
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: child.props.id ?? htmlFor,
        'aria-describedby': cx(child.props['aria-describedby'], describedBy) || undefined,
        'aria-invalid': error ? true : child.props['aria-invalid'],
      })
    : children;

  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="text-danger">
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
