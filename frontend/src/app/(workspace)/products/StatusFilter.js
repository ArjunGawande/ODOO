import Link from 'next/link';

import { cx } from '@/components/ui';
import { buildPageHref } from '@backend/lib/pagination';

const OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/** Active/archived links. `param` is the query key, `params` the rest of the query. */
export function StatusFilter({ basePath, params, param, current, label, hash = '' }) {
  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {OPTIONS.map(({ value, label: text }) => {
        const query = { ...params, [param]: value === 'active' ? undefined : value };
        return (
          <Link
            key={value}
            href={`${buildPageHref(basePath, query, 1)}${hash}`}
            aria-current={value === current ? 'page' : undefined}
            className={cx(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              value === current ? 'bg-accent-soft text-accent-strong' : 'text-ink-muted hover:text-ink',
            )}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
