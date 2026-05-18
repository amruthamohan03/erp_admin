'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
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
    return <div className="h-[60px] border-t border-slate-200" />;
  }

  return (
    <div className="flex items-center justify-between p-4 border-t border-slate-200 text-sm flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <span className="text-slate-500">
          {totalRows === 0
            ? '0 results'
            : `Showing ${startIndex + 1}–${Math.min(
                startIndex + pageSize,
                totalRows,
              )} of ${totalRows}`}
        </span>
        <span className="text-slate-300">|</span>
        <label className="flex items-center gap-2 text-slate-600">
          Rows per page:
          <select
            className="input py-1 px-2 w-auto"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn-secondary px-2 py-1"
          disabled={page === 1}
          onClick={() => setPage(1)}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page === 1}
          onClick={() => setPage(Math.max(1, page - 1))}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 py-1 text-slate-700">
          Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        </span>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          className="btn-secondary px-2 py-1"
          disabled={page >= totalPages}
          onClick={() => setPage(totalPages)}
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
