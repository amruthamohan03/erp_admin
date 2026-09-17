import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { translateBatch } from '@/lib/translate';
import { isLocale } from '@/i18n/config';
import { translateBatchSchema } from '@/schemas';

// §4.37 — guard every door. This route spends the deployment's translation quota
// on an outside provider, so it is not something an anonymous caller may drive.
// It carries no permission check beyond that: reading the interface's own labels
// is not a resource anyone holds a `can_view` grant for.
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = translateBatchSchema.parse(await req.json().catch(() => null));
  const { texts, target, source = 'en' } = data;
  if (!isLocale(target)) {
    throw new BadRequestError('Language must be English (en) or French (fr).');
  }

  const translations = await translateBatch(texts, target, source);
  return ok({ translations });
});
