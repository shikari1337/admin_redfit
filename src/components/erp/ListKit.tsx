import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Columns3, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * ListKit — the three list-screen controls the admin kept re-inventing:
 * a CHIP filter row, a COLUMN chooser and a loading SKELETON.
 *
 * Written once here (beside FilterBar / Pagination / ExportMenu) so every list
 * screen filters, hides a column and waits in the same way. Nothing in this
 * file fetches: a chip reports a value and the page decides what that means,
 * exactly like `useListControls`.
 *
 * A chip GROUP with no options renders nothing at all — that is what makes the
 * row "contextual": a store with no brands never sees a Brand chip, rather than
 * an empty dropdown that looks broken.
 *
 * Colours come from the theme's Tailwind families (see `tailwind.config.js` —
 * every family points at a theme ramp). There is no literal in this file.
 */

// ── Chip filters ─────────────────────────────────────────────────────────────

export type ChipOption = {
  value: string;
  label: string;
  /** Small right-hand note in the menu — a count, or what the option means. */
  hint?: string;
};

export type ChipGroup = {
  key: string;
  /** What the chip says when nothing is picked, e.g. "Status". */
  label: string;
  options: ChipOption[];
  /** Current value; '' (or []) means "not filtering on this". */
  value: string | string[];
  onChange: (value: any) => void;
  /** Several values at once (a checklist) instead of one. */
  multiple?: boolean;
  /** One line explaining the whole group, shown at the top of its menu. */
  help?: string;
};

const CHIP_BASE =
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
const CHIP_OFF = 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink';
const CHIP_ON = 'border-brand bg-brand/10 text-brand-700';

function asArray(v: string | string[]): string[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

/** One chip: the group's label when idle, the chosen option(s) when active. */
const Chip: React.FC<{ group: ChipGroup }> = ({ group }) => {
  const picked = asArray(group.value);
  const active = picked.length > 0;
  const chosen = group.options.filter((o) => picked.includes(o.value));
  const text = !active
    ? group.label
    : chosen.length === 1
      ? `${group.label}: ${chosen[0]?.label ?? picked[0]}`
      : `${group.label}: ${chosen.length}`;

  const toggle = (value: string) => {
    if (!group.multiple) {
      group.onChange(picked[0] === value ? '' : value);
      return;
    }
    group.onChange(picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(CHIP_BASE, active ? CHIP_ON : CHIP_OFF)}>
          <span className="max-w-[16rem] truncate">{text}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-auto">
        {group.help && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-ink-soft">{group.help}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {active && (
          <>
            <DropdownMenuItem onSelect={() => group.onChange(group.multiple ? [] : '')}>
              <X className="mr-2 h-3.5 w-3.5" /> Clear {group.label.toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {group.options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            // A checklist stays open so several can be ticked; a one-of-these
            // chip closes on the pick, because the answer is complete.
            onSelect={(e) => { if (group.multiple) e.preventDefault(); toggle(o.value); }}
            className="justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check className={cn('h-3.5 w-3.5 shrink-0', picked.includes(o.value) ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{o.label}</span>
            </span>
            {o.hint && <span className="shrink-0 text-xs tabular-nums text-ink-mute">{o.hint}</span>}
          </DropdownMenuItem>
        ))}
        {group.options.length === 0 && (
          <DropdownMenuItem disabled>Nothing to choose from yet</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * The chip row. `groups` with no options are dropped, so a page can declare
 * every chip it could ever show and let the data decide which appear.
 * When anything is set, a "Clear all" appears at the end — a filtered list must
 * always say how to get back.
 */
export const FilterChips: React.FC<{
  groups: ChipGroup[];
  onClearAll?: () => void;
  className?: string;
  /** Rendered after the chips (a column chooser, a toggle…). */
  children?: React.ReactNode;
}> = ({ groups, onClearAll, className, children }) => {
  const shown = groups.filter((g) => g.options.length > 0);
  const anyActive = shown.some((g) => asArray(g.value).length > 0);
  if (!shown.length && !children) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden />
      {shown.map((g) => <Chip key={g.key} group={g} />)}
      {anyActive && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-ink-soft hover:text-ink"
        >
          <X className="h-3 w-3" /> Clear all
        </button>
      )}
      {children}
    </div>
  );
};

// ── Column chooser ───────────────────────────────────────────────────────────

export type ColumnDef = {
  key: string;
  label: string;
  /** Always shown and not offered for hiding (the identity column). */
  always?: boolean;
  /** Hidden until the user asks for it. */
  defaultHidden?: boolean;
};

/**
 * Remember a screen's column choice for THIS viewer. localStorage can throw
 * (private window, blocked site data), so every read and write is guarded and
 * the screen renders correctly when it comes back empty.
 */
export function useColumnChoice(storageKey: string, columns: ColumnDef[]) {
  const initial = useMemo(() => {
    const fallback = columns.filter((c) => c.always || !c.defaultHidden).map((c) => c.key);
    try {
      const raw = localStorage.getItem(`cols:${storageKey}`);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return fallback;
      // Keep only columns that still exist, and never lose a mandatory one.
      const keep = columns.filter((c) => c.always || saved.includes(c.key)).map((c) => c.key);
      return keep.length ? keep : fallback;
    } catch { return fallback; }
  }, [storageKey, columns]);

  const [visible, setVisible] = useState<string[]>(initial);

  const set = (next: string[]) => {
    setVisible(next);
    try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify(next)); } catch { /* per-viewer only */ }
  };
  const toggle = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (col?.always) return;
    set(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);
  };
  const reset = () => {
    const fallback = columns.filter((c) => c.always || !c.defaultHidden).map((c) => c.key);
    set(fallback);
  };
  const shows = (key: string) => visible.includes(key);

  return { visible, shows, toggle, reset, set };
}

