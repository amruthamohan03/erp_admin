'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { savePreferences } from '@/lib/preferences';

// Light / dark, as a round icon button in the Topbar.
//
// §4.11 makes `<Toggle>` the control for a boolean setting, and this is the
// one deliberate exception: appearance is chrome rather than a field on a
// record, and a 36px circle beside the avatar is what was asked for. The
// SUBSTANCE of the rule is kept — the button still carries `role="switch"`
// and `aria-checked`, so to a screen reader and to the keyboard it is the same
// control as every other switch in the app, just drawn as a glyph. Do not copy
// this shape for a setting inside a form; that is a `<Toggle>`.
//
// The icon shows the ACTION, not the state: a moon on a light page means
// "switch to dark". That is the common convention and the one the reference
// followed, and the title spells it out for anyone who reads it the other way.

export function ThemeToggle(): React.ReactElement {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // next-themes hydration guard — see "Avoid Hydration Mismatch" in their docs.
  // Until mount the server and the browser disagree about the theme, so the
  // button renders in a fixed state rather than flipping after hydration.
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
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark appearance"
      onClick={() => apply(!isDark)}
      title={
        followingSystem
          ? `Following your device, currently ${isDark ? 'dark' : 'light'}. Switching here chooses for yourself.`
          : isDark
            ? 'Dark appearance — switch to light'
            : 'Light appearance — switch to dark'
      }
      // Glass on the brand gradient, which §4.32 allows precisely here: the
      // surface underneath is a known colour, so white-on-translucent has
      // fixed contrast in both themes without a `dark:` twin.
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0"
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      {/* The switch is named by aria-label; this gives its STATE to a reader,
          which an icon alone cannot. */}
      <span className="sr-only">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
