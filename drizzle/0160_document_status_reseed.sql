-- Document Status master: the agreed list of fifteen, at ids 1–15, with
-- 1 (CRF/AD/INSURANCE TO BE VALIDATED) as the default for a new import.
--
-- The table had drifted from its seed differently per database — typos
-- ("…VALIDATED D", "AWAITING LIQUIDATION S"), stray tabs and trailing spaces,
-- hidden duplicates of live rows — so ids cannot be trusted to mean the same
-- status everywhere. Rows are therefore matched BY NAME (case, whitespace and a
-- stray trailing letter ignored), moved to their agreed id, and every file
-- pointing at an old id is re-pointed in the same step. Nothing an import or
-- export holds is lost: a status not on the list keeps its row, moves past 15
-- and is hidden (display = 'N').
--
-- The Import page's Document Status derive (statusMap) names statuses by id, so
-- it is rewritten here against the new ids; see the end of the file.

ALTER TABLE "imports_t" DROP CONSTRAINT IF EXISTS "imports_t_document_status_document_status_master_t_id_fk";
--> statement-breakpoint
ALTER TABLE "exports_t" DROP CONSTRAINT IF EXISTS "exports_t_document_status_document_status_master_t_id_fk";
--> statement-breakpoint
DO $$
DECLARE
  want text[] := ARRAY[
    'CRF/AD/INSURANCE TO BE VALIDATED',
    'AD/INSURANCE TO BE VALIDATED',
    'CRF/AD TO BE VALIDATED',
    'CRF/INSURANCE TO BE VALIDATED',
    'INSURANCE TO BE VALIDATED',
    'CRF TO BE VALIDATED',
    'AD TO BE VALIDATED',
    'FICHE DE CALCUL TO BE VALIDATED',
    'FILE READY TO DECLARE',
    'AWAITING LIQUIDATION',
    'AWAITING QUITTANCE',
    'CLEARING COMPLETED',
    'CUSTOMS MANIFEST TO BE GENERATED',
    'RESTRICTED SHIPMENT - DGDA AUTHORIZATION TO BE RECEIVED',
    'TO BE REGULARIZED'
  ];
  shift constant int := 100000;
  i int;
  keeper int;
  next_id int;
  r record;
BEGIN
  -- Move every existing row (and every reference to it) out of the 1–15 range.
  UPDATE "document_status_master_t" SET "id" = "id" + shift;
  UPDATE "imports_t" SET "document_status" = "document_status" + shift WHERE "document_status" IS NOT NULL;
  UPDATE "exports_t" SET "document_status" = "document_status" + shift WHERE "document_status" IS NOT NULL;

  FOR i IN 1 .. array_length(want, 1) LOOP
    -- The best existing row for this status: a visible one before a hidden one.
    SELECT d."id" INTO keeper
      FROM "document_status_master_t" d
     WHERE d."id" > shift
       AND regexp_replace(upper(btrim(regexp_replace(d."document_status", '\s+', ' ', 'g'))), ' [A-Z]$', '')
         = upper(want[i])
     ORDER BY (d."display" = 'Y') DESC, d."id"
     LIMIT 1;

    IF keeper IS NULL THEN
      INSERT INTO "document_status_master_t" ("id", "document_status", "type", "display")
      VALUES (i, want[i], 'I', 'Y');
    ELSE
      -- Every row naming this status — the keeper and any duplicates — now means id i.
      UPDATE "imports_t" SET "document_status" = i
       WHERE "document_status" IN (
         SELECT d."id" FROM "document_status_master_t" d
          WHERE d."id" > shift
            AND regexp_replace(upper(btrim(regexp_replace(d."document_status", '\s+', ' ', 'g'))), ' [A-Z]$', '') = upper(want[i]));
      UPDATE "exports_t" SET "document_status" = i
       WHERE "document_status" IN (
         SELECT d."id" FROM "document_status_master_t" d
          WHERE d."id" > shift
            AND regexp_replace(upper(btrim(regexp_replace(d."document_status", '\s+', ' ', 'g'))), ' [A-Z]$', '') = upper(want[i]));
      DELETE FROM "document_status_master_t" d
       WHERE d."id" > shift AND d."id" <> keeper
         AND regexp_replace(upper(btrim(regexp_replace(d."document_status", '\s+', ' ', 'g'))), ' [A-Z]$', '') = upper(want[i]);
      UPDATE "document_status_master_t"
         SET "id" = i, "document_status" = want[i], "display" = 'Y', "updated_at" = now()
       WHERE "id" = keeper;
    END IF;
  END LOOP;

  -- Statuses not on the list: kept for the files that hold them, numbered after
  -- the list, hidden from the picker.
  next_id := array_length(want, 1) + 1;
  FOR r IN SELECT "id" FROM "document_status_master_t" WHERE "id" > shift ORDER BY "id" LOOP
    UPDATE "imports_t" SET "document_status" = next_id WHERE "document_status" = r."id";
    UPDATE "exports_t" SET "document_status" = next_id WHERE "document_status" = r."id";
    UPDATE "document_status_master_t"
       SET "id" = next_id, "document_status" = btrim(regexp_replace("document_status", '\s+', ' ', 'g')),
           "display" = 'N', "updated_at" = now()
     WHERE "id" = r."id";
    next_id := next_id + 1;
  END LOOP;

  PERFORM setval(pg_get_serial_sequence('document_status_master_t', 'id'),
                 (SELECT max("id") FROM "document_status_master_t"));
END $$;
--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_document_status_document_status_master_t_id_fk"
  FOREIGN KEY ("document_status") REFERENCES "document_status_master_t"("id");
--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_document_status_document_status_master_t_id_fk"
  FOREIGN KEY ("document_status") REFERENCES "document_status_master_t"("id");
--> statement-breakpoint
-- A new import starts at 1; one saved without a status gets it too.
ALTER TABLE "imports_t" ALTER COLUMN "document_status" SET DEFAULT 1;
--> statement-breakpoint
UPDATE "imports_t" SET "document_status" = 1 WHERE "document_status" IS NULL;
--> statement-breakpoint
-- Import Tracking: the status follows which of the three documents (CRF, AD,
-- insurance) have been received — it names what is still to be validated.
-- Restated against the new ids. The old rules sent "CRF + insurance" to the
-- customs-manifest status and had no rule for AD alone or insurance alone; both
-- are corrected here.
UPDATE "master_page_accordion_field_t" f
   SET "derive" = '{
     "kind": "statusMap",
     "rules": [
       {"when": {"all": [{"field": "crf_received_date", "truthy": true}, {"field": "ad_date", "truthy": true}, {"field": "insurance_date", "truthy": true}]}, "value": 8},
       {"when": {"all": [{"field": "crf_received_date", "truthy": true}, {"field": "insurance_date", "truthy": true}]}, "value": 7},
       {"when": {"all": [{"field": "ad_date", "truthy": true}, {"field": "insurance_date", "truthy": true}]}, "value": 6},
       {"when": {"all": [{"field": "crf_received_date", "truthy": true}, {"field": "ad_date", "truthy": true}]}, "value": 5},
       {"when": {"field": "crf_received_date", "truthy": true}, "value": 2},
       {"when": {"field": "ad_date", "truthy": true}, "value": 4},
       {"when": {"field": "insurance_date", "truthy": true}, "value": 3}
     ],
     "default": 1
   }'::jsonb,
       "updated_at" = now()
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE f."accordion_id" = a."id"
   AND p."slug" = 'import'
   AND f."name" = 'document_status'
   AND f."derive" ->> 'kind' = 'statusMap';
