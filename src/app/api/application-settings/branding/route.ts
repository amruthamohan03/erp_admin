import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicationSettings } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { deleteUploadIfLocal, saveUploadedImage, UploadError } from '@/lib/storage';
import { getAppSettings } from '@/lib/settings';

type Kind = 'logo' | 'favicon';
function parseKind(v: string | null): Kind | null {
  return v === 'logo' || v === 'favicon' ? v : null;
}

// Favicons are commonly .ico; the default storage allowlist doesn't include it.
const LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);
const FAVICON_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get('kind'));
  if (!kind) return fail('kind must be "logo" or "favicon"', 400);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file uploaded', 400);

  try {
    const current = await getAppSettings();
    const previous = kind === 'logo' ? current.logo_url : current.favicon_url;

    const saved = await saveUploadedImage(file, {
      bucket: 'branding',
      // Singleton row — use ownerId=0 so all uploads sit under one folder.
      ownerId: 0,
      maxBytes: kind === 'favicon' ? 256 * 1024 : 1024 * 1024,
      allowedMime: kind === 'favicon' ? FAVICON_MIME : LOGO_MIME,
    });

    // Upsert the singleton with just the changed URL. CHECK constraint pins id=1.
    await db
      .insert(applicationSettings)
      .values({
        id: 1,
        ...(kind === 'logo' ? { logoUrl: saved.url } : { faviconUrl: saved.url }),
        updatedBy: session.uid,
      })
      .onConflictDoUpdate({
        target: applicationSettings.id,
        set: {
          ...(kind === 'logo' ? { logoUrl: saved.url } : { faviconUrl: saved.url }),
          updatedBy: session.uid,
          updatedAt: sql`now()`,
        },
      });

    await deleteUploadIfLocal(previous);

    return ok({ [kind === 'logo' ? 'logo_url' : 'favicon_url']: saved.url });
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, err.status);
    // eslint-disable-next-line no-console
    console.error('[application-settings.branding.POST]', err);
    return fail('Upload failed', 500);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get('kind'));
  if (!kind) return fail('kind must be "logo" or "favicon"', 400);

  const current = await getAppSettings();
  const previous = kind === 'logo' ? current.logo_url : current.favicon_url;

  await db
    .update(applicationSettings)
    .set({
      ...(kind === 'logo' ? { logoUrl: null } : { faviconUrl: null }),
      updatedBy: session.uid,
      updatedAt: sql`now()`,
    })
    .where(eq(applicationSettings.id, 1));

  await deleteUploadIfLocal(previous);

  return ok({ [kind === 'logo' ? 'logo_url' : 'favicon_url']: null });
}
