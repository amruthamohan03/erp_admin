CREATE TABLE "role_menu_mapping_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_add" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_menu_id_menu_master_t_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_menu_mapping_role_menu_uq" ON "role_menu_mapping_t" USING btree ("role_id","menu_id");
