-- Seed the §4.12 transactional page for clients_t. Layout mirrors the source
-- PHP form (5 sub-sections), but each sub-section becomes a separate §4.12
-- accordion so role and audit can be set per section.
--
-- Idempotent via ON CONFLICT clauses against the unique indexes from 0039.

DO $$
DECLARE
  v_page_id          INT;
  acc_basic          INT;
  acc_contact        INT;
  acc_legal          INT;
  acc_financial      INT;
  acc_verification   INT;
  super_admin_role   CONSTANT INT := 1;
BEGIN
  -- ====== Page row ======
  INSERT INTO "master_page_t" ("slug", "title", "route", "target_table", "display_order", "display", "created_by", "updated_by")
  VALUES ('clients', 'Clients', '/clients', 'clients_t', 1, 'Y', 1, 1)
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
  VALUES (v_page_id, 'contact', 'Contact Information', 'ti ti-phone', 2, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_contact;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'legal', 'Legal & License Info', 'ti ti-file-certificate', 3, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_legal;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'financial', 'Financial & Payment Info', 'ti ti-currency-dollar', 4, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_financial;

  INSERT INTO "master_page_accordion_t" ("page_id", "slug", "title", "icon", "display_order", "display", "created_by", "updated_by")
  VALUES (v_page_id, 'verification', 'Verification & Approval', 'ti ti-file-text', 5, 'Y', 1, 1)
  ON CONFLICT ("page_id", "slug") DO UPDATE SET "title" = EXCLUDED."title", "icon" = EXCLUDED."icon"
  RETURNING id INTO acc_verification;

  -- ====== Super Admin gets EDIT on every accordion ======
  -- Guarded against a missing role_id=1 so the migration doesn't FK-violate on
  -- a DB where the role master hasn't been seeded yet. If the role is missing,
  -- grant accordion access through the UI later.
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "master_page_accordion_role_t" ("accordion_id", "role_id", "permission", "created_by", "updated_by")
    VALUES
      (acc_basic,        super_admin_role, 'edit', 1, 1),
      (acc_contact,      super_admin_role, 'edit', 1, 1),
      (acc_legal,        super_admin_role, 'edit', 1, 1),
      (acc_financial,    super_admin_role, 'edit', 1, 1),
      (acc_verification, super_admin_role, 'edit', 1, 1)
    ON CONFLICT ("accordion_id", "role_id") DO UPDATE SET "permission" = EXCLUDED."permission";
  ELSE
    RAISE WARNING 'role_master_t has no id=1; no accordion roles seeded. Grant access manually.';
  END IF;

  -- ====== Fields: Basic Information (11) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_basic, 'company_name',       'Company Name',          'text',           true,  NULL,                NULL,                  NULL,
       '{"minLength":2,"maxLength":200,"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_basic, 'group_company_id',   'Group Company Name',    'select',         false, 'group-companies',   'group_company_name',  NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_basic, 'short_name',         'Client Code',           'text',           true,  NULL,                NULL,                  NULL,
       '{"minLength":3,"maxLength":3,"uppercase":true,"uniquenessSlug":"clients-short-name","colSpan":"5-per-row"}'::jsonb, 3),
    (acc_basic, 'client_type',        'Client Type',           'checkbox-group', true,  NULL,                NULL,
       '[{"value":"I","label":"Import"},{"value":"E","label":"Export"},{"value":"L","label":"Local"}]'::jsonb,
       '{"colSpan":"5-per-row","joinChar":""}'::jsonb, 4),
    (acc_basic, 'industry_type_id',   'Industry Type',         'select',         false, 'industries',        'industry_name',       NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 5),
    (acc_basic, 'referred_by_id',     'Referred By',           'select',         false, 'referers',          'refferer_name',       NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 6),
    (acc_basic, 'phase_id',           'Phase',                 'select',         false, 'phases',            'phase_name',          NULL,
       '{"colSpan":"5-per-row","labelTemplate":"{phase_code}-{phase_name}"}'::jsonb, 7),
    (acc_basic, 'phase_start_date',   'Phase Start Date',      'date',           false, NULL,                NULL,                  NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 8),
    (acc_basic, 'phase_end_date',     'Phase End Date',        'date',           false, NULL,                NULL,                  NULL,
       '{"colSpan":"5-per-row","afterField":"phase_start_date"}'::jsonb, 9),
    (acc_basic, 'office_location_id', 'Location',              'select',         false, 'office-locations',  'location_name',       NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 10),
    (acc_basic, 'address',            'Address',               'textarea',       true,  NULL,                NULL,                  NULL,
       '{"minLength":2,"maxLength":500,"rows":2,"colSpan":"12"}'::jsonb, 11)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Contact Information (5) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "props", "display_order")
  VALUES
    (acc_contact, 'contact_person',  'Contact Person',  'text',  false, '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_contact, 'email',           'Email',           'email', false, '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_contact, 'email_secondary', 'Secondary Email', 'email', false, '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_contact, 'phone',           'Phone',           'tel',   false, '{"maxLength":20,"pattern":"[0-9+\\\\s()-]{7,20}","colSpan":"5-per-row"}'::jsonb, 4),
    (acc_contact, 'phone_secondary', 'Phone (Secondary)','tel',  false, '{"maxLength":20,"pattern":"[0-9+\\\\s()-]{7,20}","colSpan":"5-per-row"}'::jsonb, 5)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Legal & License Info (11) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "props", "display_order")
  VALUES
    (acc_legal, 'id_nat_number',          'ID/NAT Number',          'text', false, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_legal, 'id_nat_file',            'ID/NAT File',            'file', false, '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_legal, 'rccm_number',            'RCCM Number',            'text', false, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_legal, 'rccm_file',              'RCCM File',              'file', false, '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 4),
    (acc_legal, 'import_export_number',   'Import/Export Number',   'text', false, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 5),
    (acc_legal, 'import_export_validity', 'Import/Export Validity', 'date', false, '{"colSpan":"5-per-row"}'::jsonb, 6),
    (acc_legal, 'import_export_file',     'Import/Export File',     'file', false, '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 7),
    (acc_legal, 'attestation_number',     'Attestation Number',     'text', false, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 8),
    (acc_legal, 'attestation_validity',   'Attestation Validity',   'date', false, '{"colSpan":"5-per-row"}'::jsonb, 9),
    (acc_legal, 'attestation_file',       'Attestation File',       'file', false, '{"accept":".pdf,.jpg,.jpeg,.png","maxSizeKb":5120,"colSpan":"5-per-row"}'::jsonb, 10),
    (acc_legal, 'nif_number',             'NIF Number',             'text', false, '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 11)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Financial & Payment Info (11) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "options_static", "props", "display_order")
  VALUES
    (acc_financial, 'payment_term',            'Payment Term',            'select', true,  NULL,        NULL,
       '[{"value":"ADVANCE","label":"Advance"},{"value":"15days","label":"15 Days"},{"value":"30days","label":"30 Days"},{"value":"45days","label":"45 Days"},{"value":"60days","label":"60 Days"}]'::jsonb,
       '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_financial, 'credit_term',             'Credit Term (days)',      'number', false, NULL,        NULL,             NULL,
       '{"min":0,"max":365,"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_financial, 'liquidation_paid_by',     'Liquidation Paid By',     'select', true,  'done-by',   'done_by_name',   NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_financial, 'license_cleared_by',      'License Cleared By',      'select', false, 'done-by',   'done_by_name',   NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 4),
    (acc_financial, 'license_submit_to_bank',  'License Submitted To Bank','select', true, 'done-by',   'done_by_name',   NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 5),
    (acc_financial, 'contract_start_date',     'Contract Start Date',     'date',   false, NULL,        NULL,             NULL,
       '{"colSpan":"5-per-row"}'::jsonb, 6),
    (acc_financial, 'contract_validity',       'Contract Validity',       'date',   false, NULL,        NULL,             NULL,
       '{"colSpan":"5-per-row","afterField":"contract_start_date"}'::jsonb, 7),
    (acc_financial, 'payment_contact_email',   'Payment Contact Email',   'email',  false, NULL,        NULL,             NULL,
       '{"maxLength":100,"colSpan":"5-per-row"}'::jsonb, 8),
    (acc_financial, 'payment_contact_phone',   'Payment Contact Phone',   'tel',    false, NULL,        NULL,             NULL,
       '{"maxLength":20,"pattern":"[0-9+\\\\s()-]{7,20}","colSpan":"5-per-row"}'::jsonb, 9),
    (acc_financial, 'approval_code',           'Approval Code',           'text',   false, NULL,        NULL,             NULL,
       '{"maxLength":50,"colSpan":"5-per-row"}'::jsonb, 10),
    (acc_financial, 'invoice_template',        'Select Template',         'select', true,  NULL,        NULL,
       '[{"value":"I","label":"Include"},{"value":"E","label":"Exclude"}]'::jsonb,
       '{"colSpan":"5-per-row"}'::jsonb, 11)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;

  -- ====== Fields: Verification & Approval (5) ======
  INSERT INTO "master_page_accordion_field_t"
    ("accordion_id", "name", "label", "field_type", "required", "options_source", "options_label_field", "props", "display_order")
  VALUES
    (acc_verification, 'verified_by_id',   'Verified By',       'select',   false, 'users', 'full_name', '{"colSpan":"5-per-row"}'::jsonb, 1),
    (acc_verification, 'verified_by_date', 'Verification Date', 'date',     false, NULL,    NULL,        '{"colSpan":"5-per-row"}'::jsonb, 2),
    (acc_verification, 'approved_by_id',   'Approved By',       'select',   false, 'users', 'full_name', '{"colSpan":"5-per-row"}'::jsonb, 3),
    (acc_verification, 'approved_by_date', 'Approved Date',     'date',     false, NULL,    NULL,        '{"colSpan":"5-per-row","afterField":"verified_by_date"}'::jsonb, 4),
    (acc_verification, 'remarks',          'Remarks',           'textarea', false, NULL,    NULL,        '{"maxLength":1000,"rows":3,"colSpan":"12"}'::jsonb, 5)
  ON CONFLICT ("accordion_id", "name") DO NOTHING;
END $$;
