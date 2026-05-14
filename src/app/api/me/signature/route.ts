import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
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
    const existing = await query<{ signature_image: string | null }>(
      `SELECT signature_image FROM users_t WHERE id = $1`,
      [session.uid],
    );

    const saved = await saveUploadedImage(file, {
      bucket: 'signatures',
      ownerId: session.uid,
      maxBytes: 1 * 1024 * 1024,
    });

    await query(
      `UPDATE users_t SET signature_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [saved.url, session.uid],
    );
    await deleteUploadIfLocal(existing.rows[0]?.signature_image);

    return ok({ signature_image: saved.url });
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, err.status);
    // eslint-disable-next-line no-console
    console.error('[me.signature.POST]', err);
    return fail('Upload failed', 500);
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const existing = await query<{ signature_image: string | null }>(
    `SELECT signature_image FROM users_t WHERE id = $1`,
    [session.uid],
  );

  await query(
    `UPDATE users_t SET signature_image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [session.uid],
  );
  await deleteUploadIfLocal(existing.rows[0]?.signature_image);

  return ok({ signature_image: null });
}
