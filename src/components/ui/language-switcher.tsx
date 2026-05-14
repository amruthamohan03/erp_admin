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
            <span className="flex-1" translate="no">{localeLabels[lc]}</span>
            {lc === locale && <span className="ms-2 text-xs opacity-60">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
