import DashboardShell from '@/components/layout/DashboardShell';
import SettingsView from '@/components/settings/SettingsView';

export const metadata = { title: 'Account settings' };

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsView />
    </DashboardShell>
  );
}
