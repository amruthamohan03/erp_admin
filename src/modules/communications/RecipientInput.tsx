'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Building2, User, X } from 'lucide-react';
import FieldMessages from '@/components/ui/FieldMessages';
import { cn } from '@/lib/utils';
import { checkRecipient, type OutboundChannel } from '@/schemas/outboundMessages';
import type { DirectoryEntry } from '@/db/queries/outboundMessages';

// The To / Cc / Bcc field: chips, with suggestions from the client and user
// address book as the operator types — and any address or number that is not
// in it can simply be typed and committed with Enter, comma or semicolon.
//
// Every entry is checked with the same `checkRecipient` the route uses, the
// moment it is committed, so a typo is caught on the chip rather than on send.

const MAX_SUGGESTIONS = 8;
const SEPARATORS = /[,;\n]+/u;

export default function RecipientInput({
  channel,
  field = 'to',
  values,
  onChange,
  directory,
  placeholder,
  invalid,
  required,
  'aria-label': ariaLabel,
  id,
}: {
  channel: OutboundChannel;
  field?: 'to' | 'cc' | 'bcc';
  values: string[];
  onChange: (values: string[]) => void;
  directory: DirectoryEntry[];
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
  'aria-label'?: string;
  id?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const owner = useMemo(() => {
    const m = new Map<string, DirectoryEntry>();
    for (const d of directory) m.set(d.value.toLowerCase(), d);
    return m;
  }, [directory]);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(values.map((v) => v.toLowerCase()));
    const digits = q.replace(/\D/gu, '');
    return directory
      .filter((d) => !taken.has(d.value.toLowerCase()))
      .filter(
        (d) =>
          d.value.toLowerCase().includes(q) ||
          d.label.toLowerCase().includes(q) ||
          // Phones match on digits, so "812 345" finds "+243812345678".
          (channel === 'whatsapp' && digits.length >= 3 && d.value.replace(/\D/gu, '').includes(digits)),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [text, values, directory, channel]);

  /** Adds each entry that checks out; the first that does not is reported and left in the box. */
  const commit = (raw: string): void => {
    const parts = raw.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    const rejected: string[] = [];
    let firstError: string | null = null;
    for (const part of parts) {
      const r = checkRecipient(channel, part, field);
      if (r.error || !r.value) {
        rejected.push(part);
        firstError ??= r.error ?? null;
        continue;
      }
      if (!next.some((v) => v.toLowerCase() === r.value!.toLowerCase())) next.push(r.value);
    }
    onChange(next);
    setText(rejected.join(', '));
    setError(firstError);
    setCursor(0);
  };

  const pick = (d: DirectoryEntry): void => {
    commit(d.value);
    inputRef.current?.focus();
  };

  return (
    <div className="min-w-0">
      <div
        className={cn(
          'relative flex min-h-[38px] w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          (invalid || error) && 'border-destructive ring-1 ring-destructive/40',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => {
          const who = owner.get(v.toLowerCase());
          return (
            <span
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 py-0.5 pl-2 pr-1 text-xs font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
              title={who ? `${who.label} — ${v}` : v}
            >
              {who && <span className="shrink-0 font-semibold">{who.label}</span>}
              <span className="truncate">{v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((x) => x !== v));
                }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-500/25"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          value={text}
          // Required only while empty — a filled chip list satisfies it, and the
          // native check then drives the shared red highlight (§4.18).
          required={required && values.length === 0}
          aria-label={ariaLabel}
          aria-invalid={invalid || Boolean(error) || undefined}
          role="combobox"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          placeholder={values.length === 0 ? placeholder : ''}
          className="h-7 min-w-[10rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            const v = e.target.value;
            if (SEPARATORS.test(v)) commit(v);
            else {
              setText(v);
              setError(null);
              setCursor(0);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a suggestion lands before the list closes.
          onBlur={() => window.setTimeout(() => {
            setOpen(false);
            if (inputRef.current && document.activeElement !== inputRef.current && inputRef.current.value.trim()) {
              commit(inputRef.current.value);
            }
          }, 150)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (SEPARATORS.test(pasted)) {
              e.preventDefault();
              commit(`${text}${pasted}`);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && suggestions.length) {
              e.preventDefault();
              setCursor((c) => (c + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp' && suggestions.length) {
              e.preventDefault();
              setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || (e.key === 'Tab' && text.trim())) {
              if (!text.trim()) return;
              e.preventDefault();
              if (open && suggestions[cursor]) pick(suggestions[cursor]);
              else commit(text);
            } else if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'Backspace' && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />

        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {suggestions.map((d, i) => (
              <li
                key={`${d.source}-${d.value}`}
                role="option"
                aria-selected={i === cursor}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(d);
                }}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                  i === cursor ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                {d.source === 'client' ? (
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="shrink-0 font-medium text-foreground">{d.label}</span>
                <span className="min-w-0 truncate text-muted-foreground" title={d.value}>{d.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <FieldMessages error={error} />
    </div>
  );
}
