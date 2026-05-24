CREATE TABLE "regime_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"regime_name" varchar(200) NOT NULL,
	"type" varchar(2) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regime_master_t" ADD CONSTRAINT "regime_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regime_master_t" ADD CONSTRAINT "regime_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "regime_master_t" ("id", "regime_name", "type", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(2, 'IM4-00', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'IM4-320', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'IM4-321', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'IM4-322', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'IM4-325', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'IM4-326', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'IM4-328', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, 'IM4-345', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'IM4-4000', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(11, 'IM5', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(12, 'IM6', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(13, 'IM7', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(14, 'EX1', 'E', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(15, 'EX2', 'E', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(16, 'EX3', 'E', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('regime_master_t', 'id'), (SELECT MAX(id) FROM "regime_master_t"));
