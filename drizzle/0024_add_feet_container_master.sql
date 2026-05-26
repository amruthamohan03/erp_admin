CREATE TABLE "feet_container_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"feet_container_size" varchar(50) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feet_container_master_t" ADD CONSTRAINT "feet_container_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feet_container_master_t" ADD CONSTRAINT "feet_container_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "feet_container_master_t" ("id", "feet_container_size", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, '20', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, '40', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, '20*2', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, '20*3', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'V RAC', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('feet_container_master_t', 'id'), (SELECT MAX(id) FROM "feet_container_master_t"));
