'use client';

import Link from 'next/link';
import { Anchor } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

export default function ImportsDashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Anchor className="h-6 w-6 text-primary-600" />
            Imports Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Customs imports KPI cards.{' '}
            <Link href="/imports" className="text-primary-600 hover:underline">
              View consignments →
            </Link>
          </p>
        </div>
      </div>
      <DashboardCardsGrid category="import_dashboard" />
    </>
  );
}
