-- 0051 — §4.26: per-action colour and icon, configurable under Settings.
--
-- The runtime turns these rows into CSS variables that the shared btn- and ico-
-- classes read, so restyling an action reaches every screen with no deploy. The
-- defaults encode the conventions the app already followed when the colours were
-- hardcoded (§4.20): view near-black, edit blue, delete red, export green.

CREATE TABLE IF NOT EXISTS "action_style_master_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_key" varchar(40) NOT NULL,
  "label" varchar(60) NOT NULL,
  "color" varchar(20) NOT NULL,
  "icon" varchar(60) NOT NULL,
  "display_order" integer DEFAULT 1 NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "action_style_master_t_action_key_unique" UNIQUE("action_key")
);

DO $$ BEGIN
  ALTER TABLE "action_style_master_t"
    ADD CONSTRAINT "action_style_master_t_created_by_users_t_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "action_style_master_t"
    ADD CONSTRAINT "action_style_master_t_updated_by_users_t_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the sixteen actions. ON CONFLICT DO NOTHING so an operator's edits survive
-- a re-run and a partially seeded table is completed rather than overwritten.
INSERT INTO "action_style_master_t" ("action_key", "label", "color", "icon", "display_order") VALUES
  ('create',           'Create',           '#4f46e5', 'Plus',            1),
  ('save',             'Save',             '#4f46e5', 'Save',            2),
  ('update',           'Update',           '#4f46e5', 'Save',            3),
  ('edit',             'Edit',             '#2563eb', 'Edit2',           4),
  ('view',             'View',             '#0f172a', 'Eye',             5),
  ('delete',           'Delete',           '#dc2626', 'Trash2',          6),
  ('cancel',           'Cancel',           '#475569', 'X',               7),
  ('approve',          'Approve',          '#059669', 'Check',           8),
  ('reject',           'Reject',           '#dc2626', 'X',               9),
  ('submit',           'Submit',           '#4f46e5', 'Send',           10),
  ('export',           'Export',           '#059669', 'FileSpreadsheet',11),
  ('import',           'Import',           '#0891b2', 'Upload',         12),
  ('download',         'Download',         '#0891b2', 'Download',       13),
  ('print',            'Print',            '#e11d48', 'Printer',        14),
  ('restore',          'Restore',          '#7c3aed', 'RotateCcw',      15),
  ('permanent_delete', 'Permanent Delete', '#991b1b', 'ShieldX',        16)
ON CONFLICT ("action_key") DO NOTHING;
