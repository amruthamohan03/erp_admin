'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarClock, ChartLine, FileSpreadsheet, FileText, Table, Users,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OverviewTab from './OverviewTab';
import ExpiryTab from './ExpiryTab';
import ClientTab from './ClientTab';
import { exportHref, type LicenseUseForValue } from './useTabData';

// §4.29 — the Licence dashboard.
//
// Three views over one book, so they are tabs on one screen rather than three
// routes. Only the open tab fetches, and a tab that has been opened keeps its
// data, so switching back is instant and does not flash a skeleton — the same
// shape as the Import and Export tracking dashboards, from the same shared
// hook and UI kit (§4.10).
//
// `useFor` scopes the whole screen, so the Import and the Export Licence
// dashboard are one implementation differing by a config object.

export interface LicenseDashboardConfig {
  useFor: LicenseUseForValue;
  heading: string;
  subtitle: string;
  /** Where a row's Edit goes, and where the list button points. */
  basePath: string;
  listLabel: string;
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'expiry', label: 'Expiry Analysis', icon: CalendarClock },
  { key: 'clients', label: 'Client Analysis', icon: Users },
] as const;

export default function LicenseDashboardTabsView({ config }: { config: LicenseDashboardConfig }) {
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
  const panel = (key: string, node: ReactNode) => (
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
            {config.heading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={exportHref({ scope: 'dashboard', use_for: config.useFor })}
            className="btn-excel btn-sm"
          >
            <Table className="h-4 w-4" /> All Data (Multi-Sheet)
          </a>
          <a
            href={exportHref({ scope: 'licenses', use_for: config.useFor })}
            className="btn-excel btn-sm"
          >
            <FileSpreadsheet className="h-4 w-4" /> Licences
          </a>
          <Link href={config.basePath} className="btn-primary btn-sm">
            <FileText className="h-4 w-4" /> {config.listLabel}
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

        {panel(
          'overview',
          <OverviewTab active useFor={config.useFor} basePath={config.basePath} />,
        )}
        {panel('expiry', <ExpiryTab active useFor={config.useFor} basePath={config.basePath} />)}
        {panel(
          'clients',
          <ClientTab active useFor={config.useFor} basePath={config.basePath} />,
        )}
      </Tabs>
    </div>
  );
}
