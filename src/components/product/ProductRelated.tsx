import React, { useState, useRef, useEffect } from 'react';
import { productsAPI } from '../../services/api';

interface RelatedProduct { id: string; _id?: string; name: string; slug?: string; images?: string[] }

interface ProductRelatedProps {
  crossSellIds: string[];
  upsellIds: string[];
  fbtIds: string[];
  onCrossSellChange: (ids: string[]) => void;
  onUpsellChange: (ids: string[]) => void;
  onFbtChange: (ids: string[]) => void;
  currentProductId?: string;
}

const useProductSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await productsAPI.getAll({ search: query, limit: 10 });
        const list: any[] = Array.isArray(res) ? res : (res?.data || []);
        setResults(list.map((p: any) => ({ id: p.id || p._id, name: p.name, slug: p.slug, images: p.images })));
      } catch { setResults([]); } finally { setLoading(false); }
    }, 350);
  }, [query]);

  return { query, setQuery, results, loading };
};

const ProductSearchPicker: React.FC<{
  label: string;
  description: string;
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  currentProductId?: string;
}> = ({ label, description, selectedIds, onAdd, onRemove, currentProductId }) => {
  const { query, setQuery, results, loading } = useProductSearch();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredResults = results.filter(r => r.id !== currentProductId && !selectedIds.includes(r.id));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map(id => (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <span className="font-mono text-blue-500">{id.slice(0, 8)}…</span>
              <button type="button" onClick={() => onRemove(id)} className="text-blue-400 hover:text-red-500 ml-0.5">✕</button>
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search products to add…"
          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {open && (query || loading) && (
          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {loading && <p className="px-3 py-2 text-xs text-gray-400">Searching…</p>}
            {!loading && filteredResults.length === 0 && query && (
              <p className="px-3 py-2 text-xs text-gray-400">No products found for "{query}"</p>
            )}
            {filteredResults.map(product => (
              <button key={product.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onAdd(product.id); setQuery(''); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
                {product.images?.[0] ? (
                  <img src={product.images[0]} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded shrink-0" />
                )}
                <span className="text-sm text-gray-800 truncate">{product.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ProductRelated: React.FC<ProductRelatedProps> = ({
  crossSellIds, upsellIds, fbtIds,
  onCrossSellChange, onUpsellChange, onFbtChange,
  currentProductId,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Related Products</h2>
      <p className="text-xs text-gray-500 mb-4">Boost AOV by linking related products. Search by name.</p>

      <div className="divide-y divide-gray-100">
        <div className="pb-4">
          <ProductSearchPicker
            label="Cross-sells"
            description="Suggested on cart page as complementary purchases"
            selectedIds={crossSellIds}
            onAdd={id => onCrossSellChange([...crossSellIds, id])}
            onRemove={id => onCrossSellChange(crossSellIds.filter(x => x !== id))}
            currentProductId={currentProductId}
          />
        </div>
        <div className="py-4">
          <ProductSearchPicker
            label="Upsells"
            description="Suggested on product page as premium alternatives"
            selectedIds={upsellIds}
            onAdd={id => onUpsellChange([...upsellIds, id])}
            onRemove={id => onUpsellChange(upsellIds.filter(x => x !== id))}
            currentProductId={currentProductId}
          />
        </div>
        <div className="pt-4">
          <ProductSearchPicker
            label="Frequently Bought Together"
            description="Shown as a bundle recommendation on the product page"
            selectedIds={fbtIds}
            onAdd={id => onFbtChange([...fbtIds, id])}
            onRemove={id => onFbtChange(fbtIds.filter(x => x !== id))}
            currentProductId={currentProductId}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductRelated;
