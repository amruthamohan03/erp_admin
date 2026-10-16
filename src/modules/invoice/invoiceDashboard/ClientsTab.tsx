'use client';

import { Coins, FileSpreadsheet, FileText, Trophy, Users } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartCard, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { ClientSummary, InvoiceClients } from '@/db/queries/invoiceDashboardTabs';
import type { InvoiceKind } from '@/schemas/invoice-dashboard';
import { usd } from './OverviewTab';
import { KIND_LABEL, exportHref, tabEndpoint, useTabData } from './useTabData';

// Clients — who the invoices are for. Ranked by billed value, with the count
// beside it, because a client billed twice for $80k matters more than one
// billed ten times for $200.

export default function ClientsTab({ kind, active }: { kind: InvoiceKind; active: boolean }) {
  const { data, loading, error } = useTabData<InvoiceClients>(active ? tabEndpoint(kind, 'clients') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const top = data.clients[0];
  const byCount = [...data.clients].sort((a, b) => b.count - a.count).slice(0, 10);
  const name = (c: ClientSummary): string => c.client_name ?? 'No client';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Users className="h-4 w-4" /> Client Analysis
        </h2>
        <a href={exportHref(kind, 'clients')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(data.total_clients)} label="Clients Invoiced" color="blue" icon={<Users />} />
        <KpiCard value={usd(data.total_usd)} label="Total Billed (USD)" color="green" icon={<Coins />} />
        <KpiCard
          value={top ? name(top) : '—'}
          label="Top Client"
          color="purple"
          icon={<Trophy />}
          sub={top ? `${usd(top.value_usd)} · ${nf2.format(top.share_pct)}% of billing` : 'No invoices yet'}
        />
        <KpiCard
          value={data.total_clients > 0 ? usd(data.total_usd / data.total_clients) : '—'}
          label="Average per Client"
          color="teal"
          icon={<FileText />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Top 10 Clients — by billed value" icon={<Coins className="h-4 w-4" />}>
          <HBarChart
            items={data.clients.slice(0, 10).map((c) => ({
              label: name(c),
              value: c.value_usd,
              note: `${nf.format(c.count)} invoice${c.count === 1 ? '' : 's'}`,
            }))}
            format={usd}
            emptyLabel={`No ${KIND_LABEL[kind].toLowerCase()} invoices yet.`}
          />
        </ChartCard>
        <ChartCard title="Top 10 Clients — by invoice count" icon={<FileText className="h-4 w-4" />}>
          <HBarChart
            items={byCount.map((c) => ({ label: name(c), value: c.count, note: usd(c.value_usd) }))}
            format={(v) => nf.format(v)}
            emptyLabel={`No ${KIND_LABEL[kind].toLowerCase()} invoices yet.`}
          />
        </ChartCard>
      </div>

      <Group title="All Clients" hint={`${nf.format(data.clients.length)} clients`} icon={<Users className="h-4 w-4" />} accentColor="purple">
        <DataTable<ClientSummary>
          rows={data.clients}
          rowKey={(c) => c.client_id ?? 0}
          loading={loading}
          searchPlaceholder="Search client code or name..."
          emptyMessage={`No clients have ${KIND_LABEL[kind].toLowerCase()} invoices yet.`}
          exportHref={exportHref(kind, 'clients')}
          columns={[
            {
              key: 'client_name',
              header: 'Client',
              sortable: true,
              // §4.15 — shows the code, searches the legal name too.
              value: (c) => `${c.client_name ?? ''} ${c.client_company ?? ''}`.trim(),
              render: (c) => <span title={c.client_company ?? undefined}>{name(c)}</span>,
            },
            { key: 'count', header: 'Invoices', align: 'right', sortable: true },
            {
              key: 'value_usd',
              header: 'Total (USD)',
              align: 'right',
              sortable: true,
              render: (c) => <strong className="text-foreground">{nf2.format(c.value_usd)}</strong>,
            },
            { key: 'vat_usd', header: 'VAT', align: 'right', sortable: true, render: (c) => nf2.format(c.vat_usd) },
            { key: 'avg_usd', header: 'Average', align: 'right', sortable: true, render: (c) => nf2.format(c.avg_usd) },
            { key: 'share_pct', header: 'Share', align: 'right', sortable: true, render: (c) => `${nf2.format(c.share_pct)}%` },
            { key: 'verified', header: 'DGI Verified', align: 'right', sortable: true },
            { key: 'pending', header: 'Not Verified', align: 'right', sortable: true },
            { key: 'last_date', header: 'Last Invoice', sortable: true, render: (c) => formatDate(c.last_date) },
          ]}
        />
      </Group>
    </div>
  );
}
