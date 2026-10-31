import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@backend/lib/db';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPageHref,
  escapeLike,
  likePattern,
  parsePagination,
  totalPages,
} from '@backend/lib/pagination';

import { resetTables } from './helpers/db';

describe('parsePagination', () => {
  it('applies defaults with no input', () => {
    const expected = { page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0, q: '' };
    expect(parsePagination({})).toEqual(expected);
    expect(parsePagination(undefined)).toEqual(expected);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(100);
  });

  it('computes the offset', () => {
    expect(parsePagination({ page: '3' })).toMatchObject({ page: 3, pageSize: 20, offset: 40 });
    expect(parsePagination({ page: '3', pageSize: '10' })).toMatchObject({ offset: 20 });
  });

  it.each(['0', '-1', '1.5', 'abc', '2abc', '1e3', '', ' 2', '99999999999999999999'])(
    'falls back to page 1 for %j',
    (page) => {
      expect(parsePagination({ page })).toMatchObject({ page: 1, offset: 0 });
    },
  );

  it('keeps the offset a safe integer for huge pages', () => {
    const { offset } = parsePagination({ page: String(Number.MAX_SAFE_INTEGER) });
    expect(Number.isSafeInteger(offset)).toBe(true);
  });

  it('caps pageSize at the maximum and ignores bad values', () => {
    expect(parsePagination({ pageSize: '1000' }).pageSize).toBe(100);
    expect(parsePagination({ pageSize: '0' }).pageSize).toBe(20);
    expect(parsePagination({ pageSize: 'x' }).pageSize).toBe(20);
    expect(parsePagination({}, { pageSize: 500 }).pageSize).toBe(100);
    expect(parsePagination({}, { pageSize: 5 }).pageSize).toBe(5);
  });

  it('reads the first value of a repeated param', () => {
    expect(parsePagination({ page: ['2', '9'], q: ['a', 'b'] })).toMatchObject({ page: 2, q: 'a' });
  });

  it('accepts URLSearchParams', () => {
    const params = new URLSearchParams('page=2&q=crm');
    expect(parsePagination(params)).toMatchObject({ page: 2, offset: 20, q: 'crm' });
  });

  it('cleans the search query', () => {
    expect(parsePagination({ q: '  crm  ' }).q).toBe('crm');
    expect(parsePagination({ q: 'a\0b' }).q).toBe('ab');
    expect(parsePagination({ q: 'x'.repeat(500) }).q).toHaveLength(200);
  });
});

describe('totalPages', () => {
  it('rounds up and never drops below one', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(20, 20)).toBe(1);
    expect(totalPages(21, 20)).toBe(2);
  });
});

describe('buildPageHref', () => {
  it('preserves other params and replaces page', () => {
    expect(buildPageHref('/plans', { q: 'crm', status: 'archived', page: '4' }, 2)).toBe(
      '/plans?q=crm&status=archived&page=2',
    );
  });

  it('drops the page param on page 1', () => {
    expect(buildPageHref('/plans', { q: 'crm', page: '4' }, 1)).toBe('/plans?q=crm');
    expect(buildPageHref('/plans', {}, 1)).toBe('/plans');
  });

  it('encodes values and keeps repeated params', () => {
    expect(buildPageHref('/plans', { q: 'a b&c' }, 2)).toBe('/plans?q=a+b%26c&page=2');
    expect(buildPageHref('/plans', { tag: ['x', 'y'], empty: '' }, 1)).toBe('/plans?tag=x&tag=y');
  });
});

describe('escapeLike and likePattern', () => {
  it('escapes wildcards and backslashes', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
    expect(likePattern('50%')).toBe('%50\\%%');
  });

  describe('against Postgres', () => {
    beforeEach(async () => {
      await resetTables();
      await db('products').insert(
        ['Plain', '50% Off', 'Under_score', 'Back\\slash'].map((name) => ({
          name,
          type: 'service',
          sales_price: '1.00',
        })),
      );
    });

    async function search(q) {
      return db('products')
        .whereRaw('lower(name) LIKE lower(?)', [likePattern(q)])
        .orderBy('name')
        .pluck('name');
    }

    it('treats % and _ as literal characters', async () => {
      expect(await search('%')).toEqual(['50% Off']);
      expect(await search('_')).toEqual(['Under_score']);
      expect(await search('\\')).toEqual(['Back\\slash']);
    });

    it('still matches case-insensitively', async () => {
      expect(await search('PLAIN')).toEqual(['Plain']);
    });
  });
});
