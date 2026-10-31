import { describe, expect, it } from 'vitest';

import { fromZodError } from '@backend/lib/action-result';
import {
  PASSWORD_RULE,
  emailSchema,
  forgotPasswordSchema,
  inviteStaffSchema,
  loginSchema,
  normalizeEmail,
  passwordByteLength,
  passwordSchema,
  resetPasswordSchema,
  signupSchema,
  staffTargetSchema,
} from '@backend/lib/validation/auth';

function passwordError(value) {
  const result = passwordSchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

describe('passwordSchema boundaries', () => {
  it('accepts the worked example Sharma@2026', () => {
    expect(passwordError('Sharma@2026')).toBeNull();
  });

  it('rejects 8 characters that meet every other rule', () => {
    const value = 'Sharma@2';
    expect(value).toHaveLength(8);
    expect(passwordError(value)).toMatch(/at least 9/);
  });

  it('accepts 9 characters', () => {
    const value = 'Sharma@20';
    expect(value).toHaveLength(9);
    expect(passwordError(value)).toBeNull();
  });

  it('rejects a password with no uppercase letter', () => {
    expect(passwordError('sharma@2026')).toMatch(/uppercase/);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(passwordError('SHARMA@2026')).toMatch(/lowercase/);
  });

  it('rejects a password with no special character', () => {
    expect(passwordError('Sharma2026')).toMatch(/special/);
  });

  it('does not count a digit as special', () => {
    expect(passwordError('Sharmaaaa1')).toMatch(/special/);
  });

  it('does not count whitespace as special', () => {
    expect(passwordError('Sharma 2026')).toMatch(/special/);
  });

  it('does not count a combining mark as special', () => {
    expect(passwordError('Abcdefghकि')).toMatch(/special/);
  });

  it('accepts exactly 72 ASCII bytes and rejects 73', () => {
    const at72 = `Aa@${'x'.repeat(69)}`;
    expect(passwordByteLength(at72)).toBe(72);
    expect(passwordError(at72)).toBeNull();
    expect(passwordError(`${at72}x`)).toMatch(/72 bytes/);
  });

  it('counts bytes, not characters, for multibyte input', () => {
    const at72 = `Aa@a${'é'.repeat(34)}`;
    expect(passwordByteLength(at72)).toBe(72);
    expect(passwordError(at72)).toBeNull();

    const at73 = `Aa@aa${'é'.repeat(34)}`;
    expect(at73.length).toBe(39);
    expect(passwordByteLength(at73)).toBe(73);
    expect(passwordError(at73)).toMatch(/72 bytes/);
  });

  it('rejects emoji that exceed the byte limit while short in characters', () => {
    // 4 bytes each: 19 emoji = 76 bytes, in only 22 characters.
    expect(passwordError(`Aa@${'😀'.repeat(19)}`)).toMatch(/72 bytes/);
  });

  it('counts an emoji as one character for the minimum', () => {
    // 8 code points, though 10 UTF-16 units.
    const value = 'Aa@😀😀bcd';
    expect(value.length).toBe(10);
    expect(passwordError(value)).toMatch(/at least 9/);
  });

  it('rejects a missing value with a readable message', () => {
    expect(passwordError(null)).toBe('Enter a password.');
  });

  it('does not change the password, including outer spaces', () => {
    expect(passwordSchema.parse(' Sharma@2026 ')).toBe(' Sharma@2026 ');
  });
});

describe('email handling', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  OWNER@Sharma.in ')).toBe('owner@sharma.in');
    expect(normalizeEmail('  OWNER@Sharma.in ')).toBe('owner@sharma.in');
  });

  it.each(['', 'not-an-email', 'a@b', 'a b@example.com', 'owner@sharma.in\0'])(
    'rejects %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects an email over 254 characters', () => {
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false);
  });

  it('login and forgot password refuse a NUL byte, which Postgres would error on', () => {
    expect(loginSchema.safeParse({ email: 'a\0@b.in', password: 'x' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'a\0@b.in' }).success).toBe(false);
  });

  it('login accepts an address that is not format-valid, such as a seeded local admin', () => {
    expect(loginSchema.parse({ email: 'Admin@localhost', password: 'x' }).email).toBe(
      'admin@localhost',
    );
  });
});

describe('signupSchema', () => {
  const valid = { name: 'Sharma Traders', email: 'owner@sharma.in', password: 'Sharma@2026' };

  it('accepts the worked example', () => {
    expect(signupSchema.parse(valid)).toEqual(valid);
  });

  it('strips everything except name, email and password', () => {
    const parsed = signupSchema.parse({ ...valid, role: 'admin', is_active: false, id: 1 });
    expect(Object.keys(parsed).sort()).toEqual(['email', 'name', 'password']);
  });

  it('reports each bad field through fromZodError', () => {
    const result = signupSchema.safeParse({ name: ' ', email: 'x', password: 'short' });
    const { fieldErrors } = fromZodError(result.error);
    expect(Object.keys(fieldErrors).sort()).toEqual(['email', 'name', 'password']);
  });

  it('rejects a name over 120 characters or with control characters', () => {
    expect(signupSchema.safeParse({ ...valid, name: 'a'.repeat(121) }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, name: 'a\0b' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, name: 'a\r\nBcc: b' }).success).toBe(false);
  });

  it('gives a readable error when fields are missing, as with FormData nulls', () => {
    const result = signupSchema.safeParse({ name: null, email: null, password: null });
    expect(fromZodError(result.error).fieldErrors).toEqual({
      name: 'Enter a name.',
      email: 'Enter your email address.',
      password: 'Enter a password.',
    });
  });
});

describe('other schemas', () => {
  it('reset password turns a missing token into an empty string, not a field error', () => {
    expect(resetPasswordSchema.parse({ token: null, password: 'Sharma@2026' }).token).toBe('');
  });

  it('reset password applies the password rule', () => {
    expect(resetPasswordSchema.safeParse({ token: 't', password: 'weak' }).success).toBe(false);
  });

  it('invite needs a name and a valid email', () => {
    expect(inviteStaffSchema.safeParse({ name: '', email: 'x' }).success).toBe(false);
    expect(inviteStaffSchema.parse({ name: 'Asha', email: 'ASHA@x.in' }).email).toBe('asha@x.in');
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648', '', null])(
    'rejects %j as a staff id, including values too big for the column',
    (userId) => {
      expect(staffTargetSchema.safeParse({ userId }).success).toBe(false);
    },
  );

  it('coerces a posted staff id to a number', () => {
    expect(staffTargetSchema.parse({ userId: '12' })).toEqual({ userId: 12 });
  });

  it('states the rule for the forms', () => {
    expect(PASSWORD_RULE).toMatch(/at least 9/);
  });
});
