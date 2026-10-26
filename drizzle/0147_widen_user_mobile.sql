-- §4.40 — a phone number is stored as + and up to 15 digits (ITU E.164), so a
-- full international mobile is 16 characters, one more than users_t.mobile
-- held. The save was refused by the database rather than by the form, as
-- "One of the values is too long". Widened to 20 to match the client phone
-- columns. Widening keeps every existing value.
ALTER TABLE "users_t" ALTER COLUMN "mobile" TYPE varchar(20);
