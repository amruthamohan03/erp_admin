import { NextRequest } from 'next/server';
import { ok, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { translateBatch } from '@/lib/translate';
import { isLocale } from '@/i18n/config';
import { translateBatchSchema } from '@/schemas';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const data = translateBatchSchema.parse(await req.json().catch(() => null));
  const { texts, target, source = 'en' } = data;
  if (!isLocale(target)) throw new BadRequestError('Unsupported target locale');

  const translations = await translateBatch(texts, target, source);
  return ok({ translations });
});
