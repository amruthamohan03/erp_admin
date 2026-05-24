CREATE TABLE "origin_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin_name" varchar(255) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "origin_master_t" ADD CONSTRAINT "origin_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "origin_master_t" ADD CONSTRAINT "origin_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
WITH seed(id, origin_name, created_by) AS (
	VALUES
		(1, 'SOUTH AFRICA', 1),
		(2, 'CHINA', 1),
		(3, 'SINGAPORE', 1),
		(4, 'HONG KONG', 1),
		(5, 'ZAMBIE', 1),
		(6, 'ANGOLA', 19),
		(7, 'TANZANIA, UNITED REPUBLIC OF', 19),
		(8, 'AUSTRALIA', 19),
		(9, 'ZIMBABWE', 19),
		(10, 'FINLAND', 19),
		(11, 'KATANGA', 11),
		(12, 'SWITZERLAND', 11),
		(13, 'NETHERLANDS', 117),
		(14, 'CANADA', 11),
		(15, 'GERMANY', 19),
		(16, 'UNITED KINGDOM', 19),
		(17, 'INDIA', 19),
		(18, 'MALAYSIA', 115),
		(19, 'UAE', 18),
		(20, 'Mauritius', 632),
		(21, 'DENMARK', 19),
		(22, 'GHANA', 19),
		(23, 'BRAZIL', 117),
		(24, 'UNITED ARAB  EMIRATES', 115),
		(25, 'MOZAMBIQUE', 115),
		(26, 'VIET NAM', 115),
		(27, 'INDONESIA', 115),
		(28, 'BELGIUM', 115),
		(29, 'FRANCE', 115),
		(30, 'NAMIBIA', 115),
		(31, 'IRELAND', 115),
		(32, 'ISRAEL', 115)
)
INSERT INTO "origin_master_t" ("id", "origin_name", "created_by", "updated_by", "display", "created_at", "updated_at")
SELECT s.id, s.origin_name, u.id, u.id, 'Y', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM seed s
LEFT JOIN "users_t" u ON u.id = s.created_by;
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('origin_master_t', 'id'), (SELECT MAX(id) FROM "origin_master_t"));
