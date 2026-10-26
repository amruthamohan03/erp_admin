'use client';

import type { PageFieldDef } from '@/types';
import FieldMessages from '@/components/ui/FieldMessages';
import { useFieldCheck } from '@/lib/hooks/useFieldCheck';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

// §4.40 — what appears under a field on a transaction page. One place decides
// it, in this order:
//
//   1. the server's own sentence for this field, after a refused save (red);
//   2. "needs a value" when the save marked it without a sentence (red);
//   3. the live format check — the SAME check the save route runs, so the
//      browser and the server can never word it differently (red);
//   4. warnings — likely typos, unusual values, a repeat of another field on
//      the form, a duplicate already in the database (amber). Never blocking.

/** `props.duplicateCheck` on a field row — config, not code (§4.1). */
interface DuplicateCheck {
  /** A resource of /api/v1/uniqueness, e.g. `client-contacts`. */
  resource: string;
  /** The `?field=` of that resource; defaults to the field's own name. */
  field?: string;
  /** What a conflicting row is called in the warning: "client". */
  noun?: string;
}

function duplicateCheckOf(props: Record<string, unknown> | null): DuplicateCheck | null {
  const raw = props?.['duplicateCheck'];
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.resource !== 'string' || !r.resource) return null;
  return {
    resource: r.resource,
    field: typeof r.field === 'string' ? r.field : undefined,
    noun: typeof r.noun === 'string' ? r.noun : undefined,
  };
}

const str = (props: Record<string, unknown> | null, key: string): string | undefined =>
  typeof props?.[key] === 'string' ? (props[key] as string) : undefined;

export default function FieldHints({
  field,
  value,
  entityId,
  invalid,
  serverMessage,
  extraWarning,
  readonly,
}: {
  field: PageFieldDef;
  value: unknown;
  entityId?: string;
  invalid?: boolean;
  serverMessage?: string;
  /** A form-level warning about this field, e.g. "same as Phone". */
  extraWarning?: string;
  readonly?: boolean;
}) {
  const live = useFieldCheck(field.field_type, field.label, value, {
    maxLength: typeof field.props?.['maxLength'] === 'number' ? (field.props['maxLength'] as number) : undefined,
    pattern: str(field.props, 'pattern'),
    patternMessage: str(field.props, 'patternMessage'),
    // `props.warnUnusual: false` — a field where 0 or a far date is normal.
    warnUnusual: field.props?.['warnUnusual'] !== false,
    disabled: readonly,
  });

  // Duplicate check — asked only for a value that is otherwise valid, in the
  // form it will be stored in, so "+243 812…" and "+243812…" meet. Already
  // debounced by useFieldCheck, so the request fires once typing pauses.
  const dup = duplicateCheckOf(field.props);
  const excludeId = entityId && /^\d+$/u.test(entityId) ? Number(entityId) : null;
  const settled = typeof value === 'string' ? value.trim() : '';
  const unique = useUniqueCheck({
    resource: dup?.resource ?? 'client-contacts',
    field: dup?.field ?? field.name,
    value: dup && !readonly && !live.error ? (live.value ?? settled) : '',
    excludeId,
    debounceMs: 0,
  });

  const error = serverMessage ?? (invalid ? `${field.label} needs a value.` : live.error);

  const warnings = [...live.warnings];
  if (extraWarning) warnings.push(extraWarning);
  if (dup && unique.status === 'taken') {
    warnings.push(
      `Another ${dup.noun ?? 'record'}${unique.conflictLabel ? ` (${unique.conflictLabel})` : ''} already uses this ${field.label.toLowerCase()} — check it is not entered twice.`,
    );
  }

  return <FieldMessages error={error} warnings={warnings} />;
}
