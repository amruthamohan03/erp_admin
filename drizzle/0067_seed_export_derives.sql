-- §4.12 — config-driven DERIVED values for the Export Tracking form (0065).
-- Mirrors the legacy PHP: "from license" autofill (kind/goods/transport/currency/
-- buyer), Liquidation-Paid-By from the client, and MCA-reference auto-generation.
--
-- The `license` and `client` derive sources are reused from imports (they read off
-- licenses_t / clients_t, which both forms share). `export_mca` is a new source in
-- src/lib/pages/deriveSources.ts that sequences against exports_t and applies the
-- kind_id = 2 → "RE" short-code override the legacy controller has.
-- Derived fields render read-only. Scope: export page only. Idempotent.
--
-- NOT covered here (Phase 2 / charges seed 0069): CEEC/CGEA/OCC/LMC/OGEFREM
-- auto-calc and the cumulative license weight/FOB limit checks.

DO $$
DECLARE
  v_page_id INT;
BEGIN
  SELECT id INTO v_page_id FROM "master_page_t" WHERE "slug" = 'export';
  IF v_page_id IS NULL THEN
    RAISE EXCEPTION 'export page not seeded — apply 0065 before 0067';
  END IF;

  -- ── "From license" autofill (trigger: license_id, source: license) ──
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
   WHERE f."name" = 'buyer' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── Liquidation Paid By: from the client (1 → Client, 2 → Malabar) ──
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"fromRelated","trigger":"client_id","source":"client","column":"liquidation_paid_by","valueMap":{"1":"Client","2":"Malabar"}}'::jsonb
   WHERE f."name" = 'liquidation_paid_by' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);

  -- ── MCA reference: client + license short codes + year + sequence (exports_t) ──
  UPDATE "master_page_accordion_field_t" f SET "derive" =
    '{"kind":"template","trigger":"license_id","source":"export_mca","template":"{client_short}-{kind_short}{goods_short}{transport_letter}{year}-{seq}"}'::jsonb
   WHERE f."name" = 'mca_ref' AND f."accordion_id" IN (SELECT id FROM "master_page_accordion_t" WHERE "page_id" = v_page_id);
END $$;
