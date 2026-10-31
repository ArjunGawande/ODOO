'use client';

import { useFormStatus } from 'react-dom';

import { buttonClasses } from './Button';

/** Submit button for a <form action={...}>. Must be rendered inside the form. */
export function SubmitButton({
  children,
  pendingText = 'Saving...',
  variant,
  size,
  className,
  disabled,
  ...props
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {pending ? pendingText : children}
    </button>
  );
}
