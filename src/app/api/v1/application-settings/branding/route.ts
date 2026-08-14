import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicationSettingsMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { deleteUploadIfLocal, saveUploadedImage } from '@/lib/storage';

// Branding asset upload for the application-settings singleton (id=1).
// POST replaces the logo/favicon file and upserts its URL; DELETE clears it.
// Both reuse the shared file-storage helper (public/uploads/branding/0/…)
// and delete the previous local file so uploads don't accumulate.

const SINGLETON_ID = 1;

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

async function loadOrDefault() {
  const [row] = await db
    .select()
    .from(applicationSettingsMaster)
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID))
    .limit(1);
  if (row) return row;

  const [inserted] = await db
    .insert(applicationSettingsMaster)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;

  const [afterRace] = await db
    .select()
    .from(applicationSettingsMaster)
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID))
    .limit(1);
  return afterRace;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const kind = parseKind(new URL(req.url).searchParams.get('kind'));
  if (!kind) throw new BadRequestError('kind must be "logo" or "favicon"');

  const label = kind === 'logo' ? 'Logo' : 'Favicon';

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // A body larger than the server's limit fails here, before any of our own
    // checks run, and used to surface as an opaque 500.
    throw new BadRequestError(
      `${label} could not be read. The file may be larger than the server accepts.`,
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new BadRequestError(`No ${label.toLowerCase()} file was included in the upload.`);
  }

  const current = await loadOrDefault();
  const previous = kind === 'logo' ? current.logoUrl : current.faviconUrl;

  const saved = await saveUploadedImage(file, {
    bucket: 'branding',
    // Singleton row — use ownerId=0 so all uploads sit under one folder.
    ownerId: 0,
    maxBytes: kind === 'favicon' ? 256 * 1024 : 1024 * 1024,
    allowedMime: kind === 'favicon' ? FAVICON_MIME : LOGO_MIME,
    label,
  });

  // Commit the URL before removing the old file. If the UPDATE fails, the row
  // still points at a file that exists — the reverse order leaves the operator
  // with no logo at all and a database row naming a deleted one. The new upload
  // is orphaned instead, which is recoverable and invisible.
  const [updated] = await db
    .update(applicationSettingsMaster)
    .set({
      ...(kind === 'logo' ? { logoUrl: saved.url } : { faviconUrl: saved.url }),
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID))
    .returning();

  if (!updated) {
    await deleteUploadIfLocal(saved.url);
    throw new BadRequestError(
      `${label} was uploaded but could not be saved — the application settings row is missing.`,
    );
  }

  if (previous !== saved.url) await deleteUploadIfLocal(previous);

  return ok({ [kind === 'logo' ? 'logo_url' : 'favicon_url']: saved.url });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const kind = parseKind(new URL(req.url).searchParams.get('kind'));
  if (!kind) throw new BadRequestError('kind must be "logo" or "favicon"');

  const current = await loadOrDefault();
  const previous = kind === 'logo' ? current.logoUrl : current.faviconUrl;

  await db
    .update(applicationSettingsMaster)
    .set({
      ...(kind === 'logo' ? { logoUrl: null } : { faviconUrl: null }),
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID));

  await deleteUploadIfLocal(previous);

  return ok({ [kind === 'logo' ? 'logo_url' : 'favicon_url']: null });
});
