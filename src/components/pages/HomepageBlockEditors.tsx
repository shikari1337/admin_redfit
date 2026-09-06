import React from 'react';
import ImageInputWithActions from '../common/ImageInputWithActions';

/**
 * Schema-driven editors for the STOREFRONT HOME PAGE block types
 * (hero-carousel, product-row, brand-grid, health-concerns-grid, …). These
 * render on the storefront via `storefront/src/app/page.tsx` and are distinct
 * from the CMS-page block types (hero, text, product-cards…) in BlockEditors.tsx.
 *
 * One generic renderer + a per-type field schema keeps every homepage section
 * editable from admin ▸ Appearance ▸ Pages ▸ Home — no raw-JSON fallback, and
 * new section types only need a schema entry.
 */

type FieldType = 'text' | 'textarea' | 'number' | 'url' | 'image' | 'select' | 'list' | 'group' | 'stringlist';

interface Field {
  key: string;                    // supports dot paths e.g. "config.collection"
  label: string;
  type: FieldType;
  help?: string;
  options?: { value: string; label: string }[];   // select
  itemFields?: Field[];           // list (array of objects)
  itemLabel?: string;             // list
  fields?: Field[];               // group (nested object)
}

// ── dot-path get/set (immutable) ─────────────────────────────────────────────
function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const next = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return next;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-emerald-500';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

// ── Per-type schemas ─────────────────────────────────────────────────────────
const COLLECTION_OPTS = [
  { value: '', label: '— none (use Sort below) —' },
  { value: 'trending', label: 'Trending (by recent sales)' },
  { value: 'bestsellers', label: 'Bestsellers (by all-time sales)' },
  { value: 'new-arrivals', label: 'New Arrivals (newest)' },
];
const SORT_OPTS = [
  { value: '', label: 'Default' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'popular', label: 'Most reviewed' },
  { value: 'price-asc', label: 'Price: low → high' },
  { value: 'price-desc', label: 'Price: high → low' },
];
const ACCENT_OPTS = [
  { value: 'primary', label: 'Primary' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'alt', label: 'Alt grey' },
];

const titleSub: Field[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'subtitle', label: 'Subtitle', type: 'text' },
];
const bannerFields: Field[] = [
  { key: 'imageUrl', label: 'Image URL', type: 'image' },
  { key: 'buttonUrl', label: 'Link URL', type: 'url' },
];
const iconItem: Field[] = [
  { key: 'icon', label: 'Icon', type: 'text', help: 'Lucide name (e.g. Truck) or an emoji' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'desc', label: 'Description', type: 'text' },
];
const splitSide: Field[] = [
  { key: 'imageUrl', label: 'Image URL', type: 'image' },
  { key: 'badge', label: 'Badge', type: 'text' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'subtitle', label: 'Subtitle', type: 'text' },
  { key: 'buttonText', label: 'Button text', type: 'text' },
  { key: 'buttonUrl', label: 'Button link', type: 'url' },
];

