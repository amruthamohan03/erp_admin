'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Calculator, ChartLine, FileSpreadsheet, Landmark, Table, Users, Workflow } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OverviewTab from './OverviewTab';
import WorkflowTab from './WorkflowTab';
import ClientsTab from './ClientsTab';
import DutiesTab from './DutiesTab';
import { exportHref } from './useTabData';

// §4.29 — the Fiche de Calcul dashboard. Built like the invoice dashboards:
// only the open tab fetches, and a tab once opened keeps its data, so
// switching back is instant.

const TABS = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'workflow', label: 'Workflow', icon: Workflow },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'duties', label: 'Duties & HS Codes', icon: Landmark },
] as const;

export default function FicheDashboardView() {
  const [tab, setTab] = useState<string>('overview');
  const [opened, setOpened] = useState<Set<string>>(new Set(['overview']));

  function onChange(next: string): void {
    setTab(next);
    setOpened((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  /**
   * `forceMount` keeps an opened tab in the tree; `hidden` is what hides it.
   * Radix sets `hidden: !present` BEFORE spreading our props, so ours wins.
   */
  const panel = (key: string, node: ReactNode) => (
    <TabsContent
      key={key}
      value={key}
      forceMount={opened.has(key) ? true : undefined}
      hidden={tab !== key}
      className="mt-0"
    >
      {opened.has(key) && node}
    </TabsContent>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <ChartLine className="h-7 w-7" />
            Fiche de Calcul Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Duty calculations, their workflow, clients and HS codes across every live fiche
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a href={exportHref('dashboard')} className="btn-excel btn-sm">
            <Table className="h-4 w-4" /> All Data (Multi-Sheet)
          </a>
          <a href={exportHref('fiches')} className="btn-excel btn-sm">
            <FileSpreadsheet className="h-4 w-4" /> Fiches
          </a>
          <Link href="/fiches" className="btn-primary btn-sm">
            <Calculator className="h-4 w-4" /> Fiche de Calcul
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
        {panel('workflow', <WorkflowTab active />)}
        {panel('clients', <ClientsTab active />)}
        {panel('duties', <DutiesTab active />)}
      </Tabs>
    </div>
  );
}
