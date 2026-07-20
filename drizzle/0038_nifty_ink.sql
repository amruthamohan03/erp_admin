ALTER TABLE "client_master_t" ADD COLUMN "id_nat_file_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "rccm_file_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "import_export_file_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD COLUMN "attestation_file_id" integer;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_id_nat_file_id_files_t_id_fk" FOREIGN KEY ("id_nat_file_id") REFERENCES "public"."files_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_rccm_file_id_files_t_id_fk" FOREIGN KEY ("rccm_file_id") REFERENCES "public"."files_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_import_export_file_id_files_t_id_fk" FOREIGN KEY ("import_export_file_id") REFERENCES "public"."files_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_master_t" ADD CONSTRAINT "client_master_t_attestation_file_id_files_t_id_fk" FOREIGN KEY ("attestation_file_id") REFERENCES "public"."files_t"("id") ON DELETE set null ON UPDATE no action;