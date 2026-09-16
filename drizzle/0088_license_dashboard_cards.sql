-- Licences — the summary cards an operator actually needs.
--
-- Config, not code (§4.1): the cards are rows in dashboard_card_master_t, so
-- this is the whole change as far as the list screen is concerned.
--
-- Out: Issued, Approved, Pending, Cancelled.
-- In:  Total, Expired, Expiring, Active, Annulated, Modified, Prorogated.
--
-- Three of the four removed were MISNAMED rather than unwanted, so they are
-- retitled in place and keep their id — a card that is renamed keeps whatever
-- role grants it already had, whereas deleting and re-inserting would silently
-- hide it from every non-admin role until someone remapped it:
--   * Issued    counted ACTIVE-and-in-date  → that is Active
--   * Approved  counted MODIFIED            → Modified
--   * Cancelled counted ANNULATED           → Annulated (the term the rest of
--                                             the screen already uses)
-- Pending counted INACTIVE and has no replacement, so it is hidden, not deleted:
-- §4.27's reasoning applied to config — the row is recoverable and its grants
-- survive if it is ever wanted back.

-- Total — unchanged apart from its position.
UPDATE "dashboard_card_master_t"
   SET "card_order" = 1, "card_color" = 'primary', "updated_at" = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'total';
--> statement-breakpoint

-- Expired. Its data_source pointed at `#expiring_soon_count`, so the card
-- labelled "Expired" had been showing the EXPIRING number — two cards reporting
-- one figure while the other bucket went unreported. Red: a lapsed licence
-- blocks work.
UPDATE "dashboard_card_master_t"
   SET "card_content_id" = 'expired',
       "card_key"        = 'license.expired',
       "card_title"      = 'Expired',
       "card_subtitle"   = 'Past expiry date',
       "card_icon"       = 'CalendarX',
       "card_color"      = 'red',
       "card_order"      = 2,
       "data_source"     = '/api/v1/licenses/stats#expired_count',
       "display"         = 'Y',
       "updated_at"      = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'expired';
--> statement-breakpoint

-- Expiring — orange, the middle of the three traffic-light states.
UPDATE "dashboard_card_master_t"
   SET "card_content_id" = 'expiring',
       "card_key"        = 'license.expiring',
       "card_title"      = 'Expiring',
       "card_subtitle"   = 'Within 30 days',
       "card_icon"       = 'CalendarClock',
       "card_color"      = 'orange',
       "card_order"      = 3,
       "data_source"     = '/api/v1/licenses/stats#expiring_count',
       "display"         = 'Y',
       "updated_at"      = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'expiring_soon';
--> statement-breakpoint

-- Issued → Active. Green.
UPDATE "dashboard_card_master_t"
   SET "card_content_id" = 'active',
       "card_key"        = 'license.active',
       "card_title"      = 'Active',
       "card_subtitle"   = 'In date',
       "card_icon"       = 'CheckCircle2',
       "card_color"      = 'emerald',
       "card_order"      = 4,
       "data_source"     = '/api/v1/licenses/stats#active_count',
       "display"         = 'Y',
       "updated_at"      = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'issued';
--> statement-breakpoint

-- Cancelled → Annulated.
UPDATE "dashboard_card_master_t"
   SET "card_content_id" = 'annulated',
       "card_key"        = 'license.annulated',
       "card_title"      = 'Annulated',
       "card_subtitle"   = 'Cancelled by customs',
       "card_icon"       = 'XCircle',
       "card_color"      = 'slate',
       "card_order"      = 5,
       "data_source"     = '/api/v1/licenses/stats#annulated_count',
       "display"         = 'Y',
       "updated_at"      = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'cancelled';
--> statement-breakpoint

-- Approved → Modified.
UPDATE "dashboard_card_master_t"
   SET "card_content_id" = 'modified',
       "card_key"        = 'license.modified',
       "card_title"      = 'Modified',
       "card_subtitle"   = 'Amended after issue',
       "card_icon"       = 'ShieldCheck',
       "card_color"      = 'violet',
       "card_order"      = 6,
       "data_source"     = '/api/v1/licenses/stats#modified_count',
       "display"         = 'Y',
       "updated_at"      = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'approved';
--> statement-breakpoint

-- Pending had no replacement — hidden rather than deleted, so its role grants
-- survive if it is ever wanted back.
UPDATE "dashboard_card_master_t"
   SET "display" = 'N', "updated_at" = now()
 WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'pending';
--> statement-breakpoint

-- Prorogated is genuinely new — no card counted PROROGATED before, so an
-- extended licence was invisible on this screen.
INSERT INTO "dashboard_card_master_t"
  ("card_key", "card_content_id", "card_title", "card_subtitle", "card_icon",
   "card_color", "card_order", "card_category", "data_source", "display")
SELECT 'license.prorogated', 'prorogated', 'Prorogated', 'Validity extended',
       'CalendarPlus', 'cyan', 7, 'license_dashboard',
       '/api/v1/licenses/stats#prorogated_count', 'Y'
 WHERE NOT EXISTS (
   SELECT 1 FROM "dashboard_card_master_t"
    WHERE "card_category" = 'license_dashboard' AND "card_content_id" = 'prorogated'
 );
--> statement-breakpoint

-- §4.14 — a card nobody is mapped to renders for nobody. Every role that can
-- already see the licence cards gets the new one on the same terms, so it
-- appears for exactly the people who were looking at this screen yesterday
-- rather than for an administrator who remembers to go and grant it.
INSERT INTO "role_dashboard_card_mapping_t" ("role_id", "card_id", "is_visible", "card_order")
SELECT DISTINCT m."role_id", n."id", true, 7
  FROM "role_dashboard_card_mapping_t" m
  JOIN "dashboard_card_master_t" d ON d."id" = m."card_id"
  CROSS JOIN "dashboard_card_master_t" n
 WHERE d."card_category" = 'license_dashboard'
   AND n."card_category" = 'license_dashboard'
   AND n."card_content_id" = 'prorogated'
   AND NOT EXISTS (
     SELECT 1 FROM "role_dashboard_card_mapping_t" x
      WHERE x."role_id" = m."role_id" AND x."card_id" = n."id"
   );
