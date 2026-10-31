import { cx } from '@/components/ui/cx';

/** Wordmark. `inverse` is for dark backgrounds. */
export function Brand({ inverse, className }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold', className)}>
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-ink-inverse"
      >
        B
      </span>
      <span className={inverse ? 'text-ink-inverse' : 'text-ink'}>Brightloop</span>
    </span>
  );
}
