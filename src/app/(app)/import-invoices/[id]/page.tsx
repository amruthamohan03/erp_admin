'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'import-invoices'. `[id]` is the
// import_invoices_t id.
//
// The MCA-detail + line-item grid is the `invoice_grid` field INSIDE the form
// (field_type 'invoice-grid'), so its rows are written by the page's single
// Save along with the header (§4.17).
//
// It used to render BELOW this page as a second component with its own Save
// button and its own endpoint. That is the shape §4.17 forbids and it failed in
// three ways: two controls wrote the same invoice, so saving one silently
// discarded the other's edits; the header's totals and its stored lines could
// disagree between the two clicks; and /import-invoices/new had no grid at all,
// so an invoice could not be created with its items in one go.
export default function ImportInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="import-invoices" entityId={id} />;
}
