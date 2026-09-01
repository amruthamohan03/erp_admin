'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatDate, todayIso } from '@/lib/formatDate';
import type { RemarkLine } from '@/db/schema';

// A dated remarks log: many entries, each with its own date and text.
//
// Stored as JSONB on the parent row, the same way the payment request's MCA
// lines are (`mca_data` + the `mca-grid` field type). A child table would need
// its own routes and would sit outside the page's single save transaction
// (§4.17); as a column the whole log is written with everything else.
//
// The column was already documented as "JSON array of remarks (kept as text to
// mirror the source column type)" — this is that intent finally realised.

const MAX_REMARK_LENGTH = 2000;

interface RemarkLogProps {
  value: RemarkLine[];
  onChange: (lines: RemarkLine[]) => void;
  readonly: boolean;
  invalid?: boolean;
  /** Names the control for a screen reader — the visible label sits above it. */
  fieldLabel: string;
}

export default function RemarkLog({
  value,
  onChange,
  readonly,
  invalid,
  fieldLabel,
}: RemarkLogProps) {
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState('');

  const lines = Array.isArray(value) ? value : [];
  const canAdd = text.trim().length > 0 && date.trim().length > 0;

  function add() {
    if (!canAdd) return;
    onChange([...lines, { date, remark: text.trim().slice(0, MAX_REMARK_LENGTH) }]);
    // The date stays put: several remarks recorded in one sitting share it, and
    // retyping it every time is the kind of friction that stops people writing
    // remarks at all.
    setText('');
  }

  function remove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div
      className={`rounded-md border ${invalid ? 'border-destructive' : 'border-input'} bg-background p-2`}
    >
      {lines.length > 0 && (
        <ul className="mb-2 divide-y divide-border">
          {lines.map((line, i) => (
            <li key={`${line.date}-${i}`} className="flex items-start gap-3 py-2">
              {/* §4.19 — day/month/year, never the machine's locale. */}
              <span className="w-24 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                {formatDate(line.date)}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-foreground">
                {line.remark}
              </span>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  title="Remove this remark"
                  aria-label={`Remove the remark dated ${formatDate(line.date)}`}
                  className="ico-delete shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {lines.length === 0 && (
        <p className="mb-2 px-1 py-1 text-sm text-muted-foreground">
          No remarks yet. Add the first one below.
        </p>
      )}

      {!readonly && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <input
            type="date"
            className="input sm:w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={`${fieldLabel} date`}
          />
          <input
            className="input flex-1"
            value={text}
            maxLength={MAX_REMARK_LENGTH}
            placeholder="Type a remark, then press + or Enter"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the remark rather than submitting the whole page —
              // a half-typed note must never trigger the form's single Save.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              add();
            }}
            aria-label={`${fieldLabel} text`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            title="Add this remark"
            aria-label="Add this remark"
            className="btn-create shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
