-- 0078 — the sidebar calls it what the screen calls it.
--
-- The page has read "Declaration Offices" since it was built (it is the customs
-- declaration desk, not a generic "sub office"), while the menu entry still said
-- "Sub Office" — so the sidebar and the heading it navigates to disagreed.
--
-- The URL is deliberately UNCHANGED. `role_menu_mapping_t` grants permission on
-- the menu URL (§4.7), so renaming /masters/sub-offices would silently revoke
-- every existing grant on this screen. The label is what an operator reads; the
-- URL is an identifier.
UPDATE menu_master_t
   SET menu_name = 'Declaration Office',
       updated_at = now()
 WHERE url = '/masters/sub-offices'
   AND menu_name = 'Sub Office';
