'use client';

import {
  Banknote, ChartArea, Coins, DollarSign, FileSpreadsheet, Landmark, Receipt, Ship, Wallet,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { LineChart } from '@/components/charts/Charts';
import { formatDate } from '@/lib/formatDate';
import { EXPORT_AGENCIES } from '@/lib/tracking/exportDateFields';
import {
  ChartBox, ChartCard, Empty, GridTable, Group, KpiCard, TabError, TabSkeleton,
  Td, Th, Tr, compact, nf, nf2,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { ExportPrepayment } from '@/db/queries/exportDashboardTabs';

// Prepayment — what the five agencies charged, and how far each file has got
// through liquidation and quittance.
//
// The five agencies come from one list (`exportDateFields.ts`), so the totals,
// the breakdown table and the trend chart all cover the same set — main had
// those as three unrelated queries each naming the five by hand.

const AGENCY_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  ceec: { color: 'emerald', icon: <Landmark /> },
  cgea: { color: 'amber', icon: <Coins /> },
  occ: { color: 'pink', icon: <Banknote /> },
  lmc: { color: 'violet', icon: <DollarSign /> },
  ogefrem: { color: 'sky', icon: <Ship /> },
};

const money = (v: number): string => nf2.format(v);

export default function PrepaymentTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ExportPrepayment>(
    active ? tabEndpoint('prepayment') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={4} panels={2} /> : null;

  const anyFees = data.totals.agency_fees > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground">
          <DollarSign className="h-4 w-4" /> Prepayment Analytics
        </h2>
        <a href={exportHref({ scope: 'prepayment' })} className="btn-excel btn-sm">
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(['ceec', 'lmc', 'ogefrem'] as const).map((key) => {
          const a = EXPORT_AGENCIES.find((x) => x.key === key)!;
          const style = AGENCY_STYLE[key];
          return (
            <KpiCard
              key={key}
              value={`$${compact.format(data.totals[key] ?? 0)}`}
              label={`Total ${a.label}`}
              sub={money(data.totals[key] ?? 0)}
              color={style.color}
              icon={style.icon}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={`$${compact.format(data.totals.cgea ?? 0)}`} label="Total CGEA" sub={money(data.totals.cgea ?? 0)} color="amber" icon={<Coins />} />
        <KpiCard value={`$${compact.format(data.totals.occ ?? 0)}`} label="Total OCC" sub={money(data.totals.occ ?? 0)} color="pink" icon={<Banknote />} />
        <KpiCard value={`$${compact.format(data.totals.agency_fees)}`} label="Total Agency Fees" sub={money(data.totals.agency_fees)} color="blue" icon={<Receipt />} />
        <KpiCard value={`$${compact.format(data.totals.liquidation)}`} label="Total Liquidation" sub={money(data.totals.liquidation)} color="red" icon={<Wallet />} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          value={nf.format(data.liquidation.count)}
          label="Files Liquidated"
          sub={`${nf.format(data.liquidation.with_reference)} carry a reference · avg ${
            data.liquidation.avg_days_to_liquidation === null
              ? '—'
              : `${data.liquidation.avg_days_to_liquidation} days`
          } after DGDA Out`}
          color="teal"
          icon={<Coins />}
        />
        <KpiCard
          value={nf.format(data.quittance.count)}
          label="Quittances Received"
          sub={`${nf.format(data.quittance.with_reference)} carry a reference · avg ${
            data.quittance.avg_days_from_liquidation === null
              ? '—'
              : `${data.quittance.avg_days_from_liquidation} days`
          } after liquidation`}
          color="lime"
          icon={<Receipt />}
        />
      </div>

      <ChartCard title="Monthly Agency Fees Trend" icon={<ChartArea className="h-4 w-4" />}>
        {!anyFees ? (
          <Empty>No agency fees recorded yet.</Empty>
        ) : (
          <ChartBox span="full">
            {(w) => (
              <LineChart
                labels={data.monthly.map((m) => m.month_short)}
                series={[
                  ...EXPORT_AGENCIES.map((a) => ({
                    label: a.label,
                    values: data.monthly.map((m) => Number(m[a.key] ?? 0)),
                  })),
                  { label: 'Liquidation', values: data.monthly.map((m) => Number(m.liquidation ?? 0)) },
                ]}
                width={w}
                height={200}
                format={(v) => money(v)}
              />
            )}
          </ChartBox>
        )}
      </ChartCard>

      <Group title="Agency Fees Breakdown" icon={<Landmark className="h-4 w-4" />} accentColor="amber">
        <ChartCard>
          <GridTable
            head={
              <tr>
                <Th align="left">Agency</Th>
                <Th>Total</Th>
                <Th>Processed</Th>
                <Th>Avg</Th>
                <Th>Max</Th>
                <Th>Min</Th>
              </tr>
            }
          >
            {data.agencies.map((a) => (
              <Tr key={a.key}>
                <Td align="left"><strong>{a.label}</strong></Td>
                <Td align="right">{money(a.total)}</Td>
                <Td>{nf.format(a.processed)}</Td>
                {/* An em dash, not 0.00: no file was charged zero — none was
                    charged at all, which is a different fact. */}
                <Td align="right">{a.avg === null ? '—' : money(a.avg)}</Td>
                <Td align="right">{a.max === null ? '—' : money(a.max)}</Td>
                <Td align="right">{a.min === null ? '—' : money(a.min)}</Td>
              </Tr>
            ))}
            <Tr tone="total">
              <Td align="left"><strong>GRAND TOTAL</strong></Td>
              <Td align="right"><strong>{money(data.totals.agency_fees)}</strong></Td>
              <Td colSpan={4} />
            </Tr>
          </GridTable>
        </ChartCard>
      </Group>

      <DataTable<ExportPrepayment['files'][number]>
        title="Detailed Prepayment Data"
        rows={data.files}
        rowKey={(r) => r.id}
        searchPlaceholder="Search reference or client..."
        exportHref={exportHref({ scope: 'prepayment' })}
        tableId="export-prepayment"
        autoColumns={false}
        emptyMessage="No export files yet — agency fees appear here once a file carries them."
        columns={[
          { key: 'mca_ref', header: 'MCA Ref', sortable: true, render: (r) => <strong>{r.mca_ref ?? '—'}</strong> },
          { key: 'client_name', header: 'Client', sortable: true, render: (r) => r.client_name ?? '—' },
          { key: 'weight', header: 'Weight', align: 'right', sortable: true, render: (r) => nf2.format(r.weight ?? 0) },
          { key: 'ceec', header: 'CEEC', align: 'right', sortable: true, render: (r) => money(r.ceec) },
          { key: 'cgea', header: 'CGEA', align: 'right', render: (r) => money(r.cgea) },
          { key: 'occ', header: 'OCC', align: 'right', render: (r) => money(r.occ) },
          { key: 'lmc', header: 'LMC', align: 'right', sortable: true, render: (r) => money(r.lmc) },
          { key: 'lmc_id', header: 'LMC ID', render: (r) => r.lmc_id ?? '—', defaultHidden: true },
          { key: 'lmc_date', header: 'LMC Date', render: (r) => formatDate(r.lmc_date), defaultHidden: true },
          { key: 'ogefrem', header: 'OGEFREM', align: 'right', sortable: true, render: (r) => money(r.ogefrem) },
          { key: 'ogefrem_ref', header: 'OGEFREM Ref', render: (r) => r.ogefrem_ref ?? '—', defaultHidden: true },
          { key: 'ogefrem_date', header: 'OGEFREM Date', render: (r) => formatDate(r.ogefrem_date), defaultHidden: true },
          {
            key: 'total_fees',
            header: 'Total Fees',
            align: 'right',
            sortable: true,
            render: (r) => <strong>{money(r.total_fees)}</strong>,
          },
          { key: 'liquidation', header: 'Liquidation', align: 'right', sortable: true, render: (r) => money(r.liquidation) },
        ]}
        actions={(row) => ({ edit: `/exports/${row.id}` })}
      />
    </div>
  );
}
