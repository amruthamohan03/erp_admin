-- Promote office_location_master_t.province_id from a plain integer to a real FK
-- referencing province_master_t.id. The column was added without a constraint in
-- migration 0028 because province_master_t didn't exist yet.
--
-- If any pre-existing rows hold a province_id that is NOT present in province_master_t,
-- this migration will fail. Run the cleanup query below first if needed.

-- Cleanup (commented out — uncomment only if 0028 was applied with non-empty province_id values):
-- UPDATE "office_location_master_t" SET "province_id" = NULL
-- WHERE "province_id" IS NOT NULL
--   AND "province_id" NOT IN (SELECT "id" FROM "province_master_t");

ALTER TABLE "office_location_master_t"
	ADD CONSTRAINT "office_location_master_t_province_id_province_master_t_id_fk"
	FOREIGN KEY ("province_id") REFERENCES "public"."province_master_t"("id") ON DELETE no action ON UPDATE no action;
