import { cx } from './cx';

const TONES = {
  info: 'border-info bg-info-soft text-info',
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  danger: 'border-danger bg-danger-soft text-danger',
};

/** Inline message. Errors and warnings are announced to screen readers at once. */
export function Alert({ tone = 'info', title, className, children }) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={cx('rounded-md border px-3 py-2 text-sm', TONES[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div>{children}</div> : null}
    </div>
  );
}
