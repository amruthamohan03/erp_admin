'use client';

import DataTable from '@/components/ui/DataTable';
import { formatDate } from '@/lib/formatDate';
import { nf, nf2 } from '@/modules/tracking/dashboardUi';
import type { FicheRow } from '@/db/queries/ficheDashboardTabs';
import type { FicheExportScope } from '@/schemas/fiche-dashboard';
import { exportHref, ficheHref } from './useTabData';

/**
 * The fiche list every tab shows — one set of columns, one money format, one
 * empty state (§4.10). Edit is offered only while the fiche's state still has a
 * step out of it, exactly as the fiche list decides; a finished fiche is locked.
 */
export default function FicheTable({
  rows,
  loading,
  emptyMessage,
  terminal,
  scope = 'fiches',
  showAge = false,
}: {
  rows: FicheRow[];
  loading: boolean;
  emptyMessage: string;
  /** Workflow states with no step out — their fiches can no longer be edited. */
  terminal: ReadonlySet<string>;
  scope?: FicheExportScope;
  showAge?: boolean;
}) {
  return (
    <DataTable<FicheRow>
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      searchPlaceholder="Search fiche ref, client, licence, file ref, regime, status, date..."
      emptyMessage={emptyMessage}
      exportHref={exportHref(scope)}
      columns={[
        { key: 'fiche_reference', header: 'Fiche Ref', sortable: true, className: 'font-mono' },
        { key: 'fiche_date', header: 'Fiche Date', sortable: true, render: (r) => formatDate(r.fiche_date) },
        {
          key: 'client_name',
          header: 'Client',
          sortable: true,
          // §4.15 — the column shows the code; searching accepts the legal
          // name too, so text from an outside document still finds the row.
          value: (r) => `${r.client_name ?? ''} ${r.client_company ?? ''}`.trim(),
          render: (r) => <span title={r.client_company ?? undefined}>{r.client_name ?? '—'}</span>,
        },
        { key: 'license_number', header: 'License Number', sortable: true, defaultHidden: true },
        { key: 'mca_ref', header: 'File Ref', sortable: true, className: 'font-mono' },
        { key: 'regime', header: 'Regime', sortable: true, defaultHidden: true },
        { key: 'transport_mode', header: 'Transport', sortable: true, defaultHidden: true },
        { key: 'state_label', header: 'Status', sortable: true, badge: true },
        ...(showAge
          ? [{ key: 'age_days', header: 'Age (days)', align: 'right' as const, sortable: true }]
          : []),
        { key: 'currency', header: 'Currency', sortable: true, defaultHidden: true },
        {
          key: 'cif',
          header: 'CIF',
          align: 'right',
          sortable: true,
          // CIF is in the fiche's own currency, so the code rides with it.
          render: (r) => `${nf2.format(r.cif)} ${r.currency}`,
        },
        {
          key: 'coefficient',
          header: 'Coefficient',
          align: 'right',
          sortable: true,
          defaultHidden: true,
          render: (r) => (r.coefficient === null ? '—' : r.coefficient.toFixed(4)),
        },
        { key: 'lines', header: 'Lines', align: 'right', sortable: true, render: (r) => nf.format(r.lines) },
        {
          key: 'ddi',
          header: 'DDI (CDF)',
          align: 'right',
          sortable: true,
          render: (r) => <strong className="text-foreground">{nf2.format(r.ddi)}</strong>,
        },
        { key: 'verified_at', header: 'Verified On', sortable: true, defaultHidden: true, render: (r) => formatDate(r.verified_at) },
        { key: 'verified_by_name', header: 'Verified By', sortable: true, defaultHidden: true },
        { key: 'audited_at', header: 'Audited On', sortable: true, defaultHidden: true, render: (r) => formatDate(r.audited_at) },
        { key: 'audited_by_name', header: 'Audited By', sortable: true, defaultHidden: true },
      ]}
      actions={(r) => ({ edit: terminal.has(r.state) ? undefined : ficheHref(r.id) })}
    />
  );
}
