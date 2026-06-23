CREATE TABLE "expense_type_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_type_name" varchar(300) NOT NULL,
	"is_import" boolean DEFAULT false NOT NULL,
	"is_export" boolean DEFAULT false NOT NULL,
	"is_local" boolean DEFAULT false NOT NULL,
	"is_advance" boolean DEFAULT false NOT NULL,
	"is_other" boolean DEFAULT false NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hscode_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"hscode_number" varchar(100) NOT NULL,
	"hscode_ddi" numeric(5, 2) DEFAULT '0.00',
	"hscode_ica" numeric(5, 2) DEFAULT '0.00',
	"hscode_dci" numeric(5, 2) DEFAULT '0.00',
	"hscode_dcl" numeric(5, 2) DEFAULT '0.00',
	"hscode_tpi" numeric(5, 2) DEFAULT '0.00',
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_type_master_t" ADD CONSTRAINT "expense_type_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_type_master_t" ADD CONSTRAINT "expense_type_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hscode_master_t" ADD CONSTRAINT "hscode_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hscode_master_t" ADD CONSTRAINT "hscode_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;