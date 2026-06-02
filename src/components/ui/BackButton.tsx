'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Per CLAUDE.md §4.13. Drop one of these at the top of any page that isn't the
 * dashboard / login. Uses browser history when possible (so the user lands
 * exactly where they came from) and falls back to a safe URL for direct-entry
 * cases (typed URL, opened in new tab, etc.).
 *
 * Override `fallback` if the dashboard isn't the right landing spot for a
 * particular flow (e.g. transactional pages may want their list view).
 */
export default function BackButton({
  fallback = '/dashboard',
  label,
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  function go() {
    // window.history is available on the client; if the user reached this page
    // by typing the URL or opening a new tab, history.length will be 1.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      title="Back"
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 text-slate-600 hover:text-primary-700 hover:border-primary-300 hover:bg-primary-50 px-2 py-1 text-sm transition"
    >
      <ArrowLeft className="h-4 w-4" />
      {label && <span>{label}</span>}
    </button>
  );
}
