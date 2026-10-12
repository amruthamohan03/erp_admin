'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarRange, ChartLine, DollarSign, FileSpreadsheet, FileText, Gauge, Send, Table, Truck,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OverviewTab from './OverviewTab';
import LogisticsTab from './LogisticsTab';
import TriPhaseTab from './TriPhaseTab';
import PrepaymentTab from './PrepaymentTab';
import ReportTab from './ReportTab';
import { exportHref } from './useTabData';

// §4.29 — the Export Tracking dashboard.
//
// Five views over one module, so they are tabs on one screen rather than five
// routes. Only the open tab fetches, and a tab that has been opened keeps its
// data, so switching back is instant and does not flash a skeleton — the same
// shape as the Import dashboard, from the same shared hook and UI kit (§4.10).

const TABS = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'logistics', label: 'Logistics', icon: Truck },
  { key: 'triphase', label: 'Tri Phase', icon: CalendarRange },
  { key: 'prepayment', label: 'Prepayment', icon: DollarSign },
  { key: 'report', label: 'Report', icon: FileText },
] as const;

export default function ExportDashboardView() {
  const [tab, setTab] = useState<string>('overview');
  const [opened, setOpened] = useState<Set<string>>(new Set(['overview']));

  function onChange(next: string): void {
    setTab(next);
    setOpened((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  const was = (key: string): boolean => opened.has(key);

  /**
   * `forceMount` keeps an opened tab in the tree; `hidden` is what hides it.
   * Radix sets `hidden: !present` BEFORE spreading our props, so ours wins —
   * without it every opened tab would render at once.
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <ChartLine className="h-7 w-7" />
            Export Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comprehensive export analytics with maximum data insights
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The design's Export dropdown, as two labelled buttons: with two
              choices a menu is one extra click to reach either. */}
          <a href={exportHref({ scope: 'all' })} className="btn-excel btn-sm">
            <Table className="h-4 w-4" /> All Data (Multi-Sheet)
          </a>
          <a href={exportHref({ scope: 'overview' })} className="btn-excel btn-sm">
            <FileSpreadsheet className="h-4 w-4" /> Overview
          </a>
          <Link href="/exkpi" className="btn-neutral btn-sm">
            <Gauge className="h-4 w-4" /> Delay KPI
          </Link>
          <Link href="/exports" className="btn-primary btn-sm">
            <Send className="h-4 w-4" /> Exports
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onChange}>
        <div className="mb-5 overflow-x-auto rounded-lg border border-border bg-card p-2.5">
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
        {panel('logistics', <LogisticsTab active />)}
        {panel('triphase', <TriPhaseTab active />)}
        {panel('prepayment', <PrepaymentTab active />)}
        {panel('report', <ReportTab active />)}
      </Tabs>
    </div>
  );
}
