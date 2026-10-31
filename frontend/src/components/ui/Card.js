import { cx } from './cx';

/**
 * A white panel. With `title`, `description` or `actions` it draws a header row.
 * `flush` removes the body padding, for a Table that should reach the edges.
 */
export function Card({ title, description, actions, footer, flush, className, children }) {
  const hasHeader = title || description || actions;
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : 'px-4 py-4 sm:px-5'}>{children}</div>
      {footer ? <footer className="border-t border-line px-4 py-3 sm:px-5">{footer}</footer> : null}
    </section>
  );
}
