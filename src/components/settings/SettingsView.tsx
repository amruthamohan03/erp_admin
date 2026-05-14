'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfileTab from './ProfileTab';
import SecurityTab from './SecurityTab';
import PreferencesTab from './PreferencesTab';
import SignatureTab from './SignatureTab';

export interface MeProfile {
  id: number;
  username: string;
  full_name: string;
  email: string;
  mobile: string | null;
  role_id: number;
  role_name: string;
  profile_image: string | null;
  signature_image: string | null;
  bio: string | null;
  theme_preference: 'light' | 'dark' | 'system' | null;
  locale_preference: 'en' | 'fr' | null;
  email_notifications: 'Y' | 'N' | null;
  compact_mode: 'Y' | 'N' | null;
}

export default function SettingsView() {
  const [me, setMe] = React.useState<MeProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    const r = await fetch('/api/me/profile');
    const j = await r.json();
    if (j.success) setMe(j.data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, preferences and signature.
        </p>
      </div>

      {loading || !me ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start sm:w-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="signature">Signature</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileTab me={me} onChange={reload} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesTab me={me} onChange={reload} />
          </TabsContent>
          <TabsContent value="signature">
            <SignatureTab me={me} onChange={reload} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
