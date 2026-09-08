-- 0068 — an Expired card on the License dashboard, leading the status cards.
--
-- There was no Expired bucket at all: an ACTIVE licence whose expiry date had
-- passed was counted under "Issued" and badged ACTIVE, so a lapsed licence was
-- indistinguishable from a live one on both the cards and the grid.
--
-- EXPIRED is derived, never stored (src/db/queries/licenseFilters.ts) — nobody
-- presses a button when a date passes, and a nightly job would leave the answer
-- wrong for up to a day. So this migration adds the CARD; the predicate behind
-- it is computed on read.
--
-- Placed at order 2: Total is the overall count and stays first, then the most
-- urgent status. Order is per-role config after this (Mapping → Role to
-- Dashboard Card), so moving it is a screen edit, not another migration.
--
-- The whole thing is guarded on the card not already existing, so applying it to
-- a database that got the card from the seed neither duplicates the row nor
-- shifts every other card a second time.
DO $$
DECLARE
  new_card_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dashboard_card_master_t WHERE card_key = 'license.expired') THEN
    RETURN;
  END IF;

  -- Make room at position 2.
  UPDATE dashboard_card_master_t
     SET card_order = card_order + 1, updated_at = now()
   WHERE card_category = 'license_dashboard' AND card_order >= 2;

  INSERT INTO dashboard_card_master_t
    (card_key, card_content_id, card_title, card_subtitle, card_icon, card_color,
     card_url, card_order, card_category, data_source, display)
  SELECT 'license.expired', 'expired', 'Expired', 'Past expiry date',
         -- lucide name, validated against the bundled set (§4.26).
         'CalendarX',
         -- Red: a lapsed licence blocks work, and red is what this app already
         -- uses for "this needs attention now".
         'rose',
         d.card_url, 2, 'license_dashboard', d.data_source, 'Y'
    FROM dashboard_card_master_t d
   WHERE d.card_key = 'license.expiring_soon'
  RETURNING id INTO new_card_id;

  -- Visible to exactly the roles that already see the licence cards. A new card
  -- with no mapping renders for nobody, which would look identical to this
  -- migration not having run.
  UPDATE role_dashboard_card_mapping_t m
     SET card_order = m.card_order + 1, updated_at = now()
    FROM dashboard_card_master_t d
   WHERE d.id = m.card_id
     AND d.card_category = 'license_dashboard'
     AND m.card_order >= 2;

  INSERT INTO role_dashboard_card_mapping_t (role_id, card_id, menu_id, is_visible, card_order)
  SELECT DISTINCT m.role_id, new_card_id, m.menu_id, true, 2
    FROM role_dashboard_card_mapping_t m
    JOIN dashboard_card_master_t d ON d.id = m.card_id
   WHERE d.card_key = 'license.expiring_soon';
END $$;
