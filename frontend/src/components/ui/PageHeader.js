import Link from 'next/link';

/** Page title row. `actions` wraps below the title on phones. */
export function PageHeader({ title, description, actions, backHref, backLabel = 'Back' }) {
  return (
    <header className="mb-6">
      {backHref ? (
        <Link href={backHref} className="mb-2 inline-block text-sm text-ink-muted hover:text-ink">
          <span aria-hidden="true">&larr; </span>
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {description ? <p className="mt-1 text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
