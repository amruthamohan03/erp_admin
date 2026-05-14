import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail } from '@/lib/api';
import { translateBatch } from '@/lib/translate';
import { isLocale } from '@/i18n/config';

const schema = z.object({
  texts: z.array(z.string().max(5000)).max(200),
  target: z.string().min(2).max(8),
  source: z.string().min(2).max(8).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('Invalid input', 422, { errors: parsed.error.flatten() });

  const { texts, target, source = 'en' } = parsed.data;
  if (!isLocale(target)) return fail('Unsupported target locale', 400);

  const translations = await translateBatch(texts, target, source);
  return ok({ translations });
}
