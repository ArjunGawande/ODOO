import { formatINR, fromPaise, isValidMoney, toPaise } from '@backend/lib/money';

/**
 * Final price for the variant form's live preview, added in integer paise so
 * 0.10 + 0.20 is exactly 0.30. Null while the typed extra isn't a valid amount.
 */
export function previewFinalPrice(salesPrice, extraPrice) {
  const extra = typeof extraPrice === 'string' ? extraPrice.trim() : extraPrice;
  if (!isValidMoney(salesPrice) || !isValidMoney(extra)) return null;
  return fromPaise(toPaise(salesPrice) + toPaise(extra));
}

/** "560.00" -> "+₹560.00". */
export function formatExtra(extraPrice) {
  return `+${formatINR(extraPrice)}`;
}
