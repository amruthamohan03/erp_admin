-- 0141 — Payment Subtype hangs off Payment Method, and gets a master screen.
--
-- 0056 repointed license_t.payment_method_id at payment_method_master_t (CASH,
-- BANK TRANSFER, CHEQUE, LETTER OF CREDIT), but the licence form's Payment
-- Subtype kept the 0047 filter `?payment_type_id=<payment_method_id>` — a
-- method id used as an EXPORT/IMPORT type id. Picking CASH (id 1) offered the
-- EXPORT modality codes; picking CHEQUE (id 3) offered nothing.
--
-- Subtypes now carry their own payment_method_id and the picker filters on it.
-- payment_type_id stays (it records the direction of the DRC modality codes);
-- nothing is dropped. Existing subtypes start with no method — an operator
-- assigns them from Masters → Payment Subtype. Until then a licence with no
-- method picked still lists every subtype, exactly as before.
--
-- Idempotent: every step is guarded, so this is safe to re-run.

ALTER TABLE "payment_subtype_master_t" ADD COLUMN IF NOT EXISTS "payment_method_id" integer;
--> statement-breakpoint
ALTER TABLE "payment_subtype_master_t" DROP CONSTRAINT IF EXISTS "payment_subtype_master_t_payment_method_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_subtype_master_t"
  ADD CONSTRAINT "payment_subtype_master_t_payment_method_id_fk"
  FOREIGN KEY ("payment_method_id") REFERENCES "payment_method_master_t"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_subtype_master_t_method"
  ON "payment_subtype_master_t" USING btree ("payment_method_id");
--> statement-breakpoint

-- The licence's Payment Subtype filters by the method's own column now.
UPDATE "master_page_accordion_field_t" f
   SET "props" = COALESCE(f."props", '{}'::jsonb)
                 || '{"optionsParams": {"payment_method_id": "payment_method_id"}}'::jsonb
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'payment_subtype_id'
   AND COALESCE(f."props" -> 'optionsParams', 'null'::jsonb)
       IS DISTINCT FROM '{"payment_method_id": "payment_method_id"}'::jsonb;
--> statement-breakpoint

-- §4.7 — the menu URL is the permission resource; without a row the screen can
-- be neither reached nor granted. Placed beside Payment Method (71).
INSERT INTO "menu_master_t" ("menu_name", "menu_order", "url", "icon", "menu_level", "menu_id", "display")
SELECT 'Payment Subtype', 71, '/masters/payment-subtypes', 'ti ti-list-details', 1,
       (SELECT "id" FROM "menu_master_t" WHERE lower("menu_name") = 'masters' AND "menu_level" = 0 LIMIT 1),
       'Y'
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/payment-subtypes');
--> statement-breakpoint

-- Whoever administers Payment Methods administers their subtypes: each role's
-- grants on /masters/payment-methods are copied, not invented.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", s."id",
       r."can_view", r."can_add", r."can_edit", r."can_delete", r."can_approve",
       r."can_restore", r."can_permanent_delete", r."can_export", r."can_import", r."can_print",
       r."can_view_audit", r."can_export_audit", r."can_manage_settings"
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" pm ON pm."id" = r."menu_id" AND pm."url" = '/masters/payment-methods'
  JOIN "menu_master_t" s ON s."url" = '/masters/payment-subtypes'
 WHERE NOT EXISTS (
   SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = r."role_id" AND x."menu_id" = s."id"
 );
