import React, { useMemo, useState } from 'react';

export interface PanelRange { from?: string; to?: string }
export interface Preset { key: string; label: string; range: () => PanelRange }

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

/**
 * Current Indian-FY quarter (Apr-Jun / Jul-Sep / Oct-Dec / Jan-Mar) containing
 * today. Each group sits entirely within one calendar year, so no year-
 * boundary math is needed. `to` is capped at today so an in-progress quarter
 * never shows future dates.
 */
function currentFyQuarterRange(): PanelRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  const groups = [[3, 4, 5], [6, 7, 8], [9, 10, 11], [0, 1, 2]];
  const g = groups.find((gr) => gr.includes(m)) ?? groups[0];
  const start = new Date(y, g[0], 1);
  const end = new Date(y, g[0] + 3, 0); // last day of the quarter's final month
  return { from: iso(start), to: iso(end > now ? now : end) };
}

const PRESETS: Preset[] = [
  { key: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { key: '7d', label: '7D', range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { key: '30d', label: '30D', range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  { key: '90d', label: '90D', range: () => ({ from: iso(daysAgo(89)), to: iso(new Date()) }) },
  { key: '12m', label: '12M', range: () => ({ from: iso(daysAgo(364)), to: iso(new Date()) }) },
  { key: 'fy', label: 'This FY', range: () => ({ from: iso(fyStart()), to: iso(new Date()) }) },
  { key: 'all', label: 'All time', range: () => ({}) }, // omit both = full history
];

/** Home dashboard's preset set (owner spec, 2026-08-15) — Today through the current FY quarter. */
export const DASHBOARD_PRESETS: Preset[] = [
  { key: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: iso(daysAgo(1)), to: iso(daysAgo(1)) }) },
  { key: '3d', label: 'Past 3 days', range: () => ({ from: iso(daysAgo(2)), to: iso(new Date()) }) },
  { key: '7d', label: 'Past 7 days', range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { key: '14d', label: 'Past 14 days', range: () => ({ from: iso(daysAgo(13)), to: iso(new Date()) }) },
  { key: '30d', label: 'Past 30 days', range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  { key: 'fq', label: 'Financial Quarter', range: () => currentFyQuarterRange() },
  { key: '3m', label: 'Past 3 months', range: () => ({ from: iso(daysAgo(89)), to: iso(new Date()) }) },
];

export function useDateRange(defaultKey = '30d', presets: Preset[] = PRESETS) {
  const [preset, setPreset] = useState(defaultKey);
  const [custom, setCustom] = useState<PanelRange | null>(null);
  const range = useMemo<PanelRange>(() => {
    if (preset === 'custom' && custom) return custom;
    return (presets.find((p) => p.key === preset) ?? presets[0]).range();
  }, [preset, custom, presets]);
  return { range, preset, setPreset, custom, setCustom };
}

/**
 * One row of range presets + custom from/to. "All time" omits from/to so the
 * backend aggregates the store's entire history — past data is always reachable.
 * `presets` defaults to the shared 7-item set every panel page already uses;
 * pass `DASHBOARD_PRESETS` (or any custom list) to change just one consumer.
 */
const DateRangeBar: React.FC<{
  preset: string;
  onPreset: (key: string) => void;
  custom: PanelRange | null;
  onCustom: (r: PanelRange) => void;
  presets?: Preset[];
}> = ({ preset, onPreset, custom, onCustom, presets = PRESETS }) => {
  const [draft, setDraft] = useState<PanelRange>({});
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => (
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
