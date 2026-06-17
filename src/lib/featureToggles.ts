import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { featureToggleMaster } from '@/db/schema';

// Feature toggle helper per CLAUDE.md §4.1 + §10.
//
// Callers consult `isFeatureEnabled` from anywhere in the codebase instead
// of writing `if (process.env.FOO === '1')` or `if (someBoolean)`. The
// fallback applies whenever the toggle row isn't configured (missing row
// or display='N') — treat it as the "safe default if the master hasn't
// been seeded yet".
//
// MVP: no caching. Each call is one indexed lookup on the unique
// toggle_key column. If a hot-path use case shows up, add a short-TTL
// in-memory cache or load-once-per-request in a future slice.

export async function isFeatureEnabled(
  toggleKey: string,
  fallback = false,
): Promise<boolean> {
  const [row] = await db
    .select({
      enabled: featureToggleMaster.enabled,
      display: featureToggleMaster.display,
    })
    .from(featureToggleMaster)
    .where(eq(featureToggleMaster.toggleKey, toggleKey))
    .limit(1);
  if (!row || row.display === 'N') return fallback;
  return row.enabled;
}

// Bulk variant — one query for many toggles. Useful when a single request
// needs to gate several features at once.
export async function loadFeatureToggles(
  toggleKeys: ReadonlyArray<string>,
  fallback = false,
): Promise<Record<string, boolean>> {
  if (toggleKeys.length === 0) return {};
  const rows = await db
    .select({
      toggleKey: featureToggleMaster.toggleKey,
      enabled: featureToggleMaster.enabled,
      display: featureToggleMaster.display,
    })
    .from(featureToggleMaster);
  const seen = new Map<string, boolean>();
  for (const r of rows) {
    if (r.display === 'N') continue;
    seen.set(r.toggleKey, r.enabled);
  }
  const out: Record<string, boolean> = {};
  for (const k of toggleKeys) {
    out[k] = seen.get(k) ?? fallback;
  }
  return out;
}
