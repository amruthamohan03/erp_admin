// The one place a preference is written back to the user's row (§4.10).
//
// The Topbar and Settings → Preferences both change the same settings, and each
// had its own idea of what that meant: Settings PUT the value to
// /api/v1/me/preferences, the Topbar only called next-themes and wrote nothing.
// So the same switch persisted from one screen and not from the other, and the
// stored `theme_preference` disagreed with what the operator was looking at.

export type ThemePreference = 'light' | 'dark' | 'system';

export interface PreferencePatch {
  theme_preference?: ThemePreference;
  email_notifications?: boolean;
  compact_mode?: boolean;
}

/**
 * Persist a preference change, fire-and-forget.
 *
 * Deliberately swallows a failure. next-themes has already applied the change
 * locally, so the screen is correct either way; interrupting an operator with a
 * dialog because a preference did not reach the server would be louder than the
 * thing it is reporting. A save that matters — anything on a record — reports
 * through <ResultDialog> (§4.22); this is not that.
 */
export async function savePreferences(patch: PreferencePatch): Promise<void> {
  try {
    await fetch('/api/v1/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    // Intentionally ignored — see above.
  }
}
