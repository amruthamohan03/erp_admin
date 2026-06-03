-- Seeds the 14 Import dashboard stat cards into dashboard_card_master_t and maps
-- them to Super Admin (1) + Developer (52) via role_dashboard_card_mapping_t.
--
-- Same pattern as 0047 (client dashboard cards):
--   * card_content_id = the stat/filter key; data_source = '/api/imports/stats#<key>'.
--   * card_url = '/import?card=<key>' (deep-link; the /import page also filters in-place on click).
--   * card_color = short semantic name → Tailwind gradient on the page.
--   * card_category = 'import_dashboard' so the page selects just these.
-- Idempotent: ON CONFLICT (card_key) updates metadata; mapping ON CONFLICT does nothing.

INSERT INTO "dashboard_card_master_t"
  ("card_key","card_content_id","card_title","card_icon","card_color","card_url","card_order","card_category","data_source","display","created_by","updated_by")
VALUES
  ('import.total',              'all',                'Total Imports',            'Boxes',         'primary', '/import?card=all',                1,  'import_dashboard', '/api/imports/stats#all',                'Y',1,1),
  ('import.completed',          'completed',          'Completed',                'CheckCircle2',  'emerald', '/import?card=completed',          2,  'import_dashboard', '/api/imports/stats#completed',          'Y',1,1),
  ('import.in_progress',        'in_progress',        'In Progress',              'Activity',      'sky',     '/import?card=in_progress',        3,  'import_dashboard', '/api/imports/stats#in_progress',        'Y',1,1),
  ('import.in_transit',         'in_transit',         'In Transit',               'Truck',         'slate',   '/import?card=in_transit',         4,  'import_dashboard', '/api/imports/stats#in_transit',         'Y',1,1),
  ('import.crf_missing',        'crf_missing',        'CRF Missing',              'FileX',         'fuchsia', '/import?card=crf_missing',        5,  'import_dashboard', '/api/imports/stats#crf_missing',        'Y',1,1),
  ('import.ad_missing',         'ad_missing',         'AD Missing',               'CalendarX',     'cyan',    '/import?card=ad_missing',         6,  'import_dashboard', '/api/imports/stats#ad_missing',         'Y',1,1),
  ('import.insurance_missing',  'insurance_missing',  'Insurance Missing',        'ShieldAlert',   'rose',    '/import?card=insurance_missing',  7,  'import_dashboard', '/api/imports/stats#insurance_missing',  'Y',1,1),
  ('import.audited_pending',    'audited_pending',    'Audited Pending',          'ClipboardCheck','teal',    '/import?card=audited_pending',    8,  'import_dashboard', '/api/imports/stats#audited_pending',    'Y',1,1),
  ('import.archived_pending',   'archived_pending',   'Archived Pending',         'Archive',       'violet',  '/import?card=archived_pending',   9,  'import_dashboard', '/api/imports/stats#archived_pending',   'Y',1,1),
  ('import.dgda_in_pending',    'dgda_in_pending',    'DGDA In Pending',          'LogIn',         'amber',   '/import?card=dgda_in_pending',    10, 'import_dashboard', '/api/imports/stats#dgda_in_pending',    'Y',1,1),
  ('import.liquidation_pending','liquidation_pending','Liquidation Pending',      'Wallet',        'yellow',  '/import?card=liquidation_pending',11, 'import_dashboard', '/api/imports/stats#liquidation_pending','Y',1,1),
  ('import.quittance_pending',  'quittance_pending',  'Quittance Pending',        'Receipt',       'red',     '/import?card=quittance_pending',  12, 'import_dashboard', '/api/imports/stats#quittance_pending',  'Y',1,1),
  ('import.dgda_out_pending',   'dgda_out_pending',   'DGDA Out Pending',         'LogOut',        'orange',  '/import?card=dgda_out_pending',   13, 'import_dashboard', '/api/imports/stats#dgda_out_pending',   'Y',1,1),
  ('import.dispatch_pending',   'dispatch_pending',   'Dispatch/Deliver Pending', 'Send',          'lime',    '/import?card=dispatch_pending',   14, 'import_dashboard', '/api/imports/stats#dispatch_pending',   'Y',1,1)
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

-- Map every import_dashboard card to roles 1 (Super Admin) and 52 (Developer),
-- skipping any role that doesn't exist so the FK can't be violated.
INSERT INTO "role_dashboard_card_mapping_t" ("role_id","card_id","is_visible","card_order","created_by","updated_by")
SELECT r.role_id, c.id, true, c.card_order, 1, 1
FROM "dashboard_card_master_t" c
CROSS JOIN (VALUES (1),(52)) AS r(role_id)
WHERE c.card_category = 'import_dashboard'
  AND EXISTS (SELECT 1 FROM "role_master_t" rm WHERE rm.id = r.role_id)
ON CONFLICT ("role_id","card_id") DO NOTHING;
