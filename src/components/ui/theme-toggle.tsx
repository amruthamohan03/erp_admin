'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { savePreferences } from '@/lib/preferences';

// Light / dark, as one switch in the Topbar.
//
// It was a dropdown, which is two clicks and a menu for a setting with exactly
// two states — and §4.11 is explicit that a boolean setting is a <Toggle>. The
// sun and moon flank it so BOTH states are legible at rest; a lone switch
// labelled only by its current icon makes an operator work out which way is on.
//
// Radix gives the keyboard and ARIA behaviour through the shared Toggle, so
// this file only decides what the switch means and how it reads on the brand
// gradient (§4.11 — there is exactly one toggle component; do not add another).

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // next-themes hydration guard — see "Avoid Hydration Mismatch" in their docs.
  // Until mount the server and the browser disagree about the theme, so the
  // switch renders in a fixed position rather than flipping after hydration.
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
    <div
      className="flex items-center gap-1.5"
      title={
        followingSystem
          ? `Following your device, currently ${isDark ? 'dark' : 'light'}. Switching here chooses for yourself.`
          : isDark
            ? 'Dark appearance — switch to light'
            : 'Light appearance — switch to dark'
      }
    >
      {/* On the brand gradient, so a fixed white alpha rather than a token —
          §4.32's stated exception for anything sitting on a known surface. */}
      <Sun
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 transition-opacity ${isDark ? 'text-white/50' : 'text-white'}`}
      />
      <Toggle
        size="sm"
        checked={isDark}
        onChange={apply}
        aria-label="Dark appearance"
        // The track must read against the gradient, where `bg-primary` is the
        // gradient's own colour and would vanish. cn() merges, so this replaces
        // the default track colours without forking the component.
        className="data-[state=checked]:bg-white/90 data-[state=unchecked]:bg-white/25"
      />
      <Moon
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 transition-opacity ${isDark ? 'text-white' : 'text-white/50'}`}
      />
    </div>
  );
}
