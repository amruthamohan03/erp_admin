-- Client → Invoice Bank mapping (§4.1).
--
-- The "Client to Bank" menu has pointed at '#' since the port — seedMenus even
-- says so: `TODO(port): client_bank_mapping_t not on branch`. Nothing in the
-- schema referenced invoice_bank_master_t at all, so an invoice had no way to
-- know which bank's details to print for a client. This is that table.
--
-- Named `client_invoice_bank_mapping_t`, not main's `client_bank_mapping_t`,
-- because this database has TWO bank masters and they are not interchangeable:
--   * banklist_master_t     — the banks quoting exchange rates, and the bank a
--                             licence is filed with (license_t.bank_id);
--   * invoice_bank_master_t — OUR accounts, the ones whose name, account number,
--                             SWIFT and address get printed on an invoice.
-- This maps a client to the second. A name that did not say which would be a
-- coin-flip for the next person joining against it.

CREATE TABLE IF NOT EXISTS "client_invoice_bank_mapping_t" (
  "id"              serial PRIMARY KEY,
  "client_id"       integer NOT NULL REFERENCES "client_master_t"("id") ON DELETE CASCADE,
  "invoice_bank_id" integer NOT NULL REFERENCES "invoice_bank_master_t"("id") ON DELETE RESTRICT,
  -- Which of a client's banks an invoice reaches for when nobody picks. A client
  -- may legitimately be invoiced through several (different currencies, different
  -- entities), so this is many-to-many with one marked rather than a single
  -- column on client_master_t.
  "is_default"      boolean NOT NULL DEFAULT false,
  "display"         varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"      integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"      integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ON DELETE RESTRICT on the bank, CASCADE on the client, and the difference is
-- deliberate: deleting a client should take its mappings with it, but an invoice
-- bank that a client still invoices through must not vanish from under them —
-- §4.37's rule that freeing a resource in use refuses rather than orphans.

-- One row per (client, bank). Partial on display so a removed pairing can be
-- added back (§4.27) — an index over every row would make un-assigning a bank
-- permanent.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_invoice_bank_mapping_t_pair"
  ON "client_invoice_bank_mapping_t" ("client_id", "invoice_bank_id")
  WHERE "display" = 'Y';
--> statement-breakpoint

-- AT MOST ONE default per client, enforced by the database rather than by the
-- save handler remembering to clear the others. "Which bank does this client
-- invoice through by default" must have one answer, and a UI bug or an API-only
-- caller must not be able to create a second.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_invoice_bank_mapping_t_default"
  ON "client_invoice_bank_mapping_t" ("client_id")
  WHERE "is_default" AND "display" = 'Y';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_invoice_bank_mapping_t_client_idx"
  ON "client_invoice_bank_mapping_t" ("client_id");
--> statement-breakpoint

-- The screen the menu has been promising. Updated in place rather than inserted:
-- the row already exists with url '#', and it already carries whatever role
-- grants an administrator has given it over the life of the database.
UPDATE "menu_master_t"
   SET "url" = '/mapping/clienttobank', "updated_at" = now()
 WHERE "menu_name" = 'Client to Bank'
   AND "url" = '#';
--> statement-breakpoint

-- §4.7 — the URL is the permission resource, so changing it from '#' to a real
-- path means any grant that existed still applies (the row is keyed on menu_id,
-- not on the URL). Admin is granted explicitly in case the placeholder never had
-- one, matching what seedMenus gives every other seeded row.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/mapping/clienttobank'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
