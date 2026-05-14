'use server';

import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from './config';

export async function setLocaleAction(value: string): Promise<{ ok: boolean }> {
  if (!isLocale(value)) return { ok: false };
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return { ok: true };
}
