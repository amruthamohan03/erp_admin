CREATE TABLE "form_field_role_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"permission" varchar(10) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_field_role_t_permission_check" CHECK ("form_field_role_t"."permission" IN ('view', 'edit', 'hidden'))
);
--> statement-breakpoint
ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_field_id_form_field_master_t_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."form_field_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_role_t" ADD CONSTRAINT "form_field_role_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_form_field_role_t" ON "form_field_role_t" USING btree ("field_id","role_id");