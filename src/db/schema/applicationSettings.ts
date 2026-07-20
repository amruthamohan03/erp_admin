import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Singleton table holding app-wide branding — project name, colors,
// logo, footer text. Read once on app load and applied by the
// layout (Topbar / Sidebar / theme provider).
//
// Physically a normal table with an auto-increment PK; conceptually
// singleton via convention (id=1 always exists after seed). Storing
// as a table (rather than JSON on disk) means admins can edit
// branding from the /settings/application UI without a deploy.
//
// Adding a new branding knob = add a column here + a field on the
// Zod schema + input on the admin page. The seed default keeps
// existing environments valid — no migration data loss.

export const applicationSettingsMaster = pgTable(
  'application_settings_master_t',
  {
    id: serial('id').primaryKey(),
    projectName: varchar('project_name', { length: 100 }).notNull().default('ERP Admin'),
    appTitle: varchar('app_title', { length: 100 }).notNull().default('ERP Admin'),
    tagline: varchar('tagline', { length: 255 }),
    logoUrl: text('logo_url'),
    faviconUrl: text('favicon_url'),
    primaryColor: varchar('primary_color', { length: 20 }).notNull().default('#2563eb'),
    accentColor: varchar('accent_color', { length: 20 }).notNull().default('#2563eb'),
    sidebarBg: varchar('sidebar_bg', { length: 20 }).notNull().default('#0f172a'),
    sidebarFg: varchar('sidebar_fg', { length: 20 }).notNull().default('#e2e8f0'),
    footerText: text('footer_text'),
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
);

export type ApplicationSettingsRow = typeof applicationSettingsMaster.$inferSelect;
export type ApplicationSettingsInsert = typeof applicationSettingsMaster.$inferInsert;
