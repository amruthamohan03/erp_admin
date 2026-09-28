import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// §4.1 — the standing rule for which tariff lines need an environmental
// clearance (certificat vert), as a list of HS-code PREFIXES.
//
// "Everything under 0301" is one decision an operator makes once. Expressed as
// a flag on each code it has to be remembered again for every line added
// afterwards, which is how a rule silently stops covering what it was written
// to cover. A prefix row covers codes that do not exist yet.
//
// `hscode_master_t.requires_green_certificate` remains, now nullable, as the
// per-code override: NULL follows these rules, true/false states an exception
// explicitly. `greenCertificateFor` in src/lib/hscodes/greenCertificate.ts is
// the one place the two are combined (§4.10).

export const hsGreenPrefixMaster = pgTable('hs_green_prefix_master_t', {
  id: serial('id').primaryKey(),
  // Stored as the operator typed it — `0301` or `03.01` — and compared on
  // digits alone, so the punctuation is presentation rather than data.
  prefix: varchar('prefix', { length: 20 }).notNull(),
  // Why this range is covered. A prefix is four digits with no meaning to
  // anyone who did not add it; the note is what makes the row reviewable a
  // year later.
  note: varchar('note', { length: 255 }),
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

export type HsGreenPrefixRow = typeof hsGreenPrefixMaster.$inferSelect;
export type HsGreenPrefixInsert = typeof hsGreenPrefixMaster.$inferInsert;
