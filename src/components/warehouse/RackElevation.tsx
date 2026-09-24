import React from 'react';
import { cn } from '@/lib/utils';
import { type RackView, type Loc, fillTone, fillRatio, num, litres, sizeLabel } from './layoutModel';

/**
 * One rack, drawn the way you see it standing in the aisle: steel uprights at
 * the sides, a beam under every level, row 1 at the FLOOR and the highest row
 * at the top, columns left to right. Each slot fills from the bottom like the
 * goods on it, coloured by its tightest limit.
 */

const TONE: Record<string, { fill: string; face: string; text: string }> = {
  empty:   { fill: 'bg-transparent',  face: 'bg-slate-50',   text: 'text-slate-400' },
  open:    { fill: 'bg-sky-300',      face: 'bg-sky-50',     text: 'text-sky-900' },
  low:     { fill: 'bg-emerald-400',  face: 'bg-emerald-50', text: 'text-emerald-900' },
  mid:     { fill: 'bg-amber-400',    face: 'bg-amber-50',   text: 'text-amber-900' },
  high:    { fill: 'bg-rose-500',     face: 'bg-rose-50',    text: 'text-rose-900' },
  blocked: { fill: 'bg-slate-700',    face: 'bg-slate-700',  text: 'text-white' },
};

const rowName = (n: number) => { let s = ''; let x = n; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };

export const RackElevation: React.FC<{
  view: RackView;
  selectedId?: string | null;
  onSelect: (l: Loc) => void;
  onSelectRack?: (l: Loc) => void;
  compact?: boolean;
}> = ({ view, selectedId, onSelect, onSelectRack, compact }) => {
  const { rack, rows, cols, cells } = view;
  const at = new Map(cells.map((c) => [`${c.row}:${c.col}`, c.slot]));
  const units = cells.reduce((s, c) => s + num(c.slot.current_units), 0);
  const used = cells.filter((c) => num(c.slot.current_units) > 0).length;
  const cap = cells.reduce((s, c) => s + (c.slot.max_volume_ml != null ? num(c.slot.max_volume_ml) : 0), 0);
  const cellW = compact ? 44 : 60;
  const cellH = compact ? 34 : 46;
  const shortCode = (code: string) => {
    const base = code.startsWith(rack.code) ? code.slice(rack.code.length).replace(/^[-/ .]+/, '') : code;
    return base || code;
  };

  return (
    <div className={cn('rounded-lg border bg-white shadow-sm', rack.id === selectedId ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200')}>
      <button
        type="button"
        onClick={() => onSelectRack?.(rack)}
        className="flex w-full items-baseline justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
        title="Open this rack"
      >
        <span className="min-w-0">
          <span className="font-mono text-sm font-semibold text-slate-900">{rack.code}</span>
          {rack.name && <span className="ml-2 truncate text-xs text-slate-500">{rack.name}</span>}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
          {rows}×{cols} · {used}/{cells.length} in use · {units.toLocaleString('en-IN')} units
          {cap > 0 && <> · {litres(cap, 0)}</>}
        </span>
      </button>

      <div className="overflow-x-auto px-3 pb-3 pt-2">
        <div className="inline-flex">
          {/* row axis */}
          <div className="flex flex-col justify-end pr-1.5 pb-[18px]">
            {Array.from({ length: rows }, (_, i) => rows - i).map((r) => (
              <div key={r} style={{ height: cellH + 6 }} className="flex items-center text-[10px] font-semibold text-slate-400">
                {rowName(r)}
              </div>
            ))}
          </div>

          <div>
            {/* the frame: uprights left/right, a beam under each level */}
            <div className="relative border-x-[5px] border-slate-500 bg-slate-100/60 px-1 pt-1" style={{ minWidth: cols * (cellW + 4) + 10 }}>
              {Array.from({ length: rows }, (_, i) => rows - i).map((r) => (
                <div key={r} className="flex gap-1 border-b-[4px] border-orange-500/80 pb-0.5 pt-0.5">
                  {Array.from({ length: cols }, (_, j) => j + 1).map((c) => {
                    const slot = at.get(`${r}:${c}`);
                    if (!slot) {
                      return <div key={c} style={{ width: cellW, height: cellH }} className="rounded-sm border border-dashed border-slate-200" />;
                    }
                    const tone = fillTone(slot);
                    const t = TONE[tone];
                    const ratio = tone === 'open' ? 0.5 : tone === 'empty' ? 0 : Math.min(1, fillRatio(slot) ?? 0);
                    const title = [
                      slot.code,
                      `${num(slot.current_units)}${slot.max_units != null ? ` / ${slot.max_units}` : ''} units · ${slot.sku_count} SKU`,
                      slot.max_volume_ml != null ? `volume ${litres(slot.used_volume_ml)} of ${litres(slot.max_volume_ml)}` : 'no volume limit',
                      sizeLabel(slot) ? `inside ${sizeLabel(slot)}` : 'size not measured',
                      slot.status !== 'active' ? `status: ${slot.status}` : null,
                    ].filter(Boolean).join('\n');
                    return (
                      <button
                        key={c}
                        type="button"
                        title={title}
                        onClick={() => onSelect(slot)}
                        style={{
                          width: cellW, height: cellH,
                          ...(tone === 'blocked' ? { backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--surface) 12%, transparent) 0 6px, transparent 6px 12px)' } : {}),
                        }}
                        className={cn(
                          'relative overflow-hidden rounded-sm border text-left transition-shadow',
                          t.face,
                          slot.id === selectedId ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-300 hover:border-slate-500 hover:shadow',
                        )}
                      >
                        <span className={cn('absolute inset-x-0 bottom-0', t.fill)} style={{ height: `${Math.round(ratio * 100)}%`, opacity: 0.85 }} />
                        <span className={cn('relative block truncate px-1 pt-0.5 font-mono text-[10px] font-semibold', tone === 'blocked' ? 'text-white' : 'text-slate-800')}>
                          {shortCode(slot.code)}
                        </span>
                        {num(slot.current_units) > 0 && (
                          <span className={cn('relative block px-1 text-[10px] tabular-nums', t.text)}>{num(slot.current_units)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* the floor, and the column axis */}
            <div className="h-1.5 bg-slate-700" />
            <div className="flex gap-1 px-[9px] pt-0.5">
              {Array.from({ length: cols }, (_, j) => j + 1).map((c) => (
                <div key={c} style={{ width: cellW }} className="text-center text-[10px] font-semibold text-slate-400">{c}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const FillLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
    {[
      ['bg-slate-50 border border-slate-300', 'empty'],
      ['bg-emerald-400', 'under 60%'],
      ['bg-amber-400', '60–90%'],
      ['bg-rose-500', 'full'],
      ['bg-sky-300', 'has stock, no limit set'],
      ['bg-slate-700', 'blocked'],
    ].map(([cls, label]) => (
      <span key={label} className="inline-flex items-center gap-1.5">
        <span className={cn('inline-block h-3 w-3 rounded-sm', cls)} />{label}
      </span>
    ))}
    <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1 w-4 bg-orange-500/80" />beam</span>
  </div>
);

export default RackElevation;
