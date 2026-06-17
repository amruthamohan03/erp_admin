import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// License type master per root CLAUDE.md §2 step 2.
//
// The two license types the spec calls out are Import (IB) and Export, but
// the table allows new types without a code change — seed rows decide what
// the project actually supports today. Each license_t row will FK here by
// type_code (stable string) to pick its workflow + form definition family
// via case_template_master_t.

export const licenseTypeMaster = pgTable('license_type_master_t', {
  id: serial('id').primaryKey(),
  typeCode: varchar('type_code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type LicenseTypeMasterRow = typeof licenseTypeMaster.$inferSelect;
export type LicenseTypeMasterInsert = typeof licenseTypeMaster.$inferInsert;
