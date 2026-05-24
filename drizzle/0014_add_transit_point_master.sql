CREATE TABLE "transit_point_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"transit_point_name" varchar(255) NOT NULL,
	"entry_point" boolean DEFAULT true NOT NULL,
	"exit_point" boolean DEFAULT true NOT NULL,
	"loading" boolean DEFAULT true NOT NULL,
	"destination" boolean DEFAULT true NOT NULL,
	"warehouse" boolean DEFAULT false NOT NULL,
	"location" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transit_point_master_t" ADD CONSTRAINT "transit_point_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transit_point_master_t" ADD CONSTRAINT "transit_point_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "transit_point_master_t" ("id", "transit_point_name", "entry_point", "exit_point", "loading", "destination", "warehouse", "location", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'KINSEVERE', false, false, true, false, true, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'KIPOI', false, false, true, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'STL', false, false, true, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'IMPALA', false, false, true, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'KAMBOVE', false, false, true, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'LIKASI', false, false, true, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'MABENDE', false, false, true, true, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'SAKANIA', true, true, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, 'KASUMBALESA', true, true, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'MOKAMBO', true, true, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(11, 'DILOLO', true, true, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(12, 'PWETO', true, false, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(13, 'KINSHASA', true, false, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(14, 'LUANO', true, false, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(15, 'MATADI', true, false, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(16, 'WISKY', false, false, false, false, true, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(17, 'LUBUMBASHI', false, false, false, false, true, true, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(18, 'KOLWEZI', false, false, false, false, true, true, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(19, 'KILWA', true, true, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(20, 'ARU', true, false, false, false, false, false, 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('transit_point_master_t', 'id'), (SELECT MAX(id) FROM "transit_point_master_t"));
