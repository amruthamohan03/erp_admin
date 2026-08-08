import Sidebar from '@/components/layout/Sidebar';
import SidebarProvider from '@/components/layout/SidebarProvider';
import Topbar from '@/components/layout/Topbar';
import Footer from '@/components/layout/Footer';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        {/* min-w-0 keeps a wide data table inside its own horizontal scroll region
            instead of stretching the flex row and pushing the page sideways. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
}
