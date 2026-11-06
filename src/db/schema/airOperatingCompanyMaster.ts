import { sql } from 'drizzle-orm';
import { pgTable, serial, varchar, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Air Operating Company catalogue — the companies that operate an air shipment
// on the Import Tracking form (Logistics & Transport → Operating Company).
//
// The form stores the chosen NAME in imports_t.operating_company, varchar(50),
// not this row's id, so the name is capped at the same 50 characters: a longer
// one could be picked but never saved onto a file.
export const airOperatingCompanyMaster = pgTable(
  'air_operating_company_master_t',
  {
    id: serial('id').primaryKey(),
    airOperatingCompanyName: varchar('air_operating_company_name', { length: 50 }).notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // One row per name, whatever its case — the dropdown would otherwise offer
    // "EMIRATES" and "Emirates" as two different operators.
    nameUnique: uniqueIndex('uq_air_operating_company_master_t_name').on(sql`upper(${t.airOperatingCompanyName})`),
  }),
);

export type AirOperatingCompanyMasterRow = typeof airOperatingCompanyMaster.$inferSelect;
export type AirOperatingCompanyMasterInsert = typeof airOperatingCompanyMaster.$inferInsert;
