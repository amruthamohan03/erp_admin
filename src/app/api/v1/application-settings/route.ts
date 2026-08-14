import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicationSettingsMaster } from '@/db/schema';
import {
  ok,
  requireAuth,
  isResponse,
  withErrorHandler,
} from '@/lib/api';
import { applicationSettingsUpdateSchema } from '@/schemas/application-settings';
import { brandingFromRow } from '@/db/queries/branding';
import { uploadExists } from '@/lib/storage';

// Application-wide branding (project name, colors, logo, footer).
// Singleton row (id=1) seeded on install; the admin UI PUTs the
// whole object each save.
//
// GET is intentionally public-to-authenticated-users (no admin
// gate) — the Topbar reads it on every page load. PUT is admin-
// only in practice via the menu grant on /settings/application;
// the endpoint itself only enforces auth to keep the API surface
// simple.

const SINGLETON_ID = 1;

async function loadOrDefault() {
  const [row] = await db
    .select()
    .from(applicationSettingsMaster)
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID))
    .limit(1);
  if (row) return row;

  // Insert-if-missing keeps GET stable even if the seed hasn't
  // run — makes local dev + first boot after a fresh DB work
  // without a manual step.
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

// Row → DTO lives in the query helper so the server-rendered palette and this
// endpoint can never drift apart (§4.10); only the audit fields are added here.
function toResponse(row: typeof applicationSettingsMaster.$inferSelect) {
  return { id: row.id, ...brandingFromRow(row), updated_at: row.updatedAt };
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const row = await loadOrDefault();

  // A branding row can outlive its files: the uploads folder is not part of a
  // database dump, so a restore carries the URL without the PNG. The browser
  // cannot tell a missing file from a slow one, so the server reports it and the
  // settings page says "re-upload" instead of showing an empty box (§4.23).
  const [logoPresent, faviconPresent] = await Promise.all([
    uploadExists(row.logoUrl),
    uploadExists(row.faviconUrl),
  ]);

  return ok(toResponse(row), {
    meta: {
      logo_file_missing: !!row.logoUrl && !logoPresent,
      favicon_file_missing: !!row.faviconUrl && !faviconPresent,
    },
  });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = applicationSettingsUpdateSchema.parse(await req.json());

  // Ensure the singleton row exists before UPDATE — same reason
  // as the fallback in GET (fresh DB without a seed run).
  await loadOrDefault();

  const [row] = await db
    .update(applicationSettingsMaster)
    .set({
      projectName: data.project_name,
      appTitle: data.app_title,
      tagline: data.tagline ?? null,
      logoUrl: data.logo_url ?? null,
      faviconUrl: data.favicon_url ?? null,
      primaryColor: data.primary_color,
      accentColor: data.accent_color,
      sidebarBg: data.sidebar_bg,
      sidebarFg: data.sidebar_fg,
      footerText: data.footer_text ?? null,
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(applicationSettingsMaster.id, SINGLETON_ID))
    .returning();

  return ok(toResponse(row));
});
