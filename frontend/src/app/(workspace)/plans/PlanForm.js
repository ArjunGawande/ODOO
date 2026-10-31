'use client';

import { useActionState } from 'react';

import {
  Card,
  Checkbox,
  Field,
  FormError,
  Input,
  LinkButton,
  Select,
  SubmitButton,
} from '@/components/ui';
import {
  BILLING_PERIOD_LABELS,
  BILLING_PERIODS,
  PLAN_OPTIONS,
  planFormValues,
} from '@backend/lib/validation/plans';

const BILLING_OPTIONS = BILLING_PERIODS.map((value) => ({
  value,
  label: BILLING_PERIOD_LABELS[value],
}));

const NEW_PLAN = {
  name: '',
  price: '',
  billing_period: 'monthly',
  min_quantity: '1',
  start_date: '',
  end_date: '',
  auto_close: false,
  can_close_early: false,
  can_pause: false,
  can_renew: false,
};

/**
 * Create and edit form. `plan` is a plain plans row when editing.
 *
 * React resets a form after every action, even a failed one, and a reset can't
 * restore a changed select or checkbox, controlled or not. So each attempt remounts
 * the form with what was submitted, and a failed save keeps the user's input.
 */
export function PlanForm({ action, plan, submitLabel, cancelHref }) {
  const [state, formAction] = useActionState(async (previous, formData) => {
    const result = await action(null, formData);
    return {
      ...result,
      submitted: planFormValues(formData),
      attempt: (previous?.attempt ?? 0) + 1,
    };
  }, null);

  const initial = plan ? { ...plan, min_quantity: String(plan.min_quantity) } : NEW_PLAN;
  const values = state?.submitted ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <form key={state?.attempt ?? 0} action={formAction} className="max-w-2xl space-y-6">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <FormError state={state} />

      <Card title="Plan details">
        <div className="space-y-4">
          <Field label="Name" htmlFor="name" error={errors.name} required>
            <Input name="name" defaultValue={values.name} maxLength={160} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Price (₹)"
              htmlFor="price"
              hint="Such as 1000 or 1000.50"
              error={errors.price}
              required
            >
              <Input name="price" defaultValue={values.price} inputMode="decimal" required />
            </Field>

            <Field
              label="Billing period"
              htmlFor="billing_period"
              error={errors.billing_period}
              required
            >
              <Select
                name="billing_period"
                defaultValue={values.billing_period}
                options={BILLING_OPTIONS}
                required
              />
            </Field>
          </div>

          <Field
            label="Minimum quantity"
            htmlFor="min_quantity"
            hint="The fewest units a customer can buy on this plan."
            error={errors.min_quantity}
            required
            className="sm:max-w-xs"
          >
            <Input
              name="min_quantity"
              defaultValue={values.min_quantity}
              inputMode="numeric"
              required
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Sale window"
        description="The plan can be sold from the start date to the end date, including both days."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="start_date" error={errors.start_date} required>
            <Input name="start_date" type="date" defaultValue={values.start_date} required />
          </Field>

          <Field label="End date" htmlFor="end_date" error={errors.end_date} required>
            <Input name="end_date" type="date" defaultValue={values.end_date} required />
          </Field>
        </div>
      </Card>

      <Card title="Options" description="Choose what is allowed on this plan.">
        <div className="space-y-4">
          {PLAN_OPTIONS.map((option) => (
            <Checkbox
              key={option.key}
              name={option.key}
              label={option.label}
              hint={option.hint}
              defaultChecked={values[option.key]}
            />
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
