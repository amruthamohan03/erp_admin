CREATE TABLE "done_by_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"done_by_name" varchar(50) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "done_by_t_done_by_name_unique" UNIQUE("done_by_name")
);
--> statement-breakpoint
INSERT INTO "done_by_t" ("id", "done_by_name", "display", "created_at", "updated_at") VALUES
	(1, 'Client', 'Y', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'Malabar', 'Y', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('done_by_t', 'id'), (SELECT MAX(id) FROM "done_by_t"));
