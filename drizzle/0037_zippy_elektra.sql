ALTER TABLE "client_master_t" ADD COLUMN "client_type" varchar(20);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "group_company_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "industry_type_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "referred_by_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "office_location_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "phase_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "phase_start_date" date;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "phase_end_date" date;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "contact_person" varchar(100);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "email_secondary" varchar(100);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "phone_secondary" varchar(30);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "id_nat_number" varchar(50);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "id_nat_file" varchar(255);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "rccm_number" varchar(50);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "rccm_file" varchar(255);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "import_export_number" varchar(50);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "import_export_validity" date;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "import_export_file" varchar(255);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "attestation_number" varchar(50);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "attestation_validity" date;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "attestation_file" varchar(255);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "nif_number" varchar(50);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "payment_contact_email" varchar(100);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "payment_contact_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_group_company_id_group_company_master_t_id_fk" FOREIGN KEY ("group_company_id") REFERENCES "public"."group_company_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_industry_type_id_industry_master_t_id_fk" FOREIGN KEY ("industry_type_id") REFERENCES "public"."industry_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_referred_by_id_referer_master_t_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."referer_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_office_location_id_office_master_t_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_phase_id_phase_master_t_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_master_t_industry" ON "client_master_t" USING btree ("industry_type_id");--> statement-breakpoint
CREATE INDEX "idx_client_master_t_group" ON "client_master_t" USING btree ("group_company_id");--> statement-breakpoint
CREATE INDEX "idx_client_master_t_office" ON "client_master_t" USING btree ("office_location_id");--> statement-breakpoint
CREATE INDEX "idx_client_master_t_phase" ON "client_master_t" USING btree ("phase_id");