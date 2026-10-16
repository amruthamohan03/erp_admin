'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChartLine, FileSpreadsheet, FileText, ShieldCheck, Table, Users, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { InvoiceKind } from '@/schemas/invoice-dashboard';
import OverviewTab from './OverviewTab';
import ClientsTab from './ClientsTab';
import ValidationTab from './ValidationTab';
import PaymentTab from './PaymentTab';
import { KIND_LABEL, exportHref, invoiceModule } from './useTabData';

// §4.29 — the Export Invoice and Import Invoice dashboards.
//
// One view, given the kind: the two dashboards ask the same questions of two
// invoice tables, so they share every tab and differ only in which endpoint
// they read (§4.10). Built like the Quotation and tracking dashboards — only the
// open tab fetches, and a tab once opened keeps its data, so switching back is
// instant.

const TABS = [
  { key: 'overview', label: 'Overview', icon: ChartLine },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'validation', label: 'Validation & DGI', icon: ShieldCheck },
  { key: 'payment', label: 'Payment Mode', icon: Wallet },
] as const;

export default function InvoiceDashboardView({ kind }: { kind: InvoiceKind }) {
  const [tab, setTab] = useState<string>('overview');
  const [opened, setOpened] = useState<Set<string>>(new Set(['overview']));
  const label = KIND_LABEL[kind];

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
            {label} Invoice Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Billing, clients, DGI validation and payment mode across every {label.toLowerCase()} invoice
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a href={exportHref(kind, 'dashboard')} className="btn-excel btn-sm">
            <Table className="h-4 w-4" /> All Data (Multi-Sheet)
          </a>
          <a href={exportHref(kind, 'invoices')} className="btn-excel btn-sm">
            <FileSpreadsheet className="h-4 w-4" /> Invoices
          </a>
          <Link href={`/${invoiceModule(kind)}`} className="btn-primary btn-sm">
            <FileText className="h-4 w-4" /> {label} Invoices
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

        {panel('overview', <OverviewTab kind={kind} active />)}
        {panel('clients', <ClientsTab kind={kind} active />)}
        {panel('validation', <ValidationTab kind={kind} active />)}
        {panel('payment', <PaymentTab kind={kind} active />)}
      </Tabs>
    </div>
  );
}
