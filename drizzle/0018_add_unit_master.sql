CREATE TABLE "unit_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_name" varchar(100) NOT NULL,
	"unit_code" varchar(20),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_master_t" ADD CONSTRAINT "unit_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "unit_master_t" ADD CONSTRAINT "unit_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "unit_master_t" ("id", "unit_name", "unit_code", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'KG', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'MT', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'M3', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'CIF', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'CIF + Duty', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'Per Declaration', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'Per Truck', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'Per Truck/Trailer', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, '1', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'PER TANKER', NULL, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('unit_master_t', 'id'), (SELECT MAX(id) FROM "unit_master_t"));
