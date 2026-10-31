import { buildPageHref, totalPages } from '@backend/lib/pagination';

import { buttonClasses } from './Button';
import { LinkButton } from './LinkButton';

function PageLink({ page, disabled, basePath, params, rel, children }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
        {children}
      </span>
    );
  }
  return (
    <LinkButton variant="secondary" size="sm" rel={rel} href={buildPageHref(basePath, params, page)}>
      {children}
    </LinkButton>
  );
}

/**
 * Previous and next links with a "Showing x-y of z" line. `params` is the page's
 * awaited searchParams, so filters survive paging. Renders nothing for an empty
 * list. A page past the end links back to the last real page.
 */
export function Pagination({ page, total, pageSize, basePath, params = {} }) {
  if (total <= 0) return null;

  const lastPage = totalPages(total, pageSize);
  const first = Math.min((page - 1) * pageSize + 1, total);
  const last = Math.min(page * pageSize, total);
  const linkProps = { basePath, params };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
    >
      <p className="text-sm text-ink-muted tabular-nums">
        Showing {first}&ndash;{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink page={Math.min(page - 1, lastPage)} disabled={page <= 1} rel="prev" {...linkProps}>
          Previous
        </PageLink>
        <span className="text-sm text-ink-muted tabular-nums">
          Page {Math.min(page, lastPage)} of {lastPage}
        </span>
        <PageLink page={page + 1} disabled={page >= lastPage} rel="next" {...linkProps}>
          Next
        </PageLink>
      </div>
    </nav>
  );
}
