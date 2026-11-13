import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Search, X } from 'lucide-react';
import { attributeValuesAPI, brandsAPI, categoriesAPI } from '@/services/api';
import { cn } from '@/lib/utils';

/**
 * CatalogItemPicker (HMAPP design 60, request A2): pick catalogue items BY ID, many, in order,
 * from the store's own ACTIVE brands, categories or product form values. Built from the review
 * ProductPicker's typeahead (`components/reviews/ProductPicker.tsx`); no name is ever typed into
 * a saved document, only the catalogue's ids.
 *
 * Sources, each the admin's existing read:
 *   brand     `brandsAPI.list({ active: true })`          (GET /public/brands)
 *   category  `categoriesAPI.list()`                      (GET /public/categories: active, public)
 *   form      `attributeValuesAPI.getByAttributeSlug('product-form', { isActive: true })`
 *             (the catalogue's form attribute, the same slug Products.tsx filters on)
 *
 * A saved id the active list no longer has shows "No longer active, remove it" (the server
 * refuses it on save, naming the field).
 */

export type CatalogKind = 'brand' | 'category' | 'form';

export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  /** A category's parent id (categories only). */
  parent: string | null;
}

/** The catalogue's form attribute (the slug the storefront's form pages and Products.tsx use). */
const FORM_ATTRIBUTE = 'product-form';

const cache = new Map<CatalogKind, Promise<CatalogItem[]>>();

function rowsOf(r: any): any[] {
  if (Array.isArray(r)) return r;
  for (const k of ['data', 'brands', 'categories', 'items']) {
    const v = r?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') { const inner = rowsOf(v); if (inner.length) return inner; }
  }
  return [];
}

async function fetchKind(kind: CatalogKind): Promise<CatalogItem[]> {
  const raw = kind === 'brand'
    ? await brandsAPI.list({ active: true })
    : kind === 'category'
      ? await categoriesAPI.list()
      : await attributeValuesAPI.getByAttributeSlug(FORM_ATTRIBUTE, { isActive: true });
  return rowsOf(raw)
    .filter((r: any) => r && r.is_active !== false && r.isActive !== false)
    .map((r: any): CatalogItem => ({
      id: String(r.id ?? r._id ?? ''),
      name: String(r.name ?? r.label ?? r.slug ?? ''),
      kind,
      parent: kind === 'category' && (r.parent ?? r.parent_id) ? String(r.parent ?? r.parent_id) : null,
    }))
    .filter((x) => x.id && x.name);
}

/** The active items of one kind, read once per page life (a failed read can be tried again). */
export function useCatalogItems(kind: CatalogKind): { items: CatalogItem[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ items: CatalogItem[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null });
  useEffect(() => {
    let live = true;
    let p = cache.get(kind);
    if (!p) { p = fetchKind(kind); cache.set(kind, p); }
    setState((s) => ({ ...s, loading: true, error: null }));
    p.then((items) => { if (live) setState({ items, loading: false, error: null }); })
      .catch(() => {
        cache.delete(kind);
        if (live) setState({ items: [], loading: false, error: 'The catalogue list could not be read.' });
      });
    return () => { live = false; };
  }, [kind]);
  return state;
}

/** Every category id under (and including) each root, from the parent links. */
export function categorySubtree(items: CatalogItem[], roots: Iterable<string>): Set<string> {
  const kids = new Map<string, string[]>();
  for (const c of items) if (c.parent) { const k = String(c.parent); kids.set(k, [...(kids.get(k) ?? []), c.id]); }
  const out = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const k of kids.get(id) ?? []) stack.push(k);
  }
  return out;
}

/** "Parent / Child" for a category, the name for anything else. */
function pathName(item: CatalogItem, byId: Map<string, CatalogItem>): string {
  if (item.kind !== 'category') return item.name;
  const parts = [item.name];
  let cur = item.parent ? byId.get(String(item.parent)) : undefined;
  let guard = 0;
  while (cur && guard++ < 8) { parts.unshift(cur.name); cur = cur.parent ? byId.get(String(cur.parent)) : undefined; }
  return parts.join(' / ');
}

/** The words for each catalogue kind (also the app answers' interest headings). */
export const KIND_WORDS: Record<CatalogKind, string> = { brand: 'brand', category: 'category', form: 'product form' };

export const CatalogItemPicker: React.FC<{
  kind: CatalogKind;
  /** The chosen ids, in the order shown. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Ids never offered (for example the hidden category subtrees). */
  exclude?: Set<string>;
  max?: number;
  disabled?: boolean;
  label?: string;
  /** Show the order controls (lists the app shows in order). */
  ordered?: boolean;
  /** Extra words on each chosen row (for example its rate). */
  renderExtra?: (id: string) => React.ReactNode;
}> = ({ kind, value, onChange, exclude, max, disabled, label, ordered = true, renderExtra }) => {
  const { items, loading, error } = useCatalogItems(kind);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = React.useId();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const chosen = new Set(value);
  const term = q.trim().toLowerCase();
  const results = term.length < 1 ? [] : items
    .filter((i) => !chosen.has(i.id) && !exclude?.has(i.id))
    .map((i) => ({ i, name: pathName(i, byId) }))
    .filter((x) => x.name.toLowerCase().includes(term))
    .slice(0, 12);
  const full = max !== undefined && value.length >= max;

  const add = (id: string) => { if (!full) onChange([...value, id]); setQ(''); setOpen(false); };
  const move = (idx: number, by: number) => {
    const next = value.slice();
    const to = idx + by;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange(next);
  };
  const remove = (id: string) => onChange(value.filter((x) => x !== id));

  return (
    <div className="space-y-2" ref={boxRef}>
      {label && <div className="text-xs font-medium text-gray-600">{label}</div>}
      {value.length > 0 && (
        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {value.map((id, idx) => {
            const it = byId.get(id);
            const gone = !loading && !error && !it;
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {ordered && <span className="w-6 text-right tabular-nums text-xs text-gray-400">{idx + 1}</span>}
                <span className={cn('min-w-0 flex-1 break-words', gone ? 'text-amber-800' : 'text-gray-900')}>
                  {it ? pathName(it, byId) : gone ? 'No longer active, remove it' : 'Loading'}
                  {gone && <span className="ml-2 font-mono text-xs text-gray-500">{id}</span>}
                </span>
                {renderExtra?.(id)}
                {ordered && (
                  <>
                    <button type="button" disabled={disabled || idx === 0} onClick={() => move(idx, -1)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`Move ${it?.name ?? 'item'} up`}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={disabled || idx === value.length - 1} onClick={() => move(idx, 1)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label={`Move ${it?.name ?? 'item'} down`}>
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button type="button" disabled={disabled} onClick={() => remove(id)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-30" aria-label={`Remove ${it?.name ?? 'item'}`}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="text"
          value={q}
          disabled={disabled || full || loading || !!error}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); add(results[hi].i.id); }
            if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-label={`Add a ${KIND_WORDS[kind]}`}
          placeholder={full ? `At most ${max}` : `Type a ${KIND_WORDS[kind]} name to add it`}
          className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-8 text-sm shadow-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />}
        {open && term.length > 0 && (
          <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {results.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-500">No active {KIND_WORDS[kind]} matches that.</li>}
            {results.map((r, i) => (
              <li key={r.i.id} role="option" aria-selected={i === hi}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => add(r.i.id)}
                  className={cn('block w-full px-3 py-2 text-left text-sm', i === hi ? 'bg-gray-100' : 'hover:bg-gray-50')}>
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
};

export default CatalogItemPicker;
