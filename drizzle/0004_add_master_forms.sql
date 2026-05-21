CREATE TABLE "form_definition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_definition_master_t_form_key_unique" UNIQUE("form_key")
);
--> statement-breakpoint
CREATE TABLE "form_field_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"field_key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"help_text" text,
	"validation_json" jsonb,
	"options_json" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_definition_master_t" ADD CONSTRAINT "form_definition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definition_master_t" ADD CONSTRAINT "form_definition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_master_t" ADD CONSTRAINT "form_field_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;