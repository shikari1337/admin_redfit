/**
 * The Overview's one period control: a button naming the period in force that
 * opens a list of preset rows (Days · Months · Years) with a custom range in
 * the footer. Rows, not a calendar — nobody fights a grid for "past 30 days".
 */
import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayIso } from '@/utils/date';
import { PERIODS, type PanelRange, type PeriodGroup, periodByKey, rangeLabel } from './periods';

const GROUPS: PeriodGroup[] = ['Days', 'Months', 'Years'];

export const PeriodPicker: React.FC<{
  value: string;
  range: PanelRange;
  custom: PanelRange | null;
  onChange: (key: string, custom?: PanelRange) => void;
}> = ({ value, range, custom, onChange }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PanelRange>(custom ?? {});
  const wrap = useRef<HTMLDivElement>(null);
  const today = todayIso();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const def = periodByKey(value);
  const name = value === 'custom' ? 'Custom range' : def.label;
  const span = rangeLabel(range);
  const draftOk = !!draft.from && !!draft.to && draft.from <= draft.to;

  return (
    <div className="relative" ref={wrap}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        data-testid="period-picker"
        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50">
        <Calendar aria-hidden className="size-4 shrink-0 text-gray-400" />
        <span className="font-medium text-gray-900">{name}</span>
        {span !== name && <span className="hidden truncate text-gray-500 sm:inline">{span}</span>}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-surface-raised py-1 shadow-lg"
          data-testid="period-menu">
          <div role="listbox" aria-label="Period" className="max-h-[60vh] overflow-auto">
            {GROUPS.map((g) => (
              <div key={g} className="py-1">
                <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g}</div>
                {PERIODS.filter((p) => p.group === g).map((p) => {
                  const selected = p.key === value;
                  return (
                    <button key={p.key} type="button" role="option" aria-selected={selected}
                      onClick={() => { onChange(p.key); setOpen(false); }}
                      className={cn('flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-gray-50',
                        selected ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                      <span>{p.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-normal text-gray-400">{rangeLabel(p.range())}</span>
                        <Check aria-hidden className={cn('size-4', selected ? 'text-gray-900' : 'invisible')} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <form className="border-t border-gray-100 px-3 pb-2 pt-2.5"
            onSubmit={(e) => { e.preventDefault(); if (draftOk) { onChange('custom', draft); setOpen(false); } }}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Custom range</div>
            <div className="flex items-center gap-2">
              <input type="date" aria-label="From" max={today} value={draft.from ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
                className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" aria-label="To" max={today} value={draft.to ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
                className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">{draft.from && draft.to && !draftOk ? 'The start must be on or before the end.' : ''}</span>
              <button type="submit" disabled={!draftOk}
                className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default PeriodPicker;
