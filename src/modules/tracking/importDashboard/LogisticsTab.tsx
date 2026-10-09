'use client';

import {
  Building2,
  CircleCheck,
  FileSpreadsheet,
  Flag,
  MapPin,
  Route,
  Send,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  AccentCard,
  ChartCard,
  Empty,
  KpiCard,
  SectionHeader,
  TabError,
  TabSkeleton,
  nf,
} from '../dashboardUi';
import { exportHref, tabEndpoint, useTabData } from './useTabData';
import type { ImportLogistics } from '@/db/queries/importDashboardTabs';

// Logistics — where road consignments are along the Zambia → DRC → warehouse
// journey, as the uploaded design's tracking stage cards.
//
// A file is counted at the FIRST leg it has not recorded, so the figures are
// disjoint and add up to the trucks still moving. Each card exports exactly the
// files sitting at it, which is the list a logistics clerk chases.

/** The design cycles a hue and an icon per stage, in journey order. */
const STAGE_STYLE: Array<{ color: string; icon: React.ReactNode }> = [
  { color: 'orange', icon: <Flag /> },
  { color: 'amber', icon: <Send /> },
  { color: 'lime', icon: <Flag /> },
  { color: 'emerald', icon: <Warehouse /> },
  { color: 'sky', icon: <Send /> },
  { color: 'violet', icon: <MapPin /> },
  { color: 'fuchsia', icon: <Route /> },
  { color: 'rose', icon: <Building2 /> },
];

export default function LogisticsTab({ active }: { active: boolean }) {
  const { data, loading, error } = useTabData<ImportLogistics>(
    active ? tabEndpoint('logistics') : null,
  );

  if (error) return <TabError message={error} />;
  if (!data) return loading ? <TabSkeleton tiles={3} panels={2} /> : null;

  const waiting = data.stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Road Shipment Tracking Journey"
        hint="Track shipments leg by leg. Each file is counted at the first leg it has not recorded, so a file appears exactly once."
        icon={<Route className="h-4 w-4" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard value={nf.format(data.total)} label="Total Road Shipments" color="blue" icon={<Truck />} />
        <KpiCard value={nf.format(data.completed)} label="Journey Complete" sub="Reached the final warehouse" color="green" icon={<CircleCheck />} />
        <KpiCard value={nf.format(waiting)} label="Still Moving" sub="Counted at the leg each waits on" color="orange" icon={<Route />} />
      </div>

      {data.total === 0 ? (
        <ChartCard>
          <Empty>No road files yet — this tab covers consignments travelling by road.</Empty>
        </ChartCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.stages.map((s, i) => {
            const style = STAGE_STYLE[i % STAGE_STYLE.length];
            return (
              <AccentCard
                key={s.key}
                large
                color={style.color}
                icon={style.icon}
                badge={`Stage ${i + 1}`}
                value={nf.format(s.count)}
                label={`Waiting on ${s.label}`}
                desc={
                  s.count === 0
                    ? 'nothing waiting here'
                    : `${s.count === 1 ? 'file' : 'files'} not yet recorded`
                }
                action={
                  s.count > 0 ? (
                    <a
                      href={exportHref({ scope: 'stage', stage: s.key })}
                      className="btn-excel btn-sm"
                      title={`Export the ${s.count} file${s.count === 1 ? '' : 's'} waiting on ${s.label}`}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Export
                    </a>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
