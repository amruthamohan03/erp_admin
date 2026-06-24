CREATE TABLE "files_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"key" text NOT NULL,
	"mime" varchar(255),
	"size" bigint,
	"sha256" varchar(64),
	"original_name" varchar(500) NOT NULL,
	"uploader_id" integer,
	"entity_type" varchar(100),
	"entity_id" varchar(100),
	"status" varchar(20) DEFAULT 'committed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_t_status_check" CHECK ("files_t"."status" IN ('pending', 'committed', 'quarantined', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "files_t" ADD CONSTRAINT "files_t_uploader_id_users_t_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_files_t_entity" ON "files_t" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_files_t_status" ON "files_t" USING btree ("status");