import Link from 'next/link';

import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  Money,
  PageHeader,
  Pagination,
  SearchBox,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@backend/lib/auth/permissions';
import { parsePagination } from '@backend/lib/pagination';
import { parseStatus } from '@backend/lib/validation/products';
import { listProducts } from '@backend/services/products';

import { StatusFilter } from './StatusFilter';

export const metadata = { title: 'Products' };

const BASE_PATH = '/products';

function emptyMessage(q, status, total) {
  if (total > 0) return { title: 'No products on this page', description: 'Go back to an earlier page.' };
  if (q) return { title: 'No products match your search', description: 'Try a different name.' };
  if (status === 'archived') return { title: 'No archived products' };
  return { title: 'No products yet', description: 'Products you add will appear here.' };
}

export default async function ProductsPage({ searchParams }) {
  const user = await requirePermission('products.read');
  const params = await searchParams;
  const { q, page, pageSize } = parsePagination(params);
  const status = parseStatus(params.status);
  const { rows, total } = await listProducts({ q, status, page, pageSize });

  const newProduct = can(user, 'products.write') ? (
    <LinkButton href="/products/new">New product</LinkButton>
  ) : null;
  const isFirstRun = status === 'active' && !q && total === 0;

  return (
    <>
      <PageHeader title="Products" description="What Brightloop sells." actions={newProduct} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          basePath={BASE_PATH}
          params={params}
          value={q}
          label="Search products by name"
          placeholder="Search by name"
        />
        <StatusFilter
          basePath={BASE_PATH}
          params={params}
          param="status"
          current={status}
          label="Filter products by status"
        />
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState {...emptyMessage(q, status, total)} action={isFirstRun ? newProduct : null} />
        ) : (
          <Table caption="Products">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH numeric>Sales price</TH>
                <TH numeric>Cost price</TH>
                <TH numeric>Variants</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((product) => (
                <TR key={product.id}>
                  <TD className="min-w-40">
                    <Link
                      href={`/products/${product.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {product.name}
                    </Link>
                  </TD>
                  <TD className="capitalize">{product.type}</TD>
                  <TD numeric>
                    <Money value={product.sales_price} />
                  </TD>
                  <TD numeric>
                    <Money value={product.cost_price} />
                  </TD>
                  <TD numeric>{product.variant_count}</TD>
                  <TD>
                    <Badge tone={product.is_active ? 'success' : 'neutral'}>
                      {product.is_active ? 'Active' : 'Archived'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} total={total} pageSize={pageSize} basePath={BASE_PATH} params={params} />
      </Card>
    </>
  );
}
