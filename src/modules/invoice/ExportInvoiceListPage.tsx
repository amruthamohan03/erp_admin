'use client';

// §2 step 5 — Export Invoice list (ports the legacy exportinvoice.php list). Five
// stat cards — Pending for Invoicing opens the pending-files modal, the other
// four filter the list — search + created-date range, the DN / INV Excel
// exports, and the row actions: ALL (print, every page), Edit while not yet
// validated, Validate, Mark DGI Verified, Delete.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileSpreadsheet, FileText } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { formatDate } from '@/lib/formatDate';
import PendingInvoicingModal from './PendingInvoicingModal';
import {
  DateRangeFilter, EMPTY_COUNTS, InvoiceStatCards, useInvoiceRowActions, validationBadge,
  type InvoiceCounts, type InvoiceFilter,
} from './invoiceListShared';

interface Row {
  id: number;
  invoice_ref: string | null;
  client_name: string | null;
  mca_count: number;
  type_of_goods: string | null;
  encoded_by: string | null;
  created_at: string | null;
  validated: number;
}

export default function ExportInvoiceListPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<InvoiceCounts>(EMPTY_COUNTS);
  const [pendingOpen, setPendingOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter });
      if (search.trim()) p.set('q', search.trim());
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      const j = await fetch(`/api/v1/export-invoices?${p}`).then((r) => r.json());
      if (j.ok) {
        setItems(j.data);
        setTotal(j.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filter, search, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const loadStats = useCallback(() => {
    fetch('/api/v1/export-invoices/statistics').then((r) => r.json()).then((j) => { if (j.ok) setCounts(j.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const actions = useInvoiceRowActions('export', () => { load(); loadStats(); });

  function exportProfile(profile: 'dn' | 'inv') {
    const p = new URLSearchParams({ profile });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    window.location.assign(`/api/v1/export-invoices/export?${p}`);
  }

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" /> Export Invoices
          </h1>
        </div>
      </div>

      <InvoiceStatCards
        counts={counts}
        filter={filter}
        onFilter={(f) => { setFilter(f); setPage(1); }}
        onPending={() => setPendingOpen(true)}
      />

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Export Invoices"
        searchPlaceholder="Search reference, client, goods, encoded by..."
        emptyMessage="No export invoices match — clear the filters, or create the first one."
        filters={<DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />}
        toolbar={
          <>
            <button type="button" onClick={() => exportProfile('dn')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Export DN
            </button>
            <button type="button" onClick={() => exportProfile('inv')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Export INV
            </button>
            <Link href="/export-invoices/new" className="btn-primary btn-sm">
              <Plus className="h-4 w-4" /> New Export Invoice
            </Link>
          </>
        }
        columns={[
          { key: 'invoice_ref', header: 'Référence Interne', className: 'font-medium' },
          { key: 'client_name', header: 'Client' },
          { key: 'mca_count', header: 'MCA Count', align: 'center', render: (r: Row) => `${r.mca_count} file(s)` },
          { key: 'type_of_goods', header: 'Type of Goods' },
          { key: 'created_at', header: 'Date', render: (r: Row) => formatDate(r.created_at) },
          { key: 'encoded_by', header: 'Encoded By' },
          {
            key: 'validated',
            header: 'Validation',
            value: (r: Row) => validationBadge(r.validated).label,
            render: (r: Row) => validationBadge(r.validated).node,
          },
        ]}
        actions={(r) => ({
          // A validated invoice is final — the save route refuses it too.
          edit: r.validated === 0 ? `/export-invoices/${r.id}` : undefined,
          remove: r.validated === 0 ? () => actions.askDelete(r) : undefined,
          extra: (
            <>
              <button type="button" title="ALL — print every page (Debit Note + Facture)"
                onClick={() => window.open(`/api/v1/export-invoices/${r.id}/print?page=full`, '_blank')}
                className="btn-pdf btn-sm ms-1 h-7 px-2 text-[11px] font-bold">
                ALL
              </button>
              {actions.buttons(r)}
            </>
          ),
        })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {actions.dialogs}
      <PendingInvoicingModal kind="export" open={pendingOpen} onClose={() => setPendingOpen(false)} onChanged={loadStats} />
    </>
  );
}
