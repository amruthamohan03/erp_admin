CREATE TABLE "province_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_name" varchar(255) NOT NULL,
	"origin_id" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_origin_id_origin_master_t_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."origin_master_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "province_master_t" ADD CONSTRAINT "province_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Wipe any pre-existing rows so the 26-province seed below is the authoritative set.
-- Safe on a fresh CREATE TABLE (no-op); destructive only if the table was populated
-- out-of-band before this migration ran. RESTART IDENTITY resets the serial sequence
-- so the explicit ids in the INSERT below stay consistent with the source dump.
-- Intentionally NO CASCADE: after 0031 wires office_location_master_t.province_id as a
-- FK to this table, a re-apply of 0030 should fail loudly rather than silently wipe
-- referencing office locations.
TRUNCATE TABLE "province_master_t" RESTART IDENTITY;
--> statement-breakpoint
-- Seed: 26 DRC provinces. origin_id=1 mirrors the source schema default.
-- WARNING: in this repo's seeded origin_master_t, id=1 is 'SOUTH AFRICA', not DRC.
-- The user accepted this on 2026-05-25; re-link the rows once a DRC origin row exists.
INSERT INTO "province_master_t" ("id", "province_name", "origin_id", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1,  'Bas-Uélé',       1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2,  'Équateur',       1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3,  'Haut-Katanga',   1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4,  'Haut-Lomami',    1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5,  'Haut-Uélé',      1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6,  'Ituri',          1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7,  'Kasaï',          1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8,  'Kasaï-Central',  1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9,  'Kasaï-Oriental', 1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'Kinshasa',       1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(11, 'Kongo-Central',  1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(12, 'Kwango',         1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(13, 'Kwilu',          1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(14, 'Lomami',         1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(15, 'Lualaba',        1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(16, 'Mai-Ndombe',     1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(17, 'Maniema',        1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(18, 'Mongala',        1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(19, 'Nord-Kivu',      1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(20, 'Nord-Ubangi',    1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(21, 'Sankuru',        1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(22, 'Sud-Kivu',       1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(23, 'Sud-Ubangi',     1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(24, 'Tanganyika',     1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(25, 'Tshopo',         1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(26, 'Tshuapa',        1, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('province_master_t', 'id'), (SELECT MAX(id) FROM "province_master_t"));
