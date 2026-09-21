import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { badgeClass, statusTone, type ToneKey } from '@/lib/statusTone';

// §4.38 — the one status pill. Its colour comes from the status text through
// statusTone, so the same status is the same colour on every screen; pass
// `tone` only when a master row carries its own (payment stages do).

interface Props {
  status: ReactNode;
  /** Overrides the text-derived hue — for a status whose master configures one. */
  tone?: ToneKey;
  title?: string;
  className?: string;
}

export default function StatusBadge({ status, tone, title, className }: Props) {
  const text = typeof status === 'string' || typeof status === 'number' ? String(status) : '';
  if (status === null || status === undefined || status === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      title={title ?? (text || undefined)}
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-4 tracking-wide',
        badgeClass(tone ?? statusTone(text)),
        className,
      )}
    >
      {status}
    </span>
  );
}
