'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

export default function QuotationsDashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary-600" />
            Quotations Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quotation KPIs + revenue totals.{' '}
            <Link href="/quotations" className="text-primary-600 hover:underline">
              View quotations →
            </Link>
          </p>
        </div>
      </div>
      <DashboardCardsGrid category="quotation_dashboard" />
    </>
  );
}
