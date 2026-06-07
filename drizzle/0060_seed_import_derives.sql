-- §4.12 — config-driven DERIVED values for the Import Tracking form (0052).
-- Mirrors the source PHP: MCA reference auto-generation, "from license" autofill,
-- Liquidation-Paid-By from the client, remaining weight/FOB, and the Document
-- Status auto-computed from the CRF / AD / Insurance dates.
--
-- Business mappings live HERE as data; the SQL that backs the sources lives in the
-- vetted registry src/lib/pages/deriveSources.ts. Derived fields render read-only.
-- Scope: import page only. Idempotent.

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'import';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'import page not seeded — apply 0052 before 0060';
  END IF;

  -- ── "From license" autofill (trigger: license_id, source: license) ──
  -- Each field copies one column off the selected license / its computed remaining.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"kind_id"}'::jsonb
   WHERE f."name" = 'kind' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"type_of_goods_id"}'::jsonb
   WHERE f."name" = 'type_of_goods' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"transport_mode_id"}'::jsonb
   WHERE f."name" = 'transport_mode' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"currency_id"}'::jsonb
   WHERE f."name" = 'currency' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"supplier"}'::jsonb
   WHERE f."name" = 'supplier' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"ref_cod"}'::jsonb
   WHERE f."name" = 'crf_reference' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"invoice_number"}'::jsonb
   WHERE f."name" = 'license_invoice_number' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"remaining_weight"}'::jsonb
   WHERE f."name" = 'rem_weight' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"license_id","source":"license","column":"remaining_fob"}'::jsonb
   WHERE f."name" = 'r_fob' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Liquidation Paid By: from the client (1 → Client, 2 → Malabar) ──
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"client_id","source":"client","column":"liquidation_paid_by","valueMap":{"1":"Client","2":"Malabar"}}'::jsonb
   WHERE f."name" = 'liquidation_paid_by' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── MCA reference: built from client + license short codes + year + sequence ──
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"template","trigger":"license_id","source":"import_mca","template":"{client_short}-{kind_short}{goods_short}{transport_letter}{year}-{seq}"}'::jsonb
   WHERE f."name" = 'mca_ref' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Document Status: auto from CRF / AD / Insurance date presence ──
  --    7=all three, 6=CRF+Ins, 4=AD+Ins, 3=CRF+AD, 2=CRF only, else 1.
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"statusMap","default":1,"rules":[
       {"when":{"all":[{"field":"crf_received_date","truthy":true},{"field":"ad_date","truthy":true},{"field":"insurance_date","truthy":true}]},"value":7},
       {"when":{"all":[{"field":"crf_received_date","truthy":true},{"field":"insurance_date","truthy":true}]},"value":6},
       {"when":{"all":[{"field":"ad_date","truthy":true},{"field":"insurance_date","truthy":true}]},"value":4},
       {"when":{"all":[{"field":"crf_received_date","truthy":true},{"field":"ad_date","truthy":true}]},"value":3},
       {"when":{"field":"crf_received_date","truthy":true},"value":2}
     ]}'::jsonb
   WHERE f."name" = 'document_status' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
