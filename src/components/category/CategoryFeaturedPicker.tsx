/**
 * CategoryFeaturedPicker — choose which products hold the first slots of a
 * category's storefront listing (migration 119).
 *
 * Two ways to fill the shelf, mirroring the backend's `featured_mode`:
 *   manual — pick exact products and order them by hand
 *   brand  — pick brands; the slots auto-fill with those brands' products in
 *            this category and stay full as the catalogue changes
 *
 * The shelf applies to the category's DEFAULT order only. Once a shopper sorts
 * by price or searches, their intent wins — stated in the UI so a merchant
 * isn't left wondering why their placement "disappeared".
 */
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, GripVertical, ArrowUp, ArrowDown, Loader2, Store, ListOrdered, CircleSlash } from 'lucide-react';
import { searchAPI, brandsAPI, productsAPI } from '../../services/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type FeaturedMode = 'off' | 'manual' | 'brand';

export interface FeaturedValue {
  mode: FeaturedMode;
  productIds: string[];
  brandIds: string[];
  limit: number;
}

interface Props {
  value: FeaturedValue;
  onChange: (v: FeaturedValue) => void;
  /** Resolves ids → names so a saved shelf shows products, not raw UUIDs. */
  categoryName?: string;
}

interface PickedProduct { id: string; name: string; sku?: string; image?: string }

const MODES: { key: FeaturedMode; label: string; hint: string; icon: React.ElementType }[] = [
  { key: 'off', label: 'Default order', hint: 'No pinning — the usual A→Z order', icon: CircleSlash },
  { key: 'manual', label: 'Pick products', hint: 'Choose exact products and their order', icon: ListOrdered },
  { key: 'brand', label: 'Pick brands', hint: 'Auto-fill the slots from chosen brands', icon: Store },
];

