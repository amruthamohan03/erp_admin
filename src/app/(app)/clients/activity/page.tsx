'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  FileCheck,
  Gauge,
  Send,
  Users,
  Wallet,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import { gradient } from '@/components/ui/cardGradient';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';
import { fetchMasterOptions, type MasterOption } from '@/lib/selectOptions';
import { formatDate } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import type { ClientDashboard } from '@/db/queries/clientDashboard';

// §4.29 — one client, everything open on them.
//
// The sibling /clients/dashboard reports on the client BASE (how many of each
// type, where they are). This answers the question an account manager has before
// a call: what is open for THIS client, how much licence headroom is left, and
// what do they owe. The figures come from /api/v1/clients/activity, aggregated
// in SQL over live rows.

const nf = new Intl.NumberFormat('en-US');
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Tile({
  label,
  value,
  sub,
  color,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</span>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold text-white" title={String(value)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-white/80">{sub}</div>}
    </>
  );
  const className = `card bg-gradient-to-br ${gradient(color)} p-4`;
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={`${className} transition-transform hover:scale-[1.02]`}>
      {body}
    </Link>
  );
}

/** How much of a cap is spent. Null cap means uncapped, not full. */
function Headroom({ used, cap }: { used: number; cap: number | null }) {
  if (cap === null) {
    return <span className="text-xs text-muted-foreground">No cap</span>;
  }
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  // Amber past three quarters, rose once it is spent — the same reading as the
  // status hues (§4.38): waiting, then stopped.
  const tone =
    pct >= 100
      ? 'bg-gradient-to-r from-rose-500 to-red-600'
      : pct >= 75
        ? 'bg-gradient-to-r from-amber-500 to-orange-500'
        : 'bg-gradient-to-r from-emerald-500 to-green-600';
  return (
    <div className="min-w-[8rem]">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {nf2.format(used)} of {nf2.format(cap)} ({pct}%)
      </div>
    </div>
  );
}

