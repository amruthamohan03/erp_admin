CREATE TABLE "client_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"email" varchar(100),
	"phone" varchar(30),
	"address" text,
	"tax_id" varchar(50),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_master_t_client_code_unique" UNIQUE("client_code")
);
--> statement-breakpoint
CREATE TABLE "status_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"status_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"entity_type" varchar(100),
	"color" varchar(30),
	"badge" varchar(50),
	"is_final" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_type_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(50),
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_master_t_type_key_unique" UNIQUE("type_key")
);
--> statement-breakpoint
CREATE TABLE "license_type_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "license_type_master_t_type_code_unique" UNIQUE("type_code")
);
--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_master_t" ADD CONSTRAINT "status_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_master_t" ADD CONSTRAINT "status_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_type_master_t" ADD CONSTRAINT "document_type_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_type_master_t" ADD CONSTRAINT "document_type_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_type_master_t" ADD CONSTRAINT "license_type_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_type_master_t" ADD CONSTRAINT "license_type_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_master_key_entity_uq" ON "status_master_t" USING btree ("status_key","entity_type");