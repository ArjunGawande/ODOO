/** Joins class names, skipping anything falsy. */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}
