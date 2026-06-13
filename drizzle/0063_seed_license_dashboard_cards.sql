-- Seeds the 7 License dashboard stat cards into dashboard_card_master_t and maps
-- them to Super Admin (1) + Developer (52) via role_dashboard_card_mapping_t.
--
-- Same pattern as 0053 (import dashboard cards):
--   * card_content_id = the stat/filter key; data_source = '/api/licenses/stats#<key>'.
--   * card_url = '/license?card=<key>' (deep-link; the /license page opens a popup
--     listing the matching licenses on click).
--   * card_color = short semantic name → Tailwind gradient on the page.
--   * card_icon = lucide-react icon name (the page resolves it via a small registry).
--   * card_category = 'license_dashboard' so the page selects just these.
-- Idempotent: ON CONFLICT (card_key) updates metadata; mapping ON CONFLICT does nothing.

INSERT INTO "dashboard_card_master_t"
  ("card_key","card_content_id","card_title","card_icon","card_color","card_url","card_order","card_category","data_source","display","created_by","updated_by")
VALUES
  ('license.total',      'all',        'Total',      'FileText',      'primary', '/license?card=all',        1, 'license_dashboard', '/api/licenses/stats#all',        'Y',1,1),
  ('license.expired',    'expired',    'Expired',    'CalendarX',     'fuchsia', '/license?card=expired',    2, 'license_dashboard', '/api/licenses/stats#expired',    'Y',1,1),
  ('license.expiring',   'expiring',   'Expiring',   'Clock',         'sky',     '/license?card=expiring',   3, 'license_dashboard', '/api/licenses/stats#expiring',   'Y',1,1),
  ('license.incomplete', 'incomplete', 'Incomplete', 'AlertTriangle', 'emerald', '/license?card=incomplete', 4, 'license_dashboard', '/api/licenses/stats#incomplete', 'Y',1,1),
  ('license.annulated',  'annulated',  'Annulated',  'Ban',           'orange',  '/license?card=annulated',  5, 'license_dashboard', '/api/licenses/stats#annulated',  'Y',1,1),
  ('license.modified',   'modified',   'Modified',   'Pencil',        'rose',    '/license?card=modified',   6, 'license_dashboard', '/api/licenses/stats#modified',   'Y',1,1),
  ('license.prorogated', 'prorogated', 'Prorogated', 'History',       'teal',    '/license?card=prorogated', 7, 'license_dashboard', '/api/licenses/stats#prorogated', 'Y',1,1)
ON CONFLICT ("card_key") DO UPDATE SET
  "card_content_id" = EXCLUDED."card_content_id",
  "card_title"      = EXCLUDED."card_title",
  "card_icon"       = EXCLUDED."card_icon",
  "card_color"      = EXCLUDED."card_color",
  "card_url"        = EXCLUDED."card_url",
  "card_order"      = EXCLUDED."card_order",
  "card_category"   = EXCLUDED."card_category",
  "data_source"     = EXCLUDED."data_source",
  "updated_by"      = 1,
  "updated_at"      = now();
--> statement-breakpoint

-- Map every license_dashboard card to roles 1 (Super Admin) and 52 (Developer),
-- skipping any role that doesn't exist so the FK can't be violated.
INSERT INTO "role_dashboard_card_mapping_t" ("role_id","card_id","is_visible","card_order","created_by","updated_by")
SELECT r.role_id, c.id, true, c.card_order, 1, 1
FROM "dashboard_card_master_t" c
CROSS JOIN (VALUES (1),(52)) AS r(role_id)
WHERE c.card_category = 'license_dashboard'
  AND EXISTS (SELECT 1 FROM "role_master_t" rm WHERE rm.id = r.role_id)
ON CONFLICT ("role_id","card_id") DO NOTHING;
