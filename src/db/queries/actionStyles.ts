import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { actionStyleMaster } from '@/db/schema';
import { ACTION_STYLE_DEFAULTS, type ActionKey, type ActionStyle } from '@/lib/actionStyles';

// §4.26 read side. The root layout needs these on every request to inline the
// action palette before first paint, and the settings screen needs the same
// row→DTO mapping — so both call in here (§4.10, §7.4).

/**
 * Configured action styles, deduped per request by React `cache`.
 *
 * Never throws, and always returns a complete set: a missing row falls back to
 * its shipped default, so a half-seeded table still renders a coherent app
 * rather than colourless buttons.
 */
export const loadActionStyles = cache(async (): Promise<ActionStyle[]> => {
  let rows: Array<{ action_key: string; label: string; color: string; icon: string }> = [];
  try {
    rows = await db
      .select({
        action_key: actionStyleMaster.actionKey,
        label: actionStyleMaster.label,
        color: actionStyleMaster.color,
        icon: actionStyleMaster.icon,
      })
      .from(actionStyleMaster)
      .where(eq(actionStyleMaster.display, 'Y'))
      .orderBy(asc(actionStyleMaster.displayOrder));
  } catch {
    return ACTION_STYLE_DEFAULTS;
  }

  const configured = new Map(rows.map((r) => [r.action_key, r]));
  return ACTION_STYLE_DEFAULTS.map((fallback) => {
    const row = configured.get(fallback.action_key);
    if (!row) return fallback;
    return {
      action_key: fallback.action_key as ActionKey,
      label: row.label || fallback.label,
      color: row.color || fallback.color,
      icon: row.icon || fallback.icon,
    };
  });
});
