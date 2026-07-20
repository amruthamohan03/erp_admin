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

function toResponse(row: typeof applicationSettingsMaster.$inferSelect) {
  return {
    id: row.id,
    project_name: row.projectName,
    app_title: row.appTitle,
    tagline: row.tagline,
    logo_url: row.logoUrl,
    favicon_url: row.faviconUrl,
    primary_color: row.primaryColor,
    accent_color: row.accentColor,
    sidebar_bg: row.sidebarBg,
    sidebar_fg: row.sidebarFg,
    footer_text: row.footerText,
    updated_at: row.updatedAt,
  };
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const row = await loadOrDefault();
  return ok(toResponse(row));
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
