// Public surface for the audit module. See src/lib/audit/recordAudit.ts for
// the entry point + invariants (transaction-scoped, append-only).

export { recordAudit } from './recordAudit';
export type {
  RecordAuditArgs,
  AuditAction,
  AuditActorType,
} from './recordAudit';
export { redact } from './redact';
