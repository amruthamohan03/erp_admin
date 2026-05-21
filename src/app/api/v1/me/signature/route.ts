import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { deleteUploadIfLocal, saveUploadedImage } from '@/lib/storage';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new BadRequestError('No file uploaded');

  const [existing] = await db
    .select({ signature_image: usersT.signatureImage })
    .from(usersT)
    .where(eq(usersT.id, session.uid))
    .limit(1);

  // saveUploadedImage throws UploadError (AppError subclass) — wrapper handles it.
  const saved = await saveUploadedImage(file, {
    bucket: 'signatures',
    ownerId: session.uid,
    maxBytes: 1 * 1024 * 1024,
  });

  await db
    .update(usersT)
    .set({
      signatureImage: saved.url,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid));

  await deleteUploadIfLocal(existing?.signature_image ?? null);

  return ok({ signature_image: saved.url });
});

export const DELETE = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const [existing] = await db
    .select({ signature_image: usersT.signatureImage })
    .from(usersT)
    .where(eq(usersT.id, session.uid))
    .limit(1);

  await db
    .update(usersT)
    .set({
      signatureImage: null,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid));

  await deleteUploadIfLocal(existing?.signature_image ?? null);

  return ok({ signature_image: null });
});