export const HOMEPAGE_SCHEMAS: Record<string, Field[]> = {
  'hero-carousel': [
    { key: 'items', label: 'Slides', type: 'list', itemLabel: 'Slide', itemFields: [
      { key: 'imageUrl', label: 'Image URL', type: 'image' },
      { key: 'buttonText', label: 'Button text', type: 'text' },
      { key: 'buttonUrl', label: 'Button link', type: 'url' },
    ] },
  ],
  'trust-bar': [
    { key: 'items', label: 'Trust badges', type: 'list', itemLabel: 'Badge', itemFields: iconItem },
  ],
  'category-grid': [
    ...titleSub,
    { key: 'limit', label: 'Max categories', type: 'number' },
    { key: 'viewAllUrl', label: 'View-all link', type: 'url' },
  ],
  'brand-grid': [
    ...titleSub,
    { key: 'limit', label: 'Max brands', type: 'number', help: 'Ordered by brand preference rank' },
    { key: 'viewAllUrl', label: 'View-all link', type: 'url' },
  ],
  'health-concerns-grid': [
    ...titleSub,
    { key: 'parentSlug', label: 'Parent category slug', type: 'text', help: 'e.g. health-concerns (children shown A→Z)' },
    { key: 'limit', label: 'Max concerns', type: 'number' },
    { key: 'viewAllUrl', label: 'View-all link', type: 'url' },
  ],
  'product-row': [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'subtitle', label: 'Subtitle', type: 'text' },
    { key: 'badge', label: 'Badge', type: 'text', help: 'e.g. HOT, NEW, TOP RATED' },
    { key: 'accentColor', label: 'Accent colour', type: 'select', options: ACCENT_OPTS },
    { key: 'viewAllUrl', label: 'View-all link', type: 'url' },
    { key: 'config.collection', label: 'Collection', type: 'select', options: COLLECTION_OPTS,
      help: 'Bestsellers/Trending are computed from real sales and cached; leave blank to use Sort.' },
    { key: 'config.categorySlug', label: 'Category slug (optional)', type: 'text', help: 'Limit the row to one category' },
    { key: 'config.sort', label: 'Sort (when no collection)', type: 'select', options: SORT_OPTS },
    { key: 'config.limit', label: 'Number of products', type: 'number' },
  ],
  'promo-banners': [
    { key: 'columns', label: 'Columns', type: 'number' },
    { key: 'banners', label: 'Banners', type: 'list', itemLabel: 'Banner', itemFields: bannerFields },
  ],
  'full-width-banner': [
    { key: 'badge', label: 'Badge', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'subtitle', label: 'Subtitle', type: 'text' },
    { key: 'bgColor', label: 'Background', type: 'text', help: 'e.g. emerald-teal, or a colour' },
    { key: 'buttonText', label: 'Button text', type: 'text' },
    { key: 'buttonUrl', label: 'Button link', type: 'url' },
  ],
  'split-banner': [
    { key: 'left', label: 'Left panel', type: 'group', fields: splitSide },
    { key: 'right', label: 'Right panel', type: 'group', fields: splitSide },
  ],
  'why-choose-us': [
    ...titleSub,
    { key: 'items', label: 'Points', type: 'list', itemLabel: 'Point', itemFields: iconItem },
  ],
  'stats-bar': [
    { key: 'items', label: 'Stats', type: 'list', itemLabel: 'Stat', itemFields: [
      { key: 'icon', label: 'Icon', type: 'text' },
      { key: 'source', label: 'Live source', type: 'select', options: [
        { value: '', label: '— fixed value —' },
        { value: 'products', label: 'Products count' },
        { value: 'brands', label: 'Brands count' },
        { value: 'categories', label: 'Categories count' },
      ] },
      { key: 'value', label: 'Fixed value (if no source)', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
    ] },
  ],
  'info-strip': [
    { key: 'items', label: 'Items', type: 'list', itemLabel: 'Item', itemFields: iconItem },
  ],
  'testimonials': [
    ...titleSub,
    { key: 'items', label: 'Testimonials', type: 'list', itemLabel: 'Testimonial', itemFields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'rating', label: 'Rating (1–5)', type: 'number' },
      { key: 'text', label: 'Quote', type: 'textarea' },
      { key: 'product', label: 'Product / context', type: 'text' },
    ] },
  ],
  'newsletter': [
    ...titleSub,
    { key: 'badges', label: 'Badges', type: 'stringlist' },
  ],
  'faq-accordion': [
    ...titleSub,
    { key: 'source', label: 'Source', type: 'select', options: [
      { value: 'api', label: 'Store FAQs (automatic)' },
      { value: 'manual', label: 'Manual items' },
    ] },
    { key: 'limit', label: 'Max questions', type: 'number' },
  ],
  'cta-banner': [
    ...titleSub,
    { key: 'bgColor', label: 'Background', type: 'text' },
    { key: 'buttonText', label: 'Primary button text', type: 'text' },
    { key: 'buttonUrl', label: 'Primary button link', type: 'url' },
    { key: 'secondaryButtonText', label: 'Secondary button text', type: 'text' },
    { key: 'secondaryButtonUrl', label: 'Secondary button link', type: 'url' },
  ],
  'google-reviews': [
    ...titleSub,
  ],
};

