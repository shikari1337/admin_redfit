/**
 * MegaMenuEditor — drag-and-drop GUI builder for a nav item's dropdown content.
 *
 * A menu item's dropdown is one of three modes:
 *   none  → plain link, no dropdown
 *   list  → a flat `children` list (storefront renders it as the dense grid — ideal for Brands)
 *   mega  → `megaMenu.columns` (side-by-side titled columns + optional featured promo card)
 *
 * Columns reorder by dragging their header grip; links drag within AND between
 * columns. Every link can point at a category / attribute value / page / brand /
 * custom URL and carry its own icon + image. All unknown stored fields are
 * preserved through the round-trip (the editor only touches what it renders).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners,
  useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, horizontalListSortingStrategy,
  sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp, Pencil, X, Link2, Tag,
  FileText, Star, SlidersHorizontal, Eye, EyeOff, Columns3, List, Ban, Search,
  ArrowRight, Image as ImageIcon, Check, Settings2,
} from 'lucide-react';
import IconPicker, { getIconComponent } from '../IconPicker';
import ImageInputWithActions from '../common/ImageInputWithActions';

// ─── Shared types + helpers (also used by AppearanceMenus) ────────────────────

export interface LookupItem { _id: string; name: string; slug: string }
export interface AttributeItem { _id: string; name: string; slug: string; values: { name: string; slug: string }[] }
export type LinkType = 'link' | 'category' | 'page' | 'brand' | 'attribute';

export interface MegaLink {
  label: string;
  type: LinkType;
  target: string;
  url?: string;
  icon?: string;
  image?: string;
  openInNewTab?: boolean;
  [key: string]: any;
}

export function buildUrl(type: string, target?: string): string {
  if (!target) return '#';
  if (type === 'category') return `/category/${target}`;
  if (type === 'page') return `/${target}`;
  if (type === 'brand') return `/brand/${target}`;
  if (type === 'attribute') return `/search?attribute=${target}`;
  return target;
}

export const TYPE_META: Record<LinkType, { label: string; Icon: React.ComponentType<any>; tone: string }> = {
  category: { label: 'Category', Icon: Tag, tone: 'bg-emerald-50 text-emerald-700' },
  attribute: { label: 'Attribute', Icon: SlidersHorizontal, tone: 'bg-violet-50 text-violet-700' },
  page: { label: 'Page', Icon: FileText, tone: 'bg-sky-50 text-sky-700' },
  brand: { label: 'Brand', Icon: Star, tone: 'bg-amber-50 text-amber-700' },
  link: { label: 'Link', Icon: Link2, tone: 'bg-gray-100 text-gray-600' },
};

let uidCounter = 0;
export const uid = () => `u${++uidCounter}-${Math.random().toString(36).slice(2, 8)}`;

interface UILink extends MegaLink { _uid: string }
interface UIColumn { _uid: string; title: string; links: UILink[]; [key: string]: any }

const hydrateLink = (l: any): UILink => ({ label: '', type: 'link', target: '', ...l, _uid: uid() });
const stripLink = (l: UILink): MegaLink => {
  const { _uid, ...rest } = l;
  return { ...rest, url: buildUrl(rest.type, rest.target) };
};

// ─── SearchSelect — searchable single-value picker (scales to 500+ options) ───

export function SearchSelect({
  options, value, onChange, placeholder = 'Select…', className = '',
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ(''); }}
        className="w-full flex items-center justify-between gap-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white hover:border-blue-400 focus:outline-none focus:border-blue-500 text-left"
      >
        <span className={`truncate ${current ? 'text-gray-800' : 'text-gray-400'}`}>
          {current?.label || placeholder}
        </span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 left-0 right-0 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
            <Search size={11} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full text-xs bg-transparent focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No matches</p>}
            {filtered.slice(0, 300).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-left hover:bg-blue-50 ${o.value === value ? 'text-blue-700 font-semibold bg-blue-50/60' : 'text-gray-700'}`}
              >
                {o.value === value && <Check size={11} className="shrink-0" />}
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Link visual glyph (image → icon → type glyph) ────────────────────────────

export function LinkGlyph({ link, size = 28 }: { link: MegaLink; size?: number }) {
  const TypeIcon = TYPE_META[link.type]?.Icon || Link2;
  const IconComp = link.icon ? getIconComponent(link.icon) : null;
  return (
    <span
      className="relative rounded-lg overflow-hidden shrink-0 bg-blue-50 ring-1 ring-black/[0.05] flex items-center justify-center text-blue-500"
      style={{ width: size, height: size }}
    >
      {IconComp ? <IconComp size={Math.round(size * 0.5)} /> : <TypeIcon size={Math.round(size * 0.45)} className="opacity-60" />}
      {link.image && (
        <img
          src={link.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </span>
  );
}

// ─── AddContentPanel — searchable multi-select across all linkable content ────

export function AddContentPanel({
  onAdd, onClose, categories, pages, brands, attributes, defaultType = 'category',
}: {
  onAdd: (links: MegaLink[]) => void;
  onClose: () => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
  defaultType?: LinkType;
}) {
  const [type, setType] = useState<LinkType>(defaultType);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attrOpen, setAttrOpen] = useState<AttributeItem | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const list: LookupItem[] = type === 'category' ? categories : type === 'page' ? pages : type === 'brand' ? brands : [];
  const filtered = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const filteredAttrs = attributes.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (key: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  const visibleKeys: string[] =
    type === 'attribute'
      ? (attrOpen ? attrOpen.values.map((v) => `${attrOpen.slug}:${v.slug}`) : [])
      : filtered.map((i) => i.slug);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev);
    visibleKeys.forEach((k) => (allSelected ? n.delete(k) : n.add(k)));
    return n;
  });

  function handleAdd() {
    if (type === 'link') {
      if (!customUrl.trim() && !customLabel.trim()) return;
      onAdd([{ label: customLabel || customUrl, type: 'link', target: customUrl, url: customUrl }]);
    } else if (type === 'attribute') {
      const links: MegaLink[] = [];
      attributes.forEach((attr) => attr.values.forEach((val) => {
        const key = `${attr.slug}:${val.slug}`;
        if (selected.has(key)) links.push({ label: val.name, type: 'attribute', target: key, url: buildUrl('attribute', key) });
      }));
      if (!links.length) return;
      onAdd(links);
    } else {
      const items = list.filter((i) => selected.has(i.slug));
      if (!items.length) return;
      onAdd(items.map((i) => ({ label: i.name, type, target: i.slug, url: buildUrl(type, i.slug) })));
    }
    onClose();
  }

  const TABS: { id: LinkType; label: string }[] = [
    { id: 'category', label: 'Categories' },
    { id: 'attribute', label: 'Attributes' },
    { id: 'page', label: 'Pages' },
    { id: 'brand', label: 'Brands' },
    { id: 'link', label: 'Custom link' },
  ];

  return (
    <div className="border border-blue-200 rounded-lg bg-white shadow-sm p-2.5 space-y-2">
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setType(t.id); setSelected(new Set()); setSearch(''); setAttrOpen(null); }}
            className={`px-2 py-1 text-[11px] rounded-md font-semibold transition-colors ${
              type === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === 'link' ? (
        <div className="space-y-1.5">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Label"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          />
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https:// or /path"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          />
        </div>
      ) : type === 'attribute' && !attrOpen ? (
        <div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded mb-1.5">
            <Search size={11} className="text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search attributes…" className="w-full text-xs focus:outline-none" />
          </div>
          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded">
            {filteredAttrs.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No attributes</p>}
            {filteredAttrs.map((attr) => (
              <button
                key={attr._id}
                type="button"
                onClick={() => { setAttrOpen(attr); setSearch(''); }}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50"
              >
                <span className="truncate">{attr.name}</span>
                <span className="text-gray-400 text-[10px]">({attr.values.length}) →</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {type === 'attribute' && attrOpen && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <button type="button" onClick={() => setAttrOpen(null)} className="text-[11px] text-blue-600 hover:underline">← Back</button>
              <span className="text-[11px] font-semibold text-gray-700">{attrOpen.name}</span>
            </div>
          )}
          {type !== 'attribute' && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded mb-1.5">
              <Search size={11} className="text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${type}s…`} className="w-full text-xs focus:outline-none" />
            </div>
          )}
          <div className="max-h-40 overflow-y-auto border border-gray-100 rounded">
            {visibleKeys.length > 0 && (
              <button type="button" onClick={toggleAll} className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 border-b border-gray-100">
                <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${allSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                  {allSelected && <Check size={9} />}
                </span>
                Select all
              </button>
            )}
            {type === 'attribute' && attrOpen
              ? attrOpen.values.map((v) => {
                  const key = `${attrOpen.slug}:${v.slug}`;
                  return (
                    <button key={key} type="button" onClick={() => toggle(key)} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50">
                      <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${selected.has(key) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                        {selected.has(key) && <Check size={9} />}
                      </span>
                      <span className="truncate">{v.name}</span>
                    </button>
                  );
                })
              : filtered.map((i) => (
                  <button key={i._id} type="button" onClick={() => toggle(i.slug)} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50">
                    <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${selected.has(i.slug) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                      {selected.has(i.slug) && <Check size={9} />}
                    </span>
                    <span className="truncate">{i.name}</span>
                  </button>
                ))}
            {type !== 'attribute' && filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Nothing found</p>}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleAdd}
          disabled={type === 'link' ? (!customUrl.trim() && !customLabel.trim()) : selected.size === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          Add {selected.size > 0 && type !== 'link' ? `(${selected.size})` : ''}
        </button>
        <button type="button" onClick={onClose} className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}

// ─── Link edit form (shared by column links + simple-list links) ──────────────

function LinkEditFields({
  link, onChange, categories, pages, brands, attributes,
}: {
  link: UILink;
  onChange: (updated: UILink) => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const attrParts = link.type === 'attribute' ? link.target.split(':') : [];
  const attrSlug = attrParts[0] || '';
  const valueSlug = attrParts[1] || '';
  const attr = attributes.find((a) => a.slug === attrSlug);

  const targetOptions =
    link.type === 'category' ? categories.map((c) => ({ value: c.slug, label: c.name }))
    : link.type === 'page' ? pages.map((p) => ({ value: p.slug, label: p.name }))
    : link.type === 'brand' ? brands.map((b) => ({ value: b.slug, label: b.name }))
    : [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={link.label}
          onChange={(e) => onChange({ ...link, label: e.target.value })}
          placeholder="Label"
          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        />
        <select
          value={link.type}
          onChange={(e) => onChange({ ...link, type: e.target.value as LinkType, target: '', url: '' })}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
        >
          <option value="category">Category</option>
          <option value="attribute">Attribute</option>
          <option value="page">Page</option>
          <option value="brand">Brand</option>
          <option value="link">Custom link</option>
        </select>
      </div>

      {link.type === 'attribute' ? (
        <div className="grid grid-cols-2 gap-2">
          <SearchSelect
            options={attributes.map((a) => ({ value: a.slug, label: a.name }))}
            value={attrSlug}
            onChange={(s) => onChange({ ...link, target: s ? `${s}:` : '', url: '' })}
            placeholder="Attribute…"
          />
          <SearchSelect
            options={(attr?.values || []).map((v) => ({ value: v.slug, label: v.name }))}
            value={valueSlug}
            onChange={(v) => {
              const key = `${attrSlug}:${v}`;
              const valName = attr?.values.find((x) => x.slug === v)?.name || v;
              onChange({ ...link, target: key, url: buildUrl('attribute', key), label: link.label || valName });
            }}
            placeholder="Value…"
          />
        </div>
      ) : link.type === 'link' ? (
        <input
          value={link.target}
          onChange={(e) => onChange({ ...link, target: e.target.value, url: e.target.value })}
          placeholder="https:// or /path"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        />
      ) : (
        <SearchSelect
          options={targetOptions}
          value={link.target}
          onChange={(t) => {
            const name = targetOptions.find((o) => o.value === t)?.label || '';
            onChange({ ...link, target: t, url: buildUrl(link.type, t), label: link.label || name });
          }}
          placeholder={`Select ${link.type}…`}
        />
      )}

      <div className="grid grid-cols-2 gap-2 items-start">
        <IconPicker value={link.icon || ''} onChange={(id) => onChange({ ...link, icon: id })} label="Icon" />
        <ImageInputWithActions value={link.image || ''} onChange={(url) => onChange({ ...link, image: url })} label="Image (overrides icon)" />
      </div>

      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={!!link.openInNewTab}
          onChange={(e) => onChange({ ...link, openInNewTab: e.target.checked })}
          className="rounded border-gray-300"
        />
        Open in new tab
      </label>
    </div>
  );
}

// ─── Sortable link card ───────────────────────────────────────────────────────

function SortableLinkCard({
  link, onChange, onRemove, categories, pages, brands, attributes,
}: {
  link: UILink;
  onChange: (updated: UILink) => void;
  onRemove: () => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const [editing, setEditing] = useState(false);
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `link:${link._uid}` });
  const meta = TYPE_META[link.type] || TYPE_META.link;
  const hidden = link.isVisible === false;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-white ${isDragging ? 'opacity-40 border-blue-300' : editing ? 'border-blue-300 shadow-sm' : 'border-gray-150 border-gray-200'} ${hidden && !isDragging ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1.5">
        <button
          type="button"
          {...dndAttrs}
          {...listeners}
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label={`Drag ${link.label || 'link'}`}
        >
          <GripVertical size={13} />
        </button>
        <LinkGlyph link={link} size={30} />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditing((e) => !e)}>
          <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
            {link.label || <span className="text-gray-400 italic font-normal">Untitled</span>}
          </p>
          <span className="flex items-center gap-1 mt-0.5">
            <span className={`inline-block text-[9.5px] font-bold px-1 py-px rounded ${meta.tone}`}>{meta.label}</span>
            {hidden && <span className="inline-block text-[9.5px] font-bold px-1 py-px rounded bg-orange-50 text-orange-600">Hidden</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...link, isVisible: hidden ? undefined : false })}
          className={`p-1 shrink-0 rounded ${hidden ? 'text-orange-500 bg-orange-50' : 'text-gray-300 hover:text-gray-500'}`}
          title={hidden ? 'Hidden on storefront — click to show' : 'Visible — click to hide'}
        >
          {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="p-1 text-gray-400 hover:text-blue-600 shrink-0" aria-label="Edit link">
          {editing ? <X size={12} /> : <Pencil size={11} />}
        </button>
        <button type="button" onClick={onRemove} className="p-1 text-gray-300 hover:text-red-500 shrink-0" aria-label="Remove link">
          <Trash2 size={11} />
        </button>
      </div>
      {editing && (
        <div className="px-2 pb-2 pt-1.5 border-t border-blue-100">
          <LinkEditFields link={link} onChange={onChange} categories={categories} pages={pages} brands={brands} attributes={attributes} />
        </div>
      )}
    </div>
  );
}

// ─── Sortable column ──────────────────────────────────────────────────────────

function SortableColumn({
  column, onTitle, onSettings, onRemove, onLinkChange, onLinkRemove, onAddLinks,
  categories, pages, brands, attributes,
}: {
  column: UIColumn;
  onTitle: (t: string) => void;
  onSettings: (patch: Partial<UIColumn>) => void;
  onRemove: () => void;
  onLinkChange: (linkUid: string, updated: UILink) => void;
  onLinkRemove: (linkUid: string) => void;
  onAddLinks: (links: MegaLink[]) => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `col:${column._uid}` });

  const colHidden = column.isVisible === false;
  const cap = Number(column.maxVisible) > 0 ? Number(column.maxVisible) : 0;
  const visibleLinks = column.links.filter((l) => l.isVisible !== false).length;
  const capped = cap > 0 && visibleLinks > cap;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`w-[290px] shrink-0 rounded-xl border bg-gray-50/80 flex flex-col ${isDragging ? 'opacity-40 border-blue-300' : colHidden ? 'border-orange-200' : 'border-gray-200'}`}
    >
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-gray-200/70">
        <button
          type="button"
          {...dndAttrs}
          {...listeners}
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Drag column"
        >
          <GripVertical size={14} />
        </button>
        <input
          value={column.title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Column headline"
          className="flex-1 min-w-0 text-xs font-bold uppercase tracking-wide border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-1.5 py-1 bg-transparent focus:bg-white focus:outline-none text-gray-700 placeholder:font-medium placeholder:normal-case placeholder:tracking-normal"
        />
        <span className="text-[10px] text-gray-400 font-semibold shrink-0">{column.links.length}</span>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className={`p-1 shrink-0 rounded ${showSettings ? 'text-blue-600 bg-blue-50' : colHidden || capped ? 'text-blue-500' : 'text-gray-300 hover:text-gray-500'}`}
          title="Column settings (visibility, items to show, View-all link)"
        >
          <Settings2 size={12} />
        </button>
        <button
          type="button"
          onClick={() => { if (!column.links.length || window.confirm(`Delete this column and its ${column.links.length} links?`)) onRemove(); }}
          className="p-1 text-gray-300 hover:text-red-500 shrink-0"
          aria-label="Delete column"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {(colHidden || capped) && !showSettings && (
        <div className="flex items-center gap-1 px-2.5 pt-1.5 flex-wrap">
          {colHidden && <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-orange-50 text-orange-600">Hidden on storefront</span>}
          {capped && <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-blue-50 text-blue-600">Shows top {cap} + View all</span>}
        </div>
      )}

      {showSettings && (
        <div className="px-2.5 py-2 border-b border-gray-200/70 bg-white space-y-2">
          <label className="flex items-center justify-between text-[11px] font-medium text-gray-600 cursor-pointer">
            <span>Visible on storefront</span>
            <input
              type="checkbox"
              checked={!colHidden}
              onChange={(e) => onSettings({ isVisible: e.target.checked ? undefined : false })}
              className="rounded border-gray-300"
            />
          </label>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
            <span className="shrink-0">Show</span>
            <input
              type="number"
              min={1}
              value={cap || ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                onSettings({ maxVisible: Number.isFinite(v) && v > 0 ? v : undefined });
              }}
              placeholder="all"
              className="w-14 text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-400"
            />
            <span className="text-gray-500 font-normal">items on desktop; rest behind “View all”</span>
          </div>
          {cap > 0 && (
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">“View all” link</label>
              <input
                value={column.viewAllUrl || ''}
                onChange={(e) => onSettings({ viewAllUrl: e.target.value || undefined })}
                placeholder="Default: this menu item’s link"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
          )}
          <p className="text-[10px] text-gray-400 leading-snug">Mobile always shows the full list; the cap only tidies the desktop panel.</p>
        </div>
      )}

      <div className="flex-1 p-1.5 space-y-1.5 min-h-[60px]">
        <SortableContext items={column.links.map((l) => `link:${l._uid}`)} strategy={verticalListSortingStrategy}>
          {column.links.map((link) => (
            <SortableLinkCard
              key={link._uid}
              link={link}
              onChange={(u) => onLinkChange(link._uid, u)}
              onRemove={() => onLinkRemove(link._uid)}
              categories={categories}
              pages={pages}
              brands={brands}
              attributes={attributes}
            />
          ))}
        </SortableContext>
        {column.links.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            Drop links here, or add below
          </p>
        )}
      </div>

      <div className="p-1.5 pt-0">
        {adding ? (
          <AddContentPanel
            onAdd={onAddLinks}
            onClose={() => setAdding(false)}
            categories={categories}
            pages={pages}
            brands={brands}
            attributes={attributes}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
          >
            <Plus size={11} /> Add content
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Simple list board (children mode) — its own single-column DndContext ─────

function SimpleLinksBoard({
  links, setLinks, categories, pages, brands, attributes,
}: {
  links: UILink[];
  setLinks: (updater: (prev: UILink[]) => UILink[]) => void;
  categories: LookupItem[];
  pages: LookupItem[];
  brands: LookupItem[];
  attributes: AttributeItem[];
}) {
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLinks((prev) => {
      const from = prev.findIndex((l) => `link:${l._uid}` === String(active.id));
      const to = prev.findIndex((l) => `link:${l._uid}` === String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={links.map((l) => `link:${l._uid}`)} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {links.map((link) => (
              <SortableLinkCard
                key={link._uid}
                link={link}
                onChange={(u) => setLinks((prev) => prev.map((l) => (l._uid === link._uid ? u : l)))}
                onRemove={() => setLinks((prev) => prev.filter((l) => l._uid !== link._uid))}
                categories={categories}
                pages={pages}
                brands={brands}
                attributes={attributes}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {links.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-5 border border-dashed border-gray-200 rounded-lg">
          No links yet — add categories, brands, pages or custom links below
        </p>
      )}
      <div className="mt-2 max-w-md">
        {adding ? (
          <AddContentPanel
            onAdd={(newLinks) => setLinks((prev) => [...prev, ...newLinks.map(hydrateLink)])}
            onClose={() => setAdding(false)}
            categories={categories}
            pages={pages}
            brands={brands}
            attributes={attributes}
            defaultType="brand"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
          >
            <Plus size={11} /> Add links
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Live preview (approximates the storefront mega panel) ────────────────────

/**
 * Mirrors storefront Header.tsx EXACTLY: hidden columns/links filtered out,
 * per-column maxVisible caps with a "View all" tail, and the single-column
 * rebalance (one long strip splits into up to 4 balanced columns). Every
 * remaining link renders — what you see here is what ships.
 */
