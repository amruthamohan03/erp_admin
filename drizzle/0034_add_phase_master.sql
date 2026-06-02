CREATE TABLE "phase_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_name" varchar(150) NOT NULL,
	"phase_code" varchar(50) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phase_master_t" ADD CONSTRAINT "phase_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "phase_master_t" ADD CONSTRAINT "phase_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Case-insensitive UNIQUE indexes on both human-meaningful identifier fields.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phase_master_t_phase_name_ci" ON "phase_master_t" (LOWER("phase_name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phase_master_t_phase_code_ci" ON "phase_master_t" (LOWER("phase_code"));
