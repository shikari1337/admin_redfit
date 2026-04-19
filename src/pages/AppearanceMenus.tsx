import React, { useEffect, useState } from 'react';
import {
  FaSave, FaBars, FaPlus, FaTrash, FaArrowUp, FaArrowDown,
  FaChevronDown, FaChevronUp, FaLink, FaTag, FaLayerGroup, FaRegSquare, FaCheckSquare,
} from 'react-icons/fa';
import api from '../services/api';
import { categoriesAPI, pagesAPI, menusAPI, brandsAPI, attributesAPI } from '../services/api';
import IconPicker from '../components/IconPicker';
import MegaMenuEditor from '../components/menu/MegaMenuEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  type: 'link' | 'category' | 'page' | 'brand';
  target: string;
  url?: string;
  icon?: string;
  order: number;
  isVisible: boolean;
  openInNewTab?: boolean;
  megaMenu?: any;
}

const LOCATION_HEADER = 'header_main';
const FOOTER_TABS = [
  { id: 'footer_1', location: 'footer_column_1', label: 'Footer — Col 1', hint: 'e.g. Shop by Category' },
  { id: 'footer_2', location: 'footer_column_2', label: 'Footer — Col 2', hint: 'e.g. Useful Links' },
  { id: 'footer_3', location: 'footer_column_3', label: 'Footer — Col 3', hint: 'e.g. Policies' },
] as const;
type FooterTabId = typeof FOOTER_TABS[number]['id'];

function buildUrl(type: string, target?: string): string {
  if (!target) return '#';
  if (type === 'category') return `/category/${target}`;
  if (type === 'page') return `/${target}`;
  if (type === 'brand') return `/brand/${target}`;
  return target;
}

function computeUrls(items: MenuItem[]): any[] {
  return items.map((item) => ({
    ...item,
    url: buildUrl(item.type, item.target),
    displayOrder: item.order,
    megaMenu: item.megaMenu
      ? {
          ...item.megaMenu,
          columns: (item.megaMenu.columns || []).map((col: any) => ({
            ...col,
            links: (col.links || []).map((link: any) => ({
              ...link,
              url: buildUrl(link.type, link.target),
            })),
          })),
        }
      : undefined,
  }));
}

function fromMenuItems(items: any[]): MenuItem[] {
  return (items || []).map((item: any, i: number) => ({
    label: item.label || '',
    type: item.type === 'custom' ? 'link' : (item.type || 'link') as any,
    target: item.target || item.url || '',
    url: item.url || '',
    icon: item.icon || '',
    order: item.displayOrder ?? i,
    isVisible: item.isVisible !== false,
    openInNewTab: item.openInNewTab || false,
    megaMenu: item.megaMenu,
  }));
}

// ─── Add-items left panel ─────────────────────────────────────────────────────

type LookupItem = { _id: string; name: string; slug: string };

