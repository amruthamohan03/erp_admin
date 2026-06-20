'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import QuotationBuilder, {
  type InitialQuotation,
} from '@/components/quotations/QuotationBuilder';

// Wrapper for the /quotations/[id] edit route. Loads the quotation
// (header + items) once, then hands the data to QuotationBuilder which
// owns the actual form state + save path.

interface DetailResponse {
  header: {
    id: number;
    client_id: number;
    quotation_ref: string;
    quotation_date: string | null;
    kind_id: number | null;
    transport_mode_id: number | null;
    goods_type_id: number | null;
    arsp: string | null;
  };
  items: Array<{
    category_id: number | null;
    item_id: number | null;
    unit_id: number | null;
    currency_id: number | null;
    has_tva: boolean;
    quantity: string;
    taux_usd: string | null;
    cost_usd: string | null;
    cif_split: string | null;
    percentage: string | null;
    rate_cdf: string | null;
  }>;
}

export default function EditQuotationPage() {
  const params = useParams<{ id: string }>();
  const quotationId = params?.id;

  const [initial, setInitial] = React.useState<InitialQuotation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/quotations/${quotationId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error?.message ?? 'Failed to load quotation');
          return;
        }
        const d = json.data as DetailResponse;
        setInitial({
          id: d.header.id,
          header: {
            client_id: d.header.client_id,
            quotation_ref: d.header.quotation_ref,
            quotation_date: d.header.quotation_date,
            kind_id: d.header.kind_id,
            transport_mode_id: d.header.transport_mode_id,
            goods_type_id: d.header.goods_type_id,
            arsp: d.header.arsp,
          },
          items: d.items,
        });
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  if (loading) {
    return (
      <div className="text-sm text-slate-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quotation…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
        {error}
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="text-sm text-slate-500">Quotation not found.</div>
    );
  }
  return <QuotationBuilder initial={initial} />;
}
