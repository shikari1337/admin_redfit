import React, { useMemo, useState } from 'react';
import { Images, Ruler, Info, RefreshCw } from 'lucide-react';
import MediaLibraryBrowser from '../components/common/MediaLibraryBrowser';
import { useImageSpecs, specHint } from '../lib/imageSpecs';

/**
 * Media library — the store's bucket as it really is.
 *
 * The previous "Gallery" kept its list in localStorage: it only ever showed
 * files uploaded from that one browser and never the ~48,000 product photos,
 * brand logos, banners or AI outputs already in the store's folder. This page
 * browses the bucket itself (folders, paging, search) through the same
 * component every image picker uses, and the second tab prints the size every
 * image slot needs for THIS store's frontend — the reference staff and the AI
 * generator both work from.
 */
const ENTITY_LABELS: Record<string, string> = {
  product: 'Products', category: 'Categories', brand: 'Brands', home: 'Home page', page: 'Pages', blog: 'Blog',
  store: 'Store identity', attribute: 'Attributes', menu: 'Menus', trust: 'Trust badges', bundle: 'Bundles', size_chart: 'Size charts', section: 'Product page sections', generic: 'Other',
};

const Gallery: React.FC = () => {
  const [tab, setTab] = useState<'library' | 'sizes'>('library');
  const { resolution, loading, reload } = useImageSpecs();
  const grouped = useMemo(() => {
    const g: Record<string, typeof resolution extends null ? never : NonNullable<typeof resolution>['specs']> = {} as any;
    for (const s of resolution?.specs || []) (g[s.entity] ||= []).push(s);
    return g;
  }, [resolution]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media library</h1>
          <p className="text-sm text-gray-500">Every image and video in this store’s storage — folders, search, upload, and the size each place on the website needs.</p>
        </div>
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5">
          <button type="button" onClick={() => setTab('library')} className={`inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded ${tab === 'library' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'}`}><Images size={14} /> Library</button>
          <button type="button" onClick={() => setTab('sizes')} className={`inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded ${tab === 'sizes' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'}`}><Ruler size={14} /> Image sizes</button>
        </div>
      </div>

      {tab === 'library' ? (
        <MediaLibraryBrowser mode="manager" accept="all" height="calc(100vh - 220px)" uploadFolder="uploads" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm text-gray-800 flex items-start gap-2">
            <Info size={16} className="text-brand-600 mt-0.5 shrink-0" />
            <div>
              <p>These are the sizes this store’s website actually renders — the same numbers every image field shows and the AI image generator produces. Frontend: <b>{resolution?.frontendLabel || '…'}</b>{resolution?.themeName ? ` · theme “${resolution.themeName}”` : ''}.</p>
              <p className="text-xs text-gray-600 mt-1">A custom-built website that renders a slot differently can override it in Settings ▸ Appearance ▸ <b>Image sizes (11.8)</b>; a Liquid theme declares its own sizes in its settings schema.</p>
            </div>
            <button type="button" onClick={reload} className="ml-auto inline-flex items-center gap-1 h-7 px-2 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 shrink-0" title="Reload"><RefreshCw size={12} /> Refresh</button>
          </div>
          {loading && !resolution && <p className="text-sm text-gray-500">Loading…</p>}
          {Object.entries(grouped).map(([entity, specs]) => (
            <div key={entity} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">{ENTITY_LABELS[entity] || entity}</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500"><th className="px-4 py-2 font-medium">Slot</th><th className="px-4 py-2 font-medium">Needs</th><th className="px-4 py-2 font-medium hidden md:table-cell">Where it shows</th><th className="px-4 py-2 font-medium hidden lg:table-cell">Other frontends</th><th className="px-4 py-2 font-medium hidden md:table-cell">Key</th></tr></thead>
                <tbody>
                  {(specs as any[]).map((s) => (
                    <tr key={s.key} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-2"><div className="font-medium text-gray-900">{s.label}</div><div className="text-xs text-gray-500">{s.description}</div></td>
                      <td className="px-4 py-2 whitespace-nowrap"><div className="text-gray-900">{s.width} × {s.height} px <span className="text-gray-400">({s.aspect})</span></div><div className="text-xs text-gray-500">{specHint(s).split(' · ').slice(1).join(' · ')}{s.fit === 'cover' ? ' · edges may crop' : ' · shown whole'}</div>{s.source === 'override' && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">store override</span>}{s.source === 'theme' && <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-1">from theme</span>}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 hidden md:table-cell">{s.uses || '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 hidden lg:table-cell">{s.others.length ? s.others.map((o: any) => `${o.frontend}: ${o.width}×${o.height}`).join(' · ') : '—'}</td>
                      <td className="px-4 py-2 text-[11px] font-mono text-gray-400 hidden md:table-cell">{s.key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Gallery;
