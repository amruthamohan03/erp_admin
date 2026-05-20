'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AppSettings } from '@/lib/settings';

const SettingsContext = createContext<AppSettings | null>(null);

export function SettingsProvider({
  value,
  children,
}: {
  value: AppSettings;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useAppSettings must be used inside SettingsProvider');
  }
  return ctx;
}