export default function ClientActivityDashboardPage() {
  const [clients, setClients] = useState<MasterOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [data, setData] = useState<ClientDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which client `data` describes — null until the first load returns. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Derived rather than its own state: "loading" IS "a client is chosen and what
  // we hold is not yet theirs". Keeping a separate flag would mean setting it
  // synchronously inside the effect, which cascades a render for no gain.
  const loading = clientId !== '' && loadedFor !== clientId;

  // §4.15 — clients are labelled by short code everywhere they are picked.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchMasterOptions('clients', CLIENT_OPTION_LABEL_FIELD);
      if (!cancelled) setClients(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // No client chosen: nothing to fetch, and nothing to clear either — the
    // render gates on `clientId`, so a stale result is never shown. Clearing it
    // here would be a setState in an effect body for no gain.
    if (!clientId) return;
    let cancelled = false;
    void (async () => {
      const res = await safeFetchJson<ClientDashboard>(`/api/v1/clients/activity?client_id=${clientId}`);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message || 'This client could not be loaded.');
        setData(null);
      } else {
        setError(null);
        setData(res.data ?? null);
      }
      // Last, and on the failure path too — otherwise a client that errors would
      // sit under the skeleton for ever instead of showing what went wrong.
      setLoadedFor(clientId);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const k = data?.kpi;
  const maxMonth = useMemo(
    () => Math.max(1, ...(data?.monthly ?? []).flatMap((m) => [m.imports, m.exports])),
    [data],
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Users className="h-5 w-5 text-primary-600" /> Client Activity Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <label className="label mb-0">Client</label>
          <div className="w-64">
            <SearchableSelect
              aria-label="Client"
              value={clientId}
              onChange={setClientId}
              placeholder="Choose a client"
              options={clients.map((c) => ({ value: String(c.id), label: c.label }))}
            />
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!clientId && !loading && (
        <div className="card p-8 text-center text-muted-foreground">
          Choose a client above to see what is open for them.
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-muted" />
          ))}
        </div>
      )}

      {clientId && !loading && data?.client && k && (
        <>
          <div className="card p-4">
            <div className="text-lg font-semibold text-foreground">
              {data.client.short_name ?? '—'}
              {data.client.company_name && (
                <span className="ms-2 text-sm font-normal text-muted-foreground">
                  {data.client.company_name}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {data.client.client_type && <span>Type: {data.client.client_type}</span>}
              {data.client.contact_person && <span>Contact: {data.client.contact_person}</span>}
              {data.client.email && <span>{data.client.email}</span>}
              {data.client.phone && <span>{data.client.phone}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Open Imports"
              value={nf.format(k.imports_open)}
              sub={`${nf.format(k.imports_total)} all time`}
              color="violet"
              icon={<Boxes className="h-4 w-4" />}
              href={`/imports?client_id=${clientId}`}
            />
            <Tile
              label="Open Exports"
              value={nf.format(k.exports_open)}
              sub={`${nf.format(k.exports_total)} all time`}
              color="sky"
              icon={<Send className="h-4 w-4" />}
              href={`/exports?client_id=${clientId}`}
            />
            <Tile
              label="Licences Expiring"
              value={nf.format(k.licenses_expiring)}
              sub={`${nf.format(k.licenses_active)} active of ${nf.format(k.licenses_total)}`}
              color="amber"
              icon={<FileCheck className="h-4 w-4" />}
            />
            <Tile
              label="Outstanding Payments"
              value={nf2.format(k.payments_open_amount)}
              sub={`${nf.format(k.payments_open)} request${k.payments_open === 1 ? '' : 's'} in approval`}
              color="rose"
              icon={<Wallet className="h-4 w-4" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-foreground">Where their files are</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every file on this client, by clearing status.
              </p>
              <ul className="mt-3 space-y-2">
                {data.files_by_status.map((s) => (
                  <li key={s.status ?? 'none'} className="flex items-center justify-between gap-2 text-sm">
                    <StatusBadge status={s.status ?? 'Not set'} />
                    <span className="text-xs text-muted-foreground">
                      {nf.format(s.imports)} import{s.imports === 1 ? '' : 's'} ·{' '}
                      {nf.format(s.exports)} export{s.exports === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
                {data.files_by_status.length === 0 && (
                  <li className="text-sm text-muted-foreground">No files for this client yet.</li>
                )}
              </ul>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold text-foreground">Activity over time</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Files opened per month, over the last twelve.
              </p>
              <div className="mt-3 flex h-36 items-end gap-1">
                {data.monthly.map((m) => (
                  <div
                    key={m.month}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${m.month_name}: ${m.imports} imports, ${m.exports} exports`}
                  >
                    <div className="flex h-28 w-full items-end justify-center gap-0.5">
                      <div
                        className="w-1/2 rounded-t bg-gradient-to-t from-indigo-500 to-violet-500"
                        style={{ height: `${(m.imports / maxMonth) * 100}%` }}
                      />
                      <div
                        className="w-1/2 rounded-t bg-gradient-to-t from-sky-500 to-blue-600"
                        style={{ height: `${(m.exports / maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {m.month_name.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-violet-500" /> Imports
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-sky-500" /> Exports
                </span>
              </div>
            </section>
          </div>

          <DataTable
            title={
              <span className="inline-flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" /> Licence headroom
              </span>
            }
            rows={data.licences}
            rowKey={(l) => l.id}
            searchable={false}
            serial={false}
            customisableColumns={false}
            columnFilters={false}
            autoColumns={false}
            emptyMessage="No licences for this client yet."
            columns={[
              {
                key: 'license_number',
                header: 'Licence',
                className: 'font-mono text-xs',
                render: (l) => l.license_number ?? '—',
              },
              { key: 'kind_name', header: 'Kind', render: (l) => l.kind_name ?? '—' },
              { key: 'status', header: 'Status', badge: true },
              {
                key: 'license_expiry_date',
                header: 'Expiry',
                render: (l) => formatDate(l.license_expiry_date),
              },
              {
                key: 'fob_used',
                header: 'FOB used',
                render: (l) => <Headroom used={l.fob_used} cap={l.fob_cap} />,
              },
              {
                key: 'weight_used',
                header: 'Weight used',
                render: (l) => <Headroom used={l.weight_used} cap={l.weight_cap} />,
              },
            ]}
            actions={(l) => ({ edit: `/licenses/${l.id}` })}
          />

          <DataTable
            title="Recent files"
            rows={data.recent_files}
            rowKey={(r) => `${r.kind}-${r.id}`}
            searchable={false}
            serial={false}
            customisableColumns={false}
            columnFilters={false}
            autoColumns={false}
            emptyMessage="Nothing recorded for this client yet."
            columns={[
              { key: 'ref', header: 'Reference', className: 'font-mono text-xs', render: (r) => r.ref ?? '—' },
              {
                key: 'kind',
                header: 'Type',
                render: (r) => (r.kind === 'import' ? 'Import' : 'Export'),
              },
              { key: 'status', header: 'Status', badge: true },
              { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
            ]}
            actions={(r) => ({
              edit: r.kind === 'import' ? `/imports/${r.id}` : `/exports/${r.id}`,
            })}
          />
        </>
      )}
    </div>
  );
}
