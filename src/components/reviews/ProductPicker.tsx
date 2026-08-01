import React from 'react';
import { Search, X, Package, Loader2, Check } from 'lucide-react';
import { productsAPI } from '@/services/api';
import { cn } from '@/lib/utils';

/**
 * "Which product is this review about?"
 *
 * The old Reviews page answered this with a <select> containing every product —
 * unusable against a 44k-SKU catalog, and it only ever loaded the first page, so
 * most products were simply not offerable.
 *
 * This is a debounced typeahead over `productsAPI.searchVariations`, which hits
 * `GET /products?expand=variations&group=none&search=` — i.e. it searches at
 * VARIATION level. That matters: the parent product here is a remedy FAMILY
 * ("Arnica Montana", 52 packs) while the thing a shopper actually bought and
 * reviewed is the pack, and the store's own SKU lives on the variation
 * (COMMON_MISTAKES #58). Picking a result therefore binds product_id AND
 * variation_id.
 */

export interface PickedProduct {
  product_id: string;
  variation_id: string | null;
  name: string;
  sku?: string;
  image?: string;
}

const rowToPick = (r: any): PickedProduct => ({
  // An expand=variations row IS a variation: `id` is the variation id and
  // `product_id`/`productId` points at its parent. A simple (variation-less)
  // product comes back with no product_id — then the row itself is the product.
  product_id: r.product_id || r.productId || r.id,
  variation_id: (r.product_id || r.productId) ? r.id : null,
  name: r.name || r.product_name || 'Unnamed',
  sku: r.sku,
  image: Array.isArray(r.images) ? r.images[0] : (r.image || r.product_image),
});

export const ProductPicker: React.FC<{
  value?: PickedProduct | null;
  onChange: (p: PickedProduct | null) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  error?: string;
}> = ({ value, onChange, label = 'Product', placeholder = 'Search by product name, brand or SKU…', autoFocus, error }) => {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<PickedProduct[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Debounced search. 3-char minimum matches the unified search service.
  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const raw = await productsAPI.searchVariations(term, 12);
        setResults(raw.map(rowToPick));
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (p: PickedProduct) => {
    onChange(p);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(results[highlight]); }
    if (e.key === 'Escape')    { setOpen(false); }
  };

  return (
    <div className="space-y-1.5" ref={boxRef}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5">
          {value.image ? (
            <img src={value.image} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
              <Package className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{value.name}</p>
            <p className="truncate text-xs text-gray-500">
              {value.sku ? `SKU ${value.sku}` : 'No SKU'}
              {value.variation_id ? ' · specific pack' : ' · product level'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear selected product"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={cn(
              'w-full rounded-lg border py-2 pl-9 pr-9 text-sm outline-none transition',
              'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
              error ? 'border-red-300' : 'border-gray-300',
            )}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          )}

          {open && q.trim().length >= 3 && (
            <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {loading && !results.length && (
                <p className="px-3 py-6 text-center text-sm text-gray-500">Searching…</p>
              )}
              {!loading && !results.length && (
                <p className="px-3 py-6 text-center text-sm text-gray-500">
                  No product matches “{q.trim()}”.
                </p>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.product_id}-${r.variation_id ?? 'base'}`}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(r)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    i === highlight ? 'bg-indigo-50' : 'hover:bg-gray-50',
                  )}
                >
                  {r.image ? (
                    <img src={r.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                      <Package className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{r.name}</span>
                    {r.sku && <span className="block truncate text-xs text-gray-500">SKU {r.sku}</span>}
                  </span>
                  {i === highlight && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!value && !error && (
        <p className="text-xs text-gray-400">
          Type at least 3 characters. Results are specific packs, so the review carries the store’s own SKU.
        </p>
      )}
    </div>
  );
};

export default ProductPicker;
