-- Live Chat presence: one row per user, stamped by the chat polls while that
-- user's app is open and visible. The contact list shows a green dot for anyone
-- stamped within the last minute. No backfill — nobody is online until their
-- app next checks in.
CREATE TABLE IF NOT EXISTS "chat_presence_t" (
  "user_id" integer PRIMARY KEY NOT NULL REFERENCES "users_t"("id") ON DELETE CASCADE,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