export const ColumnChooser: React.FC<{
  columns: ColumnDef[];
  visible: string[];
  onToggle: (key: string) => void;
  onReset?: () => void;
  className?: string;
}> = ({ columns, visible, onToggle, onReset, className }) => {
  const hidden = columns.filter((c) => !c.always && !visible.includes(c.key)).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(CHIP_BASE, hidden ? CHIP_ON : CHIP_OFF, className)} title="Choose which columns to show">
          <Columns3 className="h-3.5 w-3.5" />
          <span>Columns{hidden ? ` (${hidden} hidden)` : ''}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-auto">
        <DropdownMenuLabel className="text-xs font-normal text-ink-soft">Show in the table</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuItem
            key={c.key}
            disabled={c.always}
            onSelect={(e) => { e.preventDefault(); onToggle(c.key); }}
            className="gap-2"
          >
            <Check className={cn('h-3.5 w-3.5 shrink-0', visible.includes(c.key) ? 'opacity-100' : 'opacity-0')} />
            <span className="truncate">{c.label}</span>
            {c.always && <span className="ml-auto text-xs text-ink-mute">always</span>}
          </DropdownMenuItem>
        ))}
        {onReset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onReset()}>Reset to the usual columns</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ── Loading skeleton ─────────────────────────────────────────────────────────

/**
 * Grey bars in the shape of the table that is coming, INSIDE the table, so the
 * header, the toolbar and the filters stay on screen while a page loads — a
 * full-page spinner throws the controls away and makes every list feel slower
 * than it is.
 */
export const TableSkeleton: React.FC<{ rows?: number; cols: number; className?: string }> = ({
  rows = 8, cols, className,
}) => (
  <tbody className={className} aria-busy="true">
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} className="border-b border-line/60">
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="px-3 py-2.5">
            <span
              className="block h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${c === 0 ? 55 : 40 + ((r + c) % 4) * 12}%` }}
            />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

/** The same bars for a card/tile area rather than a table. */
export const BlockSkeleton: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
  <div className={cn('space-y-2', className)} aria-busy="true">
    {Array.from({ length: lines }).map((_, i) => (
      <span key={i} className="block h-3 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 15}%` }} />
    ))}
  </div>
);

export default FilterChips;
