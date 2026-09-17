'use client';

import * as React from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { localeLabels, locales, type Locale } from '@/i18n/config';
import { useTranslate } from '@/components/providers/TranslateProvider';

// Deliberately shaped like <ThemeToggle>: same ghost icon trigger, same labelled
// menu, same trailing tick. The two sit side by side in the Topbar, so a
// difference between them would read as a difference in kind.
export function LanguageSwitcher(): React.ReactElement {
  const { locale, setLocale, pending } = useTranslate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Language">
          {pending ? (
            <Loader2 className="h-[1.1rem] w-[1.1rem] animate-spin" />
          ) : (
            <Languages className="h-[1.1rem] w-[1.1rem]" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-no-translate>
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((lc: Locale) => (
          <DropdownMenuItem key={lc} onClick={() => setLocale(lc)}>
            {/* The code occupies the icon slot, so the rows line up with the
                Appearance menu beside it. A language is always named in its own
                language — neither of these is ever translated. */}
            <span
              className="me-2 w-4 text-center text-[0.65rem] font-semibold uppercase opacity-60"
              translate="no"
            >
              {lc}
            </span>
            <span className="truncate" translate="no">
              {localeLabels[lc]}
            </span>
            {lc === locale && <span className="ms-auto text-xs opacity-60">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
