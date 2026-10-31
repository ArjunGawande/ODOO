import { notFound, redirect } from 'next/navigation';

import { Card, PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { parseId } from '@backend/lib/validation/products';
import { getProduct } from '@backend/services/products';

import { ProductForm } from '../../ProductForm';

export const metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }) {
  await requirePermission('products.write');
  const id = parseId((await params).id);
  if (!id) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  // Archived products are read-only: their page offers Restore instead.
  if (!product.is_active) redirect(`/products/${id}`);

  const { name, type, sales_price, cost_price, notes } = product;

  return (
    <>
      <PageHeader title={`Edit ${name}`} backHref={`/products/${id}`} backLabel={name} />
      <Card>
        <ProductForm product={{ id, name, type, sales_price, cost_price, notes }} />
      </Card>
    </>
  );
}
