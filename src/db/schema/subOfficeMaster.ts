import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Customs declaration office (sub-office under the main office_master_t).
// imports_t / exports_t carry a declaration_office_id FK — the actual
// customs office where the declaration is filed.

export const subOfficeMaster = pgTable('sub_office_master_t', {
  id: serial('id').primaryKey(),
  subOfficeName: varchar('sub_office_name', { length: 255 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type SubOfficeMasterRow = typeof subOfficeMaster.$inferSelect;
export type SubOfficeMasterInsert = typeof subOfficeMaster.$inferInsert;
