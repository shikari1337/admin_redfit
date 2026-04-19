import React, { useState, useEffect, useCallback } from 'react';
import {
  FaPlus, FaTrash, FaChevronDown, FaChevronUp,
  FaArrowUp, FaArrowDown, FaEdit, FaTimes,
} from 'react-icons/fa';

interface LookupItem { _id: string; name: string; slug: string; }
interface AttributeValue { name: string; slug: string; }
interface AttributeItem { _id: string; name: string; slug: string; values: AttributeValue[]; }

interface MegaLink {
  label: string;
  type: 'link' | 'category' | 'page' | 'brand' | 'attribute';
  target: string;
  url?: string;
  icon?: string;
}

interface MegaColumn {
  title: string;
  links: MegaLink[];
}

interface MegaData {
  isMegaMenu: boolean;
  layout: 'columns' | 'grid' | 'tabs';
  columns: MegaColumn[];
  featuredImage?: string;
  featuredImageLink?: string;
  featuredImageAlt?: string;
}

interface MegaMenuEditorProps {
  megaMenu: any;
  onChange: (megaMenu: any) => void;
  menuItemIndex: number;
  availableCategories?: LookupItem[];
  availablePages?: LookupItem[];
  availableBrands?: LookupItem[];
  availableAttributes?: AttributeItem[];
}

function buildUrl(type: string, target: string): string {
  if (!target) return '#';
  if (type === 'category') return `/category/${target}`;
  if (type === 'page') return `/${target}`;
  if (type === 'brand') return `/brand/${target}`;
  if (type === 'attribute') return `/search?attribute=${target}`;
  return target;
}

// ─── Per-column Add Items panel ───────────────────────────────────────────────

