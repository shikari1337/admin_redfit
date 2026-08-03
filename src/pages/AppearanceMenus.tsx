/**
 * Appearance ▸ Menus — storefront navigation builder.
 *
 * Header tab edits the SAME menu record the storefront renders: the first
 * active menu with items whose location is one of header_main/header/main/
 * primary (mirrors Header.tsx resolution). homeomead's live mega menu lives at
 * location `header` — earlier versions of this page edited a phantom
 * `header_main` record and could never touch it.
 *
 * Items round-trip LOSSLESSLY: unknown stored fields (children, image, …) are
 * preserved; the editor only rewrites what it renders. Dropdown content
 * (simple list vs mega columns) is managed by the drag-and-drop MegaMenuEditor.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Menu as MenuIcon, Save, GripVertical, Trash2, ChevronDown, ChevronUp,
  Eye, EyeOff, Plus, Columns3, List as ListIcon, Monitor, Smartphone,
  MonitorSmartphone,
} from 'lucide-react';
import api, { categoriesAPI, pagesAPI, menusAPI, brandsAPI, attributesAPI } from '../services/api';
import IconPicker from '../components/IconPicker';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import MegaMenuEditor, {
  AddContentPanel, LinkGlyph, SearchSelect, TYPE_META, buildUrl, uid,
} from '../components/menu/MegaMenuEditor';
import type { AttributeItem, LinkType, LookupItem, MegaLink } from '../components/menu/MegaMenuEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UIMenuItem {
  _uid: string;
  label: string;
  type: LinkType;
  target: string;
  url?: string;
  icon?: string;
  image?: string;
  isVisible: boolean;
  openInNewTab?: boolean;
  /** Device targeting: undefined = everywhere, 'desktop' | 'mobile' = only there. */
  showOn?: 'desktop' | 'mobile';
  megaMenu?: any;
  children?: any[];
  [key: string]: any;
}

interface MenuRecord { id: string | null; name: string; location: string; items: UIMenuItem[] }

// Mirrors storefront Header.tsx — the storefront picks the first ACTIVE menu
// with items whose location is in this list.
const HEADER_LOCATIONS = ['header_main', 'header', 'main', 'primary'];

const FOOTER_TABS = [
  { id: 'footer_1', location: 'footer_column_1', label: 'Footer — Col 1', hint: 'e.g. Shop by Category' },
  { id: 'footer_2', location: 'footer_column_2', label: 'Footer — Col 2', hint: 'e.g. Useful Links' },
  { id: 'footer_3', location: 'footer_column_3', label: 'Footer — Col 3', hint: 'e.g. Policies' },
] as const;
type TabId = 'header' | typeof FOOTER_TABS[number]['id'];

function hydrateItems(items: any[]): UIMenuItem[] {
  return (items || []).map((item: any) => ({
    ...item,
    _uid: uid(),
    label: item.label || '',
    type: (item.type === 'custom' ? 'link' : item.type || 'link') as LinkType,
    target: item.target || item.url || '',
    isVisible: item.isVisible !== false,
  }));
}

/** Strip editor-only fields and recompute canonical URLs before persisting. */
function serializeItems(items: UIMenuItem[]): any[] {
  return items.map(({ _uid, ...item }, i) => {
    const out: any = { ...item, url: buildUrl(item.type, item.target), displayOrder: i };
    if (out.megaMenu === undefined) delete out.megaMenu;
    if (out.children === undefined) delete out.children;
    return out;
  });
}

// ─── Sortable top-level item row ──────────────────────────────────────────────

