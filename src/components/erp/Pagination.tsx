import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { num } from './Money';
import { Btn } from './Button';
import { SelectInput } from './FilterBar';

/**
 * Pagination — the shared prev/next + page-size footer for every list.
 * Kit-styled, tabular counts, and it hides itself when everything fits on one
 * page (`total <= pageSize`). Pair with `useListControls` (`page`/`pageSize`).
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
}> = ({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = [10, 20, 50, 100], className }) => {
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
        <span className="tabular-nums text-xs text-gray-500">
          Page {num(page)} of {num(totalPages)}
        </span>
        <Btn type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight />
        </Btn>
      </div>
    </div>
  );
};

export default Pagination;
