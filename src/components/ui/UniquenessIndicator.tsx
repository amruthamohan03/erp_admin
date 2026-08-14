'use client';

import { Check, Loader2, X } from 'lucide-react';
import type { UniqueStatus } from '@/lib/hooks/useUniqueCheck';

// Small inline badge that pairs with useUniqueCheck on a master-name
// form input. Renders nothing in 'idle' state so the surrounding
// helper-text row stays clean when the input is empty.

export interface UniquenessIndicatorProps {
  status: UniqueStatus;
  message: string;
}

export default function UniquenessIndicator({
  status,
  message,
}: UniquenessIndicatorProps) {
  if (status === 'idle') return null;
  const tone =
    status === 'available'
      ? 'text-emerald-700'
      : status === 'taken'
        ? 'text-red-700'
        : status === 'checking'
          ? 'text-muted-foreground'
          : 'text-amber-700';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      {status === 'checking' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'available' && <Check className="h-3 w-3" />}
      {status === 'taken' && <X className="h-3 w-3" />}
      {message}
    </span>
  );
}
