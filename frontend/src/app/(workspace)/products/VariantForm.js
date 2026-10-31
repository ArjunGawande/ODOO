'use client';

import { useState } from 'react';

import { addVariantAction, updateVariantAction } from '@/actions/products';
import { Button, Field, FormError, Input, LinkButton } from '@/components/ui';
import { formatINR } from '@backend/lib/money';

import { formatExtra, previewFinalPrice } from './price-preview';
import { useFormAction } from './useFormAction';

/** Adds a variant, or edits `variant` when one is given, with a live final price. */
export function VariantForm({ productId, salesPrice, variant }) {
  const { state, formAction, pending, onSubmit } = useFormAction(
    variant ? updateVariantAction : addVariantAction,
  );
  const [extraPrice, setExtraPrice] = useState(variant?.extra_price ?? '0.00');
  const errors = state?.fieldErrors;
  const finalPrice = previewFinalPrice(salesPrice, extraPrice);

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="product_id" value={productId} />
      {variant ? <input type="hidden" name="variant_id" value={variant.id} /> : null}
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Attribute" htmlFor="attribute" error={errors?.attribute} required>
          <Input
            name="attribute"
            defaultValue={variant?.attribute}
            placeholder="Brand"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Value" htmlFor="value" error={errors?.value} required>
          <Input
            name="value"
            defaultValue={variant?.value}
            placeholder="Odoo"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Extra price (₹)" htmlFor="extra_price" error={errors?.extra_price} required>
          <Input
            name="extra_price"
            inputMode="decimal"
            autoComplete="off"
            value={extraPrice}
            onChange={(event) => setExtraPrice(event.target.value)}
            required
          />
        </Field>
      </div>

      <p aria-live="polite" className="text-sm text-ink-muted tabular-nums">
        {finalPrice === null ? (
          'Enter a valid extra price to see the final price.'
        ) : (
          <>
            {formatINR(salesPrice)} {formatExtra(extraPrice.trim())} ={' '}
            <span className="font-semibold text-ink">Final price {formatINR(finalPrice)}</span>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving...' : variant ? 'Save variant' : 'Add variant'}
        </Button>
        {variant ? (
          <LinkButton variant="secondary" href={`/products/${productId}#variants`}>
            Cancel
          </LinkButton>
        ) : null}
      </div>
    </form>
  );
}