function AddItemsPanel({
  categories,
  pages,
  brands,
  onAdd,
}: {
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  onAdd: (items: Omit<MenuItem, 'order'>[]) => void;
}) {
  const [openSection, setOpenSection] = useState<string>('custom');
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [catSearch, setCatSearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');

  function toggleCat(slug: string) {
    setSelectedCats((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }
  function togglePage(slug: string) {
    setSelectedPages((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }
  function toggleBrand(slug: string) {
    setSelectedBrands((prev) => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }
  function selectAllCats(filtered: LookupItem[]) {
    setSelectedCats((prev) => {
      const n = new Set(prev);
      const allSelected = filtered.every((c) => n.has(c.slug));
      filtered.forEach((c) => allSelected ? n.delete(c.slug) : n.add(c.slug));
      return n;
    });
  }
  function selectAllPages(filtered: LookupItem[]) {
    setSelectedPages((prev) => {
      const n = new Set(prev);
      const allSelected = filtered.every((p) => n.has(p.slug));
      filtered.forEach((p) => allSelected ? n.delete(p.slug) : n.add(p.slug));
      return n;
    });
  }
  function selectAllBrands(filtered: LookupItem[]) {
    setSelectedBrands((prev) => {
      const n = new Set(prev);
      const allSelected = filtered.every((b) => n.has(b.slug));
      filtered.forEach((b) => allSelected ? n.delete(b.slug) : n.add(b.slug));
      return n;
    });
  }

  function addCustomLink() {
    if (!customLabel.trim() && !customUrl.trim()) return;
    onAdd([{ label: customLabel || customUrl, type: 'link', target: customUrl, isVisible: true }]);
    setCustomLabel('');
    setCustomUrl('');
  }

  function addCategories() {
    if (selectedCats.size === 0) return;
    const items = categories
      .filter((c) => selectedCats.has(c.slug))
      .map((c) => ({ label: c.name, type: 'category' as const, target: c.slug, isVisible: true }));
    onAdd(items);
    setSelectedCats(new Set());
  }

  function addPages() {
    if (selectedPages.size === 0) return;
    const items = pages
      .filter((p) => selectedPages.has(p.slug))
      .map((p) => ({ label: p.name, type: 'page' as const, target: p.slug, isVisible: true }));
    onAdd(items);
    setSelectedPages(new Set());
  }

  function addBrands() {
    if (selectedBrands.size === 0) return;
    const items = brands
      .filter((b) => selectedBrands.has(b.slug))
      .map((b) => ({ label: b.name, type: 'brand' as const, target: b.slug, isVisible: true }));
    onAdd(items);
    setSelectedBrands(new Set());
  }

  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(catSearch.toLowerCase()));
  const filteredPages = pages.filter((p) => p.name.toLowerCase().includes(pageSearch.toLowerCase()));
  const filteredBrands = brands.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()));

  const Section = ({
    id, title, icon, children,
  }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setOpenSection(openSection === id ? '' : id)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        {openSection === id ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
      </button>
      {openSection === id && <div className="p-3 bg-white">{children}</div>}
    </div>
  );

  const CheckList = ({
    items, selected, onToggle, onSelectAll, search, onSearch, onAdd: onAddItems, addLabel,
  }: {
    items: LookupItem[]; selected: Set<string>; onToggle: (s: string) => void;
    onSelectAll: (f: LookupItem[]) => void; search: string; onSearch: (s: string) => void;
    onAdd: () => void; addLabel: string;
  }) => {
    const allSelected = items.length > 0 && items.every((i) => selected.has(i.slug));
    return (
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 mb-2 focus:outline-none focus:border-blue-400"
        />
        {items.length > 0 && (
          <div className="max-h-44 overflow-y-auto border border-gray-100 rounded mb-2">
            <button
              type="button"
              onClick={() => onSelectAll(items)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 border-b border-gray-100"
            >
              {allSelected ? <FaCheckSquare size={12} className="text-blue-500" /> : <FaRegSquare size={12} className="text-gray-400" />}
              Select All
            </button>
            {items.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => onToggle(item.slug)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 transition-colors"
              >
                {selected.has(item.slug)
                  ? <FaCheckSquare size={12} className="text-blue-500 flex-shrink-0" />
                  : <FaRegSquare size={12} className="text-gray-400 flex-shrink-0" />}
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        )}
        {items.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No items found</p>}
        <button
          type="button"
          onClick={onAddItems}
          disabled={selected.size === 0}
          className="w-full py-1.5 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-40 transition-colors"
        >
          {addLabel} {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    );
  };

  return (
    <div className="w-64 flex-shrink-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add to Menu</p>

      <Section id="custom" title="Custom Link" icon={<FaLink size={11} />}>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">URL</label>
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https:// or /path"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Link Text</label>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Label"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              onKeyDown={(e) => e.key === 'Enter' && addCustomLink()}
            />
          </div>
          <button
            type="button"
            onClick={addCustomLink}
            className="w-full py-1.5 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-900 transition-colors"
          >
            Add to Menu
          </button>
        </div>
      </Section>

      <Section id="pages" title="Pages" icon={<FaLayerGroup size={11} />}>
        <CheckList
          items={filteredPages}
          selected={selectedPages}
          onToggle={togglePage}
          onSelectAll={selectAllPages}
          search={pageSearch}
          onSearch={setPageSearch}
          onAdd={addPages}
          addLabel="Add to Menu"
        />
      </Section>

      <Section id="categories" title="Categories" icon={<FaTag size={11} />}>
        <CheckList
          items={filteredCats}
          selected={selectedCats}
          onToggle={toggleCat}
          onSelectAll={selectAllCats}
          search={catSearch}
          onSearch={setCatSearch}
          onAdd={addCategories}
          addLabel="Add to Menu"
        />
      </Section>

      <Section id="brands" title="Brands" icon={<FaTag size={11} />}>
        <CheckList
          items={filteredBrands}
          selected={selectedBrands}
          onToggle={toggleBrand}
          onSelectAll={selectAllBrands}
          search={brandSearch}
          onSearch={setBrandSearch}
          onAdd={addBrands}
          addLabel="Add to Menu"
        />
      </Section>
    </div>
  );
}

// ─── Menu item row ─────────────────────────────────────────────────────────────

function MenuItemRow({
  item,
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
  isHeader,
}: {
  item: MenuItem;
  index: number;
  total: number;
  onChange: (field: string, value: any) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: any[];
  isHeader: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const typeLabel = item.type === 'category' ? 'Category'
    : item.type === 'page' ? 'Page'
    : item.type === 'brand' ? 'Brand'
    : 'Custom Link';

  return (
    <div className={`border rounded-lg bg-white ${expanded ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"
          >
            <FaArrowUp size={10} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"
          >
            <FaArrowDown size={10} />
          </button>
        </div>

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          <p className="text-sm font-medium text-gray-800 truncate">{item.label || <span className="text-gray-400 italic">Untitled</span>}</p>
          <p className="text-xs text-gray-400 truncate">{typeLabel}{item.target ? ` — ${item.target}` : ''}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!item.isVisible && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">Hidden</span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Label */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navigation Label</label>
              <input
                type="text"
                value={item.label}
                onChange={(e) => onChange('label', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={item.type}
                onChange={(e) => onChange('type', e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              >
                <option value="link">Custom Link</option>
                <option value="category">Category</option>
                <option value="page">Page</option>
                <option value="brand">Brand</option>
              </select>
            </div>

            {/* Target */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {item.type === 'category' ? 'Category' : item.type === 'page' ? 'Page' : item.type === 'brand' ? 'Brand' : 'URL'}
              </label>
              {item.type === 'category' ? (
                <select
                  value={item.target}
                  onChange={(e) => onChange('target', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                >
                  <option value="">— Select category —</option>
                  {categories.map((c) => <option key={c._id} value={c.slug}>{c.name}</option>)}
                </select>
              ) : item.type === 'page' ? (
                <select
                  value={item.target}
                  onChange={(e) => onChange('target', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                >
                  <option value="">— Select page —</option>
                  {pages.map((p) => <option key={p._id} value={p.slug}>{p.name}</option>)}
                </select>
              ) : item.type === 'brand' ? (
                <select
                  value={item.target}
                  onChange={(e) => onChange('target', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                >
                  <option value="">— Select brand —</option>
                  {brands.map((b) => <option key={b._id} value={b.slug}>{b.name}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={item.target}
                  onChange={(e) => onChange('target', e.target.value)}
                  placeholder="https:// or /path"
                  className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                />
              )}
            </div>
          </div>

          {/* Icon */}
          <div>
            <IconPicker
              value={item.icon || ''}
              onChange={(id) => onChange('icon', id)}
              label="Icon (optional)"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={item.isVisible}
                onChange={(e) => onChange('isVisible', e.target.checked)}
                className="rounded border-gray-300 text-blue-600"
              />
              Visible
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={item.openInNewTab || false}
                onChange={(e) => onChange('openInNewTab', e.target.checked)}
                className="rounded border-gray-300 text-blue-600"
              />
              Open in new tab
            </label>
          </div>

          {/* Mega menu (header only) */}
          {isHeader && (
            <MegaMenuEditor
              megaMenu={item.megaMenu || {}}
              onChange={(val: any) => onChange('megaMenu', val)}
              menuItemIndex={index}
              availableCategories={categories}
              availablePages={pages}
              availableBrands={brands}
              availableAttributes={attributes}
            />
          )}

          {/* Remove */}
          <div className="flex justify-end pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
            >
              <FaTrash size={10} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const AppearanceMenus: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'header' | FooterTabId>('header');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [pages, setPages] = useState<LookupItem[]>([]);
  const [brands, setBrands] = useState<LookupItem[]>([]);
  const [attributes, setAttributes] = useState<any[]>([]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [footerItems1, setFooterItems1] = useState<MenuItem[]>([]);
  const [footerItems2, setFooterItems2] = useState<MenuItem[]>([]);
  const [footerItems3, setFooterItems3] = useState<MenuItem[]>([]);
  const [headerMenuId, setHeaderMenuId] = useState<string | null>(null);
  const [footerMenuId1, setFooterMenuId1] = useState<string | null>(null);
  const [footerMenuId2, setFooterMenuId2] = useState<string | null>(null);
  const [footerMenuId3, setFooterMenuId3] = useState<string | null>(null);

  useEffect(() => {
    fetchMenuData();
    fetchLookups();
  }, []);

  async function fetchLookups() {
    try {
      const [catRes, pagesRes, brandsRes, attrsRes] = await Promise.all([
        categoriesAPI.list().catch(() => []),
        pagesAPI.getAll().catch(() => ({ data: [] })),
        brandsAPI.list().catch(() => ({ data: [] })),
        attributesAPI.list().catch(() => []),
      ]);
      const cats: any[] = Array.isArray(catRes) ? catRes : (catRes as any)?.data ?? [];
      const pg: any[] = Array.isArray(pagesRes) ? pagesRes : (pagesRes as any)?.data ?? [];
      const br: any[] = Array.isArray(brandsRes) ? brandsRes : (brandsRes as any)?.data ?? [];
      const attrs: any[] = Array.isArray(attrsRes) ? attrsRes : (attrsRes as any)?.data ?? [];
      setCategories(cats.map((c: any) => ({ _id: String(c._id), name: c.name || c.slug, slug: c.slug })));
      setPages(pg.map((p: any) => ({ _id: String(p._id), name: p.title || p.name || p.slug, slug: p.slug })));
      setBrands(br.map((b: any) => ({ _id: String(b._id), name: b.name || b.slug, slug: b.slug })));
      setAttributes(attrs.map((a: any) => ({
        _id: String(a._id),
        name: a.name,
        slug: a.slug,
        values: (a.values || []).map((v: any) => ({ name: v.name, slug: v.slug })),
      })));
    } catch {}
  }

  async function fetchMenuData() {
    setLoading(true);
    try {
      const [headerMenu, f1, f2, f3, settingsResp] = await Promise.all([
        menusAPI.getByLocation(LOCATION_HEADER),
        menusAPI.getByLocation('footer_column_1'),
        menusAPI.getByLocation('footer_column_2'),
        menusAPI.getByLocation('footer_column_3'),
        api.get('/settings/admin').catch(() => null),
      ]);

      if (headerMenu?._id) {
        setHeaderMenuId(headerMenu._id);
        setMenuItems(fromMenuItems(headerMenu.items || []));
      } else {
        const settings = settingsResp?.data?.data || settingsResp?.data || {};
        setMenuItems(fromMenuItems(settings?.menu?.items || []));
      }

      if (f1?._id) { setFooterMenuId1(f1._id); setFooterItems1(fromMenuItems(f1.items || [])); }
      if (f2?._id) { setFooterMenuId2(f2._id); setFooterItems2(fromMenuItems(f2.items || [])); }
      if (f3?._id) { setFooterMenuId3(f3._id); setFooterItems3(fromMenuItems(f3.items || [])); }
    } catch {
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }

  const items =
    activeTab === 'header' ? menuItems :
    activeTab === 'footer_1' ? footerItems1 :
    activeTab === 'footer_2' ? footerItems2 : footerItems3;

  const setItems =
    activeTab === 'header' ? setMenuItems :
    activeTab === 'footer_1' ? setFooterItems1 :
    activeTab === 'footer_2' ? setFooterItems2 : setFooterItems3;

  function addItems(newItems: Omit<MenuItem, 'order'>[]) {
    setItems((prev) => [
      ...prev,
      ...newItems.map((it, i) => ({ ...it, order: prev.length + i })),
    ]);
  }

  function updateItem(index: number, field: string, value: any) {
    setItems((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index).map((it, i) => ({ ...it, order: i })));
  }

  function moveItem(index: number, dir: 'up' | 'down') {
    setItems((prev) => {
      const arr = [...prev];
      if (dir === 'up' && index > 0) [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      else if (dir === 'down' && index < arr.length - 1) [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr.map((it, i) => ({ ...it, order: i }));
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      const footerTab = FOOTER_TABS.find(t => t.id === activeTab);
      const location = activeTab === 'header' ? LOCATION_HEADER : (footerTab!.location);
      const menuName = activeTab === 'header' ? 'Header Menu' : footerTab!.label;
      const menuId =
        activeTab === 'header' ? headerMenuId :
        activeTab === 'footer_1' ? footerMenuId1 :
        activeTab === 'footer_2' ? footerMenuId2 : footerMenuId3;

      const payload = { name: menuName, slug: location, location, isActive: true, items: computeUrls(items) };

      if (menuId) {
        await menusAPI.update(menuId, payload);
      } else {
        const created = await menusAPI.create(payload);
        const id = created?._id || null;
        if (activeTab === 'header') setHeaderMenuId(id);
        else if (activeTab === 'footer_1') setFooterMenuId1(id);
        else if (activeTab === 'footer_2') setFooterMenuId2(id);
        else setFooterMenuId3(id);
      }

      if (activeTab === 'header') {
        await api.put('/settings', { menu: { items: computeUrls(items) } }).catch(() => {});
      }

      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (error: any) {
      setSaveMsg(error.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center h-64 items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FaBars className="text-gray-500" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Menus</h1>
            <p className="text-xs text-gray-500">Configure navigation menus for your storefront</p>
          </div>
        </div>
        <button
          type="submit"
          form="menu-form"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <FaSave size={13} />}
          Save Menu
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {([{ id: 'header', label: 'Header Navigation' }, ...FOOTER_TABS.map(t => ({ id: t.id, label: t.label }))] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <form id="menu-form" onSubmit={handleSave}>
        <div className="px-6 py-6 flex gap-6 items-start">
          {/* Left: Add items */}
          <AddItemsPanel
            categories={categories}
            pages={pages}
            brands={brands}
            onAdd={addItems}
          />

          {/* Right: Menu structure */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Menu Structure
                  <span className="ml-2 font-normal normal-case text-gray-400">({items.length} item{items.length !== 1 ? 's' : ''})</span>
                </p>
                {activeTab !== 'header' && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {FOOTER_TABS.find(t => t.id === activeTab)?.hint}
                  </p>
                )}
              </div>
              {saveMsg && (
                <span className={`text-xs font-medium ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>
                  {saveMsg}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl py-16 flex flex-col items-center justify-center text-gray-400">
                <FaBars size={24} className="mb-2 text-gray-200" />
                <p className="text-sm">No menu items yet</p>
                <p className="text-xs mt-1">Add items from the panel on the left</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <MenuItemRow
                    key={index}
                    item={item}
                    index={index}
                    total={items.length}
                    onChange={(field, value) => updateItem(index, field, value)}
                    onRemove={() => removeItem(index)}
                    onMoveUp={() => moveItem(index, 'up')}
                    onMoveDown={() => moveItem(index, 'down')}
                    categories={categories}
                    pages={pages}
                    brands={brands}
                    attributes={attributes}
                    isHeader={activeTab === 'header' as string}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => addItems([{ label: '', type: 'link', target: '', isVisible: true }])}
              className="mt-3 w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <FaPlus size={10} /> Add blank item
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AppearanceMenus;
