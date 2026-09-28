'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Toggle from '@/components/ui/Toggle';
import { Separator } from '@/components/ui/separator';
import { useTranslate } from '@/components/providers/TranslateProvider';
import { localeLabels } from '@/i18n/config';
import type { MeProfile } from './SettingsView';

/**
 * One row: what the setting is, what it does, and the switch (§4.11).
 *
 * Every preference here is the same shape, so the row is written once rather
 * than four times with drifting spacing.
 */
function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  label: string;
  description: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-base">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Toggle aria-label={ariaLabel} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function PreferencesTab({
  me,
  onChange,
}: {
  me: MeProfile;
  onChange: () => Promise<void> | void;
}) {
  // `resolvedTheme` is what the page is ACTUALLY showing — `theme` is 'system'
  // while following the OS, which would leave the switch stuck off on a dark
  // machine and contradict the screen around it.
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale, pending } = useTranslate();

  const [emailNotifs, setEmailNotifs] = React.useState((me.email_notifications ?? 'Y') === 'Y');
  const [compact, setCompact] = React.useState((me.compact_mode ?? 'N') === 'Y');

  // next-themes hydration guard — see "Avoid Hydration Mismatch" in their docs,
  // and <ThemeToggle>, which guards the same way for the same reason. The
  // switches stay neutral until mount rather than rendering one state on the
  // server and another in the browser.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const followSystem = theme === 'system';
  const isDark = mounted ? resolvedTheme === 'dark' : false;

  async function persistPrefs(
    patch: Partial<{
      theme_preference: 'light' | 'dark' | 'system';
      email_notifications: boolean;
      compact_mode: boolean;
    }>,
  ) {
    await fetch('/api/v1/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await onChange();
  }

  function applyTheme(next: 'light' | 'dark' | 'system') {
    setTheme(next);
    void persistPrefs({ theme_preference: next });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Customise how the app looks and behaves.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SettingRow
          label="Dark mode"
          ariaLabel="Dark mode"
          description={
            followSystem
              ? `Following your device, which is currently ${isDark ? 'dark' : 'light'}. Turn off “Follow system” to choose yourself.`
              : 'Use the dark theme across the app.'
          }
          checked={isDark}
          // Locked while following the device: the switch would appear to work
          // and then be overridden by the OS, which is a control that lies.
          disabled={!mounted || followSystem}
          onChange={(v) => applyTheme(v ? 'dark' : 'light')}
        />

        <Separator />

        <SettingRow
          label="Theme"
          ariaLabel="Follow system theme"
          description="Match whatever light or dark setting your device is using."
          checked={mounted && followSystem}
          disabled={!mounted}
          // Turning it off has to land on something concrete, so it keeps
          // whatever is on screen rather than snapping to light.
          onChange={(v) => applyTheme(v ? 'system' : isDark ? 'dark' : 'light')}
        />

        <Separator />

        <SettingRow
          label="Language"
          ariaLabel="Use French"
          description={
            <>
              Show the interface in French. Currently{' '}
              {/* A language is always named in its own language, and never
                  machine-translated — the same rule the Topbar switcher uses. */}
              <span translate="no" className="font-medium text-foreground">
                {localeLabels[locale]}
              </span>
              .
            </>
          }
          checked={locale === 'fr'}
          disabled={pending}
          onChange={(v) => setLocale(v ? 'fr' : 'en')}
        />

        <Separator />

        <SettingRow
          label="Email notifications"
          ariaLabel="Email notifications"
          description="Receive notifications about activity in your account."
          checked={emailNotifs}
          onChange={(v) => {
            setEmailNotifs(v);
            void persistPrefs({ email_notifications: v });
          }}
        />

        <Separator />

        <SettingRow
          label="Compact mode"
          ariaLabel="Compact mode"
          description="Reduce padding for a denser layout."
          checked={compact}
          onChange={(v) => {
            setCompact(v);
            void persistPrefs({ compact_mode: v });
          }}
        />
      </CardContent>
    </Card>
  );
}
