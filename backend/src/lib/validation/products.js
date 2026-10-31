import { z } from 'zod';

import { fromPaise, isValidMoney, toPaise } from '../money';

// Postgres int4, the type of every id column.
const MAX_ID = 2147483647;
const MAX_NOTES_LENGTH = 2000;

export const PRODUCT_TYPES = ['service', 'goods'];

/** A positive int4 from a route param or form field, otherwise null. */
export function parseId(value) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9]\d{0,9}$/.test(text)) return null;
  const id = Number(text);
  return id <= MAX_ID ? id : null;
}

/** The active/archived filter from a query param. Anything unknown means active. */
export function parseStatus(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function requiredText(label, max) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} can be at most ${max} characters.`)
    // Postgres rejects NUL in text, which would otherwise surface as a 500.
    .refine((text) => !text.includes('\0'), `${label} contains an invalid character.`);
}

function moneyProblem(text, label) {
  if (text === '') return `${label} is required.`;
  if (isValidMoney(text)) return null;
  if (/^-\d/.test(text)) return `${label} cannot be negative.`;
  if (/^\d+\.\d{3,}$/.test(text)) return `${label} can have at most 2 decimal places.`;
  if (/^\d+(\.\d+)?$/.test(text)) return `${label} is too large. The maximum is 9999999999.99.`;
  return `${label} must be an amount such as 1560.00.`;
}

/** A required amount that fits numeric(12,2), normalised to the form "1560.00". */
function moneyField(label) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .transform((text, ctx) => {
      const message = moneyProblem(text, label);
      if (!message) return fromPaise(toPaise(text));
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    });
}

export const productSchema = z.object({
  name: requiredText('Name', 160),
  type: z.enum(PRODUCT_TYPES, { error: 'Choose service or goods.' }),
  sales_price: moneyField('Sales price'),
  cost_price: moneyField('Cost price'),
  notes: z
    .string({ error: 'Notes must be text.' })
    .trim()
    .max(MAX_NOTES_LENGTH, `Notes can be at most ${MAX_NOTES_LENGTH} characters.`)
    .refine((text) => !text.includes('\0'), 'Notes contain an invalid character.')
    .optional()
    .transform((text) => text || null),
});

export const variantSchema = z.object({
  attribute: requiredText('Attribute', 80),
  value: requiredText('Value', 80),
  extra_price: moneyField('Extra price'),
});
