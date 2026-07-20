'use client';

import Link from 'next/link';
import { FileCheck } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

export default function LicensesDashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-primary-600" />
            Licenses Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Status breakdown + expiring-soon watch.{' '}
            <Link href="/licenses" className="text-primary-600 hover:underline">
              View licenses →
            </Link>
          </p>
        </div>
      </div>
      <DashboardCardsGrid category="license_dashboard" />
    </>
  );
}
