-- Bulk messages by condition (Communication → Email & WhatsApp): one row per
-- client, with the attachments stored once on the batch's first row. Every
-- other row in the batch points at that row through bulk_parent_id.
ALTER TABLE "outbound_message_t"
  ADD COLUMN IF NOT EXISTS "bulk_parent_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_message_t_bulk_parent_id_fk'
  ) THEN
    ALTER TABLE "outbound_message_t"
      ADD CONSTRAINT "outbound_message_t_bulk_parent_id_fk"
      FOREIGN KEY ("bulk_parent_id") REFERENCES "outbound_message_t"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbound_message_t_bulk_parent"
  ON "outbound_message_t" ("bulk_parent_id")
  WHERE "bulk_parent_id" IS NOT NULL;
