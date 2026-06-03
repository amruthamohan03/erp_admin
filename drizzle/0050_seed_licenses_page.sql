-- §4.12 transactional page for licenses_t. Accordions mirror the source PHP
-- form's 5 sections; each section is its own accordion so role + audit are
-- per-section. EDIT granted to Super Admin (1) and Developer (52).
-- Idempotent via ON CONFLICT against the unique indexes from 0039.
--
-- Limitations vs the source PHP: the shared runtime renders a static form — it
-- does NOT do kind-based show/hide, MCA license-number auto-generation, the
-- import/export table split, or dependent subtype filtering.

DO $$
DECLARE
  v_page_id     INT;
  acc_basic     INT;
  acc_financial INT;
  acc_invoice   INT;
  acc_license   INT;
  acc_payment   INT;
BEGIN
  -- ====== Page row ======
  INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display", "created_by", "updated_by")
  VALUES ('license', 'License', '/license', 'licenses_t', 2, 'Y', 1, 1)
  ON CONFLICT ("slug") DO UPDATE
    SET "title" = EXCLUDED."title",
        "route" = EXCLUDED."route",
        "target_table" = EXCLUDED."target_table",
        "updated_by" = EXCLUDED."updated_by",
        "updated_at" = now()
  RETURNING id INTO v_page_id;

  -- ====== Accordions ======
  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'basic', 'Basic Information', 'ti ti-info-circle', 1, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_basic;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'financial', 'Financial Information', 'ti ti-currency-dollar', 2, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_financial;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'invoice-transport', 'Invoice & Transport Information', 'ti ti-file-invoice', 3, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_invoice;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'license-details', 'License Details', 'ti ti-calendar-event', 4, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_license;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'payment', 'Payment Information', 'ti ti-credit-card', 5, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_payment;

  -- ====== Role grants: Super Admin (1) + Developer (52) EDIT on every accordion ======
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 1) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission", "created_by", "updated_by")
    VALUES
      (acc_basic, 1, 'edit', 1, 1), (acc_financial, 1, 'edit', 1, 1), (acc_invoice, 1, 'edit', 1, 1),
      (acc_license, 1, 'edit', 1, 1), (acc_payment, 1, 'edit', 1, 1)
    ON CONFLICT ("accordion_id", "role_id") DO UPDATE SET "permission" = EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=1 (Super Admin); grant license accordions manually.';
  END IF;

  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = 52) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission", "created_by", "updated_by")
    VALUES
      (acc_basic, 52, 'edit', 1, 1), (acc_financial, 52, 'edit', 1, 1), (acc_invoice, 52, 'edit', 1, 1),
      (acc_license, 52, 'edit', 1, 1), (acc_payment, 52, 'edit', 1, 1)
    ON CONFLICT ("accordion_id", "role_id") DO UPDATE SET "permission" = EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=52 (Developer); grant license accordions manually.';
  END IF;

  -- ====== Fields: Basic Information (7) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_basic, 'kind_id',            'Kind',           'select', true,  'kinds',         'kind_name',  NULL, '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_basic, 'bank_id',            'Bank',           'select', true,  'banks',         'bank_name',  NULL, '{"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_basic, 'client_id',          'Client',         'select', true,  'clients',       'short_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_basic, 'license_cleared_by', 'License Cleared By', 'select', true, 'done-by',    'done_by_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 4),
    (acc_basic, 'type_of_goods_id',   'Type of Goods',  'select', true,  'type-of-goods', 'goods_type', NULL, '{"colSpan":"5-per-row"}'::jsonb, 5),
    (acc_basic, 'weight',             'Weight',         'number', true,  NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 6),
    (acc_basic, 'm3',                 'M3',             'number', false, NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 7)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Financial Information (6) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_financial, 'unit_of_measurement_id', 'Unit of Measurement', 'select', true,  'units',      'unit_name',           NULL, '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_financial, 'currency_id',            'Currency',            'select', true,  'currencies', 'currency_short_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_financial, 'fob_declared',           'FOB Declared',        'number', true,  NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 3),
    (acc_financial, 'insurance',              'Insurance',           'number', false, NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 4),
    (acc_financial, 'freight',                'Freight',             'number', false, NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 5),
    (acc_financial, 'other_costs',            'Other Costs',         'number', false, NULL, NULL, NULL, '{"min":0,"step":"0.01","colSpan":"5-per-row"}'::jsonb, 6)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Invoice & Transport (5) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_invoice, 'transport_mode_id', 'Transport Mode',       'select', true,  'transport-modes', 'transport_mode_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_invoice, 'invoice_number',    'Invoice Number',       'text',   true,  NULL, NULL, NULL, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_invoice, 'invoice_date',      'Invoice Date',         'date',   true,  NULL, NULL, NULL, '{"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_invoice, 'invoice_file',      'Invoice File (PDF only)', 'file', false, NULL, NULL, NULL, '{"accept":"application/pdf","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 4),
    (acc_invoice, 'supplier',          'Supplier/Buyer',       'text',   true,  NULL, NULL, NULL, '{"maxLength":255,"colSpan":"12"}'::jsonb, 5)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: License Details (9) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_license, 'license_applied_date',    'License Applied Date',    'date',   true,  NULL, NULL, NULL, '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_license, 'fsi',                     'FSI/FSO',                 'text',   false, NULL, NULL, NULL, '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_license, 'aur',                     'AUR',                     'text',   false, NULL, NULL, NULL, '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_license, 'license_number',          'License Number',          'text',   true,  NULL, NULL, NULL, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 4),
    (acc_license, 'entry_post_id',           'Entry Post/Exit Post',    'select', true,  'transit-points', 'transit_point_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 5),
    (acc_license, 'ref_cod',                 'REF. COD',                'text',   false, NULL, NULL, NULL, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 6),
    (acc_license, 'license_validation_date', 'License Validation Date', 'date',   true,  NULL, NULL, NULL, '{"colSpan":"5-per-row","afterField":"license_applied_date"}'::jsonb, 7),
    (acc_license, 'license_expiry_date',     'License Expiry Date',     'date',   true,  NULL, NULL, NULL, '{"colSpan":"5-per-row","afterField":"license_validation_date"}'::jsonb, 8),
    (acc_license, 'license_file',            'License File (PDF only)', 'file',   false, NULL, NULL, NULL, '{"accept":"application/pdf","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 9)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Payment Information (3) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_payment, 'payment_method_id',  'Payment Method',     'select', true,  'payment-types',    'payment_type_name', NULL, '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_payment, 'payment_subtype_id', 'Payment Subtype',    'select', false, 'payment-subtypes', 'payment_subtype',   NULL, '{"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_payment, 'destination_id',     'Destination/Origin', 'select', true,  'origins',          'origin_name',       NULL, '{"colSpan":"5-per-row"}'::jsonb, 3)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;
END $$;
