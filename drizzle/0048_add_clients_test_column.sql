-- §4.12 — backing column for the 'test' select field on the Clients
-- "Verification & Approval" accordion (master_page_accordion_field_t).
-- Stores an industry id (the field's options come from /api/industries).
ALTER TABLE "clients_t" ADD COLUMN "test" integer;
