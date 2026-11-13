import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productsAPI } from '../../services/api';

interface Hit { id: string; name: string; active: boolean }

/** The first two words of a name: close enough to find "Calcarea Phosphorica" from "Calcarea Phosphorica 6X Tablet". */
const searchTerm = (name: string): string => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');

/**
 * One page per product (owner, 5 Nov 2026): while a NEW product is being named, the pages whose
 * names start the same way, so another pack, size or potency goes onto its page as a variation
 * instead of becoming a second page. The server already refuses an identical address (409); this
 * catches the near ones. Advice only: nothing is blocked.
 */
const SimilarProductsNote: React.FC<{ name: string }> = ({ name }) => {
  const query = searchTerm(name);
  const [found, setFound] = useState<{ query: string; hits: Hit[] }>({ query: '', hits: [] });

  useEffect(() => {
    if (query.length < 4) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const res: any = await productsAPI.getAll({ search: query, limit: 5 });
        const list: any[] = Array.isArray(res) ? res : (res?.data?.data || res?.data || []);
        const hits = list
          .map((p) => ({ id: String(p?._id ?? p?.id ?? ''), name: String(p?.name ?? ''), active: p?.isActive !== false && p?.is_active !== false }))
          .filter((h) => h.id && h.name);
        if (alive) setFound({ query, hits });
      } catch {
        if (alive) setFound({ query, hits: [] });
      }
    }, 500);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query]);

  const hits = query.length >= 4 && found.query === query ? found.hits : [];
  if (hits.length === 0) return null;

  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{hits.length === 1 ? 'A page with a similar name exists.' : 'Pages with a similar name exist.'}</p>
      <p className="mt-0.5 text-amber-800">
        One page per product: if this is another pack, size or potency, open the page and add it there as a variation.
      </p>
      <ul className="mt-2 space-y-1">
        {hits.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-2">
            <Link to={`/products/${h.id}/edit`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 break-all">{h.name}</Link>
            {!h.active && <span className="text-xs text-amber-700">(inactive)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SimilarProductsNote;
