-- 0056 retargeted two columns at new masters but dropped the OLD foreign keys
-- by guessed names. The constraints 0041 actually created carry Drizzle's long
-- generated names, so they survived, and each column ended up with TWO foreign
-- keys to two different tables. A value then had to exist in both:
--
--   license_t.payment_method_id   → payment_method_master_t (intended)
--                                 → payment_type_master_t   (stale: only EXPORT/IMPORT, ids 1–2)
--   client_master_t.office_location_id → main_office_master_t      (intended)
--                                      → office_location_master_t (stale)
--
-- so saving a licence with any Payment Method past id 2 failed with
-- "Payment Method refers to a Payment Type that does not exist".
ALTER TABLE "license_t" DROP CONSTRAINT IF EXISTS "license_t_payment_method_id_payment_type_master_t_id_fk";
--> statement-breakpoint
-- Postgres truncates identifiers to 63 bytes; this is the name 0041 produced.
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_office_location_id_office_location_master_t_id_";
--> statement-breakpoint
ALTER TABLE "client_master_t" DROP CONSTRAINT IF EXISTS "client_master_t_office_location_id_office_location_master_t_id_fk";
