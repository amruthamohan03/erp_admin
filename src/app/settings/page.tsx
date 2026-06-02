import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import SettingsView from '@/components/settings/SettingsView';

export const metadata = { title: 'Account settings' };

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <SettingsView />
    </DashboardShell>
  );
}
