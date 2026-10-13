'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Contact, BadgeCheck, Banknote, Building2, ChartBar, ChartPie, CreditCard, Eye,
  FileSpreadsheet, FileText, Package, Search, Ship, UserCheck, Users,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import { HBarChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import { displayLabel } from '@/lib/statusTone';
import {
  ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf,
} from '@/modules/tracking/dashboardUi';
import {
  clientEndpoint, exportHref, tabEndpoint, useTabData, type LicenseUseForValue,
} from './useTabData';
import type { LicenseClientDetail, LicenseClients } from '@/db/queries/licenseDashboardTabs';

// Client Analysis — who holds the book, and one client's profile in full.
//
// The profile is its own request rather than part of the tab's payload: it is
// opened for one client at a time, and carrying every client's five breakdowns
// to show one would make the tab's first paint pay for all of them. That is
// what the upload's AJAX call did too; here it is a typed GET with the same
// envelope as everything else (§4.4).
//
// The picker and the profile head show the short code AND the legal name,
// which §4.15 sanctions precisely here: the client IS the record on this
// screen, not a foreign key rendered into somebody else's column.

/** The five breakdowns, in the order the uploaded panel stacks them. */
const BREAKDOWNS: Array<{
  key: keyof LicenseClientDetail['breakdowns'];
  title: string;
  icon: React.ReactNode;
}> = [
  { key: 'status', title: 'Status Breakdown', icon: <ChartPie className="h-5 w-5" /> },
  { key: 'transport', title: 'Transport Modes', icon: <Ship className="h-5 w-5" /> },
  { key: 'goods', title: 'Type of Goods', icon: <Package className="h-5 w-5" /> },
  { key: 'bank', title: 'Banking Partners', icon: <Banknote className="h-5 w-5" /> },
  { key: 'payment', title: 'Payment Methods', icon: <CreditCard className="h-5 w-5" /> },
];

/** `client_type` is a bag of letters — I, E, L — one badge each. */
const CLIENT_TYPES: Record<string, string> = { I: 'Import', E: 'Export', L: 'Local' };

type ClientRow = LicenseClients['clients'][number];

/** One label/value line inside an info card. */
function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

/** A bordered panel with the upload's gradient icon tile in its header. */
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
function ClientProfile({
  client,
  basePath,
  useFor,
}: {
  client: LicenseClientDetail;
  basePath: string;
  useFor: LicenseUseForValue;
}) {
  const inactive = Math.max(client.total - client.active, 0);
  const share = Math.min(Math.max(client.success_rate, 0), 100);
  const code = (client.short_name ?? '??').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      {/* The gradient head. Everything on it is white on a known surface,
          which §4.32 allows without a `dark:` twin. */}
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

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: 'Total Licenses', value: nf.format(client.total) },
                { label: 'Active Licenses', value: nf.format(client.active) },
                { label: 'Success Rate', value: `${share}%` },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-white/20 bg-white/15 p-4 backdrop-blur"
                >
                  <div className="text-[0.7rem] uppercase tracking-wider text-white/90">
                    {s.label}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InfoCard icon={<ChartBar className="h-5 w-5" />} title="Performance">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Success Rate</span>
              <span className="font-bold text-[#667eea]">{share}%</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={share}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Share of this client's licences that are active"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2]"
                style={{ width: `${share}%` }}
              />
            </div>
          </div>
          <InfoItem label="Total Licenses" value={nf.format(client.total)} />
          <InfoItem
            label="Active"
            value={<span className="text-emerald-600 dark:text-emerald-400">{nf.format(client.active)}</span>}
          />
          <InfoItem
            label="Inactive"
            value={<span className="text-rose-600 dark:text-rose-400">{nf.format(inactive)}</span>}
          />
        </InfoCard>

        <InfoCard icon={<Contact className="h-5 w-5" />} title="Contact">
          <InfoItem label="Contact Person" value={client.contact_person ?? '—'} />
          <InfoItem label="Email" value={client.email ?? '—'} />
          <InfoItem label="Payment Terms" value={client.payment_term ?? '—'} />
          <InfoItem label="Last License" value={formatDate(client.last_license_date)} />
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
                        licence{d.count === 1 ? '' : 's'}
                      </span>
                    </>
                  }
                />
              ))}
            </InfoCard>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-3 border-t border-border pt-5">
        {/* The list seeds its filters from the query string, so this really
            does open narrowed to this client. */}
        <Link href={`${basePath}?client_id=${client.id}`} className="btn-primary">
          <Eye className="h-4 w-4" /> View All Licenses
        </Link>
        <a
          href={exportHref({ scope: 'client', client_id: client.id, use_for: useFor })}
          className="btn-excel"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export Data
        </a>
      </div>
    </div>
  );
}

