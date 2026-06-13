-- Seeds the 18 Export dashboard stat cards into dashboard_card_master_t and maps
-- them to Super Admin (1) + Developer (52) via role_dashboard_card_mapping_t.
--
-- Same pattern as 0053 (import dashboard cards):
--   * card_content_id = the stat/filter key; data_source = '/api/exports/stats#<key>'.
--   * card_url = '/export?card=<key>' (deep-link; the /export page filters in-place on click).
--   * card_color = short semantic name → Tailwind gradient on the page.
--   * card_category = 'export_dashboard' so the page selects just these.
-- Icon names are lucide-react components registered in the /export page ICONS map.
-- Idempotent: ON CONFLICT (card_key) updates metadata; mapping ON CONFLICT does nothing.

INSERT INTO "dashboard_card_master_t"
  ("card_key","card_content_id","card_title","card_icon","card_color","card_url","card_order","card_category","data_source","display","created_by","updated_by")
VALUES
  ('export.total',               'all',                 'Total Exports',       'Boxes',         'primary', '/export?card=all',                 1,  'export_dashboard', '/api/exports/stats#all',                 'Y',1,1),
  ('export.completed',           'completed',           'Completed',           'CheckCircle2',  'emerald', '/export?card=completed',           2,  'export_dashboard', '/api/exports/stats#completed',           'Y',1,1),
  ('export.in_progress',         'in_progress',         'In Progress',         'Activity',      'sky',     '/export?card=in_progress',         3,  'export_dashboard', '/api/exports/stats#in_progress',         'Y',1,1),
  ('export.in_transit',          'in_transit',          'In Transit',          'Truck',         'slate',   '/export?card=in_transit',          4,  'export_dashboard', '/api/exports/stats#in_transit',          'Y',1,1),
  ('export.ceec_pending',        'ceec_pending',        'CEEC Pending',        'FileX',         'fuchsia', '/export?card=ceec_pending',        5,  'export_dashboard', '/api/exports/stats#ceec_pending',        'Y',1,1),
  ('export.min_div_pending',     'min_div_pending',     'Min Div Pending',     'FileMinus',     'cyan',    '/export?card=min_div_pending',     6,  'export_dashboard', '/api/exports/stats#min_div_pending',     'Y',1,1),
  ('export.gov_docs_pending',    'gov_docs_pending',    'Gov Docs Pending',    'FileText',      'rose',    '/export?card=gov_docs_pending',    7,  'export_dashboard', '/api/exports/stats#gov_docs_pending',    'Y',1,1),
  ('export.audited_pending',     'audited_pending',     'Audited Pending',     'ClipboardCheck','teal',    '/export?card=audited_pending',     8,  'export_dashboard', '/api/exports/stats#audited_pending',     'Y',1,1),
  ('export.archived_pending',    'archived_pending',    'Archived Pending',    'Archive',       'violet',  '/export?card=archived_pending',    9,  'export_dashboard', '/api/exports/stats#archived_pending',    'Y',1,1),
  ('export.dgda_in_pending',     'dgda_in_pending',     'DGDA In Pending',     'LogIn',         'amber',   '/export?card=dgda_in_pending',     10, 'export_dashboard', '/api/exports/stats#dgda_in_pending',     'Y',1,1),
  ('export.liquidation_pending', 'liquidation_pending', 'Liquidation Pending', 'Wallet',        'yellow',  '/export?card=liquidation_pending', 11, 'export_dashboard', '/api/exports/stats#liquidation_pending', 'Y',1,1),
  ('export.quittance_pending',   'quittance_pending',   'Quittance Pending',   'Receipt',       'red',     '/export?card=quittance_pending',   12, 'export_dashboard', '/api/exports/stats#quittance_pending',   'Y',1,1),
  ('export.dispatch_pending',    'dispatch_pending',    'Dispatch Pending',    'Send',          'lime',    '/export?card=dispatch_pending',    13, 'export_dashboard', '/api/exports/stats#dispatch_pending',    'Y',1,1),
  ('export.seal_pending',        'seal_pending',        'Seal Pending',        'Lock',          'orange',  '/export?card=seal_pending',        14, 'export_dashboard', '/api/exports/stats#seal_pending',        'Y',1,1),
  ('export.lmc_id_pending',      'lmc_id_pending',      'LMC ID Pending',      'Hash',          'primary', '/export?card=lmc_id_pending',      15, 'export_dashboard', '/api/exports/stats#lmc_id_pending',      'Y',1,1),
  ('export.lmc_date_pending',    'lmc_date_pending',    'LMC Date Pending',    'CalendarX',     'cyan',    '/export?card=lmc_date_pending',    16, 'export_dashboard', '/api/exports/stats#lmc_date_pending',    'Y',1,1),
  ('export.ogefrem_ref_pending', 'ogefrem_ref_pending', 'OGEFREM Ref Pending', 'Tag',           'fuchsia', '/export?card=ogefrem_ref_pending', 17, 'export_dashboard', '/api/exports/stats#ogefrem_ref_pending', 'Y',1,1),
  ('export.ogefrem_date_pending','ogefrem_date_pending','OGEFREM Date Pending','CalendarClock', 'teal',    '/export?card=ogefrem_date_pending',18, 'export_dashboard', '/api/exports/stats#ogefrem_date_pending','Y',1,1)
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

-- Map every export_dashboard card to roles 1 (Super Admin) and 52 (Developer),
-- skipping any role that doesn't exist so the FK can't be violated.
INSERT INTO "role_dashboard_card_mapping_t" ("role_id","card_id","is_visible","card_order","created_by","updated_by")
SELECT r.role_id, c.id, true, c.card_order, 1, 1
FROM "dashboard_card_master_t" c
CROSS JOIN (VALUES (1),(52)) AS r(role_id)
WHERE c.card_category = 'export_dashboard'
  AND EXISTS (SELECT 1 FROM "role_master_t" rm WHERE rm.id = r.role_id)
ON CONFLICT ("role_id","card_id") DO NOTHING;
