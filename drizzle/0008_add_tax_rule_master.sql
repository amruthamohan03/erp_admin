CREATE TABLE "tax_rule_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"jurisdiction" varchar(50),
	"scope" varchar(50),
	"formula" jsonb NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rule_master_t_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
ALTER TABLE "tax_rule_master_t" ADD CONSTRAINT "tax_rule_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_master_t" ADD CONSTRAINT "tax_rule_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;