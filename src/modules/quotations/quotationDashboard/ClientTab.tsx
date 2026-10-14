'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Banknote, Building2, ChartBar, Coins, Contact, Crown, Eye, FileSpreadsheet, FileText,
  Layers, Package, Search, Ship, Tag, Users,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import { HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import { displayLabel } from '@/lib/statusTone';
import {
  ChartCard, Empty, GridTable, Group, KpiCard, TabError, TabSkeleton, Td, Th, Tr, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import { clientEndpoint, exportHref, tabEndpoint, useTabData } from './useTabData';
import type {
  QuotationClientDetail,
  QuotationClients,
} from '@/db/queries/quotationDashboardTabs';

// Client Analysis — who is being quoted, and for how much.
//
// The profile is its own request rather than part of the tab's payload: it is
// opened for one client at a time, and carrying every client's four breakdowns
// to show one would make the tab's first paint pay for all of them.
//
// The picker and the profile head show the short code AND the legal name, which
// §4.15 sanctions precisely here: the client IS the record on this screen, not
// a foreign key rendered into somebody else's column.

const usd = (n: number): string => `$${nf2.format(n)}`;

const BREAKDOWNS: Array<{
  key: keyof QuotationClientDetail['breakdowns'];
  title: string;
  icon: React.ReactNode;
}> = [
  { key: 'kind', title: 'By Kind', icon: <Tag className="h-5 w-5" /> },
  { key: 'transport', title: 'By Transport Mode', icon: <Ship className="h-5 w-5" /> },
  { key: 'goods', title: 'By Type of Goods', icon: <Package className="h-5 w-5" /> },
  { key: 'category', title: 'By Line Category', icon: <Layers className="h-5 w-5" /> },
];

/** `client_type` is a bag of letters — I, E, L — one badge each. */
const CLIENT_TYPES: Record<string, string> = { I: 'Import', E: 'Export', L: 'Local' };

type ClientRow = QuotationClients['clients'][number];

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="min-w-0 truncate text-xs font-medium text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="shrink-0 text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white">
          {icon}
        </span>
        <h4 className="truncate text-sm font-bold text-foreground" title={title}>{title}</h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** The whole profile, taking a settled record — so nothing here is optional. */
function ClientProfile({ client }: { client: QuotationClientDetail }) {
  const code = (client.short_name ?? '??').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] p-6 shadow-sm">
        <span
          className="pointer-events-none absolute -top-24 right-[-5%] h-64 w-64 rounded-full bg-white/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-start gap-5">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-[3px] border-white/30 bg-white/20 text-2xl font-bold text-white">
            {code}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-2xl font-bold text-white" title={client.short_name ?? ''}>
              {client.short_name ?? '—'}
            </h3>
            <p className="truncate text-sm text-white/90" title={client.company_name ?? ''}>
              {client.company_name ?? '—'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[...(client.client_type ?? '')]
                .filter((t) => CLIENT_TYPES[t])
                .map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-white/30 bg-white/20 px-2 py-0.5 text-xs font-semibold text-white"
                  >
                    {CLIENT_TYPES[t]}
                  </span>
                ))}
              <StatusBadge status={displayLabel(client.display)} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
              {[
                { label: 'Quotations', value: nf.format(client.total) },
                { label: 'Total Value', value: usd(client.value_usd) },
                { label: 'Average', value: usd(client.avg_usd) },
                { label: 'Largest', value: usd(client.max_usd) },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-white/20 bg-white/15 p-4 backdrop-blur"
                >
                  <div className="text-[0.7rem] uppercase tracking-wider text-white/90">{s.label}</div>
                  <div className="mt-1.5 truncate text-xl font-bold text-white" title={s.value}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InfoCard icon={<Contact className="h-5 w-5" />} title="Contact">
          <InfoItem label="Contact Person" value={client.contact_person ?? '—'} />
          <InfoItem label="Email" value={client.email ?? '—'} />
          <InfoItem label="Payment Terms" value={client.payment_term ?? '—'} />
          <InfoItem label="Last Quotation" value={formatDate(client.last_quotation_date)} />
          <InfoItem label="Total Lines" value={nf.format(client.lines)} />
        </InfoCard>

        {BREAKDOWNS.map((b) => {
          const list = client.breakdowns[b.key];
          if (list.length === 0) return null;
          return (
            <InfoCard key={b.key} icon={b.icon} title={b.title}>
              {list.map((d) => (
                <InfoItem
                  key={d.label}
                  label={d.label}
                  value={
                    <>
                      {nf.format(d.count)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {usd(d.value_usd)}
                      </span>
                    </>
                  }
                />
              ))}
            </InfoCard>
          );
        })}
      </div>

      {client.recent.length > 0 && (
        <ChartCard title="Recent Quotations" icon={<FileText className="h-4 w-4" />}>
          <GridTable
            head={
              <tr>
                <Th align="left">Quotation Ref</Th>
                <Th>Date</Th>
                <Th align="left">Kind</Th>
                <Th>Lines</Th>
                <Th align="right">Total (USD)</Th>
              </tr>
            }
          >
            {client.recent.map((r) => (
              <Tr key={r.id}>
                <Td align="left">{r.quotation_ref ?? '—'}</Td>
                <Td>{formatDate(r.quotation_date)}</Td>
                <Td align="left">{r.kind_name ?? '—'}</Td>
                <Td>{nf.format(r.line_count)}</Td>
                <Td align="right">
                  <strong>{nf2.format(r.total_amount)}</strong>
                </Td>
              </Tr>
            ))}
          </GridTable>
        </ChartCard>
      )}

      <div className="flex flex-wrap justify-center gap-3 border-t border-border pt-5">
        {/* The list seeds its filters from the query string, so this really
            does open narrowed to this client. */}
        <Link href={`/quotations?client_id=${client.id}`} className="btn-primary">
          <Eye className="h-4 w-4" /> View All Quotations
        </Link>
        <a href={exportHref({ scope: 'client', client_id: client.id })} className="btn-excel">
          <FileSpreadsheet className="h-4 w-4" /> Export Data
        </a>
      </div>
    </div>
  );
}

export default function ClientTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<QuotationClients>(
    active ? tabEndpoint('clients') : null,
  );
  const [clientId, setClientId] = useState('');

  const detail = useTabData<QuotationClientDetail>(
    clientId ? clientEndpoint(Number(clientId)) : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const { stats } = data;

  return (
    <div className="space-y-6">
      <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
        <Users className="h-4 w-4" /> Client Analysis
      </h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(stats.total_clients)} label="Total Clients" color="blue" icon={<Users />} />
        <KpiCard value={nf.format(stats.active_clients)} label="Active Clients" color="green" icon={<Building2 />} />
        <KpiCard
          value={nf.format(stats.with_quotations)}
          label="Clients with Quotations"
          color="violet"
          icon={<FileText />}
        />
        <KpiCard
          value={stats.avg_per_client > 0 ? stats.avg_per_client.toFixed(1) : '—'}
          label="Average Quotations per Client"
          color="orange"
          icon={<ChartBar />}
        />
      </div>

      <div className="rounded-lg border-2 border-border bg-card p-6 shadow-sm">
        <label
          htmlFor="quotation-dashboard-client"
          className="label mb-3 flex items-center gap-2 text-base font-semibold"
        >
          <Search className="h-4 w-4" /> Select Client for Detailed Analysis
        </label>
        <SearchableSelect
          id="quotation-dashboard-client"
          value={clientId}
          onChange={setClientId}
          options={data.clients.map((c) => ({
            value: String(c.id),
            label: `${c.short_name ?? c.id} — ${c.company_name ?? ''} (${c.total} quotation${
              c.total === 1 ? '' : 's'
            })`,
          }))}
          emptyLabel="— Choose a Client —"
          placeholder="— Choose a Client —"
        />
      </div>

      {clientId ? (
        detail.error ? (
          <TabError message={detail.error} />
        ) : !detail.data ? (
          <ChartCard><Empty>Loading client details…</Empty></ChartCard>
        ) : (
          // The hook keeps the previous profile on screen while the next one is
          // in flight; dimming it says so, rather than showing one client's
          // figures under another client's name as settled fact.
          <div className={detail.loading ? 'opacity-50 transition-opacity' : ''}>
            <ClientProfile client={detail.data} />
          </div>
        )
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Top Clients by Value" icon={<Crown className="h-4 w-4" />}>
          <HBarChart
            items={data.clients.slice(0, 10).map((c) => ({
              label: c.short_name ?? String(c.id),
              value: c.value_usd,
              note: `${nf.format(c.total)} quotation${c.total === 1 ? '' : 's'}`,
            }))}
            format={(v) => usd(v)}
            emptyLabel="No client has been quoted yet."
          />
        </ChartCard>

        <ChartCard title="Top Clients by Count" icon={<ChartBar className="h-4 w-4" />}>
          <HBarChart
            items={[...data.clients]
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
              .map((c) => ({ label: c.short_name ?? String(c.id), value: c.total }))}
            format={(v) => nf.format(v)}
            emptyLabel="No client has been quoted yet."
          />
        </ChartCard>
      </div>

      <Group title="Clients" icon={<Building2 className="h-4 w-4" />} accentColor="violet">
        <DataTable<ClientRow>
          rows={data.clients}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search client code, company..."
          emptyMessage="No client has been quoted yet."
          columns={[
            { key: 'short_name', header: 'Client', sortable: true },
            { key: 'company_name', header: 'Company', sortable: true },
            { key: 'total', header: 'Quotations', align: 'right', sortable: true },
            {
              key: 'value_usd',
              header: 'Total Value (USD)',
              align: 'right',
              sortable: true,
              render: (r) => <strong className="text-foreground">{nf2.format(r.value_usd)}</strong>,
            },
            {
              key: 'avg_usd',
              header: 'Average (USD)',
              align: 'right',
              sortable: true,
              render: (r) => nf2.format(r.avg_usd),
            },
            {
              key: 'last_quotation_date',
              header: 'Last Quotation',
              sortable: true,
              render: (r) => formatDate(r.last_quotation_date),
            },
          ]}
          actions={(row) => ({ view: () => setClientId(String(row.id)) })}
        />
      </Group>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Coins className="h-3.5 w-3.5" />
        Values are quotation totals in USD. A client quoted in CDF shows its USD
        total here; the CDF figures are on the Value tab.
        <Banknote className="h-3.5 w-3.5" />
      </p>
    </div>
  );
}
