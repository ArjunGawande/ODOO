import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { actionError, actionOk, fromZodError } from '@backend/lib/action-result';

describe('actionOk', () => {
  it('builds a success result', () => {
    expect(actionOk()).toEqual({ ok: true });
    expect(actionOk('Saved')).toEqual({ ok: true, message: 'Saved' });
  });
});

describe('actionError', () => {
  it('builds a failure result', () => {
    expect(actionError()).toEqual({ ok: false });
    expect(actionError('Nope')).toEqual({ ok: false, message: 'Nope' });
    expect(actionError('Nope', { email: 'Taken' })).toEqual({
      ok: false,
      message: 'Nope',
      fieldErrors: { email: 'Taken' },
    });
    expect(actionError(undefined, { email: 'Taken' })).toEqual({
      ok: false,
      fieldErrors: { email: 'Taken' },
    });
    expect(actionError('Nope', {})).toEqual({ ok: false, message: 'Nope' });
  });
});

describe('fromZodError', () => {
  it('maps each field to its first message', () => {
    const schema = z.object({
      email: z.string().email('Enter a valid email').min(100, 'Too short'),
      nested: z.object({ price: z.string('Enter a price') }),
    });
    const { error } = schema.safeParse({ email: 'nope', nested: {} });
    const result = fromZodError(error);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.email).toBe('Enter a valid email');
    expect(result.fieldErrors['nested.price']).toBe('Enter a price');
  });

  it('uses a form-level issue as the message', () => {
    const { error } = z.object({}).refine(() => false, 'Whole form is wrong').safeParse({});
    expect(fromZodError(error)).toEqual({ ok: false, message: 'Whole form is wrong' });
  });

  it('falls back to a generic or custom message', () => {
    const { error } = z.object({ a: z.string('Required') }).safeParse({});
    expect(fromZodError(error).message).toBe('Please fix the highlighted fields.');
    expect(fromZodError(error, 'Try again').message).toBe('Try again');
  });

  it('returns a plain, serialisable object', () => {
    const { error } = z.object({ a: z.string('Required') }).safeParse({});
    const result = fromZodError(error);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
