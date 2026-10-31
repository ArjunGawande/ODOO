import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  Money,
  PageHeader,
  Pagination,
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
import { parseId, parseStatus } from '@backend/lib/validation/products';
import { getProduct, getVariant, listVariants } from '@backend/services/products';

import { formatExtra } from '../price-preview';
import { RecordAction } from '../RecordAction';
import { StatusFilter } from '../StatusFilter';
import { VariantForm } from '../VariantForm';

export const metadata = { title: 'Product' };

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function variantEmptyTitle(status, total) {
  if (total > 0) return 'No variants on this page';
  return status === 'archived' ? 'No archived variants' : 'No variants yet';
}

export default async function ProductPage({ params, searchParams }) {
  const user = await requirePermission('products.read');
  const id = parseId((await params).id);
  if (!id) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  const query = await searchParams;
  const { page, pageSize } = parsePagination(query);
  const status = parseStatus(query.variants);
  const { rows: variants, total } = await listVariants(id, { status, page, pageSize });

  const canWrite = can(user, 'products.write');
  // Archived products are read-only, so they offer Restore and nothing else.
  const canEdit = canWrite && product.is_active;
  const requested = canEdit ? await getVariant(id, query.edit) : null;
  const editing = requested?.is_active ? requested : null;
  const saved = parseId(query.saved);

  const basePath = `/products/${id}`;
  const listParams = {
    variants: status === 'archived' ? status : undefined,
    pageSize: query.pageSize,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        backHref="/products"
        backLabel="Products"
        actions={
          canWrite ? (
            <>
              {canEdit ? (
                <LinkButton variant="secondary" href={`${basePath}/edit`}>
                  Edit
                </LinkButton>
              ) : null}
              <RecordAction
                key={product.is_active ? 'archive' : 'restore'}
                kind={product.is_active ? 'archiveProduct' : 'restoreProduct'}
                fields={{ id }}
                name={product.name}
                size="md"
              />
            </>
          ) : null
        }
      />

      {product.is_active ? null : (
        <Alert tone="warning">This product is archived, so it can&apos;t be sold or changed.</Alert>
      )}

      <Card title="Details">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Type">
            <span className="capitalize">{product.type}</span>
          </Detail>
          <Detail label="Sales price">
            <Money value={product.sales_price} />
          </Detail>
          <Detail label="Cost price">
            <Money value={product.cost_price} />
          </Detail>
          <Detail label="Status">
            <Badge tone={product.is_active ? 'success' : 'neutral'}>
              {product.is_active ? 'Active' : 'Archived'}
            </Badge>
          </Detail>
          <div className="sm:col-span-2 lg:col-span-4">
            <Detail label="Notes">
              {product.notes ? (
                <span className="break-words whitespace-pre-wrap">{product.notes}</span>
              ) : (
                <span className="text-ink-muted">None</span>
              )}
            </Detail>
          </div>
        </dl>
      </Card>

      <div id="variants" className="scroll-mt-20 space-y-6">
        {saved && !editing ? <Alert tone="success">Variant saved.</Alert> : null}

        <Card
          flush
          title="Variants"
          description="A variant adds its extra to the sales price."
          actions={
            <StatusFilter
              basePath={basePath}
              params={listParams}
              param="variants"
              current={status}
              label="Filter variants by status"
              hash="#variants"
            />
          }
        >
          {variants.length === 0 ? (
            <EmptyState title={variantEmptyTitle(status, total)} />
          ) : (
            <Table caption={`Variants of ${product.name}`}>
              <THead>
                <TR>
                  <TH>Attribute</TH>
                  <TH>Value</TH>
                  <TH numeric>Extra</TH>
                  <TH numeric>Final price</TH>
                  {canEdit ? <TH className="text-right">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {variants.map((variant) => {
                  const label = `${variant.attribute} ${variant.value}`;
                  const fields = { product_id: id, variant_id: variant.id };
                  return (
                    <TR key={variant.id}>
                      <TD>{variant.attribute}</TD>
                      <TD>{variant.value}</TD>
                      <TD numeric>{formatExtra(variant.extra_price)}</TD>
                      <TD numeric>
                        <Money value={variant.final_price} className="font-semibold" />
                      </TD>
                      {canEdit ? (
                        <TD className="text-right whitespace-nowrap">
                          {variant.is_active ? (
                            <>
                              <Link
                                href={`${basePath}?edit=${variant.id}#variant-form`}
                                aria-label={`Edit ${label}`}
                                className="mr-3 text-sm font-medium text-accent-strong hover:underline"
                              >
                                Edit
                              </Link>
                              <RecordAction kind="archiveVariant" fields={fields} name={label} />
                            </>
                          ) : (
                            <RecordAction kind="restoreVariant" fields={fields} name={label} />
                          )}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            basePath={basePath}
            params={listParams}
          />
        </Card>

        {canEdit ? (
          <div id="variant-form" className="scroll-mt-20">
            <Card title={editing ? `Edit ${editing.attribute}: ${editing.value}` : 'Add a variant'}>
              <VariantForm
                key={editing ? `edit-${editing.id}` : `add-${saved ?? 0}`}
                productId={id}
                salesPrice={product.sales_price}
                variant={
                  editing
                    ? {
                        id: editing.id,
                        attribute: editing.attribute,
                        value: editing.value,
                        extra_price: editing.extra_price,
                      }
                    : undefined
                }
              />
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
