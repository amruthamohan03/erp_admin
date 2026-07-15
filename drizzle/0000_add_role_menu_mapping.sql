CREATE TABLE "role_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_name" varchar(100) NOT NULL,
	"parent_role_id" integer,
	"approval_level" integer,
	"department" integer DEFAULT 0 NOT NULL,
	"management" integer DEFAULT 0 NOT NULL,
	"finance" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer,
	"menu_order" integer DEFAULT 1 NOT NULL,
	"menu_level" integer DEFAULT 0,
	"menu_name" varchar(255) NOT NULL,
	"url" varchar(255) DEFAULT '#',
	"text" varchar(100),
	"icon" varchar(100),
	"badge" varchar(50),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"email" varchar(100) NOT NULL,
	"mobile" varchar(15),
	"full_name" varchar(255) NOT NULL,
	"role_id" integer NOT NULL,
	"location_id" varchar(100),
	"dept_id" varchar(100),
	"profile_image" varchar(255) DEFAULT 'default.jpg',
	"signature_image" varchar(255),
	"bio" text,
	"theme_preference" varchar(20),
	"locale_preference" varchar(10),
	"email_notifications" varchar(1) DEFAULT 'Y',
	"compact_mode" varchar(1) DEFAULT 'N',
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_t_username_unique" UNIQUE("username"),
	CONSTRAINT "users_t_email_unique" UNIQUE("email")
);
--> statement-breakpoint
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
ALTER TABLE "role_master_t" ADD CONSTRAINT "role_master_t_parent_role_id_role_master_t_id_fk" FOREIGN KEY ("parent_role_id") REFERENCES "public"."role_master_t"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_master_t" ADD CONSTRAINT "menu_master_t_menu_id_menu_master_t_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_master_t"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users_t" ADD CONSTRAINT "users_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_role_id_role_master_t_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_menu_id_menu_master_t_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu_master_t"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_mapping_t" ADD CONSTRAINT "role_menu_mapping_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_menu_mapping_role_menu_uq" ON "role_menu_mapping_t" USING btree ("role_id","menu_id");