function previewColumns(columns: UIColumn[]): UIColumn[] {
  const cols = columns
    .filter((c) => c.isVisible !== false)
    .map((c) => {
      const links = c.links.filter((l) => l.isVisible !== false);
      const cap = Number(c.maxVisible) > 0 ? Number(c.maxVisible) : 0;
      if (cap && links.length > cap) {
        const tail: UILink = { _uid: `${c._uid}-viewall`, label: `View all (+${links.length - cap} more)`, type: 'link', target: '', _viewAll: true };
        return { ...c, links: [...links.slice(0, cap), tail] };
      }
      return { ...c, links };
    })
    .filter((c) => c.links.length > 0);
  const totalLinks = cols.reduce((n, c) => n + c.links.length, 0);
  if (cols.length === 1 && totalLinks > 6) {
    const flat = cols[0].links;
    const numCols = Math.min(4, Math.max(2, Math.ceil(flat.length / 6)));
    const perCol = Math.ceil(flat.length / numCols);
    const out: UIColumn[] = [];
    for (let i = 0; i < flat.length; i += perCol) out.push({ _uid: `re-${i}`, title: '', links: flat.slice(i, i + perCol) });
    return out;
  }
  return cols;
}

function MegaPreview({
  itemLabel, itemIcon, columns, featured,
}: {
  itemLabel: string;
  itemIcon?: string;
  columns: UIColumn[];
  featured: { image?: string; link?: string; alt?: string; kicker?: string; title?: string; cta?: string };
}) {
  const ItemIcon = itemIcon ? getIconComponent(itemIcon) : null;
  const cols = previewColumns(columns);
  return (
    <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="border-t-2 border-blue-600 px-5 py-4">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              {ItemIcon ? <ItemIcon size={15} /> : <Columns3 size={15} />}
            </span>
            <div>
              <p className="text-[13px] font-black text-gray-900 leading-none">{itemLabel || 'Menu item'}</p>
              <p className="text-[10px] text-gray-400 mt-1">Explore the {(itemLabel || 'item').toLowerCase()} range</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5">View all <ArrowRight size={11} /></span>
        </div>
        <div className="flex gap-5 items-stretch">
          <div className="flex-1 grid gap-x-4 gap-y-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(cols.length, 1), 4)}, minmax(0, 1fr))` }}>
            {cols.map((col) => (
              <div key={col._uid}>
                {col.title && (
                  <p className="text-[9.5px] font-black text-blue-600/80 uppercase tracking-widest mb-1.5 pb-1.5 border-b border-gray-100">{col.title}</p>
                )}
                {col.links.map((link) => (
                  link._viewAll ? (
                    <p key={link._uid} className="flex items-center gap-1 py-1.5 text-[11.5px] font-bold text-blue-600">
                      {link.label} <ArrowRight size={11} />
                    </p>
                  ) : (
                    <div key={link._uid} className="flex items-center gap-2 py-1">
                      <LinkGlyph link={link} size={30} />
                      <span className="text-[11.5px] font-semibold text-gray-700 truncate">{link.label || 'Untitled'}</span>
                    </div>
                  )
                ))}
              </div>
            ))}
            {cols.length === 0 && <p className="text-xs text-gray-400 py-6">No visible columns with links yet</p>}
          </div>
          <div className="w-[200px] shrink-0 relative rounded-xl overflow-hidden bg-gray-100 min-h-[150px]">
            {featured.image ? (
              <>
                <img src={featured.image} alt={featured.alt || ''} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-0 p-3 flex flex-col justify-end">
                  <p className="text-[8px] font-black uppercase tracking-widest text-amber-300 mb-0.5">{featured.kicker || 'Featured'}</p>
                  <p className="text-white font-black text-[12px] leading-tight">{featured.title || 'Promo headline'}</p>
                  <span className="mt-1.5 text-[9px] font-bold text-black bg-amber-300 px-2 py-1 rounded-full self-start">{featured.cta || 'Shop now'}</span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-1 p-3 text-center">
                <ImageIcon size={18} />
                <p className="text-[10px] leading-tight">No featured card set — the storefront shows an automatic promo</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

type Mode = 'none' | 'list' | 'mega';

interface MegaMenuEditorProps {
  /** Raw stored megaMenu object (any shape) — preserved losslessly. */
  megaMenu: any;
  /** Raw stored item.children (legacy simple dropdown). */
  childrenLinks?: any[];
  /** Called with the fields to merge onto the parent item. */
  onChange: (patch: { megaMenu?: any; children?: any[] }) => void;
  /** Stable id of the parent item — internal state re-initializes when it changes. */
  resetKey: string;
  itemLabel?: string;
  itemIcon?: string;
  categories?: LookupItem[];
  pages?: LookupItem[];
  brands?: LookupItem[];
  attributes?: AttributeItem[];
}

const MegaMenuEditor: React.FC<MegaMenuEditorProps> = ({
  megaMenu, childrenLinks, onChange, resetKey, itemLabel = '', itemIcon,
  categories = [], pages = [], brands = [], attributes = [],
}) => {
  const [mode, setMode] = useState<Mode>('none');
  const [columns, setColumns] = useState<UIColumn[]>([]);
  const [listLinks, setListLinksState] = useState<UILink[]>([]);
  const [featured, setFeatured] = useState<{ image: string; link: string; alt: string; kicker: string; title: string; cta: string }>({ image: '', link: '', alt: '', kicker: '', title: '', cta: '' });
  const [showFeatured, setShowFeatured] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ kind: 'col' | 'link'; label: string } | null>(null);
  // Unknown megaMenu fields (layout etc.) survive the round-trip untouched.
  const extraRef = useRef<Record<string, any>>({});
  const hydratingRef = useRef(true);

  // Hydrate internal state from stored data — only when the parent item changes.
  useEffect(() => {
    hydratingRef.current = true;
    extraRef.current = {};
    if (megaMenu && typeof megaMenu === 'object') {
      const { isMegaMenu, columns: c, featuredImage, featuredImageLink, featuredImageAlt, featuredKicker, featuredTitle, featuredCta, ...rest } = megaMenu;
      extraRef.current = rest;
      setFeatured({
        image: featuredImage || '', link: featuredImageLink || '', alt: featuredImageAlt || '',
        kicker: featuredKicker || '', title: featuredTitle || '', cta: featuredCta || '',
      });
      setColumns((c || []).map((col: any) => ({ ...col, _uid: uid(), title: col.title || '', links: (col.links || []).map(hydrateLink) })));
    } else {
      setFeatured({ image: '', link: '', alt: '', kicker: '', title: '', cta: '' });
      setColumns([]);
    }
    setListLinksState((childrenLinks || []).map(hydrateLink));
    setMode(megaMenu?.isMegaMenu ? 'mega' : (childrenLinks?.length ? 'list' : 'none'));
    setShowFeatured(!!megaMenu?.featuredImage);
    // Allow the state above to settle before commits resume.
    const t = setTimeout(() => { hydratingRef.current = false; }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Commit upward on every real edit (skipped while hydrating).
  useEffect(() => {
    if (hydratingRef.current) return;
    const megaData = {
      ...extraRef.current,
      isMegaMenu: mode === 'mega',
      columns: columns.map(({ _uid, links, ...rest }) => ({ ...rest, links: links.map(stripLink) })),
      featuredImage: featured.image || undefined,
      featuredImageLink: featured.link || undefined,
      featuredImageAlt: featured.alt || undefined,
      featuredKicker: featured.kicker || undefined,
      featuredTitle: featured.title || undefined,
      featuredCta: featured.cta || undefined,
    };
    onChange({
      megaMenu: (mode === 'mega' || columns.length > 0) ? megaData : undefined,
      children: mode === 'list' ? listLinks.map(stripLink) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, columns, listLinks, featured]);

  const setListLinks = useCallback((updater: (prev: UILink[]) => UILink[]) => {
    setListLinksState(updater);
  }, []);

  // ── Mode switching (with data conversion) ──
  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === 'mega') {
      if (!columns.length && listLinks.length) {
        // list → mega: chunk the flat links into balanced columns of ≤12.
        const per = 12;
        const cols: UIColumn[] = [];
        for (let i = 0; i < listLinks.length; i += per) {
          cols.push({ _uid: uid(), title: '', links: listLinks.slice(i, i + per) });
        }
        setColumns(cols);
      } else if (!columns.length) {
        setColumns([{ _uid: uid(), title: '', links: [] }]);
      }
    } else if (next === 'list') {
      if (!listLinks.length && columns.some((c) => c.links.length)) {
        if (!window.confirm('Flatten the mega menu columns into one simple list? Column headlines are dropped.')) return;
        setListLinksState(columns.flatMap((c) => c.links));
      }
    } else if (next === 'none') {
      const total = columns.reduce((n, c) => n + c.links.length, 0) + listLinks.length;
      if (total > 0 && !window.confirm('Remove the dropdown from this menu item? (Mega menu columns are kept but disabled; simple links are removed.)')) return;
    }
    setMode(next);
  }

  // ── Mega board DnD ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('col:')) {
      const col = columns.find((c) => `col:${c._uid}` === id);
      setActiveDrag({ kind: 'col', label: col?.title || `Column (${col?.links.length ?? 0} links)` });
    } else if (id.startsWith('link:')) {
      const link = columns.flatMap((c) => c.links).find((l) => `link:${l._uid}` === id);
      setActiveDrag({ kind: 'link', label: link?.label || 'Link' });
    }
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    if (!a.startsWith('link:')) return;
    const aUid = a.slice(5);
    setColumns((prev) => {
      const fromIdx = prev.findIndex((c) => c.links.some((l) => l._uid === aUid));
      const toIdx = o.startsWith('col:')
        ? prev.findIndex((c) => c._uid === o.slice(4))
        : o.startsWith('link:')
          ? prev.findIndex((c) => c.links.some((l) => l._uid === o.slice(5)))
          : -1;
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = prev.map((c) => ({ ...c, links: [...c.links] }));
      const link = next[fromIdx].links.find((l) => l._uid === aUid)!;
      next[fromIdx].links = next[fromIdx].links.filter((l) => l._uid !== aUid);
      let insertAt = next[toIdx].links.length;
      if (o.startsWith('link:')) {
        const oi = next[toIdx].links.findIndex((l) => l._uid === o.slice(5));
        if (oi >= 0) insertAt = oi;
      }
      next[toIdx].links.splice(insertAt, 0, link);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    if (a.startsWith('col:') && o.startsWith('col:') && a !== o) {
      setColumns((prev) => {
        const from = prev.findIndex((c) => `col:${c._uid}` === a);
        const to = prev.findIndex((c) => `col:${c._uid}` === o);
        if (from < 0 || to < 0) return prev;
        return arrayMove(prev, from, to);
      });
      return;
    }
    if (a.startsWith('link:') && o.startsWith('link:') && a !== o) {
      setColumns((prev) => {
        const ci = prev.findIndex((c) => c.links.some((l) => l._uid === a.slice(5)));
        if (ci < 0) return prev;
        const ai = prev[ci].links.findIndex((l) => l._uid === a.slice(5));
        const oi = prev[ci].links.findIndex((l) => l._uid === o.slice(5));
        if (ai < 0 || oi < 0 || ai === oi) return prev;
        return prev.map((c, i) => (i === ci ? { ...c, links: arrayMove(c.links, ai, oi) } : c));
      });
    }
  }

  const totalLinks = columns.reduce((n, c) => n + c.links.length, 0);

  const MODES: { id: Mode; label: string; Icon: React.ComponentType<any>; hint: string }[] = [
    { id: 'none', label: 'No dropdown', Icon: Ban, hint: 'Plain link' },
    { id: 'list', label: 'Simple links', Icon: List, hint: 'Dense grid (great for Brands)' },
    { id: 'mega', label: 'Mega menu', Icon: Columns3, hint: 'Titled columns + promo card' },
  ];

  return (
    <div className="mt-2 pt-3 border-t border-gray-200">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Dropdown content</p>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMode(m.id)}
                title={m.hint}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <m.Icon size={12} /> {m.label}
              </button>
            ))}
          </div>
        </div>
        {mode === 'mega' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-medium">{columns.length} columns · {totalLinks} links</span>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                showPreview ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-600 border-blue-200 hover:bg-blue-50'
              }`}
            >
              <Eye size={11} /> Preview
            </button>
          </div>
        )}
      </div>

      {mode === 'list' && (
        <div className="mt-3">
          <p className="text-[11px] text-gray-400 mb-2">Renders as a dense multi-column grid on the storefront — drag to reorder.</p>
          <SimpleLinksBoard
            links={listLinks}
            setLinks={setListLinks}
            categories={categories}
            pages={pages}
            brands={brands}
            attributes={attributes}
          />
        </div>
      )}

      {mode === 'mega' && (
        <div className="mt-3 space-y-3">
          {/* Column canvas */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDrag(null)}
          >
            <SortableContext items={columns.map((c) => `col:${c._uid}`)} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-3 items-start overflow-x-auto pb-2">
                {columns.map((col) => (
                  <SortableColumn
                    key={col._uid}
                    column={col}
                    onTitle={(t) => setColumns((prev) => prev.map((c) => (c._uid === col._uid ? { ...c, title: t } : c)))}
                    onSettings={(patch) => setColumns((prev) => prev.map((c) => (c._uid === col._uid ? { ...c, ...patch } : c)))}
                    onRemove={() => setColumns((prev) => prev.filter((c) => c._uid !== col._uid))}
                    onLinkChange={(lu, u) => setColumns((prev) => prev.map((c) => (c._uid === col._uid ? { ...c, links: c.links.map((l) => (l._uid === lu ? u : l)) } : c)))}
                    onLinkRemove={(lu) => setColumns((prev) => prev.map((c) => (c._uid === col._uid ? { ...c, links: c.links.filter((l) => l._uid !== lu) } : c)))}
                    onAddLinks={(links) => setColumns((prev) => prev.map((c) => (c._uid === col._uid ? { ...c, links: [...c.links, ...links.map(hydrateLink)] } : c)))}
                    categories={categories}
                    pages={pages}
                    brands={brands}
                    attributes={attributes}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setColumns((prev) => [...prev, { _uid: uid(), title: '', links: [] }])}
                  className="w-[130px] shrink-0 self-stretch min-h-[120px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                >
                  <Plus size={16} />
                  <span className="text-[11px] font-semibold">Add column</span>
                </button>
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDrag && (
                <div className={`px-3 py-2 rounded-lg shadow-xl border text-xs font-semibold ${
                  activeDrag.kind === 'col' ? 'bg-gray-50 border-gray-300 text-gray-700' : 'bg-white border-blue-300 text-gray-800'
                }`}>
                  {activeDrag.label}
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Featured promo card */}
          <div className="border border-gray-200 rounded-xl bg-white">
            <button
              type="button"
              onClick={() => setShowFeatured((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-700"
            >
              <span className="flex items-center gap-1.5">
                <ImageIcon size={12} className="text-gray-400" />
                Featured promo card
                {featured.image
                  ? <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-emerald-50 text-emerald-700">Configured</span>
                  : <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-gray-100 text-gray-500">Auto</span>}
              </span>
              {showFeatured ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showFeatured && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <ImageInputWithActions
                    value={featured.image}
                    onChange={(url) => setFeatured((f) => ({ ...f, image: url }))}
                    label="Card image"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Link</label>
                      <input
                        value={featured.link}
                        onChange={(e) => setFeatured((f) => ({ ...f, link: e.target.value }))}
                        placeholder="/category/… or https://…"
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Image alt</label>
                      <input
                        value={featured.alt}
                        onChange={(e) => setFeatured((f) => ({ ...f, alt: e.target.value }))}
                        placeholder="Describe the image"
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Kicker</label>
                      <input
                        value={featured.kicker}
                        onChange={(e) => setFeatured((f) => ({ ...f, kicker: e.target.value }))}
                        placeholder="Featured"
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Headline</label>
                      <input
                        value={featured.title}
                        onChange={(e) => setFeatured((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Skin & Hair Care Range"
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Button text</label>
                      <input
                        value={featured.cta}
                        onChange={(e) => setFeatured((f) => ({ ...f, cta: e.target.value }))}
                        placeholder="Shop now"
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                  {featured.image && (
                    <button
                      type="button"
                      onClick={() => setFeatured({ image: '', link: '', alt: '', kicker: '', title: '', cta: '' })}
                      className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                    >
                      Clear card (use automatic promo)
                    </button>
                  )}
                </div>
                <div className="relative rounded-xl overflow-hidden bg-gray-100 min-h-[170px]">
                  {featured.image ? (
                    <>
                      <img src={featured.image} alt={featured.alt || ''} className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <div className="absolute inset-0 p-4 flex flex-col justify-end">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-300 mb-1">{featured.kicker || 'Featured'}</p>
                        <p className="text-white font-black text-[15px] leading-tight">{featured.title || 'Promo headline'}</p>
                        <span className="mt-2 text-[10px] font-bold text-black bg-amber-300 px-2.5 py-1 rounded-full self-start inline-flex items-center gap-1">
                          {featured.cta || 'Shop now'} <ArrowRight size={9} />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-1.5 p-4 text-center">
                      <ImageIcon size={20} />
                      <p className="text-[11px]">No image — the storefront picks an automatic promo card for this menu</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showPreview && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Eye size={11} /> Storefront preview (approximate)
              </p>
              <MegaPreview itemLabel={itemLabel} itemIcon={itemIcon} columns={columns} featured={featured} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MegaMenuEditor;
