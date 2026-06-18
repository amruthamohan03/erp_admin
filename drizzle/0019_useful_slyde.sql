CREATE TABLE "audit_log_t" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" integer,
	"actor_type" varchar(10) DEFAULT 'user' NOT NULL,
	"action" varchar(30) NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_t_actor_type_check" CHECK ("audit_log_t"."actor_type" IN ('user', 'system', 'api')),
	CONSTRAINT "audit_log_t_action_check" CHECK ("audit_log_t"."action" IN ('create', 'update', 'delete', 'transition', 'login', 'logout', 'permission_change'))
);
--> statement-breakpoint
ALTER TABLE "audit_log_t" ADD CONSTRAINT "audit_log_t_actor_id_users_t_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users_t"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_entity" ON "audit_log_t" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_actor" ON "audit_log_t" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_t_created_at" ON "audit_log_t" USING btree ("created_at");