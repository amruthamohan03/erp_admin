ALTER TABLE "imports_t" ADD COLUMN "hscode_id" integer;--> statement-breakpoint
ALTER TABLE "imports_t" ADD COLUMN "incoterm_id" integer;--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN "hscode_id" integer;--> statement-breakpoint
ALTER TABLE "exports_t" ADD COLUMN "incoterm_id" integer;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_hscode_id_hscode_master_t_id_fk" FOREIGN KEY ("hscode_id") REFERENCES "public"."hscode_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports_t" ADD CONSTRAINT "imports_t_incoterm_id_incoterm_master_t_id_fk" FOREIGN KEY ("incoterm_id") REFERENCES "public"."incoterm_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_hscode_id_hscode_master_t_id_fk" FOREIGN KEY ("hscode_id") REFERENCES "public"."hscode_master_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports_t" ADD CONSTRAINT "exports_t_incoterm_id_incoterm_master_t_id_fk" FOREIGN KEY ("incoterm_id") REFERENCES "public"."incoterm_master_t"("id") ON DELETE set null ON UPDATE no action;