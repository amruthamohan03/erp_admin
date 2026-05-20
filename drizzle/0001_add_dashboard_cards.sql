CREATE TABLE "dashboard_card_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_key" varchar(50) NOT NULL,
	"card_content_id" varchar(50) NOT NULL,
	"card_title" varchar(100) NOT NULL,
	"card_subtitle" varchar(100),
	"card_icon" varchar(50) DEFAULT 'bi-card-text',
	"card_color" varchar(30) DEFAULT 'primary',
	"card_url" varchar(255),
	"card_order" integer DEFAULT 0 NOT NULL,
	"card_category" varchar(50) DEFAULT 'general',
	"menu_id" integer,
	"data_source" varchar(255),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_card_master_t_card_key_unique" UNIQUE("card_key")
);
--> statement-breakpoint
CREATE TABLE "role_dashboard_card_mapping_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"menu_id" integer,
	"is_visible" boolean DEFAULT true NOT NULL,
	"card_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_card_master_t" ADD CONSTRAINT "dashboard_card_master_t_menu_id_menu_master_t_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_card_master_t" ADD CONSTRAINT "dashboard_card_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_card_master_t" ADD CONSTRAINT "dashboard_card_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_dashboard_card_mapping_t" ADD CONSTRAINT "role_dashboard_card_mapping_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_dashboard_card_mapping_t" ADD CONSTRAINT "role_dashboard_card_mapping_t_card_id_dashboard_card_master_t_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."dashboard_card_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_dashboard_card_mapping_t" ADD CONSTRAINT "role_dashboard_card_mapping_t_menu_id_menu_master_t_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_dashboard_card_mapping_t" ADD CONSTRAINT "role_dashboard_card_mapping_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_dashboard_card_mapping_t" ADD CONSTRAINT "role_dashboard_card_mapping_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_dashboard_card_mapping_role_card_uq" ON "role_dashboard_card_mapping_t" USING btree ("role_id","card_id");