import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * DrillLink — the one styling for "drill-through" navigation between records
 * (statement → account → journal → invoice). A subtle dotted underline signals
 * it drills in; it darkens to the primary ink on hover. Use it for any in-table
 * link that opens the underlying record, so drill affordances look the same
 * across every panel (never a raw default-blue link).
 */
export const DrillLink: React.FC<{
  to: LinkProps['to'];
  children: React.ReactNode;
  title?: string;
  className?: string;
}> = ({ to, children, title, className }) => (
  <Link
    to={to}
    title={title}
    className={cn(
      'font-medium text-gray-700 underline decoration-dotted decoration-gray-300 underline-offset-2',
      'transition-colors hover:text-gray-900 hover:decoration-gray-500',
      'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
      className,
    )}
  >
    {children}
  </Link>
);

export default DrillLink;
