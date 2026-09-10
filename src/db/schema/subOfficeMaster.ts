import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Customs declaration office (sub-office under the main_office_master_t).
// imports_t / exports_t carry a declaration_office_id FK — the actual
// customs office where the declaration is filed.

export const subOfficeMaster = pgTable('sub_office_master_t', {
  id: serial('id').primaryKey(),
  subOfficeName: varchar('sub_office_name', { length: 255 }).notNull(),
  /**
   * The regional office this declaration desk reports to (migration 0077).
   *
   * The FK is real in the database (`sub_office_master_t_main_office_id_fkey`,
   * ON DELETE SET NULL — retiring a region must not delete the desks under it).
   * `.references()` is omitted for the same reason as on `users_t`: both
   * masters point back here through created_by/updated_by, and closing that
   * loop makes TypeScript infer `any` for every table in it (TS7022).
   */
  mainOfficeId: integer('main_office_id'),
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
