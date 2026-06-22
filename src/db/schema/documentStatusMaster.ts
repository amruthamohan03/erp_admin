import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Document status — where a customs declaration's paperwork stands
// ("CRF Received", "DGDA In", "Audited", etc.). imports_t / exports_t
// reference this via document_status. `type` is a 2-char code (I/E/U
// + combinations) limiting which direction the status applies to —
// imports vs exports vs both.

export const documentStatusMaster = pgTable('document_status_master_t', {
  id: serial('id').primaryKey(),
  documentStatus: varchar('document_status', { length: 300 }).notNull(),
  type: varchar('type', { length: 2 }).notNull(),
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

export type DocumentStatusMasterRow = typeof documentStatusMaster.$inferSelect;
export type DocumentStatusMasterInsert = typeof documentStatusMaster.$inferInsert;
