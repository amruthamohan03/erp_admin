// Enable / disable for master screens — the Status column and the save behind
// it, shared so every master's switch behaves and reads the same (§4.10).
//
// It flips the row's `display` flag through the master's own PUT, the same
// flag Delete sets (§4.27): a disabled row is hidden from every dropdown and
// shows in the Recycle Bin, and switching it back on restores it.
import Toggle from '@/components/ui/Toggle';
import type { DataTableColumn } from '@/components/ui/DataTable';
import type { SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { displayLabel } from '@/lib/statusTone';

export interface DisplayRow {
  display: 'Y' | 'N';
}

/**
 * PUTs `{ display }` to `endpoint` and returns the outcome for <ResultDialog>
 * (§4.22). `name` is the record as the operator knows it ("KG").
 */
export async function setDisplay(endpoint: string, active: boolean, name: string): Promise<SaveResult> {
  const res = await safeFetchJson(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display: active ? 'Y' : 'N' }),
  });
  if (!res.ok) {
    return {
      status: 'error',
      title: 'Not saved',
      message: res.message || `"${name}" could not be ${active ? 'enabled' : 'disabled'}.`,
      detail: res.detail,
    };
  }
  return {
    status: 'success',
    title: 'Saved',
    message: active
      ? `"${name}" has been enabled and is available in dropdowns again.`
      : `"${name}" has been disabled and no longer appears in dropdowns.`,
  };
}

/**
 * The Status column: a switch per row. Search and column filters match the
 * word (Active / Disabled), not the Y/N flag (§4.25.1).
 */
export function displayStatusColumn<T extends DisplayRow>({
  nameOf,
  onToggle,
}: {
  nameOf: (row: T) => string;
  onToggle: (row: T, active: boolean) => void;
}): DataTableColumn<T> {
  return {
    key: 'display',
    header: 'Status',
    sortable: true,
    value: (r) => displayLabel(r.display),
    render: (r) => (
      <Toggle
        size="sm"
        checked={r.display === 'Y'}
        onChange={(on) => onToggle(r, on)}
        title={displayLabel(r.display)}
        aria-label={`${r.display === 'Y' ? 'Disable' : 'Enable'} ${nameOf(r)}`}
      />
    ),
  };
}
