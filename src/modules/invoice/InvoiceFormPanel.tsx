'use client';

// §2 step 5 — the create/edit form as a collapsible panel ABOVE the list, which
// is where main's importinvoice.php and exportinvoice.php put it: one accordion
// headed "Add New Import Invoice", and the list's Edit action loads the chosen
// invoice into that same panel rather than leaving the page.
//
// TODO(§4.35): the house rule is that a list's create action is a single
// `btn-primary btn-sm` in the DataTable toolbar that NAVIGATES to /new. The
// inline panel was asked for explicitly, to match the legacy screens. The
// /import-invoices/new and /import-invoices/[id] routes still work and still
// render the same form, so bookmarks, the menu and deep links are unaffected —
// the panel is an additional entry point, not a replacement runtime.
//
// The form itself is NOT reimplemented here (§4.10): this is chrome around
// <TransactionalPage embedded>, so the metadata runtime, the derives, the
// single Save (§4.17) and the result dialog (§4.22) are the same ones the route
// uses. The panel only decides when it is open and which record it holds.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FilePlus2, Pencil } from 'lucide-react';
import clsx from 'clsx';
import TransactionalPage from '@/components/transactional/TransactionalPage';

export interface InvoiceFormPanelProps {
  /** master_page slug — 'import-invoices' | 'export-invoices'. */
  slug: string;
  /** What the panel is holding: 'new', or the id of the invoice being edited. */
  entityId: string;
  open: boolean;
  onToggle: () => void;
  /** Saved and acknowledged — the owner closes the panel and reloads the list. */
  onSaved: () => void;
  onCancel: () => void;
  /** Panel heading when creating, e.g. "Add New Import Invoice". */
  createTitle: string;
  editTitle: string;
}

export default function InvoiceFormPanel({
  slug,
  entityId,
  open,
  onToggle,
  onSaved,
  onCancel,
  createTitle,
  editTitle,
}: InvoiceFormPanelProps) {
  const creating = entityId === 'new';
  const ref = useRef<HTMLDivElement>(null);
  // Once opened, the form STAYS mounted and is only hidden when collapsed.
  // Unmounting it would throw away whatever the operator had typed, with no
  // warning and nothing on screen to say it had gone — collapsing a section is
  // a request to get it out of the way, not to discard it. (main's Bootstrap
  // collapse keeps its DOM for the same reason.)
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Editing is started from a row far down the table, so the panel it opens has
  // to come to the operator rather than the other way round.
  useEffect(() => {
    if (open && !creating) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [open, creating, entityId]);

  return (
    <div ref={ref} className="card mb-4 overflow-hidden scroll-mt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={clsx(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          // Open, the header carries the brand gradient — the operator's own
          // palette through --brand-from/--brand-to, not a fixed purple (§4.20).
          open ? 'bg-brand-gradient text-white' : 'bg-muted/60 text-foreground hover:bg-muted',
        )}
      >
        {creating ? <FilePlus2 className="h-5 w-5 shrink-0" /> : <Pencil className="h-5 w-5 shrink-0" />}
        <span className="flex-1 truncate font-semibold">{creating ? createTitle : editTitle}</span>
        <ChevronDown className={clsx('h-5 w-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Not mounted until first opened — the form fetches its page definition
          and the record on mount, and a panel the operator has never touched has
          no business doing either. */}
      {mounted && (
        <div className="border-t border-border p-4" hidden={!open}>
          <TransactionalPage
            // Remount when the panel switches records, so the form reloads
            // instead of showing the previous invoice's values.
            key={entityId}
            slug={slug}
            entityId={entityId}
            embedded
            onSaved={onSaved}
            onCancel={onCancel}
          />
        </div>
      )}
    </div>
  );
}
