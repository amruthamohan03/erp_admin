-- Table name preserves the source DB's "refferer" misspelling (two f's, one r).
-- See src/db/schema/refererMaster.ts header for rationale.
CREATE TABLE "refferer_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"refferer_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refferer_master_t" ADD CONSTRAINT "refferer_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refferer_master_t" ADD CONSTRAINT "refferer_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_refferer_master_t_refferer_name_ci" ON "refferer_master_t" (LOWER("refferer_name"));
