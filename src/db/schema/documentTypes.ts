import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Document type master per root CLAUDE.md §4.1.
//
// Catalogues the kinds of documents that can be attached to a consignment:
// 'bill_of_lading', 'customs_declaration', 'invoice_copy', 'permit', …
// Concrete document rows live elsewhere (a future document_t) and FK back
// here by type_key.
//
// category groups types for filtering UI (`general`, `license`, `invoice`,
// `customs`, etc.). Optional — not all document types belong to a category.

export const documentTypeMaster = pgTable('document_type_master_t', {
  id: serial('id').primaryKey(),
  typeKey: varchar('type_key', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type DocumentTypeMasterRow = typeof documentTypeMaster.$inferSelect;
export type DocumentTypeMasterInsert = typeof documentTypeMaster.$inferInsert;
