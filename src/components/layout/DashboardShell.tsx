'use client';

import clsx from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import SidebarProvider, { useSidebar } from '@/components/layout/SidebarProvider';
import Topbar from '@/components/layout/Topbar';
import Footer from '@/components/layout/Footer';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellFrame>{children}</ShellFrame>
    </SidebarProvider>
  );
}

// Split out because the frame needs `collapsed` from the provider it sits inside.
// `children` arrives as an already-rendered server tree, so marking this file
// 'use client' does not pull the pages into the client bundle.
function ShellFrame({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />

      {/* The sidebar is `fixed`, so it is out of flow and cannot be pushed around by
          page scroll. The content column reserves its width with a margin instead,
          and animates in step with the rail toggle. */}
      <div
        className={clsx(
          'flex min-h-screen min-w-0 flex-col transition-[margin] duration-200 ease-out',
          'motion-reduce:transition-none',
          collapsed ? 'lg:ms-[4.75rem]' : 'lg:ms-64',
        )}
      >
        <Topbar />
        {/* min-w-0 keeps a wide data table inside its own horizontal scroll region
            instead of stretching the column and pushing the page sideways. */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
