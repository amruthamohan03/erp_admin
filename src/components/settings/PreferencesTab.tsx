'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useTranslate } from '@/components/providers/TranslateProvider';
import { localeLabels, locales, type Locale } from '@/i18n/config';
import type { MeProfile } from './SettingsView';

export default function PreferencesTab({
  me,
  onChange,
}: {
  me: MeProfile;
  onChange: () => Promise<void> | void;
}) {
  const { theme, setTheme } = useTheme();
  const { locale: currentLocale, setLocale } = useTranslate();

  const [emailNotifs, setEmailNotifs] = React.useState((me.email_notifications ?? 'Y') === 'Y');
  const [compact, setCompact] = React.useState((me.compact_mode ?? 'N') === 'Y');

  async function persistPrefs(patch: Partial<{
    theme_preference: 'light' | 'dark' | 'system';
    locale_preference: Locale;
    email_notifications: boolean;
    compact_mode: boolean;
  }>) {
    await fetch('/api/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await onChange();
  }

  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  const localeOptions = locales.map((lc) => ({ value: lc, label: localeLabels[lc] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Customise how the app looks and behaves.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Combobox
              value={theme ?? 'system'}
              onChange={(v) => {
                if (!v) return;
                setTheme(v);
                persistPrefs({ theme_preference: v as 'light' | 'dark' | 'system' });
              }}
              options={themeOptions}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Combobox
              value={currentLocale}
              onChange={(v) => {
                if (!v) return;
                const next = v as Locale;
                setLocale(next);
                persistPrefs({ locale_preference: next });
              }}
              options={localeOptions}
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-base">Email notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive notifications about activity in your account.
            </p>
          </div>
          <Switch
            checked={emailNotifs}
            onCheckedChange={(v) => {
              setEmailNotifs(v);
              persistPrefs({ email_notifications: v });
            }}
          />
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-base">Compact mode</Label>
            <p className="text-sm text-muted-foreground">
              Reduce padding for a denser layout.
            </p>
          </div>
          <Switch
            checked={compact}
            onCheckedChange={(v) => {
              setCompact(v);
              persistPrefs({ compact_mode: v });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
