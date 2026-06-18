CREATE TABLE "tracking_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"tracking_number" varchar(100) NOT NULL,
	"license_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"state" varchar(50) NOT NULL,
	"current_milestone_key" varchar(50),
	"milestones_completed_json" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_t_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_license_id_license_t_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."license_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_template_id_tracking_template_master_t_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tracking_template_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_t" ADD CONSTRAINT "tracking_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;