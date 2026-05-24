CREATE TABLE "industry_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"industry_name" varchar(200) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "industry_master_t" ADD CONSTRAINT "industry_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "industry_master_t" ADD CONSTRAINT "industry_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "industry_master_t" ("id", "industry_name", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'MINING', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'NON MINIG', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('industry_master_t', 'id'), (SELECT MAX(id) FROM "industry_master_t"));
