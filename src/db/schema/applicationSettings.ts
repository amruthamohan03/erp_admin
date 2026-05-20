import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { usersT } from './users';

// Singleton row pinned at id=1. The check constraint guarantees only one
// settings row can ever exist, so every reader can safely target id=1.
export const applicationSettings = pgTable(
  'application_settings_t',
  {
    id: serial('id').primaryKey(),
    projectName: varchar('project_name', { length: 150 })
      .notNull()
      .default('ERP Admin'),
    appTitle: varchar('app_title', { length: 200 })
      .notNull()
      .default('ERP Admin'),
    tagline: varchar('tagline', { length: 200 }).default('Management Console'),
    logoUrl: varchar('logo_url', { length: 255 }),
    faviconUrl: varchar('favicon_url', { length: 255 }),
    primaryColor: varchar('primary_color', { length: 20 })
      .notNull()
      .default('#2563eb'),
    accentColor: varchar('accent_color', { length: 20 })
      .notNull()
      .default('#2563eb'),
    sidebarBg: varchar('sidebar_bg', { length: 20 })
      .notNull()
      .default('#0f172a'),
    sidebarFg: varchar('sidebar_fg', { length: 20 })
      .notNull()
      .default('#e2e8f0'),
    updatedBy: integer('updated_by').references(() => usersT.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    singleton: check('application_settings_singleton', sql`${t.id} = 1`),
  }),
);

export const applicationSettingsRelations = relations(
  applicationSettings,
  ({ one }) => ({
    updater: one(usersT, {
      fields: [applicationSettings.updatedBy],
      references: [usersT.id],
      relationName: 'application_settings_updated_by',
    }),
  }),
);

export type ApplicationSettingsRow = typeof applicationSettings.$inferSelect;
export type ApplicationSettingsInsert = typeof applicationSettings.$inferInsert;