export const HOMEPAGE_BLOCK_TYPES = Object.keys(HOMEPAGE_SCHEMAS);
export const isHomepageBlockType = (t: string): boolean => t in HOMEPAGE_SCHEMAS;

/** Sensible starter data when a homepage block is added from the picker. */
export function homepageBlockDefault(blockType: string): any {
  switch (blockType) {
    case 'hero-carousel': return { source: 'items', items: [{ imageUrl: '', buttonText: 'Shop Now', buttonUrl: '/products' }] };
    case 'trust-bar': return { items: [{ icon: 'ShieldCheck', title: '100% Authentic', desc: 'Genuine brands only' }] };
    case 'category-grid': return { title: 'Shop by Category', subtitle: 'Explore our range', limit: 14, viewAllUrl: '/categories' };
    case 'brand-grid': return { title: 'Trusted Brands', subtitle: "From India's top manufacturers", limit: 12, viewAllUrl: '/brands' };
    case 'health-concerns-grid': return { title: 'Shop by Health Concern', subtitle: 'Find remedies for your needs', parentSlug: 'health-concerns', limit: 16 };
    case 'product-row': return { title: 'New Section', subtitle: '', accentColor: 'primary', viewAllUrl: '/products', config: { collection: 'bestsellers', limit: 12 } };
    case 'promo-banners': return { columns: 1, banners: [{ imageUrl: '', buttonUrl: '/products' }] };
    case 'full-width-banner': return { badge: 'Free Shipping', title: 'Free delivery on orders above ₹500', subtitle: '', bgColor: 'emerald-teal', buttonText: 'Shop Now', buttonUrl: '/products' };
    case 'split-banner': return { left: { imageUrl: '', title: '', buttonText: 'Explore', buttonUrl: '/products' }, right: { imageUrl: '', title: '', buttonText: 'Shop Now', buttonUrl: '/products' } };
    case 'why-choose-us': return { title: 'Why Choose Us', subtitle: '', items: [{ icon: 'ShieldCheck', title: 'Authentic', desc: '' }] };
    case 'stats-bar': return { items: [{ icon: 'Package', source: 'products', label: 'Products' }] };
    case 'info-strip': return { items: [{ icon: '✅', title: 'Verified', desc: '' }] };
    case 'testimonials': return { title: 'What Our Customers Say', subtitle: '', items: [{ name: '', location: '', rating: 5, text: '', product: '' }] };
    case 'newsletter': return { title: 'Stay Updated', subtitle: '', badges: ['No spam', 'Unsubscribe anytime'] };
    case 'faq-accordion': return { title: 'Frequently Asked Questions', subtitle: '', source: 'api', limit: 8 };
    case 'cta-banner': return { title: 'Start your wellness journey today', subtitle: '', buttonText: 'Shop All Products', buttonUrl: '/products', secondaryButtonText: 'Browse Categories', secondaryButtonUrl: '/categories' };
    case 'google-reviews': return { title: 'Loved by customers on Google', subtitle: 'Real reviews from our Google Business profile' };
    default: return {};
  }
}

