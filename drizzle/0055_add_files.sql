-- §4.11 — files registry (S3 object pointer + metadata; never the bytes).
CREATE TABLE IF NOT EXISTS "files_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "bucket" varchar(255) NOT NULL,
  "key" text NOT NULL,
  "mime" varchar(255),
  "size" bigint,
  "sha256" varchar(64),
  "original_name" varchar(500) NOT NULL,
  "uploader_id" integer REFERENCES "users_t"("id"),
  "entity_type" varchar(100),
  "entity_id" varchar(100),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chk_files_t_status" CHECK ("status" IN ('pending','committed','quarantined','deleted'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_t_entity" ON "files_t" ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_t_status" ON "files_t" ("status");
