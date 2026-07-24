// DRC public holidays — excluded (with weekends) from working-day delay
// calculations in the Import Delay KPI (§ tracking). Ported from main's
// `drc_holidays_t`. holiday_type is 'fixed' (same calendar date each year) or
// 'variable' (movable, e.g. religious feasts).
import { pgTable, serial, date, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const drcHolidays = pgTable(
  'drc_holidays_t',
  {
    id: serial('id').primaryKey(),
    holidayDate: date('holiday_date').notNull(),
    nameEn: varchar('name_en', { length: 150 }).notNull(),
    nameFr: varchar('name_fr', { length: 150 }),
    holidayType: varchar('holiday_type', { length: 20 }).notNull().default('fixed'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    dateIdx: index('idx_drc_holidays_t_date').on(t.holidayDate),
  }),
);

export type DrcHolidayRow = typeof drcHolidays.$inferSelect;
export type DrcHolidayInsert = typeof drcHolidays.$inferInsert;
