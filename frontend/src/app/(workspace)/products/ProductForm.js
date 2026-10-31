'use client';

import { createProductAction, updateProductAction } from '@/actions/products';
import { Button, Field, FormError, Input, LinkButton, Select, Textarea } from '@/components/ui';

import { useFormAction } from './useFormAction';

const TYPE_OPTIONS = [
  { value: 'service', label: 'Service' },
  { value: 'goods', label: 'Goods' },
];

/** Creates a product, or edits `product` when one is given. */
export function ProductForm({ product }) {
  const { state, formAction, pending, onSubmit } = useFormAction(
    product ? updateProductAction : createProductAction,
  );
  const errors = state?.fieldErrors;

  return (
    <form action={formAction} onSubmit={onSubmit} className="max-w-2xl space-y-5">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <FormError state={state} />

      <Field label="Name" htmlFor="name" error={errors?.name} required>
        <Input name="name" defaultValue={product?.name} maxLength={160} required />
      </Field>

      <Field label="Type" htmlFor="type" error={errors?.type} required>
        <Select name="type" options={TYPE_OPTIONS} defaultValue={product?.type ?? 'service'} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Sales price (₹)" htmlFor="sales_price" error={errors?.sales_price} required>
          <Input
            name="sales_price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={product?.sales_price}
            placeholder="1000.00"
            required
          />
        </Field>
        <Field label="Cost price (₹)" htmlFor="cost_price" error={errors?.cost_price} required>
          <Input
            name="cost_price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={product?.cost_price ?? '0.00'}
            required
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" error={errors?.notes}>
        <Textarea name="notes" defaultValue={product?.notes ?? ''} maxLength={2000} />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving...' : product ? 'Save changes' : 'Create product'}
        </Button>
        <LinkButton variant="secondary" href={product ? `/products/${product.id}` : '/products'}>
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
