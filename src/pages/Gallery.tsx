import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Images, Ruler, Info, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import MediaLibraryBrowser from '../components/common/MediaLibraryBrowser';
import { useImageSpecs, specFileHint, type ImageSpec } from '../lib/imageSpecs';

/**
 * Media library: the store's bucket as it really is.
 *
 * The first tab browses the bucket itself (folders, paging, search, upload, and where a file is
 * used before it is deleted) through the same component every image picker uses. The second tab
 * prints the size every image slot needs for THIS store's frontend: the reference staff and the
 * AI generator both work from (GET /api/v2/commerce/public/media/image-specs).
 */
const ENTITY_LABELS: Record<string, string> = {
  product: 'Products', category: 'Categories', brand: 'Brands', home: 'Home page', page: 'Pages', blog: 'Blog',
  store: 'Store identity', attribute: 'Attributes', menu: 'Menus', trust: 'Trust badges', bundle: 'Bundles', size_chart: 'Size charts', section: 'Product page sections', generic: 'Other',
};

const Gallery: React.FC = () => {
  const [tab, setTab] = useState<'library' | 'sizes'>('library');
  const { resolution, loading, error, reload } = useImageSpecs();
  const grouped = useMemo(() => {
    const g: Record<string, ImageSpec[]> = {};
    for (const s of resolution?.specs || []) (g[s.entity] ||= []).push(s);
    return g;
  }, [resolution]);
  const fromWebsite = !resolution?.themeName;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Media library</h1>
          <p className="text-sm text-gray-500">Every image and video in this store's storage. Open a file to copy its link or see where it is used before you delete it.</p>
        </div>
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-100 p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')} className={`inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded ${tab === 'library' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'}`}><Images size={14} /> Library</button>
          <button type="button" role="tab" aria-selected={tab === 'sizes'} onClick={() => setTab('sizes')} className={`inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded ${tab === 'sizes' ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500'}`}><Ruler size={14} /> Image sizes</button>
        </div>
      </div>

      {tab === 'library' ? (
        <MediaLibraryBrowser mode="manager" accept="all" height="calc(100vh - 220px)" uploadFolder="uploads" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm text-gray-800 flex flex-wrap sm:flex-nowrap items-start gap-2">
            <Info size={16} className="text-brand-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>These are the sizes this store's website renders: the same numbers every image field shows and the AI image generator makes. Website: <b>{resolution?.frontendLabel || 'loading'}</b>{resolution?.themeName ? `, theme "${resolution.themeName}"` : ''}.</p>
              <p className="text-xs text-gray-600 mt-1">
                A custom-built website that shows a slot differently can change it in{' '}
                <Link to="/settings?key=imageSpecOverrides" className="text-brand-700 font-medium hover:underline">Settings, Image sizes</Link>.
                A theme declares its own sizes in its settings, and this store's own website publishes them at /image-specs.json.
              </p>
            </div>
            <button type="button" onClick={reload} disabled={loading} className="ml-auto inline-flex items-center gap-1 h-7 px-2 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 shrink-0 disabled:opacity-50" title="Reload the sizes">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
            </button>
          </div>

          {error && !resolution && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2" role="alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">The image sizes could not be loaded.</p>
                <p className="text-xs mt-0.5 break-words">{error}. Image fields show a general 1600 × 900 hint until this loads.</p>
              </div>
              <button type="button" onClick={reload} className="h-7 px-2 text-xs border border-red-300 rounded bg-white hover:bg-red-50 shrink-0">Try again</button>
            </div>
          )}
          {loading && !resolution && !error && (
            <p className="text-sm text-gray-500 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading the sizes</p>
          )}
          {resolution && resolution.specs.length === 0 && (
            <p className="text-sm text-gray-500">No image slots are listed for this store yet.</p>
          )}

          {Object.entries(grouped).map(([entity, specs]) => (
            <div key={entity} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <h2 className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">{ENTITY_LABELS[entity] || entity}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500"><th className="px-4 py-2 font-medium">Slot</th><th className="px-4 py-2 font-medium">Needs</th><th className="px-4 py-2 font-medium hidden md:table-cell">Where it shows</th><th className="px-4 py-2 font-medium hidden lg:table-cell">Other websites</th><th className="px-4 py-2 font-medium hidden md:table-cell">Key</th></tr></thead>
                  <tbody>
                    {specs.map((s) => (
                      <tr key={s.key} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2 min-w-[10rem]"><div className="font-medium text-gray-900">{s.label}</div><div className="text-xs text-gray-500">{s.description}</div></td>
                        <td className="px-4 py-2">
                          <div className="text-gray-900 whitespace-nowrap">{s.width} × {s.height} px <span className="text-gray-400">({s.aspect})</span></div>
                          <div className="text-xs text-gray-500">{specFileHint(s)}, {s.fit === 'cover' ? 'edges may crop' : 'shown whole'}</div>
                          {s.source === 'override' && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">store override</span>}
                          {s.source === 'theme' && <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 rounded px-1">{fromWebsite ? 'from the website' : 'from the theme'}</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 hidden md:table-cell">{s.uses || 'Not stated'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 hidden lg:table-cell">{s.others.length ? s.others.map((o) => `${o.frontend}: ${o.width} × ${o.height}`).join(', ') : 'None'}</td>
                        <td className="px-4 py-2 text-[11px] font-mono text-gray-400 hidden md:table-cell">{s.key}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Gallery;
