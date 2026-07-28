import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * FilterBar + form controls — a single, aligned toolbar look for the filter/
 * search rows that sit above tables. Inputs share one height (h-9), one radius,
 * one border and one focus ring so filter rows never look ragged.
 */
export const FilterBar: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className, children,
}) => (
  <div className={cn('flex flex-wrap items-end gap-3', className)}>{children}</div>
);

/** Labelled field wrapper — stacks a small label over any control. */
export const Field: React.FC<{ label?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  label, className, children,
}) => (
  <label className={cn('flex flex-col gap-1', className)}>
    {label && <span className="text-xs font-medium text-gray-600">{label}</span>}
    {children}
  </label>
);

const CONTROL =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm ' +
  'placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(CONTROL, className)} {...props} />
  ),
);
TextInput.displayName = 'TextInput';

export const SelectInput = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(CONTROL, 'pr-8', className)} {...props}>
    {children}
  </select>
));
SelectInput.displayName = 'SelectInput';

/** Search box with a leading magnifier. */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input ref={ref} className={cn(CONTROL, 'pl-8', className)} {...props} />
  </div>
));
SearchInput.displayName = 'SearchInput';

export default FilterBar;
