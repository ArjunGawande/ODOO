// Money crosses the app as strings such as "1560.00" and is calculated in
// integer paise. Nothing in this file touches a JS float.

// numeric(12,2): at most 10 integer digits and 2 decimals.
const VALID_MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const ANY_AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** True for a non-negative amount that fits numeric(12,2), such as "1560" or "1560.50". */
export function isValidMoney(str) {
  return typeof str === 'string' && VALID_MONEY.test(str);
}

/** "1560.50" -> 156050. Throws on anything that is not a decimal string. */
export function toPaise(str) {
  const match = typeof str === 'string' ? ANY_AMOUNT.exec(str) : null;
  if (!match) throw new TypeError(`Invalid money value: ${String(str)}`);
  const [, sign, rupees, decimals = ''] = match;
  const paise = Number(rupees) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) throw new RangeError(`Money value out of range: ${str}`);
  return sign && paise !== 0 ? -paise : paise;
}

/** 156050 -> "1560.50". Throws unless given a safe integer. */
export function fromPaise(paise) {
  if (!Number.isSafeInteger(paise)) throw new TypeError(`Invalid paise value: ${String(paise)}`);
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, '0');
  return `${paise < 0 ? '-' : ''}${rupees}.${decimals}`;
}

/**
 * "1560.00" -> "₹1,560.00" with en-IN (lakh) grouping. Grouped by hand so the
 * server and browser always agree. Null, undefined and "" render as "".
 */
export function formatINR(str) {
  if (str === null || str === undefined || str === '') return '';
  const [rupees, decimals] = fromPaise(toPaise(str)).split('.');
  const digits = rupees.replace('-', '');
  const grouped = digits.replace(/\B(?=(\d{2})*\d{3}$)/g, ',');
  return `${rupees.startsWith('-') ? '-' : ''}₹${grouped}.${decimals}`;
}
