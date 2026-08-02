import React from 'react';
import { Switch } from '@/components/ui/switch';

/**
 * Shared field primitives for the product form ("dumb-human obvious" pass).
 * One visual pattern everywhere:
 *  - <FieldGroup>  — white card section with a heading + one-line description
 *  - <Field>       — label above, control, help/error line under
 *  - <SwitchRow>   — option row: label left, shadcn Switch right, help under
 *  - <Segmented>   — pill-style exclusive choice (replaces radio-ish selections)
 * Purely presentational — values/handlers pass straight through.
 */

/** Canonical control styling for native inputs/selects. */
export const fieldInputCls =
  'w-full h-9 px-3 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 disabled:opacity-50 disabled:cursor-not-allowed';

/** Same styling for textareas (no fixed height). */
export const fieldTextareaCls =
  'w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 disabled:opacity-50 disabled:cursor-not-allowed';

/** Error-state variant — swap the border/ring red. */
export const fieldInputErrorCls =
  'w-full h-9 px-3 text-sm rounded-md border border-red-400 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400';

export const FieldGroup: React.FC<{
  title: string;
  description?: React.ReactNode;
  /** Optional right-aligned header slot (e.g. "+ New" / "Refresh" buttons). */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, description, actions, className = '', children }) => (
  <section className={`bg-white rounded-lg shadow-sm border border-gray-200 p-5 ${className}`}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
    {children}
  </section>
);

export const Field: React.FC<{
  label: React.ReactNode;
  help?: React.ReactNode;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  className?: string;
  /** Right-aligned element on the label row (e.g. a character counter). */
  labelRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, help, required, error, htmlFor, className = '', labelRight, children }) => (
  <div className={className}>
    <div className="flex items-baseline justify-between gap-2 mb-1">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {labelRight}
    </div>
    {children}
    {help && !error && <p className="text-xs text-gray-400 mt-1">{help}</p>}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

/** Option row: label + help on the left, switch on the right. Stack inside a
 *  `divide-y divide-gray-100` container for the settings-list look. */
export const SwitchRow: React.FC<{
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ id, label, help, checked, onCheckedChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 px-2 -mx-2 rounded-md hover:bg-gray-50 transition-colors">
    <label htmlFor={id} className="flex-1 min-w-0 cursor-pointer select-none">
      <span className="block text-[13px] font-medium text-gray-700">{label}</span>
      {help && <span className="block text-xs text-gray-400 mt-0.5">{help}</span>}
    </label>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="shrink-0 data-[state=checked]:bg-red-600"
    />
  </div>
);

/** Segmented pill buttons — an exclusive choice that LOOKS like a choice. */
export const Segmented: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel?: string;
  className?: string;
}> = ({ value, onChange, options, ariaLabel, className = '' }) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={`inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-100 p-0.5 ${className}`}
  >
    {options.map(o => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={active}
          className={`px-3 h-8 text-[13px] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
            active
              ? 'bg-white text-gray-900 font-medium shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);
