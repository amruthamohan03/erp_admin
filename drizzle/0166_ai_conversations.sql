-- AI Search conversations: each user's chats with the assistant, so a question
-- can be followed up ("and the export side?") and reopened later.
--
-- Turns live in a JSONB column (§4.5) — a conversation is read whole, by its
-- owner only, and a turn is appended in one UPDATE. Deleting a chat sets
-- display = 'N' (§4.27); deleting the user removes their chats with them.
CREATE TABLE IF NOT EXISTS "ai_conversation_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users_t"("id") ON DELETE CASCADE,
  "title" varchar(120) NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "display" varchar(1) DEFAULT 'Y' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_conversation_t_user_recent"
  ON "ai_conversation_t" ("user_id", "updated_at");
