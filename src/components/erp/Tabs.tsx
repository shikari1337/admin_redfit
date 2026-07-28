import React from 'react';
import { cn } from '@/lib/utils';

/**
 * TabBar — the underline tab strip used inside pages (Reports, settings, etc.).
 * Active tab is dark (matches the app chrome), never a default-blue underline.
 */
export interface TabDef {
  key: string;
  label: React.ReactNode;
}

export const TabBar: React.FC<{
  tabs: readonly TabDef[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className }) => (
  <div className={cn('flex flex-wrap gap-1 border-b border-gray-200', className)}>
    {tabs.map((t) => (
      <button
        key={t.key}
        onClick={() => onChange(t.key)}
        className={cn(
          '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
          active === t.key
            ? 'border-gray-900 text-gray-900'
            : 'border-transparent text-gray-500 hover:text-gray-800',
        )}
      >
        {t.label}
      </button>
    ))}
  </div>
);

export default TabBar;
