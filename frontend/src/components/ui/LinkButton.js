import Link from 'next/link';

import { buttonClasses } from './Button';

/** A link that looks like a Button. Takes every next/link prop. */
export function LinkButton({ variant, size, className, ...props }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
