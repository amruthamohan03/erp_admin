-- Clearing Status → a configurable badge colour per status (§4.38: a configured
-- tone beats the text). Read by the Import and Export Tracking lists.
--
-- Read by its words alone, three statuses all came out green (CLEARING
-- COMPLETED, CLEARED WITH IR, CLEARED WITH ARA) and two blue (IN TRANSIT, IN
-- PROGRESS), so a list could not tell them apart. Each now gets its own hue,
-- editable under Masters → Clearing Status. NULL keeps the word-based colour.
ALTER TABLE "clearing_status_master_t" ADD COLUMN IF NOT EXISTS "tone" varchar(20);
--> statement-breakpoint
-- The statusTone palette (src/lib/statusTone.ts → TONE_KEYS).
ALTER TABLE "clearing_status_master_t" DROP CONSTRAINT IF EXISTS "clearing_status_master_t_tone_check";
--> statement-breakpoint
ALTER TABLE "clearing_status_master_t" ADD CONSTRAINT "clearing_status_master_t_tone_check"
  CHECK ("tone" IS NULL OR "tone" IN ('emerald', 'rose', 'amber', 'sky', 'cyan', 'violet',
                                      'orange', 'blue', 'teal', 'fuchsia', 'indigo', 'slate'));
--> statement-breakpoint
-- Matched by name, and only where nobody has chosen a colour yet. The meaning
-- is kept where it matters: CANCELLED stays red, the completed outcome green.
UPDATE "clearing_status_master_t" s
   SET "tone" = v.tone, "updated_at" = now()
  FROM (VALUES
         ('IN TRANSIT',         'sky'),
         ('IN PROGRESS',        'amber'),
         ('CLEARING COMPLETED', 'emerald'),
         ('CANCELLED',          'rose'),
         ('CLEARED WITH IR',    'teal'),
         ('CLEARED WITH ARA',   'violet')
       ) AS v(name, tone)
 WHERE upper(btrim(s."clearing_status")) = v.name
   AND s."tone" IS NULL;
