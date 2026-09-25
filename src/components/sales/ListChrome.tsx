import React, { useCallback, useEffect, useState } from 'react';
import { Search, Bookmark, BookmarkPlus, X, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import InfoTip from '../common/InfoTip';

/**
 * THE CHROME EVERY LIST ON THE SALES DESK WEARS — defined once.
 *
 * Header (title · one line of purpose · one primary action) · toolbar (search,
 * filter chips, saved views) · honest empty state. Before this each of the
 * eight list pages in this area had its own arrangement of a text input and two
 * native `<select>`s, none of them saying how many rows were on screen and none
 * of them able to say "nothing matches — clear a chip".
 *
 * Nothing here fetches or filters. It is presentation: the page owns its state
 * and its query, exactly as it did.
 */

/** One filter chip. On/off, with a tone for the ones that mean trouble. */
export const FilterChip: React.FC<{
  on: boolean;
  tone?: 'warn' | 'bad' | 'good';
  onClick: () => void;
  /** A count rendered after the label, when the page knows one. */
  count?: number;
  children: React.ReactNode;
}> = ({ on, tone, onClick, count, children }) => {
  const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';
  const off = tone === 'bad' ? 'border-line bg-surface text-bad-ink hover:border-bad'
    : tone === 'warn' ? 'border-line bg-surface text-warn-ink hover:border-warn'
    : tone === 'good' ? 'border-line bg-surface text-good-ink hover:border-good'
    : 'border-line bg-surface text-ink-soft hover:border-line-strong';
  const active = tone === 'bad' ? 'border-bad bg-bad-bg text-bad-ink'
    : tone === 'warn' ? 'border-warn bg-warn-bg text-warn-ink'
    : tone === 'good' ? 'border-good bg-good-bg text-good-ink'
    : 'border-brand bg-brand-soft text-ink';
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${base} ${on ? active : off}`}>
      {children}
      {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );
};

/** The search box, one shape and one placeholder style across the desk. */
export const SearchBox: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}> = ({ value, onChange, placeholder, label, className = 'w-80' }) => (
  <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-ring"
    />
    {value && (
      <button type="button" aria-label="Clear the search" onClick={() => onChange('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-mute hover:text-ink">
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

/** A page header: what this is, what it is for, and the one thing to do on it. */
export const ListHeader: React.FC<{
  title: string; purpose: string; action?: React.ReactNode; aside?: React.ReactNode;
}> = ({ title, purpose, action, aside }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-0.5 max-w-2xl text-sm text-ink-soft">{purpose}</p>
    </div>
    <div className="flex items-center gap-2">{aside}{action}</div>
  </div>
);

/** Nothing here — and which of the two "nothings" it is. */
export const EmptyRowState: React.FC<{
  /** True when the dataset itself is empty, false when filters hid everything. */
  pristine: boolean;
  noun: string;
  firstLine?: string;
  onClear?: () => void;
}> = ({ pristine, noun, firstLine, onClear }) => (
  <div className="py-8 text-center">
    <p className="text-sm font-medium text-ink">
      {pristine ? `No ${noun} yet` : `Nothing matches those filters`}
    </p>
    <p className="mt-1 text-xs text-ink-soft">
      {pristine ? (firstLine ?? `They will appear here as soon as there are any.`)
        : 'Clear a chip or widen the search.'}
    </p>
    {!pristine && onClear && (
      <Button size="sm" variant="outline" className="mt-2" onClick={onClear}>Clear the filters</Button>
    )}
  </div>
);

/* ── Saved views ─────────────────────────────────────────────────────────── */

export interface SavedView<T> { name: string; filters: T }

/**
 * A filter set somebody uses every morning, kept for them.
 *
 * `localStorage`, per page key, per browser — deliberately. It is a
 * convenience, not shared state, and every read/write is wrapped because a
 * private window and blocked site data both make these throw.
 */
export function useSavedViews<T>(pageKey: string) {
  const storeKey = `admin.views.${pageKey}`;
  const [views, setViews] = useState<SavedView<T>[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setViews(parsed.slice(0, 12));
    } catch { /* no saved views is a fine state */ }
  }, [storeKey]);

  const persist = useCallback((next: SavedView<T>[]) => {
    setViews(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next.slice(0, 12))); } catch { /* ignore */ }
  }, [storeKey]);

  const save = useCallback((name: string, filters: T) => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    setViews((prev) => {
      const next = [...prev.filter((v) => v.name !== clean), { name: clean, filters }].slice(-12);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storeKey]);

  const remove = useCallback((name: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.name !== name);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storeKey]);

  return { views, save, remove, persist };
}

/** The saved-view strip: apply one, or keep the filters on screen as a new one. */
export function SavedViewBar<T>({ views, current, onApply, onSave, onRemove }: {
  views: SavedView<T>[];
  current: T;
  onApply: (f: T) => void;
  onSave: (name: string, f: T) => void;
  onRemove: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-mute">
        <Bookmark className="h-3 w-3" /> Views
        <InfoTip text="A filter set you use often, kept in this browser. It is a shortcut for you, not something the rest of the team sees." />
      </span>
      {views.map((v) => (
        <span key={v.name} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface">
          <button type="button" onClick={() => onApply(v.filters)}
            className="px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-brand-soft hover:text-ink">
            {v.name}
          </button>
          <button type="button" aria-label={`Forget the view ${v.name}`} onClick={() => onRemove(v.name)}
            className="border-l border-line px-1.5 py-1 text-ink-mute hover:text-bad">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onSave(name, current); setName(''); setNaming(false); }
              if (e.key === 'Escape') { setName(''); setNaming(false); }
            }}
            placeholder="Name this view"
            aria-label="Name this view"
            className="h-7 w-40 rounded-md border border-input bg-surface px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Save the view"
            onClick={() => { onSave(name, current); setName(''); setNaming(false); }}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft"
          onClick={() => setNaming(true)}>
          <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Save this view
        </Button>
      )}
    </div>
  );
}

/**
 * THE TAB STRIP a list wears when its rows split along an axis staff switch
 * between all day — where the sale came from, and which price book priced it.
 *
 * A dropdown is the right control for a filter you set occasionally (Status,
 * Date, Payment). It is the wrong one for a dimension somebody flips between on
 * every visit: it costs two clicks, hides which values exist, and gives no sense
 * of the shape of the data. Those belong on the surface, as tabs.
 *
 * ⚠️ GROUPS ARE INDEPENDENT, AND THAT IS THE POINT. Channel and type are
 * ORTHOGONAL — a counter sale to a wholesale account is both `pos` and `b2b`
 * (COMMON_MISTAKES #229: `order_type` is the PRICE SCOPE, `sales_channel` is the
 * PLACE, and conflating them is what migration 162 had to undo). So more than
 * one tab can be lit at once, and `startsGroup` draws the rule that says these
 * are two questions rather than one list of alternatives. A control that forced
 * a single choice would make "B2B orders taken at the counter" unaskable.
 */
export interface SegmentTab {
  key: string;
  label: string;
  on: boolean;
  onPick: () => void;
  /** Hover explanation — what this tab actually narrows to. */
  title?: string;
  /** Draw a divider before this tab: it opens a new, independent group. */
  startsGroup?: boolean;
}

export const SegmentTabs: React.FC<{ tabs: SegmentTab[]; ariaLabel: string }> = ({ tabs, ariaLabel }) => {
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" aria-label={ariaLabel}
      className="-mb-px flex flex-wrap items-center gap-x-0.5 border-b border-line">
      {tabs.map((t) => (
        <React.Fragment key={t.key}>
          {t.startsGroup && <span aria-hidden className="mx-2 h-4 w-px shrink-0 bg-line" />}
          <button
            type="button"
            role="tab"
            aria-selected={t.on}
            title={t.title}
            onClick={t.onPick}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              t.on
                ? 'border-brand font-semibold text-ink'
                : 'border-transparent font-medium text-ink-soft hover:border-line-strong hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

/**
 * One filter dimension as ONE chip: "Status", or "Status: Shipped" once set,
 * opening its values. T5 converges every list's chips into
 * `components/list/FilterChips` (Prompt 9 §5.2).
 */
export function MenuChip({ name, value, options, current, onPick, hint }: {
  name: string;
  value?: string;
  options: ReadonlyArray<readonly [string, string]>;
  current: string;
  onPick: (v: string | null) => void;
  hint?: string;
}) {
  const on = !!value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-pressed={on} title={hint}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            on ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-surface text-ink-soft hover:border-line-strong'}`}>
          {name}{on && <span className="font-semibold">: {value}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {options.map(([k, l]) => (
          <DropdownMenuItem key={k} onClick={() => onPick(current === k ? null : k)}>
            <Check className={`mr-2 h-3.5 w-3.5 ${current === k ? 'opacity-100' : 'opacity-0'}`} /> {l}
          </DropdownMenuItem>
        ))}
        {on && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onPick(null)} className="text-ink-soft">Any {name.toLowerCase()}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
