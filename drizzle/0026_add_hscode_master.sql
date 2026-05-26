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
ALTER TABLE "hscode_master_t" ADD CONSTRAINT "hscode_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hscode_master_t" ADD CONSTRAINT "hscode_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_hscode_display" ON "hscode_master_t" ("display", "hscode_number");
