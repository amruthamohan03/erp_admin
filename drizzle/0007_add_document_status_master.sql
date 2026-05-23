CREATE TABLE "document_status_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_status" varchar(300) NOT NULL,
	"type" varchar(2) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_status_master_t" ADD CONSTRAINT "document_status_master_t_created_by_users_t_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_status_master_t" ADD CONSTRAINT "document_status_master_t_updated_by_users_t_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users_t"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "document_status_master_t" ("id", "document_status", "type", "display", "created_by", "updated_by", "created_at", "updated_at") VALUES
	(1, 'CRF/AD/INSURANCE TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(2, 'AD/INSURANCE TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(3, 'INSURANCE TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(4, 'CRF TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(5, 'AD TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(6, 'CUSTOMS MANIFEST TO BE GENERATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(7, 'FICHE DE CALCUL TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(8, 'FILE READY TO DECLARE', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(9, 'RESTRICTED SHIPMENT - DGDA AUTHORIZATION TO BE RECEIVED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(10, 'TO BE REGULARIZED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(11, 'CRF/AD TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(12, 'CLEARING COMPLETED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(13, 'CRF/INSURANCE TO BE VALIDATED', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(14, 'AWAITING 2 SEPERATE INVOICE', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(15, 'AWAITING LIQUIDATION', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	(16, 'AWAITING QUITTANCE', 'I', 'Y', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('document_status_master_t', 'id'), (SELECT MAX(id) FROM "document_status_master_t"));
