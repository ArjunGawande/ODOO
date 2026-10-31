import { cx } from './cx';

/**
 * Wide tables scroll inside their own wrapper, so the page never scrolls sideways
 * on a phone. `caption` is read by screen readers only. The wrapper is `relative`
 * because screen-reader-only text is absolutely positioned: without it, that text
 * would escape the scroller and widen the page.
 */
export function Table({ caption, className, children, ...props }) {
  return (
    <div
      className="relative overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={caption ?? 'Table'}
    >
      <table className={cx('w-full border-collapse text-left text-sm', className)} {...props}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }) {
  return <thead className={cx('border-b border-line bg-surface-muted', className)} {...props} />;
}

export function TBody({ className, ...props }) {
  return <tbody className={cx('divide-y divide-line', className)} {...props} />;
}

export function TR({ className, ...props }) {
  return <tr className={className} {...props} />;
}

/** `numeric` right-aligns the column. */
export function TH({ numeric, className, scope = 'col', ...props }) {
  return (
    <th
      scope={scope}
      className={cx(
        'px-4 py-2.5 font-semibold whitespace-nowrap text-ink-muted',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

/** `numeric` right-aligns with tabular numerals, for money and counts. */
export function TD({ numeric, className, ...props }) {
  return (
    <td
      className={cx('px-4 py-3 align-top text-ink', numeric && 'text-right tabular-nums whitespace-nowrap', className)}
      {...props}
    />
  );
}
