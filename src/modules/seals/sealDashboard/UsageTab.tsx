'use client';

import {
  ChartBar, Copy, FileQuestion, FileSpreadsheet, FileText, MapPin, ShieldAlert, ShieldQuestion,
  Truck, Users,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { ComboChart, HBarChart, StackedColumnChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import {
  ChartBox, ChartCard, Empty, Group, KpiCard, TabError, TabSkeleton, nf, nf2,
} from '@/modules/tracking/dashboardUi';
import type { ClientUsage, FileRow, SealUsage } from '@/db/queries/sealDashboardTabs';
import { exportFileHref, exportHref, tabEndpoint, useTabData } from './useTabData';

// Usage — where the seals went: per month, per client, per export file, and how
// many were lost to damage on the way.
//
// The second row of cards is the §4.37 reconciliation between the register and
// the files: each counts a way the two disagree, so a zero is the healthy state.

const pct = (v: number): string => `${nf2.format(v)}%`;

export default function UsageTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<SealUsage>(active ? tabEndpoint('usage') : null);

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={8} panels={3} /> : null;

  const { kpi, monthly, clients, files, office_damage: officeDamage, damage_monthly: damageMonthly } = data;
  const used = officeDamage.reduce((s, o) => s + o.used, 0);
  const damaged = officeDamage.reduce((s, o) => s + o.damaged, 0);
  const damageRate = used + damaged > 0 ? (damaged / (used + damaged)) * 100 : 0;
  const name = (c: ClientUsage): string => c.client_name ?? 'No client';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <Truck className="h-4 w-4" /> Seal Usage
        </h2>
        <a href={exportHref('files')} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export Files
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={nf.format(kpi.files_with_seals)} label="Export Files with Seals" color="blue" icon={<FileText />} />
        <KpiCard
          value={nf.format(kpi.seal_entries)}
          label="Seals on Export Files"
          color="violet"
          icon={<Truck />}
          sub={`${nf.format(kpi.distinct_seals)} distinct seal number${kpi.distinct_seals === 1 ? '' : 's'}`}
        />
        <KpiCard value={nf.format(kpi.clients)} label="Clients" color="teal" icon={<Users />} />
        <KpiCard
          value={used + damaged > 0 ? pct(damageRate) : '—'}
          label="Damaged Rate"
          color="rose"
          icon={<ShieldAlert />}
          sub={`${nf.format(damaged)} damaged of ${nf.format(used + damaged)} used or damaged`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          value={nf.format(kpi.shared_seals)}
          label="Seals on More Than One File"
          color={kpi.shared_seals > 0 ? 'red' : 'slate'}
          icon={<Copy />}
        />
        <KpiCard
          value={nf.format(kpi.available_on_file)}
          label="Available but on a File"
          color={kpi.available_on_file > 0 ? 'red' : 'slate'}
          icon={<ShieldQuestion />}
          sub="Could be issued a second time"
        />
        <KpiCard
          value={nf.format(kpi.unregistered)}
          label="On a File, Not in Register"
          color={kpi.unregistered > 0 ? 'amber' : 'slate'}
          icon={<FileQuestion />}
        />
        <KpiCard
          value={nf.format(kpi.used_off_file)}
          label="Used but on No File"
          color={kpi.used_off_file > 0 ? 'amber' : 'slate'}
          icon={<FileQuestion />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Seals Applied per Month (Last 12 Months)" icon={<ChartBar className="h-4 w-4" />}>
          {monthly.every((m) => m.seals === 0) ? (
            <Empty>No export file in the last twelve months names a seal.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <ComboChart
                  labels={monthly.map((m) => m.month_short)}
                  columns={{ label: 'Seals', values: monthly.map((m) => m.seals) }}
                  line={{ label: 'Export files', values: monthly.map((m) => m.files) }}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
        </ChartCard>

        <ChartCard title="Top 10 Clients — by seals" icon={<Users className="h-4 w-4" />}>
          <HBarChart
            items={clients.slice(0, 10).map((c) => ({
              label: name(c),
              value: c.seals,
              note: `${nf.format(c.files)} file${c.files === 1 ? '' : 's'}`,
            }))}
            format={(v) => nf.format(v)}
            emptyLabel="No export file names a seal yet."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Used vs Damaged per Month (Last 12 Months)" icon={<ShieldAlert className="h-4 w-4" />}>
          {damageMonthly.every((m) => m.used === 0 && m.damaged === 0) ? (
            <Empty>No seal was marked Used or Damaged in the last twelve months.</Empty>
          ) : (
            <ChartBox span="full">
              {(w) => (
                <StackedColumnChart
                  labels={damageMonthly.map((m) => m.month_short)}
                  series={[
                    { label: 'Used', values: damageMonthly.map((m) => m.used) },
                    { label: 'Damaged', values: damageMonthly.map((m) => m.damaged) },
                  ]}
                  width={w}
                  height={200}
                  format={(v) => nf.format(v)}
                />
              )}
            </ChartBox>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Dated by when the seal was last changed in the register.
            {damageMonthly.some((m) => m.damaged > 0) &&
              ` Damaged rate: ${damageMonthly
                .filter((m) => m.used + m.damaged > 0)
                .map((m) => `${m.month_short} ${pct(m.damaged_rate)}`)
                .join(' · ')}`}
          </p>
        </ChartCard>

        <ChartCard title="Damaged Rate per Office" icon={<MapPin className="h-4 w-4" />}>
          <HBarChart
            items={officeDamage.map((o) => ({
              label: o.office_name,
              value: o.damaged_rate,
              note: `${nf.format(o.damaged)} of ${nf.format(o.used + o.damaged)}`,
            }))}
            format={pct}
            emptyLabel="No office has registered seal numbers yet."
          />
        </ChartCard>
      </div>

      <Group title="Export Files with Seals" hint={`${nf.format(files.length)} files`} icon={<FileText className="h-4 w-4" />} accentColor="blue">
        <DataTable<FileRow>
          rows={files}
          rowKey={(f) => f.export_id}
          loading={loading}
          searchPlaceholder="Search MCA ref, client, seal number, date..."
          emptyMessage="No export file names a seal yet — seals are added on the export file's Seals section."
          exportHref={exportHref('files')}
          columns={[
            { key: 'mca_ref', header: 'MCA Ref', sortable: true, render: (f) => f.mca_ref ?? `export #${f.export_id}` },
            { key: 'used_on', header: 'Date', sortable: true, render: (f) => formatDate(f.used_on) },
            {
              key: 'client_name',
              header: 'Client',
              sortable: true,
              // §4.15 — shows the code, searches the legal name too.
              value: (f) => `${f.client_name ?? ''} ${f.client_company ?? ''}`.trim(),
              render: (f) => <span title={f.client_company ?? undefined}>{f.client_name ?? '—'}</span>,
            },
            {
              key: 'seal_count',
              header: 'Seals',
              align: 'right',
              sortable: true,
              render: (f) => <strong className="text-foreground">{nf.format(f.seal_count)}</strong>,
            },
            {
              key: 'number_of_seals',
              header: 'No. of Seals',
              align: 'right',
              sortable: true,
              defaultHidden: true,
              render: (f) =>
                f.number_of_seals === null ? (
                  '—'
                ) : (
                  <span
                    className={f.number_of_seals !== f.seal_count ? 'font-semibold text-destructive' : undefined}
                    title={f.number_of_seals !== f.seal_count ? 'Differs from the seals the file lists' : undefined}
                  >
                    {nf.format(f.number_of_seals)}
                  </span>
                ),
            },
            {
              key: 'seals',
              header: 'Seal Numbers',
              sortable: true,
              render: (f) => (
                <span className="block max-w-[28rem] truncate font-mono" title={f.seals}>
                  {f.seals}
                </span>
              ),
            },
            { key: 'unregistered', header: 'Not in Register', align: 'right', sortable: true, defaultHidden: true },
          ]}
          actions={(f) => ({ edit: exportFileHref(f.export_id) })}
        />
      </Group>

      <Group title="Seals by Client" hint={`${nf.format(clients.length)} clients`} icon={<Users className="h-4 w-4" />} accentColor="teal">
        <DataTable<ClientUsage>
          rows={clients}
          rowKey={(c) => c.client_id ?? 0}
          loading={loading}
          searchPlaceholder="Search client code or name..."
          emptyMessage="No client has an export file naming a seal yet."
          exportHref={exportHref('clients')}
          columns={[
            {
              key: 'client_name',
              header: 'Client',
              sortable: true,
              value: (c) => `${c.client_name ?? ''} ${c.client_company ?? ''}`.trim(),
              render: (c) => <span title={c.client_company ?? undefined}>{name(c)}</span>,
            },
            { key: 'files', header: 'Files', align: 'right', sortable: true },
            {
              key: 'seals',
              header: 'Seals',
              align: 'right',
              sortable: true,
              render: (c) => <strong className="text-foreground">{nf.format(c.seals)}</strong>,
            },
            { key: 'share_pct', header: 'Share', align: 'right', sortable: true, render: (c) => pct(c.share_pct) },
            { key: 'last_date', header: 'Last File', sortable: true, render: (c) => formatDate(c.last_date) },
          ]}
        />
      </Group>
    </div>
  );
}
