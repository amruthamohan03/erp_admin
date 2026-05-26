CREATE TABLE "incoterm_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"incoterm_short_name" varchar(10) NOT NULL,
	"incoterm_full_name" varchar(250) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incoterm_master_t" ADD CONSTRAINT "incoterm_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incoterm_master_t" ADD CONSTRAINT "incoterm_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Seed: HTML entities (&#039;) from source dump decoded to real apostrophes.
INSERT INTO "incoterm_master_t" ("id", "incoterm_short_name", "incoterm_full_name", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'EXW', 'L''acheteur est libre de venir chercher les marchandises à l''usine du vendeur (EXW = nom de l''usine, de l''entrepôt).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'CPT', 'Le vendeur paie le transport jusqu''au lieu convenu avec l''acheteur (CPT = lieu convenu, généralement villes). CPT est utilisé pour tous les transports.', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'CFR', 'S''applique uniquement par la voie de mer. Le vendeur prend en charge le fret jusqu''au port de déchargement (CFR = port de débarquement).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'FOB', 'Uni uniquement aux transports maritimes. Les risques passent à l''acheteur dès le chargement sur le navire (FOB = nom du port d''embarquement).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'FAS', 'Uniquement pour les transports maritimes. Le vendeur livre jusqu''au quai du port, dédouanement inclus (FAS = port d''embarquement).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'CIF', 'Uniquement pour les transports maritimes. Le vendeur paie le fret et l''assurance (non tous risques) (CIF = port de destination).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'CIP', 'Pour tous les modes de transport. Assurance tous risques, le vendeur paie le transport jusqu''au lieu convenu (CIP = lieu convenu).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'FCA', 'Le vendeur paie la douane et remet la marchandise au transporteur choisi par l''acheteur (FCA = port d''embarquement).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, 'DDP', 'Le vendeur assume tous les risques, coûts et formalités jusqu''à la livraison au destinataire, déchargement inclus (DDP = sur le site).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'DAP', 'Le vendeur livre à un endroit convenu. L''acheteur paie les taxes d''importation (DAP = sur le site).', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('incoterm_master_t', 'id'), (SELECT MAX(id) FROM "incoterm_master_t"));
