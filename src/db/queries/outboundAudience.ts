import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { clientMaster, exportT, importT } from '@/db/schema';
import type { AuthPayload } from '@/lib/auth';
import { clientScopeFor } from '@/lib/auth/clientScope';
import { ValidationError } from '@/lib/errors';
import { kindUseForOrMissing } from './kindScope';
import { importFilterCondition } from './importFilters';
import { exportFilterCondition } from './exportFilters';
import { IMPORT_STAGES } from './importDashboard';
import { EXPORT_STAGES } from './exportDashboard';
import { getDelayTracker } from './delayTracker';
import {
  AUDIENCE_MODULE_LABEL,
  type Audience,
  type AudienceModule,
  type ClientContacts,
} from '@/schemas/outboundMessages';

// Communication → Email & WhatsApp, bulk by condition: which clients own
// tracking files in a given state. Every condition is the one the tracking
// screens already use — the pending stages are the dashboard cards' own
// predicates (importFilterCondition / exportFilterCondition), the delay is the
// KPI delay tracker — so "CRF Missing" here means exactly the files the CRF
// Missing card counts (§4.10).

/** One column per role, so both modules go through one query. */
interface Side {
  table: PgTable;
  id: AnyPgColumn;
  clientId: AnyPgColumn;
  display: AnyPgColumn;
  kind: AnyPgColumn;
  mcaRef: AnyPgColumn;
  clearingStatus: AnyPgColumn;
  documentStatus: AnyPgColumn;
  cancellationReasonId: AnyPgColumn;
  invExportDisabled: AnyPgColumn;
  preAlertDate: AnyPgColumn | null;
  stageCondition: (key: string) => SQL | null;
  stages: ReadonlyArray<{ key: string; label: string }>;
}

const SIDES: Record<AudienceModule, Side> = {
  import: {
    table: importT,
    id: importT.id,
    clientId: importT.clientId,
    display: importT.display,
    kind: importT.kind,
    mcaRef: importT.mcaRef,
    clearingStatus: importT.clearingStatus,
    documentStatus: importT.documentStatus,
    cancellationReasonId: importT.cancellationReasonId,
    invExportDisabled: importT.invExportDisabled,
    preAlertDate: importT.preAlertDate,
    stageCondition: importFilterCondition,
    stages: IMPORT_STAGES,
  },
  export: {
    table: exportT,
    id: exportT.id,
    clientId: exportT.clientId,
    display: exportT.display,
    kind: exportT.kind,
    mcaRef: exportT.mcaRef,
    clearingStatus: exportT.clearingStatus,
    documentStatus: exportT.documentStatus,
    cancellationReasonId: exportT.cancellationReasonId,
    invExportDisabled: exportT.invExportDisabled,
    // Export files carry no pre-alert; the schema refuses the condition.
    preAlertDate: null,
    stageCondition: exportFilterCondition,
    stages: EXPORT_STAGES,
  },
};

/** The pending stages each module offers as a condition, labelled as on its dashboard. */
export function audienceStageOptions(): Record<AudienceModule, Array<{ key: string; label: string }>> {
  return {
    import: SIDES.import.stages.map((s) => ({ key: s.key, label: s.label })),
    export: SIDES.export.stages.map((s) => ({ key: s.key, label: s.label })),
  };
}

export interface AudienceClient extends ClientContacts {
  client_id: number;
  short_name: string;
  company_name: string;
  /** How many of the client's files meet the conditions. */
  file_count: number;
  /** A few of those files' references, newest first — what the operator recognises. */
  refs: string[];
}

const SAMPLE_REFS = 5;

export async function resolveAudience(session: AuthPayload, a: Audience): Promise<AudienceClient[]> {
  const side = SIDES[a.module];

  const unknown = a.stages.filter((k) => !side.stageCondition(k));
  if (unknown.length) {
    throw new ValidationError(
      `Pending stage "${unknown[0]}" is not a stage of ${AUDIENCE_MODULE_LABEL[a.module]} — pick one from the list.`,
      { fields: { stages: [`Unknown stage "${unknown[0]}".`] } },
    );
  }

  const conds: SQL[] = [
    eq(side.display, 'Y'),
    isNotNull(side.clientId),
    // The same scopes the tracking list applies (§4.7), so a message can only
    // be sent about files the sender could have opened.
    await clientScopeFor(session, side.clientId),
    kindUseForOrMissing(side.kind, a.module),
  ];
  if (a.client_ids.length) conds.push(inArray(side.clientId, a.client_ids));
  if (a.clearing_status_ids.length) conds.push(inArray(side.clearingStatus, a.clearing_status_ids));
  if (a.document_status_ids.length) conds.push(inArray(side.documentStatus, a.document_status_ids));
  if (a.cancellation_reason_ids.length) conds.push(inArray(side.cancellationReasonId, a.cancellation_reason_ids));
  if (a.invoicing_hold) conds.push(eq(side.invExportDisabled, true));

  // Any of the picked stages — a client waiting on CRF or on AD.
  if (a.stages.length) {
    const preds = a.stages.map((k) => side.stageCondition(k)).filter((p): p is SQL => p !== null);
    conds.push(sql`(${sql.join(preds, sql` OR `)})`);
  }

  if (side.preAlertDate) {
    if (a.pre_alert === 'missing') conds.push(isNull(side.preAlertDate));
    if (a.pre_alert === 'received') conds.push(isNotNull(side.preAlertDate));
    if (a.pre_alert_from) conds.push(gte(side.preAlertDate, a.pre_alert_from));
    if (a.pre_alert_to) conds.push(lte(side.preAlertDate, a.pre_alert_to));
  }

  // The delay is worked out in code against the working-day calendar, not in
  // SQL — so take the files the tracker flags and narrow to those.
  if (a.delay.length) {
    const tracker = await getDelayTracker({ module: a.module });
    const ids = tracker.rows.filter((r) => (a.delay as string[]).includes(r.delay.status)).map((r) => r.id);
    if (ids.length === 0) return [];
    conds.push(inArray(side.id, ids));
  }

  const rows = await db
    .select({
      client_id: clientMaster.id,
      short_name: clientMaster.shortName,
      company_name: clientMaster.companyName,
      email: clientMaster.email,
      email_secondary: clientMaster.emailSecondary,
      payment_email: clientMaster.paymentContactEmail,
      phone: clientMaster.phone,
      phone_secondary: clientMaster.phoneSecondary,
      payment_phone: clientMaster.paymentContactPhone,
      file_count: sql<number>`count(*)::int`,
      refs: sql<string[]>`coalesce(
        (array_agg(${side.mcaRef} ORDER BY ${side.id} DESC)
          FILTER (WHERE ${side.mcaRef} IS NOT NULL AND ${side.mcaRef} <> ''))[1:${sql.raw(String(SAMPLE_REFS))}],
        '{}'::text[])`,
    })
    .from(side.table)
    .innerJoin(clientMaster, eq(clientMaster.id, side.clientId))
    // A disabled client is not written to, whatever its files say.
    .where(and(...conds, eq(clientMaster.display, 'Y')))
    .groupBy(clientMaster.id)
    .orderBy(asc(clientMaster.id));

  return rows.map((r) => ({ ...r, file_count: Number(r.file_count), refs: r.refs ?? [] }));
}
