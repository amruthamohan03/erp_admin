'use client';

import { useEffect, useMemo, useState } from 'react';

// Standard page-size choices used across every list table in the app.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface UsePagedListOptions {
  initialPageSize?: number;
}

export interface PagedListState<T> {
  /** Current page (1-based). */
  page: number;
  setPage: (n: number) => void;
  /** Active page size. Setting it resets to page 1. */
  pageSize: number;
  setPageSize: (n: number) => void;
  totalRows: number;
  totalPages: number;
  /** Zero-based offset of the first row on the current page — useful for serial numbers. */
  startIndex: number;
  /** Slice of `items` corresponding to the current page. */
  paged: T[];
  /** `true` once mounted on the client; lets the consumer gate pagination UI to avoid SSR hydration mismatch. */
  mounted: boolean;
  /** Convenience: jump back to page 1 (e.g. when a sibling search box changes). */
  resetPage: () => void;
}

/**
 * Client-side pagination for an in-memory list. Pure pagination — callers do their
 * own search/filter (with `useMemo`) and pass the *already filtered* array in.
 *
 * For server-side pagination (e.g. /api/v1/users), use the `<PaginationFooter />`
 * directly with your own `page` / `pageSize` / `total` state.
 */
export function usePagedList<T>(
  items: T[],
  options: UsePagedListOptions = {},
): PagedListState<T> {
  const initialPageSize = options.initialPageSize ?? 10;

  const [requestedPage, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
  const [mounted, setMounted] = useState(false);

  // `mounted` flips from server (false) → client (true) so PaginationFooter can
  // gate itself and avoid hydration mismatch. There is no purely-derived form
  // of this — setState-in-effect is the canonical React idiom for it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setMounted(true);
  }, []);

  const totalRows = items.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // Derive an effective page rather than clamping via an effect. When the
  // source list shrinks or pageSize grows the displayed page snaps down in
  // the same render — no extra cycle, no flash of an out-of-range slice.
  const page = Math.min(requestedPage, totalPages);

  const startIndex = (page - 1) * pageSize;

  const paged = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, startIndex, pageSize],
  );

  function setPageSize(n: number) {
    setPageSizeState(n);
    setPage(1);
  }

  function resetPage() {
    setPage(1);
  }

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
    totalPages,
    startIndex,
    paged,
    mounted,
    resetPage,
  };
}

