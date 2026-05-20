CREATE TABLE "application_settings_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_name" varchar(150) DEFAULT 'ERP Admin' NOT NULL,
	"app_title" varchar(200) DEFAULT 'ERP Admin' NOT NULL,
	"tagline" varchar(200) DEFAULT 'Management Console',
	"logo_url" varchar(255),
	"favicon_url" varchar(255),
	"primary_color" varchar(20) DEFAULT '#2563eb' NOT NULL,
	"accent_color" varchar(20) DEFAULT '#2563eb' NOT NULL,
	"sidebar_bg" varchar(20) DEFAULT '#0f172a' NOT NULL,
	"sidebar_fg" varchar(20) DEFAULT '#e2e8f0' NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_settings_singleton" CHECK ("application_settings_t"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "application_settings_t" ADD CONSTRAINT "application_settings_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;