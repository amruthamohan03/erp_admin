'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import Toggle from '@/components/ui/Toggle';
import { savePreferences } from '@/lib/preferences';

// Light / dark, as one pill in the Topbar with the current mode inside it.
//
// It was a dropdown, which is two clicks and a menu for a setting with exactly
// two states — and §4.11 is explicit that a boolean setting is a <Toggle>. The
// word sits in the track so the state reads at rest; a bare switch with no
// label makes an operator work out which way is on.
//
// Radix gives the keyboard and ARIA behaviour through the shared Toggle, so
// this file only decides what the switch means and how it reads on the brand
// gradient (§4.11 — there is exactly one toggle component; do not add another).

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // next-themes hydration guard — see "Avoid Hydration Mismatch" in their docs.
  // Until mount the server and the browser disagree about the theme, so the
  // pill renders in a fixed state rather than flipping after hydration.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const followingSystem = mounted && theme === 'system';

  function apply(next: boolean): void {
    const value = next ? 'dark' : 'light';
    setTheme(value);
    // Persisted through the same helper Settings uses, so switching here and
    // switching there leave the same thing in the database.
    void savePreferences({ theme_preference: value });
  }

  return (
    <Toggle
      size="sm"
      checked={isDark}
      onChange={apply}
      offLabel="Light"
      onLabel="Dark"
      aria-label="Dark appearance"
      title={
        followingSystem
          ? `Following your device, currently ${isDark ? 'dark' : 'light'}. Switching here chooses for yourself.`
          : isDark
            ? 'Dark appearance — switch to light'
            : 'Light appearance — switch to dark'
      }
      // The same treatment as the language pill beside it — see the note there
      // on why `primary` cannot be the track colour on the brand gradient.
      className={
        isDark
          ? 'text-primary-700 data-[state=checked]:bg-white'
          : 'text-white data-[state=unchecked]:bg-white/20'
      }
      thumbClassName={isDark ? 'bg-primary-600 ring-0' : 'bg-white'}
    />
  );
}
