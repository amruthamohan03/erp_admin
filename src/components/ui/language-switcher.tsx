'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { locales, localeLabels, type Locale } from '@/i18n/config';
import { useTranslate } from '@/components/providers/TranslateProvider';

// EN / FR, as one pill in the Topbar with the current code inside it.
//
// Deliberately shaped like <ThemeToggle>: same control, same size, same
// white-on-gradient treatment. The two sit side by side, so a difference
// between them would read as a difference in kind.
//
// A switch rather than a menu because there are exactly two languages and the
// operator is flipping between them, not choosing from a list. If a third
// locale is ever added this has to go back to a list — see the guard below,
// which makes that a visible decision rather than a switch that silently
// cannot reach the third one.

const EN: Locale = 'en';
const FR: Locale = 'fr';

export function LanguageSwitcher(): React.ReactElement {
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

  if (pending) {
    // Holds the pill's footprint while the translation is in flight, so the
    // topbar does not jump and the control does not invite a second click.
    return (
      <span className="inline-flex h-6 w-14 items-center justify-center rounded-full bg-white/20">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-label="Translating" />
      </span>
    );
  }

  return (
    <Toggle
      size="sm"
      checked={isFrench}
      onChange={(v) => setLocale(v ? FR : EN)}
      // The state's own code, inside the track. A language is always named in
      // its own language and never machine-translated, hence `translate="no"`.
      offLabel={<span translate="no">{EN}</span>}
      onLabel={<span translate="no">{FR}</span>}
      aria-label={`Use ${localeLabels[FR]}`}
      title={
        isFrench
          ? 'Interface in French — switch to English'
          : 'Interface in English — switch to French'
      }
      // §4.32 — a fixed white is correct on the brand gradient, where the
      // `primary` track is the gradient's OWN colour and would disappear into
      // it. On is a solid white pill with a brand-coloured thumb and word; off
      // is the usual glass. Both read at a glance, and both follow the
      // configured palette rather than a hardcoded hue.
      className={
        isFrench
          ? 'text-primary-700 data-[state=checked]:bg-white'
          : 'text-white data-[state=unchecked]:bg-white/20'
      }
      thumbClassName={isFrench ? 'bg-primary-600 ring-0' : 'bg-white'}
    />
  );
}
