import Form from 'next/form';
import Link from 'next/link';

import { buildPageHref } from '@backend/lib/pagination';

import { Button } from './Button';
import { Input } from './inputs';

/**
 * A GET form, so it works without client JavaScript. `params` is the page's awaited
 * searchParams: other filters are kept, and page and q are dropped so a new search
 * starts at page 1.
 */
export function SearchBox({
  basePath,
  params = {},
  value = '',
  label = 'Search',
  placeholder = 'Search',
}) {
  const hidden = Object.entries(params).flatMap(([key, entry]) => {
    if (key === 'page' || key === 'q' || entry === undefined || entry === '') return [];
    return (Array.isArray(entry) ? entry : [entry]).map((item) => [key, item]);
  });
  const { q, ...withoutQuery } = params;

  return (
    <Form action={basePath} role="search" className="flex w-full max-w-md items-center gap-2">
      {hidden.map(([key, item]) => (
        <input key={`${key}=${item}`} type="hidden" name={key} value={item} />
      ))}
      <label htmlFor="search-q" className="sr-only">
        {label}
      </label>
      <Input id="search-q" name="q" type="search" defaultValue={value} placeholder={placeholder} />
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {q ? (
        <Link
          href={buildPageHref(basePath, withoutQuery, 1)}
          className="text-sm whitespace-nowrap text-ink-muted hover:text-ink"
        >
          Clear
        </Link>
      ) : null}
    </Form>
  );
}
