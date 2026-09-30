'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { locales, localeLabels, type Locale } from '@/i18n/config';
import { useTranslate } from '@/components/providers/TranslateProvider';

// EN / FR, as one switch in the Topbar.
//
// Deliberately shaped like <ThemeToggle>: the same switch, the same flanking
// labels, the same white-on-gradient treatment. The two sit side by side, so a
// difference between them would read as a difference in kind.
//
// A switch rather than a menu because there are exactly two languages and the
// operator is flipping between them, not choosing from a list. If a third
// locale is ever added this has to go back to a list — see the guard below,
// which makes that a visible decision rather than a switch that silently
// cannot reach the third one.

const EN: Locale = 'en';
const FR: Locale = 'fr';

export function LanguageSwitcher(): React.ReactElement | null {
  const { locale, setLocale, pending } = useTranslate();

  // A two-state switch cannot express three locales. Rendering nothing would
  // hide the feature, so this fails loudly in development and degrades to the
  // two it can reach in production.
  if (process.env.NODE_ENV !== 'production' && locales.length !== 2) {
    console.warn(
      `LanguageSwitcher is a two-state switch but ${locales.length} locales are configured. ` +
        'Restore a dropdown (see git history) before shipping a third language.',
    );
  }

  const isFrench = locale === FR;

  return (
    <div
      className="flex items-center gap-1.5"
      title={isFrench ? 'Interface in French — switch to English' : 'Interface in English — switch to French'}
    >
      {/* A language is always named in its own language, and never
          machine-translated — hence `translate="no"` on both codes. */}
      <span
        translate="no"
        aria-hidden="true"
        className={`text-[0.7rem] font-semibold uppercase leading-none transition-opacity ${
          isFrench ? 'text-white/50' : 'text-white'
        }`}
      >
        {EN}
      </span>

      {pending ? (
        // Holds the switch's footprint while the translation is in flight, so
        // the row does not jump and the two codes stay where they were.
        <span className="inline-flex h-4 w-7 items-center justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-label="Translating" />
        </span>
      ) : (
        <Toggle
          size="sm"
          checked={isFrench}
          onChange={(v) => setLocale(v ? FR : EN)}
          // Named by what turning it ON does. The flanking codes are decorative
          // (aria-hidden), so this is the control's only name to a screen reader.
          aria-label={`Use ${localeLabels[FR]}`}
          // §4.32 — a fixed white alpha is correct on the brand gradient, where
          // `bg-primary` is the gradient's own colour and would disappear.
          className="data-[state=checked]:bg-white/90 data-[state=unchecked]:bg-white/25"
        />
      )}

      <span
        translate="no"
        aria-hidden="true"
        className={`text-[0.7rem] font-semibold uppercase leading-none transition-opacity ${
          isFrench ? 'text-white' : 'text-white/50'
        }`}
      >
        {FR}
      </span>
    </div>
  );
}
