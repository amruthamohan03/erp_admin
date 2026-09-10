-- 0074 — DRC public holidays for 2027-2030.
--
-- The nine FIXED holidays (same calendar date every year) already seeded for
-- 2024-2026, carried forward four more years so the calendar is populated well
-- ahead of the consignments planned against it. Movable feasts are not included:
-- they are 'variable' by definition, and an operator adds them at
-- /masters/drc-holidays once the DRC announces the dates (§4.1).
--
-- Saturdays and Sundays are deliberately NOT rows here. makeWorkingDays skips
-- weekends before it ever consults the holiday set, and getHolidaySet filters
-- weekend rows back out, so ~104 rows a year would change no delay figure while
-- burying the nine that do. The calendar screen paints them non-working instead.
--
-- The ids are EXPLICIT and match src/db/seed/data/reference-masters.json,
-- because provisioning runs `db:migrate` and THEN `db:seed`, and insertSeedRows
-- is ON CONFLICT (id) DO NOTHING. Letting the sequence pick would give these
-- rows ids 1-36 on a fresh database and the seed's 2024-2026 rows would then
-- collide with them and be silently dropped (§7.2: a fresh DB must reach the
-- same state).
--
-- Guarded on (holiday_date, name_en) as well, rather than by a unique index, so
-- re-applying inserts nothing AND a holiday an operator deliberately removed
-- (display = 'N') is not resurrected — the anti-join sees the soft-deleted row
-- too (§4.27).
INSERT INTO drc_holidays_t (id, holiday_date, name_en, name_fr, holiday_type, display)
SELECT v.id, v.d::date, v.en, v.fr, 'fixed', 'Y'
  FROM (VALUES
    (28, '2027-01-01', 'New Year', 'Jour de l’An'),
    (29, '2027-01-04', 'Martyrs of Independence', 'Journée des Martyrs'),
    (30, '2027-01-16', 'Laurent-Désiré Kabila Day', 'Journée L.-D. Kabila'),
    (31, '2027-01-17', 'Patrice Lumumba Day', 'Héros National Lumumba'),
    (32, '2027-05-01', 'Labour Day', 'Fête du Travail'),
    (33, '2027-05-17', 'Liberation Day', 'Jour de la Libération'),
    (34, '2027-06-30', 'Independence Day', 'Fête de l’Indépendance'),
    (35, '2027-08-01', 'Parents’ Day', 'Fête des Parents'),
    (36, '2027-12-25', 'Christmas', 'Noël'),
    (37, '2028-01-01', 'New Year', 'Jour de l’An'),
    (38, '2028-01-04', 'Martyrs of Independence', 'Journée des Martyrs'),
    (39, '2028-01-16', 'Laurent-Désiré Kabila Day', 'Journée L.-D. Kabila'),
    (40, '2028-01-17', 'Patrice Lumumba Day', 'Héros National Lumumba'),
    (41, '2028-05-01', 'Labour Day', 'Fête du Travail'),
    (42, '2028-05-17', 'Liberation Day', 'Jour de la Libération'),
    (43, '2028-06-30', 'Independence Day', 'Fête de l’Indépendance'),
    (44, '2028-08-01', 'Parents’ Day', 'Fête des Parents'),
    (45, '2028-12-25', 'Christmas', 'Noël'),
    (46, '2029-01-01', 'New Year', 'Jour de l’An'),
    (47, '2029-01-04', 'Martyrs of Independence', 'Journée des Martyrs'),
    (48, '2029-01-16', 'Laurent-Désiré Kabila Day', 'Journée L.-D. Kabila'),
    (49, '2029-01-17', 'Patrice Lumumba Day', 'Héros National Lumumba'),
    (50, '2029-05-01', 'Labour Day', 'Fête du Travail'),
    (51, '2029-05-17', 'Liberation Day', 'Jour de la Libération'),
    (52, '2029-06-30', 'Independence Day', 'Fête de l’Indépendance'),
    (53, '2029-08-01', 'Parents’ Day', 'Fête des Parents'),
    (54, '2029-12-25', 'Christmas', 'Noël'),
    (55, '2030-01-01', 'New Year', 'Jour de l’An'),
    (56, '2030-01-04', 'Martyrs of Independence', 'Journée des Martyrs'),
    (57, '2030-01-16', 'Laurent-Désiré Kabila Day', 'Journée L.-D. Kabila'),
    (58, '2030-01-17', 'Patrice Lumumba Day', 'Héros National Lumumba'),
    (59, '2030-05-01', 'Labour Day', 'Fête du Travail'),
    (60, '2030-05-17', 'Liberation Day', 'Jour de la Libération'),
    (61, '2030-06-30', 'Independence Day', 'Fête de l’Indépendance'),
    (62, '2030-08-01', 'Parents’ Day', 'Fête des Parents'),
    (63, '2030-12-25', 'Christmas', 'Noël')
  ) AS v (id, d, en, fr)
 WHERE NOT EXISTS (
   SELECT 1
     FROM drc_holidays_t h
    WHERE h.holiday_date = v.d::date
      AND h.name_en = v.en
 )
    ON CONFLICT (id) DO NOTHING;

-- Keep the serial ahead of the explicit ids, or the next holiday an operator
-- adds collides with one of them (insertSeedRows does the same, for the same
-- reason).
SELECT setval(
  pg_get_serial_sequence('drc_holidays_t', 'id'),
  GREATEST((SELECT max(id) FROM drc_holidays_t), 1)
);
