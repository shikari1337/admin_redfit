import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { num } from './Money';
import { Btn } from './Button';
import { SelectInput } from './FilterBar';

/** Sliding window of up to 5 page numbers around the current page (matches the numbered
 *  pagers this component replaces, e.g. Products.tsx's pre-existing implementation). */
function pageWindow(page: number, totalPages: number): number[] {
  const count = Math.min(5, totalPages);
  return Array.from({ length: count }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    if (page <= 3) return i + 1;
    if (page >= totalPages - 2) return totalPages - 4 + i;
    return page - 2 + i;
  });
}

/**
 * Pagination — the shared prev/next + page-size footer for every list.
 * Kit-styled, tabular counts, and it hides itself when everything fits on one
 * page (`total <= pageSize`). Pair with `useListControls` (`page`/`pageSize`).
 *
 * Two display modes: `variant="compact"` (default) shows a plain "Page X of Y"
 * label; `variant="numbered"` shows clickable page-number buttons (sliding
 * window of 5) instead — for pages that previously had their own numbered
 * pager, so migrating onto this component doesn't drop that affordance.
 */
export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Supply to show a rows-per-page selector. */
  onPageSize?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  variant?: 'compact' | 'numbered';
}> = ({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = [10, 20, 50, 100], className, variant = 'compact' }) => {
  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-sm text-gray-600', className)}>
      <span className="tabular-nums">
        Showing {num(first)}–{num(last)} of {num(total)}
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Rows
            <SelectInput
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-8 py-0"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </SelectInput>
          </label>
        )}
        <Btn type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft /> Prev
        </Btn>
        {variant === 'numbered' ? (
          <div className="flex items-center gap-1">
            {pageWindow(page, totalPages).map((n) => (
              <Btn
                key={n}
                type="button"
                variant={n === page ? 'primary' : 'outline'}
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => onPage(n)}
              >
                {n}
              </Btn>
            ))}
          </div>
        ) : (
          <span className="tabular-nums text-xs text-gray-500">
            Page {num(page)} of {num(totalPages)}
          </span>
        )}
        <Btn type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight />
        </Btn>
      </div>
    </div>
  );
};

export default Pagination;
