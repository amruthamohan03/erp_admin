-- 0060 — §4.1: the shape of every auto-generated reference number becomes
-- configuration instead of code.
--
-- Six references were assembled by hardcoded resolvers in
-- src/lib/pages/deriveSources.ts, with the arrangement restated a second time as
-- a template string on each field's derive row. Changing `NMI-IDCOR26-0001` to
-- `IDCOR26-0001-NMI` therefore meant editing source in two places and deploying.
--
-- Now: one row per reference, holding an ordered list of segments. Each segment
-- names a code (client / kind / goods / transport / office), a year, fixed text
-- or the incrementing number, and carries the separator that precedes it — `''`
-- glues, so `IDCOR26` is four segments with no separators between them. See
-- src/lib/mcaRefFormat.ts for the renderer, which is shared by the setup screen's
-- live preview and the server-side generator so the two cannot disagree.
--
-- `target_key` is a closed set: it selects an entry in a vetted table/column
-- registry in code, so a config row names a reference but never a table (§4.12).
-- Adding a seventh reference stays a code change, which is why this screen edits
-- the six and offers no create or delete.

CREATE TABLE IF NOT EXISTS "mca_ref_format_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "target_key" varchar(50) NOT NULL,
  "format_name" varchar(150) NOT NULL,
  "segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mca_ref_format_master_t_target_key_unique" UNIQUE("target_key"),
  CONSTRAINT "mca_ref_format_master_t_target_key_check" CHECK ("target_key" IN (
    'import','export','license','local','export-invoice','import-invoice'
  )),
  CONSTRAINT "mca_ref_format_master_t_segments_array_check" CHECK (jsonb_typeof("segments") = 'array')
);

DO $$ BEGIN
  ALTER TABLE "mca_ref_format_master_t"
    ADD CONSTRAINT "mca_ref_format_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "mca_ref_format_master_t"
    ADD CONSTRAINT "mca_ref_format_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the six with EXACTLY the formats the hardcoded resolvers produced, so the
-- first consignment created after this migration is named the same way as the
-- last one created before it. ON CONFLICT DO NOTHING: an operator's edits survive
-- a re-run, and a partially seeded table is completed rather than overwritten.
--
--   import / export  NMI-IDCOR26-0001
--   license          NMI-ID-CO-R          (no year, no number)
--   local            NMI-LTKI26-0001
--   export-invoice   2026-NMI-EXP-0001
--   import-invoice   2026-NMI-0001
INSERT INTO "mca_ref_format_master_t" ("target_key", "format_name", "segments") VALUES
  ('import', 'Import Tracking — MCA Reference', '[
     {"type":"client"},
     {"type":"kind","separator":"-"},
     {"type":"goods","separator":""},
     {"type":"transport","separator":""},
     {"type":"year","separator":"","digits":2},
     {"type":"sequence","separator":"-","width":4}
   ]'::jsonb),
  ('export', 'Export Tracking — MCA Reference', '[
     {"type":"client"},
     {"type":"kind","separator":"-"},
     {"type":"goods","separator":""},
     {"type":"transport","separator":""},
     {"type":"year","separator":"","digits":2},
     {"type":"sequence","separator":"-","width":4}
   ]'::jsonb),
  ('license', 'License — License Number', '[
     {"type":"client"},
     {"type":"kind","separator":"-"},
     {"type":"goods","separator":"-"},
     {"type":"transport","separator":"-"}
   ]'::jsonb),
  ('local', 'Local Tracking — LT Reference', '[
     {"type":"client"},
     {"type":"literal","separator":"-","value":"LT"},
     {"type":"office","separator":"","letters":2},
     {"type":"year","separator":"","digits":2},
     {"type":"sequence","separator":"-","width":4}
   ]'::jsonb),
  ('export-invoice', 'Export Invoice — Invoice Reference', '[
     {"type":"year","digits":4},
     {"type":"client","separator":"-"},
     {"type":"literal","separator":"-","value":"EXP"},
     {"type":"sequence","separator":"-","width":4}
   ]'::jsonb),
  ('import-invoice', 'Import Invoice — Invoice Reference', '[
     {"type":"year","digits":4},
     {"type":"client","separator":"-"},
     {"type":"sequence","separator":"-","width":4}
   ]'::jsonb)
ON CONFLICT ("target_key") DO NOTHING;

-- ── The fields stop restating the format ──────────────────────────────────
--
-- Each derive source now returns the finished reference as `{ref}`, assembled
-- from the row above. Leaving the old interpolation strings in place would mean
-- two sources of truth for the same arrangement, with the field's copy silently
-- winning — so they are repointed here rather than left to drift.
UPDATE master_page_accordion_field_t
   SET derive = jsonb_set(derive::jsonb, '{template}', '"{ref}"'::jsonb),
       updated_at = now()
 WHERE derive IS NOT NULL
   AND derive::jsonb ->> 'kind' = 'template'
   AND derive::jsonb ->> 'source' IN (
     'license_mca','import_mca','export_mca','local_lt',
     'export_invoice_ref','import_invoice_ref'
   );

-- ── Developer Options ─────────────────────────────────────────────────────
--
-- A new top-level group for configuration that changes how the app BEHAVES
-- rather than what it holds. Reference Formats is its first entry; it sits here
-- rather than under Masters because getting it wrong renames every consignment
-- created afterwards, and that is not a lookup table.
--
-- Seeded with the admin (role 1) grant like every other menu row, so the Super
-- Admin can reach it immediately; other roles are granted at /mapping/roletomenu.
DO $$
DECLARE
  parent_id integer;
  child_id integer;
BEGIN
  SELECT id INTO parent_id FROM menu_master_t
   WHERE menu_name = 'Developer Options' AND menu_id IS NULL LIMIT 1;

  IF parent_id IS NULL THEN
    INSERT INTO menu_master_t (menu_name, url, menu_id, menu_level, menu_order, icon, display)
    VALUES ('Developer Options', '#', NULL, 0, 98, 'ti ti-code', 'Y')
    RETURNING id INTO parent_id;
  END IF;

  SELECT id INTO child_id FROM menu_master_t
   WHERE menu_name = 'Reference Formats' AND menu_id = parent_id LIMIT 1;

  IF child_id IS NULL THEN
    INSERT INTO menu_master_t (menu_name, url, menu_id, menu_level, menu_order, icon, display)
    VALUES ('Reference Formats', '/developer/reference-formats', parent_id, 1, 1, 'ti ti-hash', 'Y')
    RETURNING id INTO child_id;
  END IF;

  -- Matches grantAdmin() in src/db/seed/menus.ts. can_manage_settings is added on
  -- top because this screen is settings, not records — editing a format changes
  -- what every consignment created afterwards is called.
  INSERT INTO role_menu_mapping_t
    (role_id, menu_id, can_view, can_add, can_edit, can_delete, can_approve, can_manage_settings)
  SELECT 1, m.id, true, true, true, true, true, true
    FROM (VALUES (parent_id), (child_id)) AS m(id)
  ON CONFLICT (role_id, menu_id) DO UPDATE
     SET can_view = true, can_edit = true, can_manage_settings = true, updated_at = now();
END $$;
