CREATE TABLE "tracking_template_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"license_type_id" integer NOT NULL,
	"milestones_json" jsonb NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_template_master_t_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_license_type_id_license_type_master_t_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_type_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_template_master_t" ADD CONSTRAINT "tracking_template_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;