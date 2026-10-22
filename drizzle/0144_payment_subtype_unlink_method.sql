-- 0144 — Payment Subtype no longer hangs off Payment Method.
--
-- 0141 nested each subtype under a Payment Method and made the licence form's
-- Payment Subtype list only the subtypes of the method picked. The business
-- does not use that pairing: the two are independent picks on the licence, and
-- the subtype master is a flat list. This undoes the link on both sides.
--
-- Idempotent: every step is guarded, so this is safe to re-run.

-- The licence's Payment Subtype lists every enabled subtype again — no filter
-- on the method picked (0141), nor the older payment_type_id mapping (0047).
UPDATE "master_page_accordion_field_t" f
   SET "props" = f."props" - 'optionsParams'
  FROM "master_page_accordion_t" a, "master_page_t" p
 WHERE f."accordion_id" = a."id" AND a."page_id" = p."id"
   AND p."slug" = 'license' AND f."name" = 'payment_subtype_id'
   AND f."props" ? 'optionsParams';
--> statement-breakpoint

-- Dropping the column takes its FK and index (0141) with it.
ALTER TABLE "payment_subtype_master_t" DROP COLUMN IF EXISTS "payment_method_id";
