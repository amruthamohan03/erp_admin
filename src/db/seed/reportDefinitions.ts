import { eq, sql } from 'drizzle-orm';
import {
  reportDefinitionMaster,
  formDefinitionMaster,
  type ReportDefinitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Report definition seeds per CLAUDE.md §2 step 7. Each row references a
// code-side handler in src/reports/handlers/ by reportKey + an optional
// parameter form (already seeded by seedReportForms).
//
// Ordering: reportForms must run first because columnsJson stays here but
// formId resolves through formKey → id.

interface SeedRow {
  reportKey: string;
  name: string;
  description: string;
  category: string;
  /** Form key to resolve via formDefinitionMaster, or null for parameterless. */
  formKey: string | null;
  columns: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'money' | 'status';
    align?: 'left' | 'right' | 'center';
  }>;
  displayOrder: number;
}

const rows: SeedRow[] = [
  {
    reportKey: 'licenses-by-state',
    name: 'Licenses by state',
    description:
      'Counts of licenses grouped by lifecycle state. Useful for the operations dashboard.',
    category: 'operations',
    formKey: null,
    displayOrder: 10,
    columns: [
      { key: 'state', label: 'State', type: 'status' },
      { key: 'count', label: 'Count', type: 'number', align: 'right' },
    ],
  },
  {
    reportKey: 'tracking-in-progress',
    name: 'Tracking runs in progress',
    description:
      'Tracking runs currently in_progress, optionally filtered by license type.',
    category: 'operations',
    formKey: 'report_tracking_in_progress_params',
    displayOrder: 20,
    columns: [
      { key: 'tracking_number', label: 'Tracking no.', type: 'text' },
      { key: 'license_no', label: 'License', type: 'text' },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'current_milestone', label: 'Current milestone', type: 'text' },
      { key: 'started_at', label: 'Started', type: 'date' },
    ],
  },
  {
    reportKey: 'invoices-outstanding',
    name: 'Invoices outstanding',
    description:
      'Issued invoices with a due date on or before the supplied cut-off. Days_until_due is negative when overdue.',
    category: 'finance',
    formKey: 'report_invoices_outstanding_params',
    displayOrder: 30,
    columns: [
      { key: 'invoice_number', label: 'Invoice no.', type: 'text' },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money', align: 'right' },
      { key: 'currency', label: 'Currency', type: 'text' },
      { key: 'due_date', label: 'Due', type: 'date' },
      { key: 'days_until_due', label: 'Days to due', type: 'number', align: 'right' },
    ],
  },
];

export async function seedReportDefinitions(
  db: Database | Transaction,
): Promise<void> {
  // Resolve formKey → form id once.
  const formKeys = rows
    .map((r) => r.formKey)
    .filter((k): k is string => k != null);
  const formIds = new Map<string, number>();
  if (formKeys.length > 0) {
    const forms = await db
      .select({ id: formDefinitionMaster.id, formKey: formDefinitionMaster.formKey })
      .from(formDefinitionMaster);
    for (const f of forms) formIds.set(f.formKey, f.id);
  }

  const values: ReportDefinitionMasterInsert[] = rows.map((r) => {
    let formId: number | null = null;
    if (r.formKey) {
      const resolved = formIds.get(r.formKey);
      if (!resolved) {
        throw new Error(
          `seedReportDefinitions: form '${r.formKey}' missing — run seedReportForms first`,
        );
      }
      formId = resolved;
    }
    return {
      reportKey: r.reportKey,
      name: r.name,
      description: r.description,
      category: r.category,
      formId,
      columnsJson: r.columns,
      displayOrder: r.displayOrder,
    };
  });

  await db
    .insert(reportDefinitionMaster)
    .values(values)
    .onConflictDoUpdate({
      target: reportDefinitionMaster.reportKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        category: sql`excluded.category`,
        formId: sql`excluded.form_id`,
        columnsJson: sql`excluded.columns_json`,
        displayOrder: sql`excluded.display_order`,
        updatedAt: sql`now()`,
      },
    });
}
