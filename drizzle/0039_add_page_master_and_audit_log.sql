-- §4.12 page master tables + §4.10 audit log.
-- All tables created in a single migration so the FK chain comes up atomically.
-- Table names all end with `_t` per CLAUDE.md §6.

-- 1) master_page_t -------------------------------------------------------
CREATE TABLE "master_page_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"route" varchar(200) NOT NULL,
	"target_table" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_page_t_display_check" CHECK ("display" IN ('Y', 'N'))
);
--> statement-breakpoint
ALTER TABLE "master_page_t" ADD CONSTRAINT "master_page_t_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_t" ADD CONSTRAINT "master_page_t_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_master_page_t_slug" ON "master_page_t" ("slug");
--> statement-breakpoint

-- 2) master_page_accordion_t ---------------------------------------------
CREATE TABLE "master_page_accordion_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"icon" varchar(100),
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_page_accordion_t_display_check" CHECK ("display" IN ('Y', 'N'))
);
--> statement-breakpoint
ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."master_page_t"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_t" ADD CONSTRAINT "master_page_accordion_t_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_master_page_accordion_t_page_slug" ON "master_page_accordion_t" ("page_id", "slug");
--> statement-breakpoint

-- 3) master_page_accordion_role_t ----------------------------------------
CREATE TABLE "master_page_accordion_role_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"accordion_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"permission" varchar(10) NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_page_accordion_role_t_permission_check" CHECK ("permission" IN ('view', 'edit'))
);
--> statement-breakpoint
ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_accordion_id_fk" FOREIGN KEY ("accordion_id") REFERENCES "public"."master_page_accordion_t"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_master_t"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_role_t" ADD CONSTRAINT "master_page_accordion_role_t_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_master_page_accordion_role_t" ON "master_page_accordion_role_t" ("accordion_id", "role_id");
--> statement-breakpoint

-- 4) master_page_accordion_field_t ---------------------------------------
CREATE TABLE "master_page_accordion_field_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"accordion_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" varchar(30) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options_source" varchar(100),
	"options_label_field" varchar(100),
	"options_static" jsonb,
	"props" jsonb,
	"display_order" integer DEFAULT 1 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_page_accordion_field_t_field_type_check"
		CHECK ("field_type" IN ('text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox-group', 'file')),
	CONSTRAINT "master_page_accordion_field_t_display_check" CHECK ("display" IN ('Y', 'N'))
);
--> statement-breakpoint
ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_accordion_id_fk" FOREIGN KEY ("accordion_id") REFERENCES "public"."master_page_accordion_t"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "master_page_accordion_field_t" ADD CONSTRAINT "master_page_accordion_field_t_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_master_page_accordion_field_t_acc_name" ON "master_page_accordion_field_t" ("accordion_id", "name");
--> statement-breakpoint

-- 5) audit_log_t (§4.10) -------------------------------------------------
CREATE TABLE "audit_log_t" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" integer,
	"actor_type" varchar(10) DEFAULT 'user' NOT NULL,
	"action" varchar(30) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_t_actor_type_check"
		CHECK ("actor_type" IN ('user', 'system', 'api')),
	CONSTRAINT "audit_log_t_action_check"
		CHECK ("action" IN ('create', 'update', 'delete', 'transition', 'login', 'logout', 'permission_change'))
);
--> statement-breakpoint
ALTER TABLE "audit_log_t" ADD CONSTRAINT "audit_log_t_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_entity" ON "audit_log_t" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_actor" ON "audit_log_t" ("actor_id");
--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_created_at" ON "audit_log_t" ("created_at");
