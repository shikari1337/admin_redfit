import React from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from './Page';

/**
 * BooksToolbar — the standard top of a Books/list page: a `PageHeader` (title +
 * explainer + right-aligned `actions` slot for ExportMenu / a primary Btn /
 * DateRangeBar) with an optional `filters` row (a `FilterBar`) directly below.
 *
 * Deliberately thin — pure layout. Pages that need something custom can still
 * use `PageHeader` directly; this just saves wiring the same header+filter row
 * on every list.
 */
export const BooksToolbar: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Right-aligned header actions: ExportMenu, a primary Btn, a DateRangeBar, … */
  actions?: React.ReactNode;
  /** Filter controls under the header (usually a `<FilterBar>`). */
  filters?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, actions, filters, className }) => (
  <div className={cn('space-y-4', className)}>
    <PageHeader title={title} description={description} icon={icon} actions={actions} />
    {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
  </div>
);

export default BooksToolbar;
