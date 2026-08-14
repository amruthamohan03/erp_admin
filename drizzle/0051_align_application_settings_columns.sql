-- 0051 — align the branding singleton's columns with src/db/schema/applicationSettings.ts.
--
-- Background: main named the table application_settings_t and gave it narrower
-- columns than the schema file declares. 0044 renames the table on a legacy
-- database but leaves the column types alone, so a renamed table still rejects
-- values the Zod boundary happily accepts:
--
--   footer_text  varchar(300)  vs  text   — Zod allows 2000 chars
--   tagline      varchar(200)  vs  varchar(255)
--   logo_url     varchar(255)  vs  text   — an upload URL is short today, but
--   favicon_url  varchar(255)  vs  text     nothing caps it at 255
--   project_name varchar(150)  vs  varchar(100)
--   app_title    varchar(200)  vs  varchar(100)
--
-- The overflow surfaces as a 500 ("Server error") on save rather than a field
-- error, because a pg 22001 is not one of the codes withErrorHandler maps.
--
-- Widening is always safe. project_name/app_title narrow to the declared 100, so
-- they are truncated first — the widest value in practice is a project name of a
-- dozen characters, and leaving them wider than the schema would make the next
-- drizzle-kit generate emit a spurious diff.
--
-- Guarded throughout so this is a no-op on a database built by the full chain
-- (0040 already creates the right shape) and a repair on a dump-restored one.
DO $$
BEGIN
  IF to_regclass('public.application_settings_master_t') IS NULL THEN
    RETURN;  -- 0044 not reached yet on this database; nothing to align.
  END IF;

  UPDATE "application_settings_master_t"
     SET "project_name" = left("project_name", 100)
   WHERE length("project_name") > 100;

  UPDATE "application_settings_master_t"
     SET "app_title" = left("app_title", 100)
   WHERE length("app_title") > 100;

  ALTER TABLE "application_settings_master_t"
    ALTER COLUMN "project_name" TYPE varchar(100),
    ALTER COLUMN "app_title"    TYPE varchar(100),
    ALTER COLUMN "tagline"      TYPE varchar(255),
    ALTER COLUMN "logo_url"     TYPE text,
    ALTER COLUMN "favicon_url"  TYPE text,
    ALTER COLUMN "footer_text"  TYPE text;
END $$;
