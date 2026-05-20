import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { deleteUploadIfLocal, saveUploadedImage, UploadError } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file uploaded', 400);

  try {
    const [existing] = await db
      .select({ profile_image: usersT.profileImage })
      .from(usersT)
      .where(eq(usersT.id, session.uid))
      .limit(1);

    const saved = await saveUploadedImage(file, {
      bucket: 'avatars',
      ownerId: session.uid,
      maxBytes: 2 * 1024 * 1024,
    });

    await db
      .update(usersT)
      .set({
        profileImage: saved.url,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(usersT.id, session.uid));

    await deleteUploadIfLocal(existing?.profile_image ?? null);

    return ok({ profile_image: saved.url });
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, err.status);
    // eslint-disable-next-line no-console
    console.error('[me.avatar.POST]', err);
    return fail('Upload failed', 500);
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const [existing] = await db
    .select({ profile_image: usersT.profileImage })
    .from(usersT)
    .where(eq(usersT.id, session.uid))
    .limit(1);

  await db
    .update(usersT)
    .set({
      profileImage: null,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid));

  await deleteUploadIfLocal(existing?.profile_image ?? null);

  return ok({ profile_image: null });
}
