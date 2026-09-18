'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export-invoices'. `[id]` is the
// export_invoices_t id.
//
// The MCA files and priced lines are the `invoice_grid` field INSIDE the form
// (field_type 'invoice-grid', props.kind 'export'), so the page's single Save
// writes the header and its children in one transaction (§4.17). The grid used
// to render below this page with a Save of its own — two controls writing one
// invoice, where saving either silently discarded the other's edits.
export default function ExportInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="export-invoices" entityId={id} />;
}
