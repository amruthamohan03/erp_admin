import { NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { applicationSettings } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { getAppSettings } from '@/lib/settings';

// GET: returns current settings (seeds defaults if the singleton is missing).
// Auth is required to keep the table in sync with the rest of the admin app.
export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const settings = await getAppSettings();
  return ok(settings);
}

const hex = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color like #2563eb');

const putSchema = z.object({
  project_name: z.string().min(1).max(150),
  app_title: z.string().min(1).max(200),
  tagline: z.string().max(200).nullable().optional(),
  logo_url: z.string().max(255).nullable().optional(),
  favicon_url: z.string().max(255).nullable().optional(),
  primary_color: hex,
  accent_color: hex,
  sidebar_bg: hex,
  sidebar_fg: hex,
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    // Upsert the singleton row. CHECK constraint on the table guarantees id=1.
    const [row] = await db
      .insert(applicationSettings)
      .values({
        id: 1,
        projectName: d.project_name,
        appTitle: d.app_title,
        tagline: d.tagline ?? null,
        logoUrl: d.logo_url ?? null,
        faviconUrl: d.favicon_url ?? null,
        primaryColor: d.primary_color,
        accentColor: d.accent_color,
        sidebarBg: d.sidebar_bg,
        sidebarFg: d.sidebar_fg,
        updatedBy: session.uid,
      })
      .onConflictDoUpdate({
        target: applicationSettings.id,
        set: {
          projectName: d.project_name,
          appTitle: d.app_title,
          tagline: d.tagline ?? null,
          logoUrl: d.logo_url ?? null,
          faviconUrl: d.favicon_url ?? null,
          primaryColor: d.primary_color,
          accentColor: d.accent_color,
          sidebarBg: d.sidebar_bg,
          sidebarFg: d.sidebar_fg,
          updatedBy: session.uid,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: applicationSettings.id });

    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[application-settings.PUT]', err);
    return fail('Server error', 500);
  }
}
