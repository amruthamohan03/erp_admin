'use client';

import { useEffect, useState } from 'react';
import { Clock as ClockIcon } from 'lucide-react';

const WEEKDAY: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
};
const TIME: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  // Initialise on the client only — SSR cannot agree with the client wall clock,
  // so we render nothing until mount to avoid hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        <ClockIcon className="h-4 w-4" />
        <span className="tabular-nums opacity-0">placeholder</span>
      </div>
    );
  }

  const date = now.toLocaleDateString(undefined, WEEKDAY);
  const time = now.toLocaleTimeString(undefined, TIME);

  return (
    <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
      <ClockIcon className="h-4 w-4" />
      <span className="tabular-nums">
        {date} <span className="opacity-50">·</span> {time}
      </span>
    </div>
  );
}
