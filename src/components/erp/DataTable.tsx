import React from 'react';
import { cn } from '@/lib/utils';
import { CARD } from './Card';

/**
 * Table primitives — one clean, zebra-less table look everywhere. Header row is
 * a soft grey, uppercase, sticky on tall lists; body rows have a hairline
 * divider and a quiet hover. Numeric columns are right-aligned + tabular so
 * money and quantities line up.
 *
 * Compose:
 *   <TableShell>
 *     <table className="w-full text-sm">
 *       <THead><Th>Product</Th><Th num>Qty</Th></THead>
 *       <TBody>
 *         <Tr><Td>…</Td><Td num>…</Td></Tr>
 *       </TBody>
 *     </table>
 *   </TableShell>
 */

/** Card-wrapped, horizontally-scrollable table container. `maxHeight` enables a sticky header. */
export const TableShell: React.FC<{
  maxHeight?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ maxHeight, className, children }) => (
  <div
    className={cn(CARD, 'overflow-auto', className)}
    style={maxHeight ? { maxHeight } : undefined}
  >
    {children}
  </div>
);

export const THead: React.FC<{ sticky?: boolean; className?: string; children: React.ReactNode }> = ({
  sticky = true, className, children,
}) => (
  <thead
    className={cn(
      'bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500',
      sticky && 'sticky top-0 z-10',
      className,
    )}
  >
    <tr className="border-b border-gray-200">{children}</tr>
  </thead>
);

export const Th: React.FC<
  React.ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }
> = ({ num, className, children, ...props }) => (
  <th
    className={cn('whitespace-nowrap px-4 py-2.5 font-semibold', num && 'text-right', className)}
    {...props}
  >
    {children}
  </th>
);

export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className, ...props
}) => <tbody className={cn('divide-y divide-gray-100', className)} {...props} />;

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...props }) => (
  <tr className={cn('transition-colors hover:bg-gray-50/70', className)} {...props} />
);

export const Td: React.FC<
  React.TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; muted?: boolean }
> = ({ num, muted, className, children, ...props }) => (
  <td
    className={cn(
      'px-4 py-2.5 align-middle text-gray-800',
      num && 'text-right tabular-nums',
      muted && 'text-gray-500',
      className,
    )}
    {...props}
  >
    {children}
  </td>
);

/** Full-width "no rows" cell. Pass the column count. */
export const EmptyRow: React.FC<{ colSpan: number; children?: React.ReactNode }> = ({
  colSpan, children,
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-gray-500">
      {children ?? 'Nothing to show yet.'}
    </td>
  </tr>
);

export default TableShell;
