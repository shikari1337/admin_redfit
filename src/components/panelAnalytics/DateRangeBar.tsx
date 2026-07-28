import React, { useMemo, useState } from 'react';

export interface PanelRange { from?: string; to?: string }

/** Local (not UTC) YYYY-MM-DD — store operates in IST; toISOString would shift the day. */
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }

/** Indian FY start (1 April) for the current date. */
function fyStart(): Date {
  const now = new Date();
  return new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
}

const PRESETS: Array<{ key: string; label: string; range: () => PanelRange }> = [
  { key: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { key: '7d', label: '7D', range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { key: '30d', label: '30D', range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  { key: '90d', label: '90D', range: () => ({ from: iso(daysAgo(89)), to: iso(new Date()) }) },
  { key: '12m', label: '12M', range: () => ({ from: iso(daysAgo(364)), to: iso(new Date()) }) },
  { key: 'fy', label: 'This FY', range: () => ({ from: iso(fyStart()), to: iso(new Date()) }) },
  { key: 'all', label: 'All time', range: () => ({}) }, // omit both = full history
];

export function useDateRange(defaultKey = '30d') {
  const [preset, setPreset] = useState(defaultKey);
  const [custom, setCustom] = useState<PanelRange | null>(null);
  const range = useMemo<PanelRange>(() => {
    if (preset === 'custom' && custom) return custom;
    return (PRESETS.find((p) => p.key === preset) ?? PRESETS[2]).range();
  }, [preset, custom]);
  return { range, preset, setPreset, custom, setCustom };
}

/**
 * One row of range presets + custom from/to. "All time" omits from/to so the
 * backend aggregates the store's entire history — past data is always reachable.
 */
const DateRangeBar: React.FC<{
  preset: string;
  onPreset: (key: string) => void;
  custom: PanelRange | null;
  onCustom: (r: PanelRange) => void;
}> = ({ preset, onPreset, custom, onCustom }) => {
  const [draft, setDraft] = useState<PanelRange>({});
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button key={p.key} type="button" onClick={() => onPreset(p.key)}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
            preset === p.key
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
          {p.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <input type="date" value={(preset === 'custom' ? custom?.from : draft.from) ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700" />
      <span className="text-xs text-gray-400">to</span>
      <input type="date" value={(preset === 'custom' ? custom?.to : draft.to) ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700" />
      <button type="button"
        onClick={() => { if (draft.from || draft.to) { onCustom(draft); onPreset('custom'); } }}
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          preset === 'custom'
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
        Apply
      </button>
    </div>
  );
};

export default DateRangeBar;
