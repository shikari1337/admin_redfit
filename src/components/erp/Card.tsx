import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Surface cards for the ERP panels. One radius (xl), one hairline border, one
 * soft shadow — so every panel reads as the same product.
 */
export const CARD = 'rounded-xl border border-gray-200 bg-white shadow-sm';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn(CARD, className)} {...props} />
);

/**
 * SectionCard — a card with a titled header strip and a padded body. Optional
 * right-aligned action (a link/button) and an inset variant (`flush`) for
 * cards whose body is a full-bleed table or list.
 */
export const SectionCard: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, action, flush, className, bodyClassName, children }) => (
  <div className={cn(CARD, 'overflow-hidden', className)}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <div className="min-w-0">
          {title && <div className="font-semibold text-gray-900">{title}</div>}
          {description && <div className="mt-0.5 text-xs text-gray-500">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    <div className={cn(!flush && 'p-5', bodyClassName)}>{children}</div>
  </div>
);

export default Card;
