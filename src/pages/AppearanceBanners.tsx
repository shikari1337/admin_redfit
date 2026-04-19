import { useEffect, useState, useRef } from 'react';
import { FaPlus, FaTrash, FaEdit, FaChevronUp, FaChevronDown, FaImage, FaTimes, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { bannersAPI, uploadAPI } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type BannerType = 'carousel' | 'grid' | 'slider' | 'featured' | 'hero';
type DisplayLocation = 'home_top' | 'home_middle' | 'home_bottom' | 'category_top' | 'search_top';

interface BannerItem {
  _id?: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  targetUrl?: string;
  displayOrder?: number;
}

interface Banner {
  _id: string;
  name: string;
  slug: string;
  type: BannerType;
  displayLocation: DisplayLocation;
  isActive: boolean;
  displayOrder: number;
  items: BannerItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATION_LABELS: Record<DisplayLocation, string> = {
  home_top: 'Home — Top',
  home_middle: 'Home — Middle',
  home_bottom: 'Home — Bottom',
  category_top: 'Category — Top',
  search_top: 'Search — Top',
};

const TYPE_LABELS: Record<BannerType, string> = {
  carousel: 'Carousel',
  slider: 'Slider',
  grid: 'Grid',
  featured: 'Featured',
  hero: 'Hero',
};

const ALL_LOCATIONS: DisplayLocation[] = ['home_top', 'home_middle', 'home_bottom', 'category_top', 'search_top'];
const ALL_TYPES: BannerType[] = ['carousel', 'slider', 'grid', 'featured', 'hero'];

const EMPTY_BANNER: Omit<Banner, '_id'> = {
  name: '',
  slug: '',
  type: 'carousel',
  displayLocation: 'home_top',
  isActive: true,
  displayOrder: 0,
  items: [],
};

const EMPTY_ITEM: BannerItem = {
  title: '',
  subtitle: '',
  imageUrl: '',
  mobileImageUrl: '',
  targetUrl: '',
  displayOrder: 0,
};

// ─── Item Editor ──────────────────────────────────────────────────────────────

function ItemEditor({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: BannerItem;
  index: number;
  total: number;
  onChange: (item: BannerItem) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mobileFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(index === 0);

  async function handleImageUpload(file: File, field: 'imageUrl' | 'mobileImageUrl') {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadAPI.uploadSingle(file, 'banners');
      const url = result?.url || result?.data?.url || result?.fileUrl || '';
      onChange({ ...item, [field]: url });
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Item header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          {item.imageUrl ? (
            <div className="flex items-center gap-2">
              <img src={item.imageUrl} alt="" className="h-8 w-14 object-cover rounded border border-gray-200" />
              <span className="text-sm text-gray-700 truncate">{item.title || 'Untitled slide'}</span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">No image yet</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
          >
            <FaArrowUp size={11} />
          </button>
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
          >
            <FaArrowDown size={11} />
          </button>
          <button
            className="p-1.5 text-red-400 hover:text-red-600"
            onClick={onRemove}
            title="Remove slide"
          >
            <FaTrash size={11} />
          </button>
        </div>
        <div className="text-gray-400">
          {expanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
        </div>
      </div>

      {/* Item body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4 grid grid-cols-1 gap-4">
          {/* Desktop image */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desktop Image <span className="text-red-500">*</span></label>
            {item.imageUrl ? (
              <div className="relative inline-block">
                <img src={item.imageUrl} alt="" className="h-24 rounded border border-gray-200 object-cover" />
                <button
                  className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-red-500"
                  onClick={() => onChange({ ...item, imageUrl: '' })}
                >
                  <FaTimes size={10} />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <FaImage size={14} />
                {uploading ? 'Uploading…' : 'Upload image'}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f, 'imageUrl');
                e.target.value = '';
              }}
            />
            <input
              type="text"
              value={item.imageUrl}
              onChange={(e) => onChange({ ...item, imageUrl: e.target.value })}
              placeholder="Or paste image URL"
              className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-600 focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Mobile image */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Image <span className="text-gray-400 font-normal">(optional)</span></label>
            {item.mobileImageUrl ? (
              <div className="relative inline-block">
                <img src={item.mobileImageUrl} alt="" className="h-16 rounded border border-gray-200 object-cover" />
                <button
                  className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-red-500"
                  onClick={() => onChange({ ...item, mobileImageUrl: '' })}
                >
                  <FaTimes size={10} />
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                onClick={() => mobileFileRef.current?.click()}
                disabled={uploading}
              >
                <FaImage size={14} />
                Upload mobile image
              </button>
            )}
            <input
              ref={mobileFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f, 'mobileImageUrl');
                e.target.value = '';
              }}
            />
          </div>

          {/* Title, subtitle, link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                type="text"
                value={item.title || ''}
                onChange={(e) => onChange({ ...item, title: e.target.value })}
                placeholder="Slide title"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle</label>
              <input
                type="text"
                value={item.subtitle || ''}
                onChange={(e) => onChange({ ...item, subtitle: e.target.value })}
                placeholder="Slide subtitle"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link URL</label>
            <input
              type="text"
              value={item.targetUrl || ''}
              onChange={(e) => onChange({ ...item, targetUrl: e.target.value })}
              placeholder="https://... or /path"
              className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Banner Form Modal ────────────────────────────────────────────────────────

function BannerModal({
  banner,
  onClose,
  onSave,
}: {
  banner: Partial<Banner> | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const isEdit = !!banner?._id;
  const [form, setForm] = useState<any>(() =>
    banner
      ? { ...EMPTY_BANNER, ...banner, items: (banner.items || []).map((it) => ({ ...it })) }
      : { ...EMPTY_BANNER }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function addItem() {
    setForm((prev: any) => ({
      ...prev,
      items: [...prev.items, { ...EMPTY_ITEM, displayOrder: prev.items.length }],
    }));
  }

  function updateItem(index: number, item: BannerItem) {
    setForm((prev: any) => {
      const items = [...prev.items];
      items[index] = item;
      return { ...prev, items };
    });
  }

  function removeItem(index: number) {
    setForm((prev: any) => {
      const items = prev.items.filter((_: any, i: number) => i !== index);
      return { ...prev, items };
    });
  }

  function moveItem(index: number, dir: -1 | 1) {
    setForm((prev: any) => {
      const items = [...prev.items];
      const target = index + dir;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items: items.map((it: BannerItem, i: number) => ({ ...it, displayOrder: i })) };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Banner name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Banner' : 'New Banner'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <FaTimes size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Banner Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Home Hero Banner"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Type + Location row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setField('type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Location</label>
              <select
                value={form.displayLocation}
                onChange={(e) => setField('displayLocation', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              >
                {ALL_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{LOCATION_LABELS[l]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Order + Active row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
              <input
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) => setField('displayOrder', parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex flex-col justify-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setField('isActive', !form.isActive)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.isActive ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm text-gray-700">{form.isActive ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
          </div>

          {/* Slides */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Slides / Items</span>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <FaPlus size={10} /> Add slide
              </button>
            </div>
            {form.items.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                No slides yet — click "Add slide" to begin
              </div>
            ) : (
              <div className="space-y-2">
                {form.items.map((item: BannerItem, idx: number) => (
                  <ItemEditor
                    key={idx}
                    item={item}
                    index={idx}
                    total={form.items.length}
                    onChange={(it) => updateItem(idx, it)}
                    onRemove={() => removeItem(idx)}
                    onMoveUp={() => moveItem(idx, -1)}
                    onMoveDown={() => moveItem(idx, 1)}
                  />
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Banner'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Banner Card ──────────────────────────────────────────────────────────────

function BannerCard({
  banner,
  onEdit,
  onDelete,
  onToggle,
}: {
  banner: Banner;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const previewImage = banner.items?.[0]?.imageUrl;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      {/* Preview */}
      <div className="h-28 bg-gray-100 relative overflow-hidden flex items-center justify-center">
        {previewImage ? (
          <img src={previewImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <FaImage size={24} />
            <span className="text-xs">No images</span>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${banner.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
            {banner.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {banner.items.length > 1 && (
          <div className="absolute bottom-2 left-2 text-xs bg-black/50 text-white rounded px-1.5 py-0.5">
            {banner.items.length} slides
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 py-3 flex-1">
        <p className="font-medium text-sm text-gray-900 truncate">{banner.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {TYPE_LABELS[banner.type]} · {LOCATION_LABELS[banner.displayLocation]}
        </p>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onToggle}
          className={`text-xs font-medium ${banner.isActive ? 'text-orange-500 hover:text-orange-600' : 'text-green-600 hover:text-green-700'}`}
        >
          {banner.isActive ? 'Deactivate' : 'Activate'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <FaEdit size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <FaTrash size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppearanceBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [modalBanner, setModalBanner] = useState<Partial<Banner> | null | false>(false);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await bannersAPI.getAll();
      setBanners(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load banners', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: any) {
    if (data._id) {
      await bannersAPI.update(data._id, data);
    } else {
      await bannersAPI.create(data);
    }
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await bannersAPI.delete(deleteTarget._id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error('Delete failed', e);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle(banner: Banner) {
    try {
      await bannersAPI.update(banner._id, { isActive: !banner.isActive });
      await load();
    } catch (e) {
      console.error('Toggle failed', e);
    }
  }

  const filtered = filterLocation === 'all'
    ? banners
    : banners.filter((b) => b.displayLocation === filterLocation);

  const showGrouped = filterLocation === 'all';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Banners</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage homepage and page banners</p>
        </div>
        <button
          onClick={() => setModalBanner({})}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FaPlus size={12} /> New Banner
        </button>
      </div>

      {/* Filter tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {[{ value: 'all', label: 'All' }, ...ALL_LOCATIONS.map((l) => ({ value: l, label: LOCATION_LABELS[l] }))].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterLocation(value)}
              className={`px-3 py-3 text-sm whitespace-nowrap border-b-2 transition-colors font-medium ${
                filterLocation === value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {value !== 'all' && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({banners.filter((b) => b.displayLocation === value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Loading banners…</div>
        ) : banners.length === 0 ? (
          <div className="text-center py-24">
            <FaImage size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No banners yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first banner to display on your storefront</p>
            <button
              onClick={() => setModalBanner({})}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Banner
            </button>
          </div>
        ) : showGrouped ? (
          <div className="space-y-8">
            {ALL_LOCATIONS.map((loc) => {
              const items = banners.filter((b) => b.displayLocation === loc);
              if (items.length === 0) return null;
              return (
                <div key={loc}>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {LOCATION_LABELS[loc]}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {items.map((banner) => (
                      <BannerCard
                        key={banner._id}
                        banner={banner}
                        onEdit={() => setModalBanner(banner)}
                        onDelete={() => setDeleteTarget(banner)}
                        onToggle={() => handleToggle(banner)}
                      />
                    ))}
                    <button
                      onClick={() => setModalBanner({ displayLocation: loc })}
                      className="border-2 border-dashed border-gray-200 rounded-xl h-[11rem] flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
                    >
                      <FaPlus size={16} />
                      <span className="text-xs font-medium">Add banner</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Empty state when all locations have 0 banners */}
            {ALL_LOCATIONS.every((loc) => banners.filter((b) => b.displayLocation === loc).length === 0) && (
              <div className="text-center py-16 text-gray-400 text-sm">No banners match the current filter.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((banner) => (
              <BannerCard
                key={banner._id}
                banner={banner}
                onEdit={() => setModalBanner(banner)}
                onDelete={() => setDeleteTarget(banner)}
                onToggle={() => handleToggle(banner)}
              />
            ))}
            <button
              onClick={() => setModalBanner({ displayLocation: filterLocation as DisplayLocation })}
              className="border-2 border-dashed border-gray-200 rounded-xl h-[11rem] flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
            >
              <FaPlus size={16} />
              <span className="text-xs font-medium">Add banner</span>
            </button>
          </div>
        )}
      </div>

      {/* Banner Form Modal */}
      {modalBanner !== false && (
        <BannerModal
          banner={modalBanner || null}
          onClose={() => setModalBanner(false)}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete banner?</h3>
            <p className="text-sm text-gray-500 mb-6">
              "<span className="font-medium text-gray-700">{deleteTarget.name}</span>" will be permanently deleted.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
