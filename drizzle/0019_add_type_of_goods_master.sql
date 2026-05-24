CREATE TABLE "type_of_goods_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"goods_type" varchar(100) NOT NULL,
	"goods_short_name" varchar(20) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "type_of_goods_master_t" ADD CONSTRAINT "type_of_goods_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "type_of_goods_master_t" ADD CONSTRAINT "type_of_goods_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "type_of_goods_master_t" ("id", "goods_type", "goods_short_name", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'CONSUMABLE', 'CO', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'DIVERS', 'DI', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'FUEL', 'FL', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'EQUIPMENT', 'EQ', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'CUIVRE', 'CU', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'SAMPLES', 'SA', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'COPPER SCRAP', 'CS', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'COBALT', 'HC', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, 'ALLIAGE', 'AL', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'MINERALS', 'MI', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(11, 'ZINC', 'ZN', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('type_of_goods_master_t', 'id'), (SELECT MAX(id) FROM "type_of_goods_master_t"));
