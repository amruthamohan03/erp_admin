'use client';

import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
      <DashboardCardsGrid category="general" />
    </>
  );
}
