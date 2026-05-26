import { Check, Loader2, X, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { UniqueStatus } from '@/lib/hooks/useUniqueCheck';

export default function UniqueAvailability({
  status,
  message,
  className,
}: {
  status: UniqueStatus;
  message: string;
  className?: string;
}) {
  if (status === 'idle' || !message) return null;

  const color =
    status === 'available'
      ? 'text-emerald-600'
      : status === 'taken'
        ? 'text-red-600'
        : status === 'error'
          ? 'text-amber-600'
          : 'text-slate-500';

  const Icon =
    status === 'available'
      ? Check
      : status === 'taken'
        ? X
        : status === 'error'
          ? AlertCircle
          : Loader2;

  return (
    <p className={clsx('mt-1 flex items-center gap-1 text-xs', color, className)}>
      <Icon className={clsx('h-3.5 w-3.5', status === 'checking' && 'animate-spin')} />
      <span>{message}</span>
    </p>
  );
}
