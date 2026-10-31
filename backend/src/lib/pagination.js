export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 200;

function readParam(searchParams, name) {
  if (!searchParams) return undefined;
  if (typeof searchParams.get === 'function') return searchParams.get(name) ?? undefined;
  const value = searchParams[name];
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Reads ?page=, ?pageSize= and ?q= from an awaited Next `searchParams` object or
 * a URLSearchParams. Bad values fall back to defaults; pageSize is capped.
 * `options.pageSize` changes the default for one list.
 * Returns { page, pageSize, offset, q }.
 */
export function parsePagination(searchParams, options = {}) {
  const fallbackSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const pageSize = Math.min(positiveInt(readParam(searchParams, 'pageSize')) ?? fallbackSize, MAX_PAGE_SIZE);

  let page = positiveInt(readParam(searchParams, 'page')) ?? 1;
  if (!Number.isSafeInteger((page - 1) * pageSize)) page = 1;

  const rawQuery = readParam(searchParams, 'q');
  const q = typeof rawQuery === 'string'
    // Postgres rejects NUL bytes in text, which would otherwise surface as a 500.
    ? rawQuery.replaceAll('\0', '').trim().slice(0, MAX_QUERY_LENGTH)
    : '';

  return { page, pageSize, offset: (page - 1) * pageSize, q };
}

/** Escapes LIKE wildcards in user input. Backslash is Postgres's default escape. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

/** The binding for `lower(name) LIKE lower(?)`: a contains match on escaped input. */
export function likePattern(q) {
  return `%${escapeLike(q)}%`;
}

export function totalPages(total, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Link to `page` of a list, keeping every other query param. Page 1 is left out
 * so the first page keeps a clean URL. `params` is an awaited `searchParams`.
 */
export function buildPageHref(basePath, params = {}, page = 1) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || value === undefined || value === null || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `${basePath}?${search}` : basePath;
}
