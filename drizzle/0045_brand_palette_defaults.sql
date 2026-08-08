-- 0045 — refresh the default brand palette on application_settings_master_t.
--
-- The chrome (sidebar, header, footer, buttons, focus rings) now derives its whole
-- token set from these columns instead of hardcoding colours in the components, so
-- the shipped defaults become the app's actual look rather than dead configuration.
--
-- Column defaults move to the indigo/violet pair that BRANDING_DEFAULTS in
-- src/lib/branding.ts documents; keep the three in sync (schema, seed, this file).
ALTER TABLE "application_settings_master_t" ALTER COLUMN "primary_color" SET DEFAULT '#4f46e5';
--> statement-breakpoint
ALTER TABLE "application_settings_master_t" ALTER COLUMN "accent_color" SET DEFAULT '#7c3aed';
--> statement-breakpoint
ALTER TABLE "application_settings_master_t" ALTER COLUMN "sidebar_bg" SET DEFAULT '#151a30';
--> statement-breakpoint

-- Existing installs: adopt the new palette only where the row still carries the old
-- defaults. An operator who already picked their own colours on /settings/application
-- keeps them — a data migration must not overwrite a deliberate choice.
UPDATE "application_settings_master_t"
   SET "primary_color" = '#4f46e5'
 WHERE lower("primary_color") = '#2563eb';
--> statement-breakpoint
UPDATE "application_settings_master_t"
   SET "accent_color" = '#7c3aed'
 WHERE lower("accent_color") = '#2563eb';
--> statement-breakpoint
UPDATE "application_settings_master_t"
   SET "sidebar_bg" = '#151a30'
 WHERE lower("sidebar_bg") = '#0f172a';
