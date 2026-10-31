import { Card, PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';

import { ProductForm } from '../ProductForm';

export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requirePermission('products.write');

  return (
    <>
      <PageHeader title="New product" backHref="/products" backLabel="Products" />
      <Card>
        <ProductForm />
      </Card>
    </>
  );
}
