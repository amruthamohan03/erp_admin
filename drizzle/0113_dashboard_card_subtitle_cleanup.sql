-- The "Active Clients" dashboard card was seeded with the subtitle "display=Y" —
-- the SQL filter behind the count, not words an operator should read. Cleared so
-- the card shows its title and value only. Guarded on the old text, so a subtitle
-- an operator has since set under Masters → Dashboard Cards is left alone.

UPDATE "dashboard_card_master_t"
SET "card_subtitle" = NULL, "updated_at" = now()
WHERE "card_key" = 'client.active' AND "card_subtitle" = 'display=Y';
