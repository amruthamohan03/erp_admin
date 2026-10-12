'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarRange,
  ChartLine,
  ClipboardCheck,
  FileSpreadsheet,
  Gauge,
  Import,
  LayoutGrid,
  Route,
  Truck,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OverviewTab from './OverviewTab';
import BriefingTab from './BriefingTab';
import LogisticsTab from './LogisticsTab';
import TriPhaseTab from './TriPhaseTab';
import OfficesTab from './OfficesTab';
import BorderSection from './BorderSection';
import ReportsTab from './ReportsTab';

// §4.29 — the Import Tracking dashboard.
//
// Seven views over one module, so they are tabs on one screen rather than seven
// routes: an operator comparing "where are files stuck" with "what is missing a
// date" is answering one question, and the figures have to be side by side.
//
// Only the open tab fetches. Each panel's data endpoint is its own request
// (`tabs/[tab]`), because the Briefing table reads every cleared file and the
// Reports tab runs 28 conditional counts — nobody opening the Overview should
// pay for either. A tab that has been opened keeps its data, so switching back
// is instant and does not flash a skeleton.

const TABS = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'briefing', label: 'Briefing', icon: ClipboardCheck },
  { key: 'logistics', label: 'Logistics', icon: Truck },
  { key: 'triphase', label: 'Tri Phase', icon: CalendarRange },
  { key: 'offices', label: 'Declaration Office', icon: Building2 },
  { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { key: 'kasumbalesa', label: 'Kasumbalesa', icon: LayoutGrid },
] as const;

export default function ImportDashboardView() {
  const [tab, setTab] = useState<string>('overview');
  // Opened-once set: a tab keeps rendering (and keeps its data) after the
  // operator moves on, so coming back is instant.
  const [opened, setOpened] = useState<Set<string>>(new Set(['overview']));

  function onChange(next: string): void {
    setTab(next);
    setOpened((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  const was = (key: string): boolean => opened.has(key);

  /**
   * `forceMount` keeps an opened tab in the tree; `hidden` is what actually
   * hides it. Radix sets `hidden: !present` BEFORE spreading our props, so ours
   * wins — without it every opened tab would render at once.
   */
  const panel = (key: string, node: React.ReactNode) => (
    <TabsContent
      key={key}
      value={key}
      forceMount={was(key) ? true : undefined}
      hidden={tab !== key}
      className="mt-0"
    >
      {was(key) && node}
    </TabsContent>
  );

  return (
    <div className="space-y-5">
      {/* The design's dashboard header: title, subtitle, actions on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <Import className="h-7 w-7" />
            Import Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive import analytics and insights
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/imkpi" className="btn-neutral btn-sm">
            <Gauge className="h-4 w-4" /> Delay KPI
          </Link>
          <Link href="/imports" className="btn-primary btn-sm">
            <Import className="h-4 w-4" /> Imports
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onChange}>
        {/* A scrolling strip rather than a wrapping one: seven tabs do not fit a
            phone, and two rows of tabs push the content down on every screen. */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card p-2.5">
          <TabsList className="h-auto w-max flex-nowrap gap-1 bg-transparent p-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="gap-2 rounded-md px-5 py-3 text-sm font-semibold text-foreground data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#667eea] data-[state=active]:to-[#764ba2] data-[state=active]:text-white data-[state=inactive]:hover:bg-muted"
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {panel('overview', <OverviewTab active />)}
        {panel('briefing', <BriefingTab active />)}
        {panel('logistics', <LogisticsTab active />)}
        {panel('triphase', <TriPhaseTab active />)}
        {panel('offices', <OfficesTab active />)}
        {panel('reports', <ReportsTab active />)}
        {panel('kasumbalesa', <BorderSection active title="Kasumbalesa Border Tracking" />)}
      </Tabs>
    </div>
  );
}
