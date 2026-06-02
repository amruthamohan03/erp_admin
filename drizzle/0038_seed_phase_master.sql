-- Seed 6 rows into phase_master_t with their source-dump IDs preserved.
-- Note row 327: phase_name = 'Full Duty and Tax', phase_code = '000' — that's
-- intentional in the source data (all other rows have phase_code matching their id).
-- ON CONFLICT (id) DO NOTHING makes this idempotent — existing rows are untouched.

INSERT INTO "phase_master_t" ("id", "phase_name", "phase_code", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(320, 'Under Construction',                            '320', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32'),
	(321, 'Consumables',                                   '321', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32'),
	(322, 'Started the production within the Exo Period',  '322', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32'),
	(325, 'Extension',                                     '325', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32'),
	(326, 'Code Normal',                                   '326', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32'),
	(327, 'Full Duty and Tax',                             '000', 'Y', 1, 1, '2025-10-28 21:26:32', '2025-10-28 21:26:32')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Push the serial sequence past the highest seeded id so future UI inserts don't collide.
SELECT setval(pg_get_serial_sequence('phase_master_t', 'id'), (SELECT MAX(id) FROM "phase_master_t"));