export default function ClientTab({
  active,
  useFor,
  basePath,
}: {
  active: boolean;
  useFor: LicenseUseForValue;
  basePath: string;
}) {
  const { data, loading, error } = useTabData<LicenseClients>(
    active ? tabEndpoint('clients', useFor) : null,
  );
  const [clientId, setClientId] = useState('');

  // The panel's own fetch, keyed by the picked client — null until one is
  // picked is what keeps the tab from loading a profile nobody asked for.
  const detail = useTabData<LicenseClientDetail>(
    clientId ? clientEndpoint(Number(clientId), useFor) : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const { stats } = data;
  const top = data.clients.slice(0, 10).map((c) => ({
    label: c.short_name ?? String(c.id),
    value: c.total,
  }));

  return (
    <div className="space-y-6">
      <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
        <Users className="h-4 w-4" /> Client Analysis
      </h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(stats.total_clients)} label="Total Clients" color="blue" icon={<Users />} />
        <KpiCard value={nf.format(stats.active_clients)} label="Active Clients" color="green" icon={<UserCheck />} />
        <KpiCard value={nf.format(stats.verified_clients)} label="Verified Clients" color="purple" icon={<BadgeCheck />} />
        <KpiCard value={nf.format(stats.with_licenses)} label="Clients with Licenses" color="orange" icon={<FileText />} />
      </div>

      <div className="rounded-lg border-2 border-border bg-card p-6 shadow-sm">
        <label
          htmlFor="license-dashboard-client"
          className="label mb-3 flex items-center gap-2 text-base font-semibold"
        >
          <Search className="h-4 w-4" /> Select Client for Detailed Analysis
        </label>
        <SearchableSelect
          id="license-dashboard-client"
          value={clientId}
          onChange={setClientId}
          options={data.clients.map((c) => ({
            value: String(c.id),
            // Both names: on this screen the client is the record, which is
            // the one place §4.15 allows the legal name beside the code.
            label: `${c.short_name ?? c.id} — ${c.company_name ?? ''} (${c.total} licence${
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
          // The hook keeps the previous profile on screen while the next one
          // is in flight; dimming it says so, rather than showing one client's
          // figures under another client's name as settled fact.
          <div className={detail.loading ? 'opacity-50 transition-opacity' : ''}>
            <ClientProfile client={detail.data} basePath={basePath} useFor={useFor} />
          </div>
        )
      ) : null}

      <ChartCard title="Top Clients by Licence Count" icon={<ChartBar className="h-4 w-4" />}>
        <HBarChart
          items={top}
          format={(v) => nf.format(v)}
          emptyLabel="No client holds a licence yet."
        />
      </ChartCard>

      {/* Not in the upload, which left the dropdown as the only way in. A
          picker cannot be sorted, searched or exported, and the figures the
          dropdown labels each option with are exactly a table's columns —
          so the list that feeds the picker is a `<DataTable>` (§4.25). */}
      <Group title="Clients" icon={<Building2 className="h-4 w-4" />} accentColor="violet">
        <DataTable<ClientRow>
          rows={data.clients}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search client code, company..."
          emptyMessage="No client holds a licence yet."
          columns={[
            { key: 'short_name', header: 'Client', sortable: true },
            { key: 'company_name', header: 'Company', sortable: true },
            { key: 'total', header: 'Licences', align: 'right', sortable: true },
            { key: 'active', header: 'Active', align: 'right', sortable: true },
            {
              key: 'success_rate',
              header: 'Success Rate',
              align: 'right',
              sortable: true,
              render: (r) => `${r.success_rate ?? 0}%`,
            },
          ]}
          actions={(row) => ({ view: () => setClientId(String(row.id)) })}
        />
      </Group>
    </div>
  );
}
