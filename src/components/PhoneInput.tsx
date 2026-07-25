import { useMemo } from 'react';

/**
 * Phone input with a country-code (dial code) selector for the admin panel.
 * Controlled: pass `dialCode` (e.g. "+91") + `value` (national number); both come
 * back via `onChange`. Defaults to India (+91). The backend stores the dial code
 * alongside the number (see backend utils/phone.ts / dial_code columns).
 */
export interface Country { code: string; dial: string; label: string; }

export const COUNTRIES: Country[] = [
  { code: 'IN', dial: '+91', label: 'India' },
  { code: 'US', dial: '+1', label: 'USA / Canada' },
  { code: 'GB', dial: '+44', label: 'UK' },
  { code: 'AE', dial: '+971', label: 'UAE' },
  { code: 'SA', dial: '+966', label: 'Saudi Arabia' },
  { code: 'QA', dial: '+974', label: 'Qatar' },
  { code: 'KW', dial: '+965', label: 'Kuwait' },
  { code: 'SG', dial: '+65', label: 'Singapore' },
  { code: 'MY', dial: '+60', label: 'Malaysia' },
  { code: 'AU', dial: '+61', label: 'Australia' },
  { code: 'NP', dial: '+977', label: 'Nepal' },
  { code: 'BD', dial: '+880', label: 'Bangladesh' },
  { code: 'LK', dial: '+94', label: 'Sri Lanka' },
  { code: 'PK', dial: '+92', label: 'Pakistan' },
];

export const DEFAULT_DIAL = '+91';

interface Props {
  value: string;
  dialCode?: string;
  onChange: (next: { number: string; dialCode: string }) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function PhoneInput({
  value, dialCode = DEFAULT_DIAL, onChange,
  placeholder = 'Mobile number', required, disabled, className = '',
}: Props) {
  const dial = dialCode || DEFAULT_DIAL;
  const options = useMemo(() => COUNTRIES, []);
  const known = options.some((c) => c.dial === dial);

  return (
    <div className={`flex items-stretch gap-2 ${className}`}>
      <select
        aria-label="Country code"
        value={known ? dial : 'custom'}
        disabled={disabled}
        onChange={(e) => onChange({ number: value, dialCode: e.target.value === 'custom' ? dial : e.target.value })}
        className="shrink-0 rounded-md border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
      >
        {options.map((c) => <option key={c.code} value={c.dial}>{c.dial} {c.code}</option>)}
        {!known && <option value="custom">{dial}</option>}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange({ number: e.target.value.replace(/[^\d]/g, ''), dialCode: dial })}
        className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
      />
    </div>
  );
}