function MenuItemRow({
  item, onPatch, onRemove, categories, pages, brands, attributes, isHeader,
}: {
  item: UIMenuItem;
  onPatch: (patch: Partial<UIMenuItem>) => void;
  onRemove: () => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
  isHeader: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item._uid });

  const meta = TYPE_META[item.type] || TYPE_META.link;
  const dropdownKind = item.megaMenu?.isMegaMenu
    ? { label: 'Mega menu', Icon: Columns3 }
    : item.children?.length
      ? { label: `${item.children.length} links`, Icon: ListIcon }
      : null;

  const targetOptions =
    item.type === 'category' ? categories.map((c) => ({ value: c.slug, label: c.name }))
    : item.type === 'page' ? pages.map((p) => ({ value: p.slug, label: p.name }))
    : item.type === 'brand' ? brands.map((b) => ({ value: b.slug, label: b.name }))
    : [];

  const attrParts = item.type === 'attribute' ? item.target.split(':') : [];
  const attr = attributes.find((a) => a.slug === (attrParts[0] || ''));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`border rounded-xl bg-white ${isDragging ? 'opacity-40 border-blue-300 shadow-lg' : expanded ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2.5">
        <button
          type="button"
          {...dndAttrs}
          {...listeners}
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label={`Drag ${item.label || 'item'}`}
        >
          <GripVertical size={15} />
        </button>
        <LinkGlyph link={item as MegaLink} size={34} />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          <p className="text-sm font-semibold text-gray-800 truncate">
            {item.label || <span className="text-gray-400 italic font-normal">Untitled</span>}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9.5px] font-bold px-1.5 py-px rounded ${meta.tone}`}>{meta.label}</span>
            {dropdownKind && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-px rounded">
                <dropdownKind.Icon size={9} /> {dropdownKind.label}
              </span>
            )}
            {(item.showOn === 'desktop' || item.showOn === 'mobile') && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-px rounded">
                {item.showOn === 'desktop' ? <><Monitor size={9} /> Desktop only</> : <><Smartphone size={9} /> Mobile only</>}
              </span>
            )}
            {item.target && <span className="text-[10.5px] text-gray-400 truncate">{item.target}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ isVisible: !item.isVisible })}
          className={`p-1.5 rounded-lg shrink-0 ${item.isVisible ? 'text-gray-400 hover:text-gray-600' : 'text-orange-500 bg-orange-50'}`}
          title={item.isVisible ? 'Visible — click to hide' : 'Hidden — click to show'}
        >
          {item.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Navigation label</label>
              <input
                value={item.label}
                onChange={(e) => onPatch({ label: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Links to</label>
              <select
                value={item.type}
                onChange={(e) => onPatch({ type: e.target.value as LinkType, target: '' })}
                className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="category">Category</option>
                <option value="attribute">Attribute</option>
                <option value="page">Page</option>
                <option value="brand">Brand</option>
                <option value="link">Custom link</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {item.type === 'link' ? 'URL' : `Which ${item.type}`}
              </label>
              {item.type === 'link' ? (
                <input
                  value={item.target}
                  onChange={(e) => onPatch({ target: e.target.value })}
                  placeholder="https:// or /path"
                  className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                />
              ) : item.type === 'attribute' ? (
                <div className="grid grid-cols-2 gap-2">
                  <SearchSelect
                    options={attributes.map((a) => ({ value: a.slug, label: a.name }))}
                    value={attrParts[0] || ''}
                    onChange={(s) => onPatch({ target: s ? `${s}:` : '' })}
                    placeholder="Attribute…"
                  />
                  <SearchSelect
                    options={(attr?.values || []).map((v) => ({ value: v.slug, label: v.name }))}
                    value={attrParts[1] || ''}
                    onChange={(v) => onPatch({ target: `${attrParts[0]}:${v}` })}
                    placeholder="Value…"
                  />
                </div>
              ) : (
                <SearchSelect
                  options={targetOptions}
                  value={item.target}
                  onChange={(t) => {
                    const name = targetOptions.find((o) => o.value === t)?.label || '';
                    onPatch({ target: t, label: item.label || name });
                  }}
                  placeholder={`Select ${item.type}…`}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-start">
            <IconPicker value={item.icon || ''} onChange={(id) => onPatch({ icon: id })} label="Icon (optional)" />
            <ImageInputWithActions value={item.image || ''} onChange={(url) => onPatch({ image: url })} label="Image (optional)" />
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={item.openInNewTab || false}
                onChange={(e) => onPatch({ openInNewTab: e.target.checked })}
                className="rounded border-gray-300 text-blue-600"
              />
              Open in new tab
            </label>
            {isHeader && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600 font-medium">Show on</span>
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  {([
                    { id: undefined, label: 'All', Icon: MonitorSmartphone },
                    { id: 'desktop' as const, label: 'Desktop', Icon: Monitor },
                    { id: 'mobile' as const, label: 'Mobile', Icon: Smartphone },
                  ]).map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => onPatch({ showOn: d.id })}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold transition-colors ${
                        (item.showOn ?? undefined) === d.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <d.Icon size={10} /> {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isHeader && (
            <MegaMenuEditor
              resetKey={item._uid}
              megaMenu={item.megaMenu}
              childrenLinks={item.children}
              itemLabel={item.label}
              itemIcon={item.icon}
              onChange={(patch) => onPatch(patch as Partial<UIMenuItem>)}
              categories={categories}
              pages={pages}
              brands={brands}
              attributes={attributes}
            />
          )}

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { if (window.confirm(`Remove "${item.label || 'this item'}" from the menu?`)) onRemove(); }}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <Trash2 size={11} /> Remove from menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const AppearanceMenus: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('header');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [addPanelKey, setAddPanelKey] = useState(0);

  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [pages, setPages] = useState<LookupItem[]>([]);
  const [brands, setBrands] = useState<LookupItem[]>([]);
  const [attributes, setAttributes] = useState<AttributeItem[]>([]);

  const [records, setRecords] = useState<Record<TabId, MenuRecord>>({
    header: { id: null, name: 'Main Menu', location: 'header', items: [] },
    footer_1: { id: null, name: 'Footer — Col 1', location: 'footer_column_1', items: [] },
    footer_2: { id: null, name: 'Footer — Col 2', location: 'footer_column_2', items: [] },
    footer_3: { id: null, name: 'Footer — Col 3', location: 'footer_column_3', items: [] },
  });
  // Serialized snapshot per tab at load/save time — powers the unsaved-changes indicators.
  const [snapshots, setSnapshots] = useState<Partial<Record<TabId, string>>>({});

  const dirtyTabs = useMemo(() => {
    const d = {} as Record<TabId, boolean>;
    (Object.keys(records) as TabId[]).forEach((t) => {
      d[t] = snapshots[t] !== undefined && JSON.stringify(serializeItems(records[t].items)) !== snapshots[t];
    });
    return d;
  }, [records, snapshots]);

  useEffect(() => {
    fetchAll();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setCategories(cats.map((c: any) => ({ _id: String(c._id ?? c.id), name: c.name || c.slug, slug: c.slug })));
      setPages(pg.map((p: any) => ({ _id: String(p._id ?? p.id), name: p.title || p.name || p.slug, slug: p.slug })));
      setBrands(br.map((b: any) => ({ _id: String(b._id ?? b.id), name: b.name || b.slug, slug: b.slug })));
      setAttributes(attrs.map((a: any) => ({
        _id: String(a._id ?? a.id),
        name: a.name,
        slug: a.slug,
        values: (a.values || []).map((v: any) => ({ name: v.name, slug: v.slug })),
      })));
    } catch { /* lookups are best-effort */ }
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const all = await menusAPI.list();
      const menus: any[] = (Array.isArray(all) ? all : []).map((m: any) => ({
        id: m._id || m.id,
        name: m.name,
        location: m.location,
        isActive: m.isActive ?? m.is_active,
        items: m.items || [],
      }));

      // Same pick the storefront makes: first active menu with items at a header
      // location; else any header-location record (even empty) so we UPDATE it
      // instead of spawning a duplicate.
      const header =
        menus.find((m) => HEADER_LOCATIONS.includes(m.location) && m.isActive !== false && m.items.length > 0)
        || menus.find((m) => HEADER_LOCATIONS.includes(m.location));

      const next: Record<TabId, MenuRecord> = {
        header: header
          ? { id: header.id, name: header.name || 'Main Menu', location: header.location, items: hydrateItems(header.items) }
          : { id: null, name: 'Main Menu', location: 'header', items: [] },
        footer_1: { id: null, name: 'Footer — Col 1', location: 'footer_column_1', items: [] },
        footer_2: { id: null, name: 'Footer — Col 2', location: 'footer_column_2', items: [] },
        footer_3: { id: null, name: 'Footer — Col 3', location: 'footer_column_3', items: [] },
      };
      for (const tab of FOOTER_TABS) {
        const rec = menus.find((m) => m.location === tab.location);
        if (rec) next[tab.id] = { id: rec.id, name: rec.name || tab.label, location: tab.location, items: hydrateItems(rec.items) };
      }
      setRecords(next);
      setSnapshots({
        header: JSON.stringify(serializeItems(next.header.items)),
        footer_1: JSON.stringify(serializeItems(next.footer_1.items)),
        footer_2: JSON.stringify(serializeItems(next.footer_2.items)),
        footer_3: JSON.stringify(serializeItems(next.footer_3.items)),
      });
    } catch {
      /* keep empty defaults */
    } finally {
      setLoading(false);
    }
  }

  const record = records[activeTab];
  const items = record.items;
  const isHeader = activeTab === 'header';

  function setItems(updater: (prev: UIMenuItem[]) => UIMenuItem[]) {
    setRecords((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], items: updater(prev[activeTab].items) },
    }));
  }

  function patchItem(itemUid: string, patch: Partial<UIMenuItem>) {
    setItems((prev) => prev.map((it) => (it._uid === itemUid ? { ...it, ...patch } : it)));
  }

  function addLinks(links: MegaLink[]) {
    setItems((prev) => [...prev, ...hydrateItems(links)]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i._uid === String(active.id));
      const to = prev.findIndex((i) => i._uid === String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  const totalMegaLinks = useMemo(
    () => items.reduce((n, it) => n
      + (it.megaMenu?.columns || []).reduce((m: number, c: any) => m + (c.links?.length || 0), 0)
      + (it.children?.length || 0), 0),
    [items],
  );

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    try {
      const rec = records[activeTab];
      const payloadItems = serializeItems(rec.items);
      if (rec.id) {
        await menusAPI.update(rec.id, { items: payloadItems, isActive: true });
      } else {
        const created = await menusAPI.create({
          name: rec.name,
          slug: rec.location.replace(/_/g, '-'),
          location: rec.location,
          isActive: true,
          items: payloadItems,
        });
        const newId = created?._id || created?.id || null;
        setRecords((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], id: newId } }));
      }
      // Legacy mirror some older storefront builds read.
      if (isHeader) await api.put('/settings', { menu: { items: payloadItems } }).catch(() => {});
      setSnapshots((prev) => ({ ...prev, [activeTab]: JSON.stringify(payloadItems) }));
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (error: any) {
      setSaveMsg(error?.response?.data?.message || 'Failed to save');
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
          <MenuIcon size={18} className="text-gray-500" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Menus</h1>
            <p className="text-xs text-gray-500">
              {isHeader
                ? <>Editing <span className="font-semibold text-gray-700">{record.name}</span> (location <code className="text-[11px] bg-gray-100 px-1 rounded">{record.location}</code>) — the menu the storefront renders</>
                : 'Configure navigation menus for your storefront'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs font-semibold ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</span>
          )}
          {dirtyTabs[activeTab] && !saveMsg && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={13} />}
            Save Menu
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {([{ id: 'header' as TabId, label: 'Header Navigation' }, ...FOOTER_TABS.map((t) => ({ id: t.id as TabId, label: t.label }))]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-full ${
                activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {records[tab.id].items.length}
              </span>
              {dirtyTabs[tab.id] && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-6 flex gap-6 items-start">
        {/* Left: add-items panel */}
        <div className="w-72 flex-shrink-0 sticky top-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add to menu</p>
          <AddContentPanel
            key={addPanelKey}
            onAdd={addLinks}
            onClose={() => setAddPanelKey((k) => k + 1)}
            categories={categories}
            pages={pages}
            brands={brands}
            attributes={attributes}
          />
          <button
            type="button"
            onClick={() => addLinks([{ label: '', type: 'link', target: '' }])}
            className="mt-2 w-full py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus size={11} /> Add blank item
          </button>
          {isHeader && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              Tip: expand an item to build its dropdown — simple link lists or full
              mega-menu columns with headlines, images and a featured promo card.
            </p>
          )}
        </div>

        {/* Right: menu structure */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Menu structure
              <span className="ml-2 font-normal normal-case text-gray-400">
                ({items.length} item{items.length !== 1 ? 's' : ''}{isHeader && totalMegaLinks > 0 ? ` · ${totalMegaLinks} dropdown links` : ''})
              </span>
            </p>
            {activeTab !== 'header' && (
              <p className="text-xs text-gray-400">{FOOTER_TABS.find((t) => t.id === activeTab)?.hint}</p>
            )}
          </div>

          {items.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-16 flex flex-col items-center justify-center text-gray-400">
              <MenuIcon size={24} className="mb-2 text-gray-200" />
              <p className="text-sm">No menu items yet</p>
              <p className="text-xs mt-1">Add items from the panel on the left</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i._uid)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {items.map((item) => (
                    <MenuItemRow
                      key={item._uid}
                      item={item}
                      onPatch={(patch) => patchItem(item._uid, patch)}
                      onRemove={() => setItems((prev) => prev.filter((i) => i._uid !== item._uid))}
                      categories={categories}
                      pages={pages}
                      brands={brands}
                      attributes={attributes}
                      isHeader={isHeader}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppearanceMenus;
