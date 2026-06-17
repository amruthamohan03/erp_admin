import { sql } from 'drizzle-orm';
import { fieldValidationMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Reusable regex validations admins reference from form_field_master_t.
// Form fields can pull in any of these via:
//
//   "validation_json": { "validationKey": "iso.country_code" }
//
// Patterns favour permissiveness over strict format checks — they catch
// obvious typos without rejecting valid-but-unusual inputs. Customs /
// jurisdiction-specific rules will want tighter regexes; treat these as
// starting points and override per project.

const rows = [
  {
    validationKey: 'iso.country_code',
    name: 'ISO 3166-1 alpha-2 country code',
    description: 'Two uppercase letters (e.g. CD for DRC, FR for France).',
    pattern: '^[A-Z]{2}$',
    errorMessage: 'Must be a 2-letter ISO country code (e.g. CD, FR).',
  },
  {
    validationKey: 'iso.currency_code',
    name: 'ISO 4217 currency code',
    description: 'Three uppercase letters (e.g. USD, EUR, CDF).',
    pattern: '^[A-Z]{3}$',
    errorMessage: 'Must be a 3-letter ISO currency code (e.g. USD, EUR, CDF).',
  },
  {
    validationKey: 'hs.code',
    name: 'Harmonized System (HS) code',
    description:
      'International customs commodity classifier. Typically 6 digits at the heading level, extended to 8 or 10 for tariff lines.',
    pattern: '^\\d{6,10}$',
    errorMessage: 'Must be a 6–10 digit HS code (e.g. 870323).',
  },
  {
    validationKey: 'drc.phone',
    name: 'DRC phone number',
    description:
      'Country code optional (+243 or leading 0), nine digits otherwise. Adjust to local prefixes if needed.',
    pattern: '^(\\+243|0)?\\d{9}$',
    errorMessage:
      'Must be a valid DRC phone number (9 digits, optional +243 or 0 prefix).',
  },
  {
    validationKey: 'drc.tin',
    name: 'DRC Tax Identification Number (TIN)',
    description:
      'Permissive baseline — 10 to 15 alphanumeric characters. Tighten per project.',
    pattern: '^[A-Z0-9]{10,15}$',
    errorMessage: 'Must be a 10–15 character alphanumeric TIN.',
  },
  {
    validationKey: 'email.simple',
    name: 'Email address',
    description:
      'Conservative single-line check — does not enforce RFC 5322. Use Zod\'s email validator at the field type level for stricter checks.',
    pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
    errorMessage: 'Must be a valid email address.',
  },
];

export async function seedFieldValidations(
  db: Database | Transaction,
): Promise<void> {
  await db
    .insert(fieldValidationMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: fieldValidationMaster.validationKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        pattern: sql`excluded.pattern`,
        errorMessage: sql`excluded.error_message`,
        updatedAt: sql`now()`,
      },
    });
}
