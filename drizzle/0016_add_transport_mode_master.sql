CREATE TABLE "transport_mode_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"transport_mode_name" varchar(100) NOT NULL,
	"transport_letter" varchar(5) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transport_mode_master_t" ADD CONSTRAINT "transport_mode_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transport_mode_master_t" ADD CONSTRAINT "transport_mode_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "transport_mode_master_t" ("id", "transport_mode_name", "transport_letter", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'ROAD', 'R', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'AIR', 'A', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'WAGON', 'W', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'LAKE', 'L', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('transport_mode_master_t', 'id'), (SELECT MAX(id) FROM "transport_mode_master_t"));
