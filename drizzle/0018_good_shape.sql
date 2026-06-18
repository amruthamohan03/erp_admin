CREATE TABLE "report_definition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50),
	"form_id" integer,
	"columns_json" jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_definition_master_t_report_key_unique" UNIQUE("report_key")
);
--> statement-breakpoint
ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_form_id_form_definition_master_t_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form_definition_master_t"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definition_master_t" ADD CONSTRAINT "report_definition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;