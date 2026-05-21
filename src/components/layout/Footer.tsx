'use client';

import { useEffect, useState } from 'react';
import { useAppSettings } from '@/components/providers/SettingsProvider';

function renderFooterText(template: string | null): string {
  if (!template) return '';
  return template.replace(/\{year\}/gi, String(new Date().getFullYear()));
}

export default function Footer() {
  const settings = useAppSettings();
  // Render the year-substituted text only after mount so SSR and client
  // agree (the server year could differ in the rare year-rollover edge case).
  const [text, setText] = useState<string>(() => renderFooterText(settings.footer_text));

  useEffect(() => {
    setText(renderFooterText(settings.footer_text));
  }, [settings.footer_text]);

  if (!text) return null;

  return (
    <footer className="border-t bg-background/95 px-6 py-3 text-center text-xs text-muted-foreground">
      {text}
    </footer>
  );
}
