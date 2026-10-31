import { z } from 'zod';

import { isValidDateString } from '../dates';
import { isValidMoney } from '../money';

// Postgres integer columns, which also covers plans.id in a URL.
const MAX_INTEGER = 2147483647;

export const BILLING_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

export const BILLING_PERIOD_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** The four allowed/not-allowed options, in display order. */
export const PLAN_OPTIONS = [
  {
    key: 'auto_close',
    label: 'Auto-close at the end',
    hint: 'The subscription closes by itself when the plan ends.',
  },
  { key: 'can_close_early', label: 'Close early', hint: 'It can be closed before the end date.' },
  { key: 'can_pause', label: 'Pause', hint: 'It can be paused for a while.' },
  { key: 'can_renew', label: 'Renew', hint: 'It can be renewed.' },
];

function dateField(requiredMessage, label) {
  return z
    .string({ error: requiredMessage })
    .trim()
    .min(1, requiredMessage)
    .refine(isValidDateString, `Enter a real calendar date for the ${label}.`);
}

const option = z.boolean().default(false);

export const planSchema = z
  .object({
    name: z
      .string({ error: 'Enter a plan name.' })
      .trim()
      .min(1, 'Enter a plan name.')
      .max(160, 'Use 160 characters or fewer.')
      // Postgres rejects NUL bytes in text, which would otherwise be a 500.
      .refine((value) => !value.includes('\0'), 'The name contains an invalid character.'),
    price: z
      .string({ error: 'Enter a price.' })
      .trim()
      .min(1, 'Enter a price.')
      .refine(isValidMoney, 'Enter a price such as 1000 or 1000.50, up to 2 decimal places.'),
    billing_period: z.enum(BILLING_PERIODS, { error: 'Choose a billing period.' }),
    min_quantity: z
      .string({ error: 'Enter a minimum quantity.' })
      .trim()
      .refine(
        (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_INTEGER,
        'Enter a whole number of 1 or more.',
      )
      .transform(Number),
    start_date: dateField('Enter a start date.', 'start date'),
    end_date: dateField('Enter an end date.', 'end date'),
    auto_close: option,
    can_close_early: option,
    can_pause: option,
    can_renew: option,
  })
  .refine(
    (plan) =>
      !isValidDateString(plan.start_date) ||
      !isValidDateString(plan.end_date) ||
      plan.end_date >= plan.start_date,
    { path: ['end_date'], error: 'The end date cannot be before the start date.' },
  );

/**
 * The form's raw values. A browser leaves an unchecked box out of FormData, so
 * every option is always set here: an unchecked box must save as false.
 */
export function planFormValues(formData) {
  const text = (name) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const values = {
    name: text('name'),
    price: text('price'),
    billing_period: text('billing_period'),
    min_quantity: text('min_quantity'),
    start_date: text('start_date'),
    end_date: text('end_date'),
  };
  for (const { key } of PLAN_OPTIONS) values[key] = formData.get(key) === 'on';
  return values;
}

/** Result of planSchema.safeParse for a submitted form. */
export function parsePlanForm(formData) {
  return planSchema.safeParse(planFormValues(formData));
}

/**
 * A URL or form id as an integer, or null when it can't be a plans.id. Anything
 * past the integer range must stop here, because Postgres errors on it.
 */
export function parsePlanId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_INTEGER ? id : null;
}

/** The list filter from ?status=. Anything unknown means active. */
export function parsePlanStatus(value) {
  return value === 'archived' ? 'archived' : 'active';
}