function ColumnAddPanel({
  onAdd,
  categories,
  pages,
  brands,
  attributes,
}: {
  onAdd: (links: MegaLink[]) => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const [type, setType] = useState<'category' | 'page' | 'brand' | 'attribute' | 'link'>('category');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [open, setOpen] = useState(false);
  // For attribute type: which attribute is expanded to show its values
  const [selectedAttr, setSelectedAttr] = useState<AttributeItem | null>(null);

  const list: LookupItem[] =
    type === 'category' ? categories :
    type === 'page' ? pages :
    type === 'brand' ? brands : [];

  const filtered = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const filteredAttrs = attributes.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(key: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  function toggleAll() {
    if (type === 'attribute' && selectedAttr) {
      const allSelected = selectedAttr.values.every(v => selected.has(`${selectedAttr.slug}:${v.slug}`));
      if (allSelected) {
        const n = new Set(selected);
        selectedAttr.values.forEach(v => n.delete(`${selectedAttr.slug}:${v.slug}`));
        setSelected(n);
      } else {
        const n = new Set(selected);
        selectedAttr.values.forEach(v => n.add(`${selectedAttr.slug}:${v.slug}`));
        setSelected(n);
      }
    } else {
      if (filtered.every(i => selected.has(i.slug))) {
        setSelected(new Set());
      } else {
        setSelected(new Set(filtered.map(i => i.slug)));
      }
    }
  }

  function handleAdd() {
    if (type === 'link') {
      if (!customUrl.trim() && !customLabel.trim()) return;
      onAdd([{ label: customLabel || customUrl, type: 'link', target: customUrl, url: customUrl }]);
      setCustomLabel(''); setCustomUrl('');
    } else if (type === 'attribute') {
      // selected keys are "attrSlug:valueSlug"
      const links: MegaLink[] = [];
      attributes.forEach(attr => {
        attr.values.forEach(val => {
          const key = `${attr.slug}:${val.slug}`;
          if (selected.has(key)) {
            links.push({ label: `${val.name}`, type: 'attribute', target: key, url: buildUrl('attribute', key) });
          }
        });
      });
      if (links.length === 0) return;
      onAdd(links);
      setSelected(new Set());
      setSearch('');
    } else {
      const items = list.filter(i => selected.has(i.slug));
      if (items.length === 0) return;
      onAdd(items.map(i => ({ label: i.name, type, target: i.slug, url: buildUrl(type, i.slug) })));
      setSelected(new Set());
      setSearch('');
    }
    setOpen(false);
  }

  const allSelected = type === 'attribute' && selectedAttr
    ? selectedAttr.values.every(v => selected.has(`${selectedAttr.slug}:${v.slug}`))
    : filtered.length > 0 && filtered.every(i => selected.has(i.slug));

  return (
    <div className="mt-2 border border-dashed border-blue-200 rounded-lg bg-blue-50/40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <FaPlus size={9} /> Add items to column
        </button>
      ) : (
        <div className="p-3 space-y-2">
          {/* Type selector */}
          <div className="flex gap-1 flex-wrap">
            {(['category', 'page', 'brand', 'attribute', 'link'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setSelected(new Set()); setSearch(''); setSelectedAttr(null); }}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  type === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-400'
                }`}
              >
                {t === 'category' ? 'Categories' : t === 'page' ? 'Pages' : t === 'brand' ? 'Brands' : t === 'attribute' ? 'Attributes' : 'Custom Link'}
              </button>
            ))}
          </div>

          {type === 'link' ? (
            <div className="space-y-1.5">
              <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Label"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" />
              <input type="text" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="URL (https:// or /path)"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" />
            </div>
          ) : type === 'attribute' ? (
            <div>
              {!selectedAttr ? (
                // Step 1: pick an attribute
                <>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search attributes…"
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-1.5 focus:outline-none focus:border-blue-400" />
                  <div className="max-h-36 overflow-y-auto border border-gray-100 rounded bg-white">
                    {filteredAttrs.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No attributes found</p>}
                    {filteredAttrs.map(attr => (
                      <button key={attr._id} type="button" onClick={() => { setSelectedAttr(attr); setSearch(''); }}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors">
                        <span className="truncate">{attr.name}</span>
                        <span className="text-gray-400 text-[10px] ml-1">({attr.values.length}) →</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                // Step 2: pick values from the selected attribute
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button type="button" onClick={() => { setSelectedAttr(null); setSearch(''); }}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                      ← Back
                    </button>
                    <span className="text-xs font-medium text-gray-700">{selectedAttr.name} values</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-gray-100 rounded bg-white">
                    {selectedAttr.values.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No values</p>}
                    {selectedAttr.values.length > 0 && (
                      <button type="button" onClick={toggleAll}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100 font-medium">
                        <span className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                          {allSelected && <span className="text-white text-[9px]">✓</span>}
                        </span>
                        Select all
                      </button>
                    )}
                    {selectedAttr.values.map(val => {
                      const key = `${selectedAttr.slug}:${val.slug}`;
                      return (
                        <button key={val.slug} type="button" onClick={() => toggle(key)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors">
                          <span className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center ${selected.has(key) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                            {selected.has(key) && <span className="text-white text-[9px]">✓</span>}
                          </span>
                          <span className="truncate">{val.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${type}s…`}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-1.5 focus:outline-none focus:border-blue-400" />
              <div className="max-h-36 overflow-y-auto border border-gray-100 rounded bg-white">
                {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No {type}s found</p>}
                {filtered.length > 0 && (
                  <button type="button" onClick={toggleAll}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100 font-medium">
                    <span className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {allSelected && <span className="text-white text-[9px]">✓</span>}
                    </span>
                    Select all
                  </button>
                )}
                {filtered.map(item => (
                  <button key={item._id} type="button" onClick={() => toggle(item.slug)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors">
                    <span className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center ${selected.has(item.slug) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {selected.has(item.slug) && <span className="text-white text-[9px]">✓</span>}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleAdd}
              disabled={
                type === 'link' ? (!customUrl.trim() && !customLabel.trim()) :
                type === 'attribute' ? selected.size === 0 :
                selected.size === 0
              }
              className="flex-1 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Add to Column {selected.size > 0 && type !== 'link' ? `(${selected.size})` : ''}
            </button>
            <button type="button" onClick={() => { setOpen(false); setSelected(new Set()); setSearch(''); setSelectedAttr(null); }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Link row (within a column) ────────────────────────────────────────────────

function LinkRow({
  link,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  categories,
  pages,
  brands,
  attributes,
}: {
  link: MegaLink;
  index: number;
  total: number;
  onChange: (updated: MegaLink) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const [editing, setEditing] = useState(false);
  // For attribute editing: split "attrSlug:valueSlug"
  const attrParts = link.type === 'attribute' ? link.target.split(':') : [];
  const [editAttrSlug, setEditAttrSlug] = useState(attrParts[0] || '');
  const [editValueSlug, setEditValueSlug] = useState(attrParts[1] || '');

  const typeLabel = link.type === 'category' ? 'Category'
    : link.type === 'page' ? 'Page'
    : link.type === 'brand' ? 'Brand'
    : link.type === 'attribute' ? 'Attribute' : 'Link';

  const selectedAttrItem = attributes.find(a => a.slug === editAttrSlug);

  return (
    <div className={`border rounded bg-white ${editing ? 'border-blue-200' : 'border-gray-100'}`}>
      {/* Collapsed row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={index === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none">
            <FaArrowUp size={8} />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none">
            <FaArrowDown size={8} />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-700 truncate block">{link.label || <span className="text-gray-400 italic">Untitled</span>}</span>
          <span className="text-[10px] text-gray-400">{typeLabel}{link.target ? ` — ${link.target}` : ''}</span>
        </div>
        <button type="button" onClick={() => setEditing(e => !e)} className="p-1 text-gray-400 hover:text-blue-500" title="Edit">
          {editing ? <FaTimes size={10} /> : <FaEdit size={10} />}
        </button>
        <button type="button" onClick={onRemove} className="p-1 text-gray-300 hover:text-red-500" title="Remove">
          <FaTrash size={10} />
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="px-2 pb-2 pt-1 border-t border-blue-100 space-y-1.5">
          <input
            type="text"
            value={link.label}
            onChange={e => onChange({ ...link, label: e.target.value })}
            placeholder="Navigation label"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          />
          <div className="flex gap-1.5 flex-wrap">
            <select
              value={link.type}
              onChange={e => { onChange({ ...link, type: e.target.value as MegaLink['type'], target: '' }); setEditAttrSlug(''); setEditValueSlug(''); }}
              className="w-24 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            >
              <option value="link">Link</option>
              <option value="category">Category</option>
              <option value="page">Page</option>
              <option value="brand">Brand</option>
              <option value="attribute">Attribute</option>
            </select>
            {link.type === 'category' ? (
              <select value={link.target} onChange={e => onChange({ ...link, target: e.target.value, url: buildUrl('category', e.target.value) })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400">
                <option value="">— Select —</option>
                {categories.map(c => <option key={c._id} value={c.slug}>{c.name}</option>)}
              </select>
            ) : link.type === 'page' ? (
              <select value={link.target} onChange={e => onChange({ ...link, target: e.target.value, url: buildUrl('page', e.target.value) })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400">
                <option value="">— Select —</option>
                {pages.map(p => <option key={p._id} value={p.slug}>{p.name}</option>)}
              </select>
            ) : link.type === 'brand' ? (
              <select value={link.target} onChange={e => onChange({ ...link, target: e.target.value, url: buildUrl('brand', e.target.value) })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400">
                <option value="">— Select —</option>
                {brands.map(b => <option key={b._id} value={b.slug}>{b.name}</option>)}
              </select>
            ) : link.type === 'attribute' ? (
              <div className="flex gap-1.5 flex-1">
                <select value={editAttrSlug}
                  onChange={e => { setEditAttrSlug(e.target.value); setEditValueSlug(''); onChange({ ...link, target: '', url: '' }); }}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400">
                  <option value="">— Attribute —</option>
                  {attributes.map(a => <option key={a._id} value={a.slug}>{a.name}</option>)}
                </select>
                {editAttrSlug && (
                  <select value={editValueSlug}
                    onChange={e => {
                      const vSlug = e.target.value;
                      setEditValueSlug(vSlug);
                      const key = `${editAttrSlug}:${vSlug}`;
                      const attrName = attributes.find(a => a.slug === editAttrSlug)?.name || editAttrSlug;
                      const valName = selectedAttrItem?.values.find(v => v.slug === vSlug)?.name || vSlug;
                      onChange({ ...link, target: key, url: buildUrl('attribute', key), label: link.label || `${attrName}: ${valName}` });
                    }}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400">
                    <option value="">— Value —</option>
                    {(selectedAttrItem?.values || []).map(v => <option key={v.slug} value={v.slug}>{v.name}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <input type="text" value={link.target} onChange={e => onChange({ ...link, target: e.target.value, url: e.target.value })}
                placeholder="https:// or /path"
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main MegaMenuEditor ──────────────────────────────────────────────────────

const MegaMenuEditor: React.FC<MegaMenuEditorProps> = ({
  megaMenu,
  onChange,
  menuItemIndex: _menuItemIndex,
  availableCategories = [],
  availablePages = [],
  availableBrands = [],
  availableAttributes = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Local state copy — avoids stale closure issues with deeply nested updates
  const [data, setData] = useState<MegaData>(() => ({
    isMegaMenu: !!megaMenu?.isMegaMenu,
    layout: megaMenu?.layout || 'columns',
    columns: megaMenu?.columns || [],
    featuredImage: megaMenu?.featuredImage || '',
    featuredImageLink: megaMenu?.featuredImageLink || '',
    featuredImageAlt: megaMenu?.featuredImageAlt || '',
  }));

  // Sync from parent if the prop identity changes (e.g. after a full save/reload)
  const megaMenuJson = JSON.stringify(megaMenu);
  useEffect(() => {
    setData({
      isMegaMenu: !!megaMenu?.isMegaMenu,
      layout: megaMenu?.layout || 'columns',
      columns: megaMenu?.columns || [],
      featuredImage: megaMenu?.featuredImage || '',
      featuredImageLink: megaMenu?.featuredImageLink || '',
      featuredImageAlt: megaMenu?.featuredImageAlt || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [megaMenuJson]);

  // Propagate local changes upward
  const commit = useCallback((updated: MegaData) => {
    setData(updated);
    onChange(updated);
  }, [onChange]);

  function toggleEnabled(enabled: boolean) {
    const updated = { ...data, isMegaMenu: enabled };
    commit(updated);
    if (enabled) setIsOpen(true);
  }

  function setField(key: keyof MegaData, value: any) {
    commit({ ...data, [key]: value });
  }

  // ─ Column operations ─

  function addColumn() {
    commit({ ...data, columns: [...data.columns, { title: '', links: [] }] });
  }

  function removeColumn(colIdx: number) {
    commit({ ...data, columns: data.columns.filter((_, i) => i !== colIdx) });
  }

  function setColumnTitle(colIdx: number, title: string) {
    const cols = data.columns.map((c, i) => i === colIdx ? { ...c, title } : c);
    commit({ ...data, columns: cols });
  }

  // ─ Link operations within a column ─

  function addLinks(colIdx: number, newLinks: MegaLink[]) {
    const cols = data.columns.map((col, i) => {
      if (i !== colIdx) return col;
      return { ...col, links: [...col.links, ...newLinks] };
    });
    commit({ ...data, columns: cols });
  }

  function updateLink(colIdx: number, linkIdx: number, updated: MegaLink) {
    const cols = data.columns.map((col, i) => {
      if (i !== colIdx) return col;
      const links = col.links.map((l, j) => j === linkIdx ? updated : l);
      return { ...col, links };
    });
    commit({ ...data, columns: cols });
  }

  function removeLink(colIdx: number, linkIdx: number) {
    const cols = data.columns.map((col, i) => {
      if (i !== colIdx) return col;
      return { ...col, links: col.links.filter((_, j) => j !== linkIdx) };
    });
    commit({ ...data, columns: cols });
  }

  function moveLink(colIdx: number, linkIdx: number, dir: -1 | 1) {
    const cols = data.columns.map((col, i) => {
      if (i !== colIdx) return col;
      const links = [...col.links];
      const target = linkIdx + dir;
      if (target < 0 || target >= links.length) return col;
      [links[linkIdx], links[target]] = [links[target], links[linkIdx]];
      return { ...col, links };
    });
    commit({ ...data, columns: cols });
  }

  return (
    <div className="mt-2 pt-3 border-t border-gray-200">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
          <div
            onClick={() => toggleEnabled(!data.isMegaMenu)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${data.isMegaMenu ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${data.isMegaMenu ? 'translate-x-4' : ''}`} />
          </div>
          Enable Mega Menu
        </label>
        {data.isMegaMenu && (
          <button
            type="button"
            onClick={() => setIsOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {isOpen ? <><FaChevronUp size={9} /> Collapse</> : <><FaChevronDown size={9} /> Edit Columns</>}
          </button>
        )}
      </div>

      {data.isMegaMenu && isOpen && (
        <div className="mt-3 space-y-3">
          {/* Layout + featured image row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Layout</label>
              <select
                value={data.layout}
                onChange={e => setField('layout', e.target.value as MegaData['layout'])}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              >
                <option value="columns">Columns</option>
                <option value="grid">Grid</option>
                <option value="tabs">Tabs</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Featured Image URL</label>
              <input
                type="text"
                value={data.featuredImage}
                onChange={e => setField('featuredImage', e.target.value)}
                placeholder="https://…"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Columns ({data.columns.length})
              </span>
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <FaPlus size={9} /> Add Column
              </button>
            </div>

            {data.columns.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-xs border border-dashed border-gray-200 rounded-lg">
                No columns yet — click "Add Column" to start building your mega menu
              </div>
            )}

            <div className="space-y-3">
              {data.columns.map((col, colIdx) => (
                <div key={colIdx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={col.title}
                      onChange={e => setColumnTitle(colIdx, e.target.value)}
                      placeholder={`Column ${colIdx + 1} heading (optional)`}
                      className="flex-1 text-xs font-semibold border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(colIdx)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Remove column"
                    >
                      <FaTrash size={11} />
                    </button>
                  </div>

                  {/* Links list */}
                  {col.links.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">No links yet — add items below</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {col.links.map((link, linkIdx) => (
                        <LinkRow
                          key={linkIdx}
                          link={link}
                          index={linkIdx}
                          total={col.links.length}
                          onChange={updated => updateLink(colIdx, linkIdx, updated)}
                          onRemove={() => removeLink(colIdx, linkIdx)}
                          onMoveUp={() => moveLink(colIdx, linkIdx, -1)}
                          onMoveDown={() => moveLink(colIdx, linkIdx, 1)}
                          categories={availableCategories}
                          pages={availablePages}
                          brands={availableBrands}
                          attributes={availableAttributes}
                        />
                      ))}
                    </div>
                  )}

                  {/* Add items to this column */}
                  <ColumnAddPanel
                    onAdd={links => addLinks(colIdx, links)}
                    categories={availableCategories}
                    pages={availablePages}
                    brands={availableBrands}
                    attributes={availableAttributes}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MegaMenuEditor;
