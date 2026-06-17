CREATE TABLE "feature_toggle_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"toggle_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_toggle_master_t_toggle_key_unique" UNIQUE("toggle_key")
);
--> statement-breakpoint
ALTER TABLE "feature_toggle_master_t" ADD CONSTRAINT "feature_toggle_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_toggle_master_t" ADD CONSTRAINT "feature_toggle_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;