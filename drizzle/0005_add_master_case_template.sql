CREATE TABLE "case_template_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"form_id" integer NOT NULL,
	"workflow_id" integer NOT NULL,
	"target_table" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_template_master_t_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_workflow_id_workflow_master_t_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_template_master_t" ADD CONSTRAINT "case_template_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;