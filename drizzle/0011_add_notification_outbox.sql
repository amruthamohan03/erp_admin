CREATE TABLE "notification_outbox_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" varchar(30) NOT NULL,
	"recipient" text NOT NULL,
	"template" varchar(100) NOT NULL,
	"payload" jsonb,
	"template_key" varchar(100),
	"case_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
