import React, { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { scaleDecimal, unscale } from '@/lib/v2/shape';
import { majorToMinor, minorDigits, minorToMajor } from '@/lib/v2/money';
import { TextInput } from './FilterBar';

/**
 * RateInput and MoneyInput (HMAPP design 60, request A4): the two typed boxes the partner
 * screens need, on the admin's ONE conversion of each unit.
 *
 *   RateInput   a percent with up to 3 decimals, held as the kernel's milli-percent integer
 *               (`5.250` percent = `5250`), through `scaleDecimal` / `unscale` (lib/v2/shape.ts).
 *   MoneyInput  major units typed, held as integer minor units of the currency, through
 *               `majorToMinor` / `minorToMajor` (lib/v2/money.ts).
 *
 * Both hold `null` for an empty box ("use the default"), never 0.
 */

/** A milli-percent integer as people read it: `5250` is "5.25%". Null is ''. */
export function rateText(milli: number | null | undefined): string {
  if (milli === null || milli === undefined || !Number.isFinite(Number(milli))) return '';
  const n = unscale(Math.trunc(Number(milli)), 3);
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })}%`;
}

/** The text a box shows for a milli-percent integer (`5250` is `5.25`). */
function rateBox(milli: number | null | undefined): string {
  if (milli === null || milli === undefined) return '';
  return String(unscale(Math.trunc(Number(milli)), 3));
}

export const RateInput: React.FC<{
  value: number | null | undefined;
  onChange: (milli: number | null) => void;
  /** The highest rate allowed (milli-percent), shown and checked. */
  max?: number | null;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}> = ({ value, onChange, max, id, disabled, placeholder, className, ...rest }) => {
  const [text, setText] = useState(rateBox(value));
  const [bad, setBad] = useState<string | null>(null);
  const hint = useId();
  useEffect(() => { setText(rateBox(value)); }, [value]);
  const commit = (t: string) => {
    if (t.trim() === '') { setBad(null); onChange(null); return; }
    const milli = scaleDecimal(t, 3);
    if (milli === null || milli < 0 || milli > 100000) { setBad('A percent from 0 to 100, up to 3 decimals.'); return; }
    if (max !== null && max !== undefined && milli > max) { setBad(`At most ${rateText(max)} (the platform's limit).`); return; }
    setBad(null);
    onChange(milli);
  };
  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <span className="inline-flex items-center gap-1.5">
        <TextInput
          id={id}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={!!bad}
          aria-describedby={hint}
          aria-label={rest['aria-label']}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className="w-28 text-right tabular-nums"
        />
        <span className="text-sm text-gray-500">percent</span>
      </span>
      <span id={hint} className={cn('text-xs', bad ? 'text-red-700' : 'text-gray-500')}>
        {bad ?? (max !== null && max !== undefined ? `Limit ${rateText(max)}` : '')}
      </span>
    </span>
  );
};

export const MoneyInput: React.FC<{
  /** Integer minor units, or null for an empty box. */
  value: number | null | undefined;
  currency: string;
  onChange: (minor: number | null) => void;
  /** The least amount allowed (minor units), shown and checked. */
  min?: number | null;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}> = ({ value, currency, onChange, min, id, disabled, placeholder, className, ...rest }) => {
  const box = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(minorToMajor(v, currency)));
  const [text, setText] = useState(box(value));
  const [bad, setBad] = useState<string | null>(null);
  const hint = useId();
  useEffect(() => { setText(box(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value, currency]);
  const fmt = (minor: number) => {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minorDigits(currency) })
        .format(minorToMajor(minor, currency));
    } catch { return `${minorToMajor(minor, currency)} ${currency}`; }
  };
  const commit = (t: string) => {
    if (t.trim() === '') { setBad(null); onChange(null); return; }
    const minor = majorToMinor(t, currency);
    if (minor === null || minor < 0) { setBad('An amount of zero or more.'); return; }
    if (min !== null && min !== undefined && minor < min) { setBad(`At least ${fmt(min)} (the platform's floor).`); return; }
    setBad(null);
    onChange(minor);
  };
  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <span className="inline-flex items-center gap-1.5">
        <TextInput
          id={id}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={!!bad}
          aria-describedby={hint}
          aria-label={rest['aria-label']}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className="w-36 text-right tabular-nums"
        />
        <span className="text-sm text-gray-500">{currency}</span>
      </span>
      <span id={hint} className={cn('text-xs', bad ? 'text-red-700' : 'text-gray-500')}>
        {bad ?? (min !== null && min !== undefined ? `Floor ${fmt(min)}` : '')}
      </span>
    </span>
  );
};

export default RateInput;