// ── Field renderer ───────────────────────────────────────────────────────────
function FieldInput({ field, data, onChange }: { field: Field; data: any; onChange: (d: any) => void }) {
  const val = getPath(data, field.key);
  const set = (v: any) => onChange(setPath(data, field.key, v));

  if (field.type === 'group') {
    const sub = val || {};
    return (
      <div className="border border-gray-200 rounded-md p-3 space-y-2">
        <div className="text-xs font-bold text-gray-700">{field.label}</div>
        {(field.fields || []).map((f) => (
          <FieldInput key={f.key} field={f} data={sub} onChange={(d) => set(d)} />
        ))}
      </div>
    );
  }

  if (field.type === 'stringlist') {
    const arr: string[] = Array.isArray(val) ? val : [];
    return (
      <div>
        <label className={labelCls}>{field.label}</label>
        <div className="space-y-2">
          {arr.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={s} onChange={(e) => set(arr.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="px-2 text-red-500 text-sm" onClick={() => set(arr.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="text-xs text-emerald-600 font-semibold" onClick={() => set([...arr, ''])}>+ Add</button>
        </div>
      </div>
    );
  }

  if (field.type === 'list') {
    const arr: any[] = Array.isArray(val) ? val : [];
    const addItem = () => set([...arr, {}]);
    const updateItem = (i: number, d: any) => set(arr.map((x, j) => (j === i ? d : x)));
    const removeItem = (i: number) => set(arr.filter((_, j) => j !== i));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir; if (j < 0 || j >= arr.length) return;
      const copy = [...arr]; [copy[i], copy[j]] = [copy[j], copy[i]]; set(copy);
    };
    return (
      <div>
        <label className={labelCls}>{field.label}</label>
        <div className="space-y-3">
          {arr.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-md p-3 bg-gray-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500 uppercase">{field.itemLabel || 'Item'} {i + 1}</span>
                <div className="flex gap-1">
                  <button type="button" className="px-1.5 text-gray-400 hover:text-gray-700" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="px-1.5 text-gray-400 hover:text-gray-700" onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="px-1.5 text-red-500" onClick={() => removeItem(i)}>✕</button>
                </div>
              </div>
              {(field.itemFields || []).map((f) => (
                <FieldInput key={f.key} field={f} data={item || {}} onChange={(d) => updateItem(i, d)} />
              ))}
            </div>
          ))}
          <button type="button" className="text-xs text-emerald-600 font-semibold" onClick={addItem}>+ Add {field.itemLabel || 'item'}</button>
        </div>
      </div>
    );
  }

  // An image field is a PICKER, not a URL box. Every other block editor in the
  // admin (BlockEditors / BlockEditorsExtra) already used ImageInputWithActions
  // — upload, choose from the media library, preview — but the homepage blocks
  // rendered a bare text input, so changing a hero slide meant pasting a CDN URL
  // by hand. Same component, so the two can't drift.
  if (field.type === 'image') {
    return (
      <ImageInputWithActions
        label={field.label}
        value={val ?? ''}
        onChange={(url) => set(url)}
        folder="pages"
      />
    );
  }

  return (
    <div>
      <label className={labelCls}>{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea className={inputCls} rows={3} value={val ?? ''} onChange={(e) => set(e.target.value)} />
      ) : field.type === 'select' ? (
        <select className={inputCls} value={val ?? ''} onChange={(e) => set(e.target.value)}>
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.type === 'number' ? (
        <input type="number" className={inputCls} value={val ?? ''} onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))} />
      ) : (
        <input type="text" className={inputCls} value={val ?? ''} placeholder={field.type === 'url' ? 'https://…' : ''} onChange={(e) => set(e.target.value)} />
      )}
      {field.help && <p className="text-[11px] text-gray-400 mt-0.5">{field.help}</p>}
    </div>
  );
}

const HomepageBlockEditor: React.FC<{ blockType: string; data: any; onChange: (d: any) => void }> = ({ blockType, data, onChange }) => {
  const schema = HOMEPAGE_SCHEMAS[blockType];
  if (!schema) return null;
  return (
    <div className="space-y-3">
      {blockType === 'google-reviews' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          The reviews widget embed is configured in <strong>SEO &amp; Analytics ▸ Google Reviews</strong>. This section just sets the heading.
        </p>
      )}
      {schema.map((f) => (
        <FieldInput key={f.key} field={f} data={data || {}} onChange={onChange} />
      ))}
    </div>
  );
};

export default HomepageBlockEditor;
