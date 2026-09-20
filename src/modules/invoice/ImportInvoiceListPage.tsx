'use client';

// §2 step 5 — Import Invoice list (ports the legacy importinvoice.php list). Five
// stat cards — Pending for Invoicing opens the pending-files modal, the other
// four filter the list — search + created-date range, the three Excel exports,
// and the row actions: PDF (the whole invoice — import prints as one document),
// Edit while not yet validated, Validate, Mark DGI Verified, Delete.
import { useCallback, useEffect, useState } from 'react';
import { Plus, FileText, FileSpreadsheet, Printer } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { formatDate } from '@/lib/formatDate';
import PendingInvoicingModal from './PendingInvoicingModal';
import TransactionFormPanel from '@/components/transactional/TransactionFormPanel';
import {
  DateRangeFilter, EMPTY_COUNTS, InvoiceStatCards, useInvoiceRowActions, validationBadge,
  type InvoiceCounts, type InvoiceFilter,
} from './invoiceListShared';

interface Row {
  id: number;
  invoice_ref: string | null;
  client_id: number | null;
  client_name: string | null;
  type_of_goods: string | null;
  created_at: string | null;
  created_by_name: string | null;
  amount: number;
  validated: number;
}

const fmt = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportInvoiceListPage() {
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
  // main keeps the form on this page: a panel headed "Add New Import Invoice",
  // which the row Edit action reuses for the invoice it was clicked on.
  const [formId, setFormId] = useState('new');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), filter });
      if (search.trim()) p.set('q', search.trim());
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      const j = await fetch(`/api/v1/import-invoices?${p}`).then((r) => r.json());
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
    fetch('/api/v1/import-invoices/statistics').then((r) => r.json()).then((j) => { if (j.ok) setCounts(j.data); }).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const actions = useInvoiceRowActions('import', () => { load(); loadStats(); });

  function exportProfile(profile: 'debit' | 'invoice' | 'full') {
    const p = new URLSearchParams({ profile });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    window.location.assign(`/api/v1/import-invoices/export?${p}`);
  }

  const print = (id: number) => window.open(`/api/v1/import-invoices/${id}/print`, '_blank');

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" /> Import Invoices
          </h1>
        </div>
      </div>

      <InvoiceStatCards
        kind="import"
        counts={counts}
        filter={filter}
        onFilter={(f) => { setFilter(f); setPage(1); }}
        onPending={() => setPendingOpen(true)}
      />

      <TransactionFormPanel
        slug="import-invoices"
        entityId={formId}
        open={formOpen}
        onToggle={() => setFormOpen((v) => !v)}
        onSaved={() => {
          setFormOpen(false);
          setFormId('new');
          load();
          loadStats();
        }}
        onCancel={() => {
          setFormOpen(false);
          setFormId('new');
        }}
        createTitle="Add New Import Invoice"
        editTitle="Edit Import Invoice"
      />

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Import Invoices List"
        searchPlaceholder="Search reference, MCA, client, goods, created by..."
        emptyMessage="No import invoices match — clear the filters, or create the first one."
        filters={<DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />}
        toolbar={
          <>
            <button type="button" onClick={() => exportProfile('debit')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Debit Note
            </button>
            <button type="button" onClick={() => exportProfile('invoice')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Invoice
            </button>
            <button type="button" onClick={() => exportProfile('full')} className="btn-excel btn-sm">
              <FileSpreadsheet className="h-4 w-4" /> Full Export
            </button>
            {/* §4.35 — one create action, last in the toolbar. It opens the
                panel above rather than navigating, because the form lives on
                this page. */}
            <button
              type="button"
              onClick={() => { setFormId('new'); setFormOpen(true); }}
              className="btn-primary btn-sm"
            >
              <Plus className="h-4 w-4" /> New Import Invoice
            </button>
          </>
        }
        columns={[
          { key: 'invoice_ref', header: 'Internal Ref', className: 'font-medium' },
          { key: 'client_name', header: 'Client' },
          { key: 'type_of_goods', header: 'Type of Goods' },
          { key: 'created_at', header: 'Invoice Date', render: (r: Row) => formatDate(r.created_at) },
          { key: 'created_by_name', header: 'Created By' },
          { key: 'amount', header: 'Amount', align: 'right', className: 'tabular-nums font-semibold', render: (r: Row) => fmt(r.amount) },
          {
            key: 'validated',
            header: 'Validation',
            value: (r: Row) => validationBadge(r.validated).label,
            render: (r: Row) => validationBadge(r.validated).node,
          },
        ]}
        actions={(r) => ({
          // A validated invoice is final — the save route refuses it too.
          edit: r.validated === 0 ? () => { setFormId(String(r.id)); setFormOpen(true); } : undefined,
          remove: r.validated === 0 ? () => actions.askDelete(r) : undefined,
          extra: (
            <>
              <button type="button" title="Print / PDF — the full invoice" onClick={() => print(r.id)} className="btn-pdf btn-icon ms-1">
                <Printer className="h-3.5 w-3.5" />
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
      <PendingInvoicingModal kind="import" open={pendingOpen} onClose={() => setPendingOpen(false)} onChanged={loadStats} />
    </>
  );
}
