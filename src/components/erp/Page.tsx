import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Page shell + header for every ERP surface. Gives each page one consistent
 * max-width, vertical rhythm, and a header block (title + one-line explainer +
 * right-side actions). Non-technical owners get a calm, predictable layout.
 *
 *   width="wide"    → dashboards & long tables (default)
 *   width="narrow"  → forms & wizards
 */
export const Page: React.FC<{
  width?: 'wide' | 'narrow' | 'full';
  className?: string;
  children: React.ReactNode;
}> = ({ width = 'wide', className, children }) => (
  <div
    className={cn(
      'mx-auto w-full space-y-6',
      width === 'wide' && 'max-w-screen-2xl',
      width === 'narrow' && 'max-w-4xl',
      className,
    )}
  >
    {children}
  </div>
);

export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon: Icon, actions, className }) => (
  <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900/5 text-gray-700 sm:flex">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-3xl text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default Page;
