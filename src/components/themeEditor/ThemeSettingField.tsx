import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import ImageInputWithActions from '../common/ImageInputWithActions';
import RichTextEditor from '../common/RichTextEditor';
import { productsAPI } from '../../services/api';
import { ThemeLookups, LookupItem } from './useThemeLookups';

/**
 * One theme schema setting as an input (Theme Customizer). Each Shopify setting type gets the control a
 * shop owner expects, built from the admin's own parts:
 *   image_picker            ImageInputWithActions (Upload, Library, AI, URL), the one image field of the admin
 *   collection(_list)       picked from the store's categories (a theme collection IS a category; its handle is the slug)
 *   product(_list)          searched in the store's products (handle = product slug)
 *   link_list               picked from the store's menus (handle = the menu's location, else its slug, as the theme host reads it)
 *   url                     typed, with the store's own pages, collections and fixed shop links offered as you type
 *   richtext                RichTextEditor (bold, italic, lists, links), the same editor products use
 * The value written is exactly what the theme reads (a URL, a handle, a list of handles, HTML), so a theme
 * built elsewhere keeps working. A setting's `info` shows under its control.
 */

export const inputCls = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400';

const SHOP_LINKS: LookupItem[] = [
  { value: '/', label: 'Home page' },
  { value: '/collections/all', label: 'All products' },
  { value: '/collections', label: 'All collections' },
  { value: '/search', label: 'Search' },
  { value: '/cart', label: 'Bag' },
];

function Help({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-[11px] text-gray-500 mt-1 mb-0 leading-snug">{text}</p>;
}

/** A single pick from a list, with a search box when the list is long. */
function PickOne({ items, value, onChange, placeholder, loading }: {
  items: LookupItem[]; value: string; onChange: (v: string) => void; placeholder: string; loading?: boolean;
}) {
  const known = items.some((i) => i.value === value);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{loading ? 'Loading...' : placeholder}</option>
      {!known && value ? <option value={value}>{value} (not found)</option> : null}
      {items.map((i) => <option key={i.value} value={i.value}>{i.label}{i.hint ? `  (${i.hint})` : ''}</option>)}
    </select>
  );
}

