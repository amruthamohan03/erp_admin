// §4.6 — config-driven approval matrix for the Payment Request workflow. Maps
// each approval STAGE to the role(s) allowed to act on it, replacing main's
// hardcoded role-id checks (forbidden by §4.7). A business analyst changes who
// approves what by editing rows here — no code change.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { roleMaster } from './roles';

// The five ordered stages of the chain.
export const PAYMENT_STAGES = ['dept', 'finance', 'management', 'under_process', 'paid'] as const;
export type PaymentStage = (typeof PAYMENT_STAGES)[number];

export const paymentStageRole = pgTable(
  'payment_stage_role_master_t',
  {
    id: serial('id').primaryKey(),
    stage: varchar('stage', { length: 20 }).notNull(),
    roleId: integer('role_id').references(() => roleMaster.id).notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    stageRoleUq: uniqueIndex('uq_payment_stage_role_t').on(t.stage, t.roleId),
  }),
);

export type PaymentStageRoleRow = typeof paymentStageRole.$inferSelect;
export type PaymentStageRoleInsert = typeof paymentStageRole.$inferInsert;
