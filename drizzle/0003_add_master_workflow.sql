CREATE TABLE "workflow_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_key" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"entity_type" varchar(100) NOT NULL,
	"initial_state" varchar(100) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_master_t_workflow_key_unique" UNIQUE("workflow_key")
);
--> statement-breakpoint
CREATE TABLE "workflow_transition_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"transition_key" varchar(100) NOT NULL,
	"from_state" varchar(100) NOT NULL,
	"to_state" varchar(100) NOT NULL,
	"rule_id" integer,
	"action_json" jsonb,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_master_t" ADD CONSTRAINT "workflow_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_master_t" ADD CONSTRAINT "workflow_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_workflow_id_workflow_master_t_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_rule_id_rule_master_t_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rule_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transition_master_t" ADD CONSTRAINT "workflow_transition_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;