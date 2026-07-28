import React from 'react';
import { cn } from '@/lib/utils';

/**
 * EmptyState — a friendly, non-technical "nothing here yet" block. An icon, a
 * one-liner, an optional helper sentence, and an optional call-to-action.
 */
export const EmptyState: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
    {Icon && (
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon className="h-6 w-6" />
      </span>
    )}
    <div className="text-sm font-semibold text-gray-900">{title}</div>
    {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;
