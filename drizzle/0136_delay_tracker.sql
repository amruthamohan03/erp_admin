-- Delay Tracker: what "late" means, as configuration (§4.1).
--
-- The stage definitions this seeds with are the EXACT values that were
-- hardcoded in `src/lib/imkpi/stages.ts` and `src/lib/exkpi/stages.ts`, so the
-- two Delay KPI screens behave identically the day this lands — they now read
-- these rows instead of those constants, which is what makes a renegotiated
-- target a row edit rather than a deploy.
--
-- Each module gets a default rule (transport_letter NULL) plus an AIR rule,
-- because an air consignment finishes at Dispatch from Airport rather than at
-- Dispatch/Deliver. That is the same process with a different finish line, not
-- a second process, which is why it is a second rule rather than a second
-- module.

CREATE TABLE IF NOT EXISTS delay_rule_master_t (
  id serial PRIMARY KEY,
  module varchar(10) NOT NULL,
  rule_key varchar(60) NOT NULL,
  name varchar(150) NOT NULL,
  transport_letter varchar(1),
  start_field varchar(60) NOT NULL,
  end_field varchar(60) NOT NULL,
  target_days integer NOT NULL,
  day_basis varchar(10) NOT NULL DEFAULT 'working',
  notify_days_before jsonb NOT NULL DEFAULT '[3, 1]'::jsonb,
  notify_overdue boolean NOT NULL DEFAULT true,
  display varchar(1) NOT NULL DEFAULT 'Y',
  created_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users_t(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT delay_rule_master_t_module_check CHECK (module IN ('import', 'export')),
  CONSTRAINT delay_rule_master_t_basis_check CHECK (day_basis IN ('working', 'calendar')),
  CONSTRAINT delay_rule_master_t_target_check CHECK (target_days BETWEEN 0 AND 3650)
);

CREATE UNIQUE INDEX IF NOT EXISTS delay_rule_master_t_key_uq ON delay_rule_master_t (rule_key);
CREATE INDEX IF NOT EXISTS idx_delay_rule_master_t_module ON delay_rule_master_t (module, transport_letter);

-- Exactly one default rule per module: a file with no transport-specific rule
-- has to land on one answer, and two defaults would make which one arbitrary.
CREATE UNIQUE INDEX IF NOT EXISTS delay_rule_master_t_default_uq
  ON delay_rule_master_t (module)
  WHERE transport_letter IS NULL AND display = 'Y';

CREATE TABLE IF NOT EXISTS delay_rule_stage_t (
  id serial PRIMARY KEY,
  rule_id integer NOT NULL REFERENCES delay_rule_master_t(id) ON DELETE CASCADE,
  stage_key varchar(60) NOT NULL,
  label varchar(150) NOT NULL,
  short_label varchar(40) NOT NULL,
  from_field varchar(60) NOT NULL,
  to_field varchar(60) NOT NULL,
  target_days integer NOT NULL,
  priority boolean NOT NULL DEFAULT false,
  color varchar(20) NOT NULL DEFAULT '#6366f1',
  icon varchar(40) NOT NULL DEFAULT 'clock',
  sort_order integer NOT NULL DEFAULT 0,
  display varchar(1) NOT NULL DEFAULT 'Y',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT delay_rule_stage_t_target_check CHECK (target_days BETWEEN 0 AND 3650)
);

CREATE UNIQUE INDEX IF NOT EXISTS delay_rule_stage_t_rule_key_uq ON delay_rule_stage_t (rule_id, stage_key);
CREATE INDEX IF NOT EXISTS idx_delay_rule_stage_t_rule ON delay_rule_stage_t (rule_id, sort_order);

-- One row per notice already given, so the nightly sweep says "3 days left"
-- once rather than every night until the file moves.
CREATE TABLE IF NOT EXISTS delay_notice_log_t (
  id serial PRIMARY KEY,
  rule_id integer NOT NULL REFERENCES delay_rule_master_t(id) ON DELETE CASCADE,
  module varchar(10) NOT NULL,
  record_id integer NOT NULL,
  days_mark integer NOT NULL,
  noticed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delay_notice_log_t_once_uq
  ON delay_notice_log_t (module, record_id, rule_id, days_mark);

-- ===================================================================
-- Seed: the rules and stages the KPI screens already measured
-- ===================================================================

INSERT INTO delay_rule_master_t
  (module, rule_key, name, transport_letter, start_field, end_field, target_days, day_basis, notify_days_before)
VALUES
  ('import', 'import_default', 'Import Clearance', NULL, 'pre_alert_date', 'dispatch_deliver_date', 21, 'working', '[5, 3, 1]'::jsonb),
  ('import', 'import_air', 'Import Clearance (Air)', 'A', 'pre_alert_date', 'dispatch_from_airport', 14, 'working', '[5, 3, 1]'::jsonb),
  ('export', 'export_default', 'Export Clearance', NULL, 'loading_date', 'exit_drc_date', 21, 'working', '[5, 3, 1]'::jsonb),
  ('export', 'export_air', 'Export Clearance (Air)', 'A', 'loading_date', 'exit_drc_date', 14, 'working', '[5, 3, 1]'::jsonb)
ON CONFLICT (rule_key) DO NOTHING;

-- Import stages — the eleven from imkpi/stages.ts, in the same order, with the
-- same thresholds, priorities and hues. Applied to BOTH import rules so an air
-- file is measured leg by leg too; the air rule simply ends elsewhere.
INSERT INTO delay_rule_stage_t
  (rule_id, stage_key, label, short_label, from_field, to_field, target_days, priority, color, icon, sort_order)
SELECT r.id, s.stage_key, s.label, s.short_label, s.from_field, s.to_field, s.target_days, s.priority, s.color, s.icon, s.sort_order
  FROM delay_rule_master_t r
  CROSS JOIN (VALUES
    ('pre_to_zambia', 'Pre Alert → Arrival Zambia', 'Pre Alert', 'pre_alert_date', 'arrival_date_zambia', 7, false, '#6366f1', 'clock-play', 1),
    ('zambia_dispatch', 'Arrival → Dispatch Zambia', 'Zambia Wait', 'arrival_date_zambia', 'dispatch_from_zambia', 3, false, '#f59e0b', 'clock-pause', 2),
    ('zambia_to_drc', 'Dispatch Zambia → DRC Entry', 'Zambia→DRC', 'dispatch_from_zambia', 'drc_entry_date', 2, false, '#84cc16', 'flag', 3),
    ('drc_to_wh', 'DRC Entry → WH Arrival', 'DRC→WH', 'drc_entry_date', 'border_warehouse_arrival_date', 3, true, '#10b981', 'building-warehouse', 4),
    ('border_wh_dispatch', 'WH Arrival → Dispatch from Border', 'WH → Dispatch', 'border_warehouse_arrival_date', 'dispatch_from_border', 3, false, '#0ea5e9', 'send', 5),
    ('border_dispatch_to_deliver', 'Dispatch from Border → Delivered', 'Dispatch→Deliver', 'dispatch_from_border', 'dispatch_deliver_date', 2, false, '#14b8a6', 'truck-delivery', 6),
    ('customs_processing', 'DGDA In → DGDA Out', 'Customs', 'dgda_in_date', 'dgda_out_date', 5, false, '#f97316', 'shield', 7),
    ('dgda_to_liquidation', 'DGDA In → Liquidation Date', 'DGDA→Liquidation', 'dgda_in_date', 'liquidation_date', 2, true, '#dc2626', 'file-invoice', 8),
    ('liquidation_to_quittance', 'Liquidation → Quittance Date', 'Liquid→Quittance', 'liquidation_date', 'quittance_date', 2, true, '#b91c1c', 'file-dollar', 9),
    ('drc_to_deliver', 'DRC Entry → Delivered', 'DRC→Deliver', 'drc_entry_date', 'dispatch_deliver_date', 5, true, '#e11d48', 'flag-3', 10),
    ('total_journey', 'Pre Alert → Delivered (Total)', 'Total Journey', 'pre_alert_date', 'dispatch_deliver_date', 21, false, '#1d4ed8', 'route', 11)
  ) AS s(stage_key, label, short_label, from_field, to_field, target_days, priority, color, icon, sort_order)
 WHERE r.rule_key IN ('import_default', 'import_air')
ON CONFLICT (rule_id, stage_key) DO NOTHING;

-- Export stages — the eleven from exkpi/stages.ts, likewise unchanged.
INSERT INTO delay_rule_stage_t
  (rule_id, stage_key, label, short_label, from_field, to_field, target_days, priority, color, icon, sort_order)
SELECT r.id, s.stage_key, s.label, s.short_label, s.from_field, s.to_field, s.target_days, s.priority, s.color, s.icon, s.sort_order
  FROM delay_rule_master_t r
  CROSS JOIN (VALUES
    ('loading_to_bp', 'Loading → BP', 'Loading→BP', 'loading_date', 'bp_date', 3, false, '#6366f1', 'clock-play', 1),
    ('bp_to_assay', 'BP → Assay', 'BP→Assay', 'bp_date', 'assay_date', 5, false, '#f59e0b', 'flask', 2),
    ('ceec', 'CEEC In → CEEC Out', 'CEEC', 'ceec_in_date', 'ceec_out_date', 3, true, '#10b981', 'certificate', 3),
    ('min_div', 'Min Div In → Min Div Out', 'Min Div', 'min_div_in_date', 'min_div_out_date', 3, false, '#0ea5e9', 'scale', 4),
    ('gov_docs', 'Gov Docs In → Gov Docs Out', 'Gov Docs', 'gov_docs_in_date', 'gov_docs_out_date', 3, false, '#14b8a6', 'files', 5),
    ('customs', 'DGDA In → DGDA Out', 'Customs', 'dgda_in_date', 'dgda_out_date', 5, false, '#f97316', 'shield', 6),
    ('dgda_to_liquidation', 'DGDA In → Liquidation', 'DGDA→Liq', 'dgda_in_date', 'liquidation_date', 2, true, '#dc2626', 'file-invoice', 7),
    ('liquidation_to_quittance', 'Liquidation → Quittance', 'Liq→Quitt', 'liquidation_date', 'quittance_date', 2, true, '#b91c1c', 'file-dollar', 8),
    ('dispatch_to_border', 'Dispatch → Border Arrival', 'Disp→Border', 'dispatch_deliver_date', 'border_arrival_date', 3, false, '#0284c7', 'send', 9),
    ('border_to_exit', 'Border Arrival → Exit DRC', 'Border→Exit', 'border_arrival_date', 'exit_drc_date', 2, true, '#e11d48', 'flag-3', 10),
    ('total_journey', 'Loading → Exit DRC (Total)', 'Total Journey', 'loading_date', 'exit_drc_date', 21, false, '#1d4ed8', 'route', 11)
  ) AS s(stage_key, label, short_label, from_field, to_field, target_days, priority, color, icon, sort_order)
 WHERE r.rule_key IN ('export_default', 'export_air')
ON CONFLICT (rule_id, stage_key) DO NOTHING;

-- ===================================================================
-- Notifications: what a looming or spent deadline says, and to whom
-- ===================================================================
--
-- Rows in the event master, so the wording and the recipients are edited under
-- Masters → Notification Events like every other event (§4.1). The sweep only
-- names the event; an event with no roles attached announces nothing.

INSERT INTO notification_event_master_t
  (event_key, module, name, title_template, message_template, link_template, notify_creator, priority)
VALUES
  ('delay.due_soon', 'tracking', 'Delay — deadline approaching',
   '{ref}: {days_left} day(s) left',
   '{ref} ({client}) is due to complete {rule} by {due_date}. {days_left} {basis} day(s) remain.',
   '/delay-tracker', true, 'normal'),
  ('delay.overdue', 'tracking', 'Delay — deadline passed',
   '{ref} is overdue by {days_over} day(s)',
   '{ref} ({client}) passed its {rule} deadline of {due_date} and is still open — {days_over} {basis} day(s) over.',
   '/delay-tracker', true, 'high')
ON CONFLICT (event_key) DO NOTHING;

-- ===================================================================
-- Navigation and permissions
-- ===================================================================
--
-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone including the Super Admin.

INSERT INTO menu_master_t (menu_id, menu_order, menu_level, menu_name, url, icon, display)
SELECT p.id, 45, 1, 'Delay Tracker', '/delay-tracker', '', 'Y'
  FROM menu_master_t p
 -- Operations, not Import Tracking: the tracker spans both modules, and
 -- File Cancellation is the precedent for a cross-module screen living there.
 WHERE p.menu_name = 'Operations' AND p.menu_level = 0
   AND NOT EXISTS (SELECT 1 FROM menu_master_t m WHERE m.url = '/delay-tracker');

INSERT INTO menu_master_t (menu_id, menu_order, menu_level, menu_name, url, icon, display)
SELECT p.id, 46, 1, 'Delay Rules', '/masters/delay-rules', '', 'Y'
  FROM menu_master_t p
 WHERE p.menu_name = 'Masters' AND p.menu_level = 0
   AND NOT EXISTS (SELECT 1 FROM menu_master_t m WHERE m.url = '/masters/delay-rules');

-- The tracker reads the same files as the Import Tracking dashboard through
-- the same predicates, so anyone who may read that may read this. Inheriting
-- is deliberate: inventing a narrower right here would hide the screen from
-- everyone until somebody noticed.
INSERT INTO role_menu_mapping_t
  (role_id, menu_id, can_view, can_add, can_edit, can_delete, can_approve,
   can_restore, can_permanent_delete, can_export, can_import, can_print,
   can_view_audit, can_export_audit, can_manage_settings)
SELECT r.role_id, d.id,
       true,                        -- can_view: the whole point
       false, false, false, false,  -- the tracker creates and changes nothing
       false, false,
       r.can_export,                -- inherit rather than invent a narrower right
       false,
       r.can_print,
       false, false, false
  FROM role_menu_mapping_t r
  JOIN menu_master_t src ON src.id = r.menu_id AND src.url = '/imports/dashboard'
  JOIN menu_master_t d   ON d.url = '/delay-tracker'
 WHERE r.can_view = true
   AND NOT EXISTS (
     SELECT 1 FROM role_menu_mapping_t x WHERE x.role_id = r.role_id AND x.menu_id = d.id
   );

-- The rules screen is a master: whoever may change other masters may change
-- what "late" means, so it inherits from the Clearing Status master rather
-- than from a dashboard nobody edits.
INSERT INTO role_menu_mapping_t
  (role_id, menu_id, can_view, can_add, can_edit, can_delete, can_approve,
   can_restore, can_permanent_delete, can_export, can_import, can_print,
   can_view_audit, can_export_audit, can_manage_settings)
SELECT r.role_id, d.id,
       r.can_view, r.can_add, r.can_edit, r.can_delete, false,
       r.can_restore, false,
       r.can_export, false, r.can_print,
       false, false, false
  FROM role_menu_mapping_t r
  JOIN menu_master_t src ON src.id = r.menu_id AND src.url = '/masters/clearing-statuses'
  JOIN menu_master_t d   ON d.url = '/masters/delay-rules'
 WHERE r.can_view = true
   AND NOT EXISTS (
     SELECT 1 FROM role_menu_mapping_t x WHERE x.role_id = r.role_id AND x.menu_id = d.id
   );
