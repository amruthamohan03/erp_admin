'use client';

import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';
import RecentActivity from '@/components/dashboard/RecentActivity';

// Main /dashboard — matches main-branch behavior: no category
// filter (every card the role can see lands here), flat tile
// styling. Per-module dashboards (/clients/dashboard, etc.)
// still get the colorful gradient tiles + focused card sets.

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
      <DashboardCardsGrid variant="flat" />
      <RecentActivity />
    </>
  );
}
