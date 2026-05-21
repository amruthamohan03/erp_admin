CREATE TABLE "banklist_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" varchar(200) NOT NULL,
	"bank_code" varchar(20) NOT NULL,
	"for_exchange" varchar(1) DEFAULT 'N' NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kind_master_t" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind_name" varchar(100) NOT NULL,
	"kind_short_name" varchar(20) NOT NULL,
	"display" varchar(1) DEFAULT 'Y' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
