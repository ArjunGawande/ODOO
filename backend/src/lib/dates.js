const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_STRING = /^(\d{4})-(\d{2})-(\d{2})$/;

function businessTimezone() {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
}

function dateInBusinessTz(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: businessTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Today as YYYY-MM-DD in APP_TIMEZONE. `now` exists for tests. */
export function todayInBusinessTz(now = new Date()) {
  return dateInBusinessTz(now);
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidDateString(str) {
  const match = typeof str === 'string' ? DATE_STRING.exec(str) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/**
 * "2026-11-01" -> "1 Nov 2026", without ever building a local Date from the
 * string. A Date (a timestamptz column) is shown as its day in APP_TIMEZONE.
 * Null, undefined and "" render as "". Throws on anything else.
 */
export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = value instanceof Date ? dateInBusinessTz(value) : value;
  if (!isValidDateString(str)) throw new TypeError(`Invalid date value: ${String(value)}`);
  const [year, month, day] = str.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
