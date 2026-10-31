import { z } from 'zod';

export const MIN_PASSWORD_CHARS = 9;
export const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_RULE =
  'Use at least 9 characters, with an uppercase letter, a lowercase letter and a special character such as @ or #.';

const CONTROL_CHARACTER = /\p{Cc}/u;
const UPPERCASE = /\p{Lu}/u;
const LOWERCASE = /\p{Ll}/u;
// Combining marks belong to their letter, as in Devanagari vowel signs.
const SPECIAL = /[^\p{L}\p{M}\p{N}\s]/u;

/** The stored form of an email: trimmed and lowercased. */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/** bcrypt reads only the first 72 bytes, so the limit is on bytes, not characters. */
export function passwordByteLength(password) {
  return new TextEncoder().encode(password).length;
}

export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  // Counted in code points, so an emoji is one character here.
  .refine((value) => [...value].length >= MIN_PASSWORD_CHARS, {
    error: `Password must be at least ${MIN_PASSWORD_CHARS} characters.`,
  })
  .refine((value) => passwordByteLength(value) <= MAX_PASSWORD_BYTES, {
    error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes. Non-English characters count as more than one.`,
  })
  .refine((value) => UPPERCASE.test(value), { error: 'Password needs an uppercase letter.' })
  .refine((value) => LOWERCASE.test(value), { error: 'Password needs a lowercase letter.' })
  .refine((value) => SPECIAL.test(value), {
    error: 'Password needs a special character such as @ or #.',
  });

const trimmedLowerEmail = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'Email must be 254 characters or fewer.');

/** For an email being stored. */
export const emailSchema = trimmedLowerEmail.pipe(z.email('Enter a valid email address.'));

// For looking up an account. Not format-checked, so an address set outside the app
// (such as a seeded admin@localhost) can still log in. Control characters are
// refused because Postgres errors on a NUL byte.
const lookupEmailSchema = trimmedLowerEmail.refine((value) => !CONTROL_CHARACTER.test(value), {
  error: 'Enter a valid email address.',
});

const nameSchema = z
  .string({ error: 'Enter a name.' })
  .trim()
  .min(1, 'Enter a name.')
  .max(120, 'Name must be 120 characters or fewer.')
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    error: 'Name contains characters that are not allowed.',
  });

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: lookupEmailSchema,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email: lookupEmailSchema });

export const resetPasswordSchema = z.object({
  // A missing or malformed token simply matches no row, so the visitor sees the
  // same expired-link message as for any other bad token.
  token: z.string().catch(''),
  password: passwordSchema,
});

export const inviteStaffSchema = z.object({ name: nameSchema, email: emailSchema });

export const staffTargetSchema = z.object({
  userId: z.coerce.number().int().min(1).max(2147483647),
});
