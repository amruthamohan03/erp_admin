-- Seeds 8 dashboard cards for the Client Dashboard into dashboard_card_master_t
-- and grants Super Admin (role_id = 1) visibility on each via
-- role_dashboard_card_mapping_t.
--
-- Card design:
--   * card_key is the stable identifier ('client.total', etc.).
--   * card_color is a short semantic name ('violet', 'emerald', etc.) that the
--     page maps to a Tailwind gradient. Keeps the master DB-tool-friendly.
--   * card_icon stores the lucide-react icon name (e.g. 'Users') instead of the
--     default 'bi-card-text' Bootstrap Icons class — the rest of the repo is on
--     lucide. The page has a tiny icon registry that resolves it.
--   * data_source is `<endpoint>#<json-path>`. The page fetches each distinct
--     endpoint once and resolves the path per card. Adding a new card pointing
--     at a different endpoint just works.
--   * card_category = 'client_dashboard' so the page can filter the user's full
--     card list down to the ones it cares about.
--
-- Idempotent: ON CONFLICT on card_key (unique) replaces metadata; role mapping
-- ON CONFLICT on (role_id, card_id) does nothing.

DO $$
DECLARE
  super_admin_role CONSTANT INT := 1;
  id_total         INT;
  id_active        INT;
  id_this_month    INT;
  id_today         INT;
  id_verified      INT;
  id_approved      INT;
  id_valid         INT;
  id_expired       INT;
BEGIN
  -- ====== Cards ======
  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.total', 'client.total', 'Total Clients', 'Users', 'violet',
          '/clients', 1, 'client_dashboard', '/api/clients/dashboard#stats.total_clients',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_total;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.active', 'client.active', 'Active Clients', 'CheckCircle2', 'emerald',
          '/clients', 2, 'client_dashboard', '/api/clients/dashboard#stats.active_clients',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_active;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.this_month', 'client.this_month', 'This Month', 'Calendar', 'amber',
          '/clients', 3, 'client_dashboard', '/api/clients/dashboard#stats.this_month',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_this_month;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.today', 'client.today', 'Today', 'Clock', 'rose',
          '/clients', 4, 'client_dashboard', '/api/clients/dashboard#stats.today',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_today;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.verified', 'client.verified', 'Verified', 'FileCheck', 'slate',
          '/clients', 5, 'client_dashboard', '/api/clients/dashboard#stats.verified',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_verified;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.approved', 'client.approved', 'Approved', 'ShieldCheck', 'sky',
          '/clients', 6, 'client_dashboard', '/api/clients/dashboard#stats.approved',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_approved;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.valid_contracts', 'client.valid_contracts', 'Valid Contracts', 'FileText', 'green',
          '/clients', 7, 'client_dashboard', '/api/clients/dashboard#stats.valid_contracts',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_valid;

  INSERT INTO "dashboard_card_master_t"
    ("card_key", "card_content_id", "card_title", "card_icon", "card_color",
     "card_url", "card_order", "card_category", "data_source",
     "display", "created_by", "updated_by")
  VALUES ('client.expired', 'client.expired', 'Expired', 'AlertCircle', 'red',
          '/clients', 8, 'client_dashboard', '/api/clients/dashboard#stats.expired',
          'Y', 1, 1)
  ON CONFLICT ("card_key") DO UPDATE SET
    "card_title" = EXCLUDED."card_title", "card_icon" = EXCLUDED."card_icon",
    "card_color" = EXCLUDED."card_color", "card_url"  = EXCLUDED."card_url",
    "card_order" = EXCLUDED."card_order", "card_category" = EXCLUDED."card_category",
    "data_source" = EXCLUDED."data_source", "updated_by" = 1, "updated_at" = now()
  RETURNING id INTO id_expired;

  -- ====== Role mappings for Super Admin ======
  IF EXISTS (SELECT 1 FROM "role_master_t" WHERE id = super_admin_role) THEN
    INSERT INTO "role_dashboard_card_mapping_t"
      ("role_id", "card_id", "is_visible", "card_order", "created_by", "updated_by")
    VALUES
      (super_admin_role, id_total,      true, 1, 1, 1),
      (super_admin_role, id_active,     true, 2, 1, 1),
      (super_admin_role, id_this_month, true, 3, 1, 1),
      (super_admin_role, id_today,      true, 4, 1, 1),
      (super_admin_role, id_verified,   true, 5, 1, 1),
      (super_admin_role, id_approved,   true, 6, 1, 1),
      (super_admin_role, id_valid,      true, 7, 1, 1),
      (super_admin_role, id_expired,    true, 8, 1, 1)
    ON CONFLICT ("role_id", "card_id") DO NOTHING;
  END IF;
END $$;
