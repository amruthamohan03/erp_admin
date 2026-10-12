import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';

// Delay Tracker — what "late" means, as configuration (§4.1).
//
// A rule says: the process starts at THIS date, must finish at THAT one, and
// has this many days to do it in. Its stages are the sub-periods inside that
// span, each with its own allowance. Both were hardcoded as `STAGE_DEFS` in
// `lib/imkpi/stages.ts` and `lib/exkpi/stages.ts`, which meant renegotiating a
// target with the customs office was a deploy; they are rows now, and the KPI
// screens read them from here so there is one definition, not two.
//
// `transport_letter` is what lets one module have more than one rule: a road
// consignment finishes at Dispatch/Deliver, an air one at Dispatch from
// Airport, and that is the same process with a different finish line rather
// than a second process. A file takes the rule matching its transport letter,
// falling back to the module's default rule (letter NULL).

/** Whether an allowance is counted in working days or calendar days. */
export const DAY_BASES = ['working', 'calendar'] as const;
export type DayBasis = (typeof DAY_BASES)[number];

/** The modules a delay rule can govern. */
export const DELAY_MODULES = ['import', 'export'] as const;
export type DelayModule = (typeof DELAY_MODULES)[number];

export const delayRuleMaster = pgTable(
  'delay_rule_master_t',
  {
    id: serial('id').primaryKey(),
    /** `import` or `export` — which tracking table the rule reads. */
    module: varchar('module', { length: 10 }).notNull(),
    /** Stable key, e.g. `import_road`. Referenced by notifications. */
    ruleKey: varchar('rule_key', { length: 60 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    /**
     * The transport mode this rule is for, by master letter.
     *
     * NULL is the module's default — the rule a file takes when no rule is
     * configured for its transport mode. Exactly one default per module.
     */
    transportLetter: varchar('transport_letter', { length: 1 }),
    /** The date column the process starts from, e.g. `pre_alert_date`. */
    startField: varchar('start_field', { length: 60 }).notNull(),
    /** The date column that completes it, e.g. `dispatch_deliver_date`. */
    endField: varchar('end_field', { length: 60 }).notNull(),
    /** How many days the whole process is allowed. */
    targetDays: integer('target_days').notNull(),
    /** `working` excludes Sat, Sun and `drc_holidays_t`; `calendar` counts all. */
    dayBasis: varchar('day_basis', { length: 10 }).notNull().default('working'),
    /**
     * Days-remaining marks that raise a notification, e.g. `[5, 3, 1]`.
     *
     * A list rather than one number because a warning a week out and a warning
     * the day before are different messages to the same person, and which ones
     * an operation wants is exactly the kind of thing that changes.
     */
    notifyDaysBefore: jsonb('notify_days_before').$type<number[]>().notNull().default([3, 1]),
    /** Also raise one once the allowance is spent and the file is still open. */
    notifyOverdue: boolean('notify_overdue').notNull().default(true),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex('delay_rule_master_t_key_uq').on(t.ruleKey),
    moduleIdx: index('idx_delay_rule_master_t_module').on(t.module, t.transportLetter),
  }),
);

/**
 * A sub-period inside a rule: one leg with its own allowance.
 *
 * These are the stages the Delay KPI screens already measured. A stage's span
 * need not be contiguous with its neighbours — "DGDA In → Liquidation" and
 * "DRC Entry → Delivered" overlap deliberately, because an operation watches
 * both the handover and the stretch it sits inside.
 */
export const delayRuleStage = pgTable(
  'delay_rule_stage_t',
  {
    id: serial('id').primaryKey(),
    ruleId: integer('rule_id')
      .notNull()
      .references(() => delayRuleMaster.id, { onDelete: 'cascade' }),
    /** Stable key within the rule, e.g. `customs_processing`. */
    stageKey: varchar('stage_key', { length: 60 }).notNull(),
    label: varchar('label', { length: 150 }).notNull(),
    /** Short label, for a column header or a chart tick. */
    shortLabel: varchar('short_label', { length: 40 }).notNull(),
    fromField: varchar('from_field', { length: 60 }).notNull(),
    toField: varchar('to_field', { length: 60 }).notNull(),
    targetDays: integer('target_days').notNull(),
    /** Surfaced first on the tracker — the legs an operation watches closest. */
    priority: boolean('priority').notNull().default(false),
    color: varchar('color', { length: 20 }).notNull().default('#6366f1'),
    icon: varchar('icon', { length: 40 }).notNull().default('clock'),
    sortOrder: integer('sort_order').notNull().default(0),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    ruleKeyIdx: uniqueIndex('delay_rule_stage_t_rule_key_uq').on(t.ruleId, t.stageKey),
    ruleIdx: index('idx_delay_rule_stage_t_rule').on(t.ruleId, t.sortOrder),
  }),
);

/**
 * One notification already sent for one file at one mark.
 *
 * Without this the nightly sweep would re-announce the same "3 days left"
 * every night until the file moved. The row is the record that it has been
 * said, so each mark is announced once.
 */
export const delayNoticeLog = pgTable(
  'delay_notice_log_t',
  {
    id: serial('id').primaryKey(),
    ruleId: integer('rule_id')
      .notNull()
      .references(() => delayRuleMaster.id, { onDelete: 'cascade' }),
    module: varchar('module', { length: 10 }).notNull(),
    /** The tracked file's id in its own table. */
    recordId: integer('record_id').notNull(),
    /** Days remaining when it was raised; `-1` is the overdue notice. */
    daysMark: integer('days_mark').notNull(),
    noticedAt: timestamp('noticed_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    onceIdx: uniqueIndex('delay_notice_log_t_once_uq').on(t.module, t.recordId, t.ruleId, t.daysMark),
  }),
);

export const delayRuleMasterRelations = relations(delayRuleMaster, ({ many }) => ({
  stages: many(delayRuleStage),
}));

export const delayRuleStageRelations = relations(delayRuleStage, ({ one }) => ({
  rule: one(delayRuleMaster, { fields: [delayRuleStage.ruleId], references: [delayRuleMaster.id] }),
}));

export type DelayRuleRow = typeof delayRuleMaster.$inferSelect;
export type DelayRuleInsert = typeof delayRuleMaster.$inferInsert;
export type DelayRuleStageRow = typeof delayRuleStage.$inferSelect;
export type DelayRuleStageInsert = typeof delayRuleStage.$inferInsert;
