'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { PAGE_SIZE_OPTIONS } from '@/lib/hooks/usePagedList';

interface PaginationFooterProps {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalRows: number;
  totalPages: number;
  /** Zero-based offset of the first row on the current page. */
  startIndex: number;
  /** Set true after client mount; the footer renders a blank spacer until then to avoid hydration mismatches. */
  mounted: boolean;
  pageSizeOptions?: readonly number[];
}

export default function PaginationFooter({
  page,
  setPage,
  pageSize,
  setPageSize,
  totalRows,
  totalPages,
  startIndex,
  mounted,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationFooterProps) {
  if (!mounted) {
    return <div className="h-[60px] border-t border-border" />;
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-3 text-sm sm:flex-row sm:p-4">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="text-muted-foreground">
          {totalRows === 0
            ? '0 results'
            : `Showing ${startIndex + 1}–${Math.min(
                startIndex + pageSize,
                totalRows,
              )} of ${totalRows}`}
        </span>
        <span className="hidden text-border sm:inline">|</span>
        <label className="flex items-center gap-2 text-muted-foreground">
          {/* The label shortens rather than wrapping — on a phone the footer has to
              stay one or two lines, not four. */}
          <span className="hidden sm:inline">Rows per page:</span>
          <span className="sm:hidden">Rows:</span>
          <SearchableSelect
            size="sm"
            className="w-20"
            aria-label="Rows per page"
            value={String(pageSize)}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => setPageSize(Number(v))}
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn-secondary px-2 py-1"
          disabled={page === 1}
          onClick={() => setPage(1)}
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page === 1}
          onClick={() => setPage(Math.max(1, page - 1))}
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        <span className="whitespace-nowrap px-3 py-1 text-foreground">
          Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        </span>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => setPage(totalPages)}
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
