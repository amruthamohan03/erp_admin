CREATE TABLE "clearance_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"clearance_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clearance_master_t" ADD CONSTRAINT "clearance_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "clearance_master_t" ADD CONSTRAINT "clearance_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "clearance_master_t" ("id", "clearance_name", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'DECLARATION', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'PRE CLEARING', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'TRANSFER', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('clearance_master_t', 'id'), (SELECT MAX(id) FROM "clearance_master_t"));