/** An ordered list of picks: chips you can remove and reorder, plus a picker to add more. */
function PickMany({ items, value, onChange, placeholder, limit, loading, hideAdd }: {
  items: LookupItem[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; limit?: number; loading?: boolean; hideAdd?: boolean;
}) {
  const labelOf = (v: string) => items.find((i) => i.value === v)?.label || `${v} (not found)`;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= value.length) return;
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const full = limit !== undefined && value.length >= limit;
  return (
    <div className="space-y-1.5">
      {value.map((v, i) => (
        <div key={v} className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-[12.5px] bg-gray-50">
          <span className="flex-1 truncate">{labelOf(v)}</span>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-gray-500 disabled:opacity-30" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-0.5 text-gray-500 disabled:opacity-30" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="p-0.5 text-red-500" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {!full && !hideAdd && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} className={inputCls}>
          <option value="">{loading ? 'Loading...' : placeholder}</option>
          {items.filter((i) => !value.includes(i.value)).map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
        </select>
      )}
      {full && !hideAdd && <p className="text-[11px] text-gray-500 m-0">This list holds at most {limit}.</p>}
    </div>
  );
}

/** Product search for product and product_list settings: type a name, pick a result. */
function ProductSearch({ onPick, exclude }: { onPick: (item: LookupItem) => void; exclude: string[] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LookupItem[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      productsAPI.getAll({ search: term, limit: 12 })
        .then((res: any) => {
          const rows: any[] = Array.isArray(res) ? res : res?.data?.items || res?.data?.products || res?.products || res?.data || res?.items || [];
          if (alive) setResults((Array.isArray(rows) ? rows : []).map((p: any) => ({ value: String(p.slug || p.handle || ''), label: String(p.name || p.title || p.slug || '') })).filter((p) => p.value));
        })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setBusy(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <div className="relative">
        <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} pl-7`} placeholder="Search products by name" />
      </div>
      {(busy || results.length > 0) && (
        <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white">
          {busy && <p className="text-[12px] text-gray-500 px-2.5 py-1.5 m-0">Searching...</p>}
          {results.filter((r) => !exclude.includes(r.value)).map((r) => (
            <button key={r.value} type="button" onClick={() => { onPick(r); setQ(''); setResults([]); }}
              className="block w-full text-left px-2.5 py-1.5 text-[12.5px] hover:bg-indigo-50">{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ThemeSettingField({ setting, value, onChange, lookups }: {
  setting: any; value: any; onChange: (v: any) => void; lookups: ThemeLookups;
}) {
  const t = setting.type;
  const label = setting.label || setting.id;
  const info: string | undefined = typeof setting.info === 'string' ? setting.info : undefined;
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  const urlOptions = useMemo(() => [
    ...SHOP_LINKS,
    ...lookups.collections.map((c) => ({ value: `/collections/${c.value}`, label: `Collection: ${c.label}` })),
    ...lookups.pages.map((p) => ({ value: `/pages/${p.value}`, label: `Page: ${p.label}` })),
  ], [lookups.collections, lookups.pages]);

  if (t === 'header') return <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 pt-2 mb-0 border-t border-gray-100">{setting.content}</p>;
  if (t === 'paragraph') return <p className="text-[12px] text-gray-500 m-0">{setting.content}</p>;

  const labelEl = <label className="block text-[12.5px] font-semibold text-gray-700 mb-1">{label}</label>;

  switch (t) {
    case 'checkbox':
      return (
        <div>
          <label className="flex items-center justify-between gap-2 text-[13px] font-semibold text-gray-700 cursor-pointer">
            {label}
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
          </label>
          <Help text={info} />
        </div>
      );
    case 'range':
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-2">
            <input type="range" min={setting.min ?? 0} max={setting.max ?? 100} step={setting.step ?? 1}
              value={Number(value ?? setting.default ?? setting.min ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-indigo-600" />
            <span className="text-[12px] text-gray-500 w-14 text-right">{value ?? setting.default}{setting.unit || ''}</span>
          </div>
          <Help text={info} />
        </div>
      );
    case 'select':
    case 'radio':
      return (
        <div>
          {labelEl}
          <select value={value ?? setting.default ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
            {(setting.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Help text={info} />
        </div>
      );
    case 'color':
      return (
        <div>
          {labelEl}
          <div className="flex items-center gap-2">
            <input type="color" value={/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(String(value)) ? value : '#000000'}
              onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border border-gray-300 p-0.5 bg-white" />
            <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="#000000" />
          </div>
          <Help text={info} />
        </div>
      );
    case 'color_background':
      // Shopify accepts gradients here; a native colour input would replace a valid gradient with black on the next save.
      return (
        <div>
          {labelEl}
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="#000000 or linear-gradient(...)" />
          <Help text={info} />
        </div>
      );
    case 'richtext':
      return (
        <div>
          {labelEl}
          <RichTextEditor value={String(value ?? '')} onChange={(html) => onChange(html)} minHeight={110} />
          <Help text={info} />
        </div>
      );
    case 'inline_richtext':
      return (
        <div>
          {labelEl}
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
          <Help text={info || 'One line. Bold and italic tags work here.'} />
        </div>
      );
    case 'textarea':
      return (
        <div>
          {labelEl}
          <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
          <Help text={info} />
        </div>
      );
    case 'html':
    case 'liquid':
      return (
        <div>
          {labelEl}
          <textarea rows={5} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono text-[12px]`} spellCheck={false} />
          <Help text={info || (t === 'html' ? 'HTML code.' : 'Liquid code.')} />
        </div>
      );
    case 'image_picker':
      return (
        <div>
          <ImageInputWithActions value={String(value ?? '')} onChange={(url) => onChange(url)} label={label} folder="theme" hideUrlInput />
          <Help text={info} />
        </div>
      );
    case 'video':
    case 'video_url':
      return (
        <div>
          {labelEl}
          <input type="url" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="https://www.youtube.com/watch?v=... or an uploaded video address" />
          <Help text={info || 'Paste a video address. The theme decides how to show it.'} />
        </div>
      );
    case 'collection':
      return (
        <div>
          {labelEl}
          <PickOne items={lookups.collections} value={String(value ?? '')} onChange={onChange} placeholder="Choose a collection" loading={lookups.loading} />
          <Help text={info || 'Collections are the store categories (Products, Categories).'} />
        </div>
      );
    case 'collection_list':
      return (
        <div>
          {labelEl}
          <PickMany items={lookups.collections} value={Array.isArray(value) ? value : []} onChange={onChange} placeholder="Add a collection" limit={setting.limit} loading={lookups.loading} />
          <Help text={info} />
        </div>
      );
    case 'link_list':
      return (
        <div>
          {labelEl}
          <PickOne items={lookups.menus} value={String(value ?? '')} onChange={onChange} placeholder="Choose a menu" loading={lookups.loading} />
          <Help text={info || 'Menus are edited in Appearance, Menus.'} />
        </div>
      );
    case 'page':
      return (
        <div>
          {labelEl}
          <PickOne items={lookups.pages} value={String(value ?? '')} onChange={onChange} placeholder="Choose a page" loading={lookups.loading} />
          <Help text={info} />
        </div>
      );
    case 'product': {
      const v = String(value ?? '');
      return (
        <div>
          {labelEl}
          {v ? (
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 text-[12.5px] bg-gray-50 mb-1.5">
              <span className="flex-1 truncate">{pickedNames[v] || v}</span>
              <button type="button" onClick={() => onChange('')} className="p-0.5 text-red-500" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
          <ProductSearch exclude={v ? [v] : []} onPick={(p) => { setPickedNames((m) => ({ ...m, [p.value]: p.label })); onChange(p.value); }} />
          <Help text={info} />
        </div>
      );
    }
    case 'product_list': {
      const list: string[] = Array.isArray(value) ? value : [];
      const full = setting.limit !== undefined && list.length >= setting.limit;
      return (
        <div>
          {labelEl}
          <PickMany items={list.map((h) => ({ value: h, label: pickedNames[h] || h }))} value={list} onChange={onChange} placeholder="" hideAdd />
          {full ? <p className="text-[11px] text-gray-500 m-0">This list holds at most {setting.limit}.</p> : <ProductSearch exclude={list} onPick={(p) => { setPickedNames((m) => ({ ...m, [p.value]: p.label })); onChange([...list, p.value]); }} />}
          <Help text={info} />
        </div>
      );
    }
    case 'metaobject_list': {
      const list = Array.isArray(value) ? value.join('\n') : String(value ?? '');
      return (
        <div>
          {labelEl}
          <textarea rows={3} value={list} onChange={(e) => onChange(e.target.value.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean))} className={inputCls} placeholder="One handle per line" />
          <Help text={info} />
        </div>
      );
    }
    case 'number':
      return (
        <div>
          {labelEl}
          <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />
          <Help text={info} />
        </div>
      );
    case 'url': {
      const listId = `url-${setting.id}`;
      return (
        <div>
          {labelEl}
          <input type="text" list={listId} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder="/collections/... or https://..." />
          <datalist id={listId}>{urlOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
          <Help text={info || 'Type or pick a link: your pages and collections are offered as you type. A full web address also works.'} />
        </div>
      );
    }
    default:
      // text, font_picker and any type this editor does not know: plain text keeps the value as the theme wrote it
      return (
        <div>
          {labelEl}
          <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} placeholder={setting.placeholder || ''} />
          <Help text={info || (t === 'font_picker' ? 'Font name as the theme lists it.' : undefined)} />
        </div>
      );
  }
}
