'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Eraser,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/messaging/richText';

// A small rich-text editor: a toolbar over a contentEditable area. No editor
// dependency (§12) — the formatting an email body needs is what the browser's
// own editing commands already do, and the output is passed through the shared
// allowlist sanitiser on paste and again on the server, so nothing the toolbar
// cannot produce survives.
//
// `execCommand` is marked deprecated but every browser still implements it and
// there is no replacement for contentEditable formatting; if one lands, this
// file is the only place to change.

interface Tool {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** An execCommand name, or `link` for the link bar. */
  command: string;
  arg?: string;
  /** queryCommandState name, so the button shows as pressed inside bold text. */
  state?: string;
}

// Data, not closures: the buttons render from this and one handler runs them.
const TOOLS: Array<Tool | 'sep'> = [
  { label: 'Bold', icon: Bold, command: 'bold', state: 'bold' },
  { label: 'Italic', icon: Italic, command: 'italic', state: 'italic' },
  { label: 'Underline', icon: Underline, command: 'underline', state: 'underline' },
  { label: 'Strikethrough', icon: Strikethrough, command: 'strikeThrough', state: 'strikeThrough' },
  'sep',
  { label: 'Heading', icon: Heading2, command: 'formatBlock', arg: '<h2>' },
  { label: 'Quote', icon: Quote, command: 'formatBlock', arg: '<blockquote>' },
  { label: 'Bulleted list', icon: List, command: 'insertUnorderedList', state: 'insertUnorderedList' },
  { label: 'Numbered list', icon: ListOrdered, command: 'insertOrderedList', state: 'insertOrderedList' },
  { label: 'Link', icon: Link2, command: 'link' },
  'sep',
  { label: 'Clear formatting', icon: Eraser, command: 'clear' },
  { label: 'Undo', icon: Undo2, command: 'undo' },
  { label: 'Redo', icon: Redo2, command: 'redo' },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  invalid,
  disabled,
  id,
  'aria-label': ariaLabel,
  minHeight = 'min-h-[220px]',
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  minHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [empty, setEmpty] = useState(!value);

  // Only written from outside when the value genuinely differs — rewriting the
  // DOM on every keystroke would throw the caret back to the start.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
    setEmpty(!value || (el?.textContent ?? '').trim() === '');
  }, [value]);

  const emit = (): void => {
    const el = ref.current;
    if (!el) return;
    setEmpty((el.textContent ?? '').trim() === '' && !el.querySelector('li'));
    onChange(el.innerHTML);
  };

  const refreshState = (): void => {
    const next: Record<string, boolean> = {};
    for (const s of ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList']) {
      try {
        next[s] = document.queryCommandState(s);
      } catch {
        next[s] = false;
      }
    }
    setActive(next);
  };

  const exec = (command: string, arg?: string): void => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
    refreshState();
  };

  // The link bar takes focus, which drops the editor's selection — so the
  // range is kept and put back before the link is applied to it.
  const savedRange = useRef<Range | null>(null);
  const [link, setLink] = useState<{ url: string; error: string | null } | null>(null);

  const addLink = (): void => {
    const sel = window.getSelection();
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setLink({ url: 'https://', error: null });
  };

  const applyLink = (): void => {
    if (!link) return;
    const url = link.url.trim();
    // The sanitiser drops anything but http(s) / mailto / tel; say so here
    // rather than letting the link silently vanish on send.
    if (!/^(https?:\/\/\S+|mailto:\S+|tel:\S+)$/iu.test(url)) {
      setLink({ ...link, error: 'A link must start with https://, http://, mailto: or tel: — e.g. https://company.com.' });
      return;
    }
    ref.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    // With nothing selected, the address itself becomes the link text.
    if (!sel || sel.isCollapsed) document.execCommand('insertHTML', false, sanitizeHtml(`<a href="${url.replace(/"/gu, '%22')}">${url.replace(/</gu, '&lt;')}</a>`));
    else document.execCommand('createLink', false, url);
    setLink(null);
    emit();
  };

  const run = (t: Tool): void => {
    if (t.command === 'link') {
      addLink();
    } else if (t.command === 'clear') {
      exec('removeFormat');
      exec('formatBlock', '<p>');
    } else {
      exec(t.command, t.arg);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-card shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        invalid && 'border-destructive ring-1 ring-destructive/40',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t, i) =>
          t === 'sep' ? (
            <span key={`sep-${i}`} className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          ) : (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={t.state ? Boolean(active[t.state]) : undefined}
              disabled={disabled}
              // mousedown, not click: a click moves focus to the button first,
              // which collapses the selection the command is meant to format.
              onMouseDown={(e) => {
                e.preventDefault();
                run(t);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  run(t);
                }
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed',
                t.state && active[t.state] && 'bg-card text-foreground shadow-sm',
              )}
            >
              <t.icon className="h-4 w-4" />
            </button>
          ),
        )}
      </div>
      {link && (
        <div className="border-b border-border bg-muted/30 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="input h-8 min-w-0 flex-1 py-0"
              value={link.url}
              onChange={(e) => setLink({ url: e.target.value, error: null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setLink(null);
                }
              }}
              aria-label="Link address"
              aria-invalid={link.error ? true : undefined}
            />
            <button type="button" onClick={applyLink} className="btn-primary btn-sm">Add link</button>
            <button type="button" onClick={() => setLink(null)} className="btn-secondary btn-sm">Cancel</button>
          </div>
          {link.error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{link.error}</p>}
        </div>
      )}
      <div className="relative">
        {empty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground" aria-hidden="true">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          onPaste={(e) => {
            // Pasted Word / web content arrives with styles, classes and
            // scripts; keep only the formatting this editor can express.
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            if (html) {
              document.execCommand('insertHTML', false, sanitizeHtml(html));
            } else {
              document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
            }
            emit();
          }}
          className={cn(
            'prose-message max-h-[480px] overflow-y-auto px-3 py-2.5 text-sm text-foreground focus:outline-none',
            minHeight,
          )}
        />
      </div>
    </div>
  );
}
