-- Seed 10 client rows into clients_t with source-dump IDs preserved.
-- Transformations applied to the source data:
--   * HTML entities decoded: `&amp;` → `&`, `&quot;` → `"`. Row 9's address is
--     double-encoded (`&amp;amp;quot;`) — decoded fully to `"`.
--   * Empty strings `''` in nullable columns coerced to NULL. This is critical
--     for `approval_code` (10 rows all `''` would violate uq_clients_t_approval_code_ci
--     from migration 0036), and for `id_nat_number` (6 rows are `''`).
--   * Defensive FK refs for `referred_by_id` (target row 2 in refferer_master_t)
--     and `office_location_id` (target rows 17/18 in office_location_master_t).
--     If the target row doesn't exist, the FK is NULLed and the seed survives.
--     Re-populate via the master UI later if needed.
--   * `updated_at` is NOT NULL in our schema; rows where the source has NULL
--     fall back to the row's `created_at`.
--
-- ON CONFLICT (id) DO NOTHING makes this idempotent — existing rows untouched.

DO $$
DECLARE
  ref_2     INT;
  loc_17    INT;
  loc_18    INT;
BEGIN
  -- Resolve potentially-missing FK targets to id-or-NULL.
  SELECT id INTO ref_2  FROM "refferer_master_t"        WHERE id = 2;
  SELECT id INTO loc_17 FROM "office_location_master_t" WHERE id = 17;
  SELECT id INTO loc_18 FROM "office_location_master_t" WHERE id = 18;

  INSERT INTO "clients_t" (
    "id", "company_name", "short_name", "client_type",
    "group_company_id", "industry_type_id", "referred_by_id", "office_location_id",
    "address",
    "phase_id", "phase_start_date", "phase_end_date",
    "contact_person", "email", "email_secondary", "phone", "phone_secondary",
    "id_nat_number", "id_nat_file", "rccm_number", "rccm_file",
    "import_export_number", "import_export_validity", "import_export_file",
    "attestation_number", "attestation_validity", "attestation_file",
    "nif_number",
    "payment_contact_email", "payment_contact_phone",
    "payment_term", "credit_term",
    "liquidation_paid_by", "license_cleared_by", "license_submit_to_bank",
    "contract_start_date", "contract_validity",
    "approval_code", "invoice_template",
    "verified_by_id", "verified_by_date", "approved_by_id", "approved_by_date",
    "remarks", "display",
    "created_by", "created_at", "updated_by", "updated_at"
  ) VALUES
    (1, 'BEAM MINING & CONSTRUCTION',                 'BEM', 'EI',
     NULL, NULL, ref_2, loc_17,
     '18901, Av Club Nautique, Q/Golf, Commune Lubumbashi, Haut-Katanga, RDC',
     NULL, NULL, NULL,
     NULL, 'yangqing@jchxmc.com', NULL, '00243818015488', '00243818015488',
     '6-910-N46503L', NULL, 'CD-FBH-01-2022-M-06321', NULL,
     '0002/GBX-25/I001167HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A1909740J',
     NULL, NULL,
     'ADVANCE', NULL,
     1, 1, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:00:49'::timestamp, 1, '2025-11-16 09:00:49'::timestamp),

    (2, 'BENEFONE MINING SAS',                        'BNF', 'I',
     NULL, 1, ref_2, loc_17,
     E'"No 7667, Avenue Blu Kilwa\r\nQuartier Golf/Lido\r\nCommune Lubumbashi\r\n"',
     NULL, NULL, NULL,
     NULL, 'liqianqian@cxlithium.com', NULL, '00243824438136', '00243824438136',
     NULL, NULL, 'RCCM/LSH/RCCM/21-B-0127', NULL,
     'PM/0002/GBX-25/I002281 HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A2178791R',
     NULL, NULL,
     'ADVANCE', NULL,
     1, 1, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:18:41'::timestamp, 1, '2025-11-16 09:18:41'::timestamp),

    (3, 'BROTHER MINING',                             'BMS', 'EIL',
     NULL, 1, ref_2, loc_18,
     'KOLWEZI',
     NULL, NULL, NULL,
     NULL, 'export.1@bmsasu.com', 'zola.huang@bmsasu.com', NULL, NULL,
     NULL, NULL, '17-B-595', NULL,
     '0004/EDX-23/I000022LV/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A1716204H',
     NULL, NULL,
     'ADVANCE', NULL,
     2, 2, 2,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:23:39'::timestamp, 1, '2026-01-13 12:24:03'::timestamp),

    (4, 'C C LA SOURCE SARL',                         'CCS', 'I',
     NULL, 1, ref_2, loc_17,
     E'"No 22, Avenue Mama Yemo, \r\nCommune de Likasi, Ville de Likasi, Province de Haut-Katanga\r\nD.R.Congo"',
     NULL, NULL, NULL,
     NULL, 'xiepengyu@yitegroup.cn', 'kpmadamlee@gmail.com', '00243-894-513-283', NULL,
     '05-F4300-N35844T', NULL, '24-B-00047', NULL,
     'PM/0002/FBX-24/I002947 HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A2400968E',
     NULL, NULL,
     'ADVANCE', NULL,
     1, 1, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:29:20'::timestamp, 1, '2025-11-16 09:29:20'::timestamp),

    (5, 'CHENGTUN CONGO RESSOURCES SARL',             'CCR', 'EIL',
     NULL, 1, ref_2, loc_18,
     '158, CHEMIN PUBLIC Q. MUSOMPO C/MANIKA KOLWEZI - LUALABA, DRC',
     NULL, NULL, NULL,
     NULL, 'import.ccr@ctm600711.com', 'beatrice.bai@ccr-commerce.com', '00243855881346', NULL,
     NULL, NULL, 'CD/KLZI/RCCM/17-B-503', NULL,
     'PM/0004/GBX - 25/I000023 L/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A1704478M',
     NULL, NULL,
     'ADVANCE', NULL,
     2, 2, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:34:47'::timestamp, 1, '2026-02-17 15:25:24'::timestamp),

    (6, 'CGM Lishi Mining SARL',                      'CGM', 'I',
     NULL, 1, ref_2, loc_17,
     '75km sur la Route Likasi, Site de Kipoi, Province du Haut-Katanga, RDC',
     NULL, NULL, NULL,
     NULL, 'shggjzm@shdrc.cc', NULL, '00243838604957', NULL,
     NULL, NULL, '14-B-1410', NULL,
     '0002/ABX-19/I000 244 HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A0906803F',
     NULL, NULL,
     'ADVANCE', NULL,
     1, 1, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:40:18'::timestamp, 1, '2025-11-16 09:40:18'::timestamp),

    (7, 'Compass Green Worldwide Sarl',               'CGW', 'I',
     NULL, 2, ref_2, loc_17,
     '103b Avenue AbbÈ Kahozi D. R. Congo. TÈl, + 243813201111   + 243 81 577 0761',
     NULL, NULL, NULL,
     NULL, 'jeandrice@cgworldwide.org', NULL, NULL, NULL,
     '6-83-N91865C', NULL, '14 - B -1979', NULL,
     NULL, NULL, NULL,
     NULL, NULL, NULL,
     'A1301940Z',
     NULL, NULL,
     'ADVANCE', NULL,
     2, 2, 2,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:45:06'::timestamp, 1, '2025-11-16 09:45:06'::timestamp),

    (8, 'STE CHEMIGYL SARL',                          'CHE', 'I',
     NULL, 2, ref_2, NULL,
     '62 Av. Magnetisme, Q/ Golf Meteo, Lubumbashi, Haut Katanga, DRCongo',
     NULL, NULL, NULL,
     NULL, 'milalang@richchemgroup.com', NULL, NULL, NULL,
     NULL, NULL, 'CD/LSH/RCCM/23-B-01486', NULL,
     '0001/EAX-23/I016346K/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A2308080Z',
     NULL, NULL,
     'ADVANCE', NULL,
     2, 2, 2,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:49:06'::timestamp, 1, '2025-11-16 09:49:06'::timestamp),

    (9, 'CMC HUACHIN MABENDE MINING SA',              'HMM', 'E',
     NULL, 1, ref_2, loc_17,
     E'"LUANO CITY ROUTE AEROPORT , Lubumbashi, Katanga, Congo, The Democratic Republic of\r\nthe"',
     NULL, NULL, NULL,
     NULL, 'claire@cnmhk.net', 'caddhy@cnmhk.net', '00243890338328', '00243842775055',
     NULL, NULL, '14-B-1126', NULL,
     '0002/FBX-24/1000347 HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A1217593M',
     NULL, NULL,
     'ADVANCE', NULL,
     1, 1, 1,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 09:55:12'::timestamp, 1, '2026-03-23 12:27:42'::timestamp),

    (10, 'COMPAGNIE MINIERE DE KAMBOVE (CMK) (CTL0094581)', 'CMK', 'EI',
     NULL, 1, ref_2, loc_17,
     'AV.No, LUBUMBASHI, KATANGA, VILLE DE LIKASI, PROVINCE DE HAUT KATANGA, DRC',
     NULL, NULL, NULL,
     NULL, 'wizardcolin@gmail.com', 'joelkatend@gmail.com', '00243853123372', '00243859364376',
     '05-B0500-N53674D', NULL, 'CD/LSHI/RCCM/14-B-1658(N.R.C. : 0439 M)', NULL,
     '0002/CBX - 21/I0000 31 HK/Z', NULL, NULL,
     NULL, NULL, NULL,
     'A 1100211 S',
     NULL, NULL,
     'ADVANCE', NULL,
     2, 2, 2,
     NULL, NULL,
     NULL, 'I',
     NULL, NULL, NULL, NULL,
     NULL, 'Y',
     1, '2025-11-16 10:01:01'::timestamp, 1, '2025-11-16 10:01:01'::timestamp)
  ON CONFLICT ("id") DO NOTHING;

  -- Push the serial sequence past the highest seeded id so future UI inserts
  -- don't collide.
  PERFORM setval(pg_get_serial_sequence('clients_t', 'id'), (SELECT MAX(id) FROM "clients_t"));

  -- Surface a notice if any FK fallback fired so the user knows to populate
  -- the missing master rows later.
  IF ref_2 IS NULL THEN
    RAISE NOTICE 'refferer_master_t has no id=2 — all referred_by_id values set to NULL.';
  END IF;
  IF loc_17 IS NULL THEN
    RAISE NOTICE 'office_location_master_t has no id=17 — affected rows seeded with NULL office_location_id.';
  END IF;
  IF loc_18 IS NULL THEN
    RAISE NOTICE 'office_location_master_t has no id=18 — affected rows seeded with NULL office_location_id.';
  END IF;
END $$;
