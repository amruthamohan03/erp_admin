-- Seed role_master_t with the 47-row dump from the source MySQL database.
--
-- Transformations applied to the source data:
--   * `department_id`, `office_location_id`, `level` columns from the source are NOT
--     present in this repo's role_master_t schema and are dropped.
--   * `parent_role_id = 0` in the source meant "no parent". Our schema FKs to
--     role_master_t(id), where id=0 doesn't exist, so all 0s become NULL here.
--   * Row 44 ('Operation Kinshsa') is an exact duplicate of row 43. Both are kept
--     deliberately (the user accepted duplicate role names — see comment in 0032).
--
-- ON CONFLICT (id) DO NOTHING makes this idempotent: existing rows (e.g. an already-
-- present id=1 Super Admin used by the running app) are left untouched. Re-running
-- the migration is safe.

INSERT INTO "role_master_t" ("id", "role_name", "parent_role_id", "approval_level", "department", "management", "finance", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1,  'Super Admin',                  NULL, 1, 1, 1, 1, 'Y', 1, 1, '2025-10-25 12:08:13', '2025-11-13 16:40:52'),
	(3,  'Admin',                        NULL, 2, 1, 1, 0, 'Y', 1, 1, '2025-11-13 16:39:52', '2025-11-26 14:56:38'),
	(4,  'Accounts Manager',             NULL, 3, 0, 0, 1, 'Y', 1, 1, '2025-11-19 15:07:12', '2025-11-19 15:07:12'),
	(5,  'Accounts Officer',             NULL, 4, 0, 0, 1, 'Y', 1, 1, '2025-11-19 15:09:29', '2025-11-19 15:09:29'),
	(6,  'Administrator',                NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 15:13:12', '2025-11-19 15:13:12'),
	(7,  'Fiche De Calcul',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 17:07:41', '2025-11-19 17:07:41'),
	(8,  'License Manager',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 17:08:22', '2025-11-19 17:08:22'),
	(9,  'Tracking Manager',             NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 17:09:00', '2025-11-19 17:09:00'),
	(10, 'Cash Cashier',                 NULL, 0, 0, 0, 1, 'Y', 1, 1, '2025-11-19 17:10:05', '2025-11-19 17:10:05'),
	(11, 'Bank Cashier',                 NULL, 0, 0, 0, 1, 'Y', 1, 1, '2025-11-19 17:10:24', '2025-11-19 17:10:31'),
	(12, 'Border Team',                  NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 17:23:55', '2025-11-19 17:23:55'),
	(13, 'Audit Team',                   NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-19 17:28:26', '2025-11-19 17:28:26'),
	(16, 'Operation Executive',          NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-27 08:55:22', '2025-11-27 08:55:22'),
	(17, 'Group Director',               NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-11-29 14:56:14', '2025-11-29 14:56:14'),
	(18, 'License Team',                 NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-12-18 09:15:57', '2025-12-18 09:15:57'),
	(19, 'Tracking Team',                NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-12-22 07:07:42', '2025-12-22 07:07:42'),
	(20, 'Invoicing',                    NULL, 0, 0, 0, 0, 'Y', 1, 1, '2025-12-29 15:25:53', '2025-12-29 15:25:53'),
	(21, 'Export Team',                  NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-07 08:18:16', '2026-01-07 08:18:16'),
	(22, 'Import Kasumbalesa',           NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-08 09:17:16', '2026-01-08 09:17:16'),
	(23, 'Export Kasumbalesa',           NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-08 09:39:16', '2026-01-08 09:39:16'),
	(24, 'Tracking Sakania',             NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-09 08:03:24', '2026-01-09 08:03:24'),
	(25, 'Import Manager',               NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-09 12:28:34', '2026-01-09 12:28:34'),
	(26, 'Seguce Kasumbelesa',           NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-09 14:34:17', '2026-01-09 14:34:17'),
	(27, 'Manager Klesa',                NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-09 15:45:36', '2026-01-09 15:45:36'),
	(28, 'Tracking Kolwezi',             NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-10 10:35:00', '2026-01-10 11:49:27'),
	(29, 'Export Kolwezi',               NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-10 11:49:46', '2026-01-10 11:49:46'),
	(30, 'Import Kolwezi',               NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-10 11:50:00', '2026-01-10 11:50:00'),
	(31, 'Airport Assistant',            NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-12 07:12:09', '2026-01-12 07:12:09'),
	(32, 'Zambia Team',                  NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-12 12:57:50', '2026-01-12 12:57:50'),
	(33, 'Manager Kolwezi',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-14 08:25:18', '2026-01-14 08:25:18'),
	(34, 'Finance Kolwezi',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-14 08:25:41', '2026-01-14 08:25:41'),
	(35, 'Invoice Kolwezi',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-14 08:37:34', '2026-01-14 08:37:34'),
	(36, 'Ops Kolwezi',                  NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-14 14:58:58', '2026-01-14 14:58:58'),
	(37, 'Audit',                        NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-22 06:41:49', '2026-01-22 06:41:49'),
	(38, 'Account Assistant  Kolwezi',   NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-22 12:06:21', '2026-01-22 12:06:21'),
	(39, 'Finance Head',                 NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-22 12:22:13', '2026-01-22 12:22:13'),
	(40, 'Accounts Assistant Kolwezi',   NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-27 07:31:24', '2026-01-27 07:31:24'),
	(41, 'Cash with invoicing',          NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-01-28 07:43:49', '2026-01-28 07:43:49'),
	(42, 'Tracking Likasi',              NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-02-01 10:09:12', '2026-02-01 10:09:12'),
	(43, 'Operation Kinshsa',            NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-02-06 09:47:34', '2026-02-06 09:47:34'),
	(44, 'Operation Kinshsa',            NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-02-06 09:47:34', '2026-02-06 09:47:34'),
	(45, 'Finance Director',             NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-02-12 06:06:50', '2026-02-12 06:06:50'),
	(46, 'Client',                       NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-02-19 06:34:51', '2026-02-19 06:34:51'),
	(47, 'Finance Approvar',             NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-03-12 10:21:45', '2026-03-12 10:21:45'),
	(48, 'cash/bank cashier',            NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-03-12 10:24:42', '2026-03-12 10:24:42'),
	(49, 'Invoice Payment Viewer',       NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-03-21 06:49:43', '2026-03-21 06:49:43'),
	(50, 'payment kasumbalesa',          NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-04-07 09:13:21', '2026-04-07 09:13:21'),
	(51, 'Fleet Manager',                NULL, 0, 0, 0, 0, 'Y', 1, 1, '2026-04-14 05:50:31', '2026-04-14 05:50:31')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Push the serial sequence past the highest seeded id so future inserts don't collide.
SELECT setval(pg_get_serial_sequence('role_master_t', 'id'), (SELECT MAX(id) FROM "role_master_t"));
