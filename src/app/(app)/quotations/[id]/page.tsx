'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'quotation'. `[id]` is the quotations_t id.
//
// The priced lines are the `items` field INSIDE the form (field_type
// 'quotation-items'), so they are written by the page's single Save along with
// the header (§4.17). Their rows live in `quotation_items_t` rather than a JSONB
// column — the §4.5 exception, because the summary export groups them by
// category across quotations; the save route's quotation hook persists them in
// the same transaction as the header they price.
export default function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="quotation" entityId={id} />;
}
