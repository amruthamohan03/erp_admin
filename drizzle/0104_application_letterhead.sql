-- §4.1 — the company letterhead becomes a setting.
--
-- Generated documents print the company's address and legal numbers in their
-- top-right corner. Until now each builder carried its own hardcoded copy; the
-- Demande de Fonds (payment request print) is the first to read it from here,
-- edited under Settings → Application.
--
-- Filled with main's letterhead once, only where nobody has set one, so the
-- document is complete on the day this ships and an edited value is never
-- overwritten.

ALTER TABLE "application_settings_master_t"
  ADD COLUMN IF NOT EXISTS "letterhead_text" text;
--> statement-breakpoint

UPDATE "application_settings_master_t"
SET "letterhead_text" = E'No. 1068, Avenue Ruwe, Quartier Makutano,\nLubumbashi, DRC\nRCCM: 13-B-1122, ID NAT. 6-9-N91867E\nNIF : A 1309334 L\nVAT Ref # 145/DGI/DGE/INF/BN/TVA/2020\nCapital Social : 45.000.000 FC'
WHERE "letterhead_text" IS NULL;