export const CategoryFeaturedPicker: React.FC<Props> = ({ value, onChange, categoryName }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedProduct[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const debounce = useRef<any>(null);

  const set = (patch: Partial<FeaturedValue>) => onChange({ ...value, ...patch });

  // Brand options for 'brand' mode.
  useEffect(() => {
    brandsAPI.list({ active: true })
      .then((r: any) => {
        const rows = r?.data?.brands ?? r?.data ?? r ?? [];
        setBrands(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setBrands([]));
  }, []);

  /**
   * Hydrate saved ids into real products. Without this an existing shelf renders
   * as a column of UUIDs — the merchant cannot tell what they pinned, which is
   * the difference between an editor and a database viewer.
   */
  useEffect(() => {
    const ids = value.productIds ?? [];
    if (!ids.length) { setPicked([]); return; }
    // Already hydrated (and in the same order)? Nothing to do.
    if (picked.length === ids.length && picked.every((p, i) => p.id === ids[i])) return;

    let cancelled = false;
    setHydrating(true);
    Promise.all(
      ids.map((id) =>
        productsAPI.getById(id)
          .then((r: any) => {
            const p = r?.data?.product ?? r?.data ?? r ?? {};
            return {
              id,
              name: p.name ?? p.title ?? '(deleted product)',
              sku: p.sku,
              image: Array.isArray(p.images) ? p.images[0] : undefined,
            } as PickedProduct;
          })
          // A pinned product that was later deleted must not break the editor.
          .catch(() => ({ id, name: '(deleted product)' } as PickedProduct)),
      ),
    ).then((rows) => { if (!cancelled) { setPicked(rows); setHydrating(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.productIds]);

  // Debounced product search (unified search service — never ad-hoc filtering).
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < searchAPI.MIN_LENGTH) { setResults([]); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      // The unified search service returns { id, label, sublabel, type } —
      // `sublabel` carries the SKU, and there is no image on this payload.
      const rows = await searchAPI.query('product', query.trim(), 10);
      setResults(
        (rows as any[]).map((r) => ({
          id: String(r.id ?? r._id ?? r.product_id),
          name: r.label ?? r.name ?? r.title ?? '(unnamed)',
          sku: r.sublabel ?? r.sku,
          image: r.image ?? r.image_url,
        })),
      );
      setSearching(false);
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const addProduct = (p: PickedProduct) => {
    if (value.productIds.includes(p.id)) return;
    if (value.productIds.length >= value.limit) return;
    set({ productIds: [...value.productIds, p.id] });
    setPicked((cur) => [...cur, p]);
    setQuery(''); setResults([]);
  };

  const removeProduct = (id: string) => {
    set({ productIds: value.productIds.filter((x) => x !== id) });
    setPicked((cur) => cur.filter((p) => p.id !== id));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.productIds.length) return;
    const ids = [...value.productIds];
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    set({ productIds: ids });
    setPicked((cur) => { const c = [...cur]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; });
  };

  const toggleBrand = (id: string) => {
    const has = value.brandIds.includes(id);
    set({ brandIds: has ? value.brandIds.filter((b) => b !== id) : [...value.brandIds, id] });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Featured products {categoryName ? `in ${categoryName}` : ''}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Reserve the first slots of this category's storefront listing. Applies to the
          category's default order — if a shopper sorts by price or searches, their choice wins.
        </p>
      </div>

      {/* Mode switch */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = value.mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => set({ mode: m.key })}
              className={`text-left rounded-lg border p-3 transition-colors ${
                active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-sm">
                <Icon className="h-4 w-4" /> {m.label}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{m.hint}</p>
            </button>
          );
        })}
      </div>

      {value.mode !== 'off' && (
        <div className="space-y-2">
          <Label htmlFor="featuredLimit">Number of slots</Label>
          <Input
            id="featuredLimit"
            type="number"
            min={1}
            max={50}
            value={value.limit}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ limit: Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 10 });
            }}
            className="w-28"
          />
          <p className="text-[11px] text-muted-foreground">Between 1 and 50. Default 10.</p>
        </div>
      )}

      {/* ── MANUAL ─────────────────────────────────────────────────────────── */}
      {value.mode === 'manual' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Add a product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search products (min ${searchAPI.MIN_LENGTH} characters)…`}
                className="pl-9"
                disabled={value.productIds.length >= value.limit}
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {value.productIds.length >= value.limit && (
              <p className="text-[11px] text-amber-600">
                All {value.limit} slots are full — remove one, or raise the slot count, to add another.
              </p>
            )}
            {results.length > 0 && (
              <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                {results.map((r) => {
                  const already = value.productIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={already}
                      onClick={() => addProduct(r)}
                      className="w-full flex items-center gap-3 p-2 text-left hover:bg-muted/60 disabled:opacity-50"
                    >
                      {r.image
                        ? <img src={r.image} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                        : <div className="h-8 w-8 rounded bg-muted shrink-0" />}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{r.name}</span>
                        {r.sku && <span className="block truncate text-[11px] text-muted-foreground">{r.sku}</span>}
                      </span>
                      {already && <Badge variant="secondary" className="text-[10px]">Added</Badge>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Shelf order{' '}
              <span className="text-muted-foreground font-normal">
                ({value.productIds.length}/{value.limit})
              </span>
            </Label>
            {hydrating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading pinned products…
              </div>
            ) : picked.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No products pinned yet — search above to fill the shelf.
              </p>
            ) : (
              <ul className="rounded-md border divide-y">
                {picked.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 p-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className="shrink-0 w-7 justify-center">{i + 1}</Badge>
                    {p.image
                      ? <img src={p.image} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      : <div className="h-8 w-8 rounded bg-muted shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm">{p.name}</span>
                      {p.sku && <span className="block truncate text-[11px] text-muted-foreground">{p.sku}</span>}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => move(i, i + 1)} disabled={i === picked.length - 1} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                      onClick={() => removeProduct(p.id)} aria-label="Remove">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── BRAND ──────────────────────────────────────────────────────────── */}
      {value.mode === 'brand' && (
        <div className="space-y-2">
          <Label>Brands to feature</Label>
          <p className="text-[11px] text-muted-foreground">
            The top {value.limit} slots fill with these brands' products in this category —
            in-stock first, then A→Z. No upkeep as the catalogue changes.
          </p>
          {brands.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No brands found.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto rounded-md border p-3">
              {brands.map((b: any) => {
                const id = String(b._id ?? b.id);
                const on = value.brandIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleBrand(id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
          {value.brandIds.length === 0 && (
            <p className="text-[11px] text-amber-600">
              Pick at least one brand — with none selected nothing is featured.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryFeaturedPicker;
