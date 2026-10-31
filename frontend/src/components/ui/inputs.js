import { cx } from './cx';

const CONTROL =
  'block w-full rounded-md border bg-surface text-ink placeholder:text-ink-muted ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted';

function controlClasses(invalid, className) {
  return cx(CONTROL, invalid ? 'border-danger' : 'border-line-strong', className);
}

/**
 * `invalid` draws the error border. Inside a Field you don't need it: Field sets
 * id, aria-invalid and aria-describedby, and aria-invalid drives the border too.
 */
export function Input({ invalid, className, type = 'text', ...props }) {
  const isInvalid = invalid || props['aria-invalid'];
  return (
    <input
      type={type}
      {...props}
      aria-invalid={isInvalid || undefined}
      className={controlClasses(isInvalid, cx('min-h-10 px-3 py-2', className))}
    />
  );
}

export function Textarea({ invalid, className, rows = 4, ...props }) {
  const isInvalid = invalid || props['aria-invalid'];
  return (
    <textarea
      rows={rows}
      {...props}
      aria-invalid={isInvalid || undefined}
      className={controlClasses(isInvalid, cx('px-3 py-2', className))}
    />
  );
}

/**
 * Pass `options` as [{ value, label }], or <option> children. `placeholder` adds a
 * first empty option.
 */
export function Select({ invalid, className, options, placeholder, children, ...props }) {
  const isInvalid = invalid || props['aria-invalid'];
  return (
    <select
      {...props}
      aria-invalid={isInvalid || undefined}
      className={controlClasses(isInvalid, cx('min-h-10 px-3 py-2', className))}
    >
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}

/** A checkbox with its own label. `label` is required for accessibility. */
export function Checkbox({ id, name, label, hint, className, ...props }) {
  const inputId = id ?? name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input
        id={inputId}
        name={name}
        type="checkbox"
        aria-describedby={hintId}
        className="mt-0.5 size-5 shrink-0 rounded border-line-strong accent-accent"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
