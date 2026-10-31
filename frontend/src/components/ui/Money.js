import { formatINR } from '@backend/lib/money';

import { cx } from './cx';

/** An amount such as ₹1,560.00 in tabular numerals. `value` is a money string. */
export function Money({ value, className }) {
  return <span className={cx('tabular-nums', className)}>{formatINR(value)}</span>;
}
