'use client';

import clsx from 'clsx';
import Sidebar from '@/components/layout/Sidebar';
import MenuProvider from '@/components/layout/MenuProvider';
import DocumentTitle from '@/components/layout/DocumentTitle';
import SidebarProvider, { useSidebar } from '@/components/layout/SidebarProvider';
import Topbar from '@/components/layout/Topbar';
import Footer from '@/components/layout/Footer';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    // MenuProvider wraps the frame because both the sidebar and the browser-tab
    // title read the same role-scoped tree — one fetch, one answer (§4.10).
    <MenuProvider>
      <SidebarProvider>
        {/* Renders nothing; keeps document.title in step with the route. */}
        <DocumentTitle />
        <ShellFrame>{children}</ShellFrame>
      </SidebarProvider>
    </MenuProvider>
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
