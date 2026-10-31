import { cx } from './cx';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

const VARIANTS = {
  primary: 'border-accent bg-accent text-ink-inverse hover:border-accent-strong hover:bg-accent-strong',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
  danger: 'border-danger bg-danger text-ink-inverse hover:border-danger-strong hover:bg-danger-strong',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-surface-muted',
};

const SIZES = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-10 px-4 text-sm',
};

/** Class string shared by Button, LinkButton and SubmitButton. */
export function buttonClasses({ variant = 'primary', size = 'md', className } = {}) {
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({ variant, size, className, type = 'button', ...props }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
