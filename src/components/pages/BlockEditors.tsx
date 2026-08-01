import React from 'react';
import { FaTrash, FaPlus } from 'react-icons/fa';
import IconPicker from '../IconPicker';
import ImageInputWithActions from '../common/ImageInputWithActions';
import RichTextEditor from '../common/RichTextEditor';

// ─── Shared field primitives ────────────────────────────────────────────────
// Every block editor uses these so each type gets the SAME capabilities:
// upload-or-URL images, real HTML editing, and icon selection.

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-md';
const LABEL = 'block text-sm font-medium text-gray-700 mb-2';

export const TextField: React.FC<{
  label: string; value: any; onChange: (v: string) => void; placeholder?: string; type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className={LABEL}>{label}</label>
    <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      className={INPUT} placeholder={placeholder} />
  </div>
);

export const NumberField: React.FC<{
  label: string; value: any; onChange: (v: number | undefined) => void; placeholder?: string; min?: number;
}> = ({ label, value, onChange, placeholder, min }) => (
  <div>
    <label className={LABEL}>{label}</label>
    <input type="number" min={min} value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className={INPUT} placeholder={placeholder} />
  </div>
);

/** HTML content with a real editor — plain textareas made authors write raw tags. */
export const HtmlField: React.FC<{
  label: string; value: any; onChange: (html: string) => void; placeholder?: string; minHeight?: number;
}> = ({ label, value, onChange, placeholder, minHeight = 160 }) => (
  <div>
    <label className={LABEL}>{label}</label>
    <RichTextEditor value={value ?? ''} onChange={onChange} placeholder={placeholder} minHeight={minHeight} />
    <p className="text-xs text-gray-500 mt-1">Formatting is saved as HTML and rendered on the storefront.</p>
  </div>
);

/** Repeating-items list: add / remove / reorder, with a per-item editor. */
export function ItemsField<T>({ label, items, onChange, blank, render, addLabel = 'Add Item' }: {
  label: string;
  items: T[] | undefined;
  onChange: (items: T[]) => void;
  blank: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  addLabel?: string;
}) {
  const list: T[] = Array.isArray(items) ? items : [];
  const setAt = (i: number, patch: Partial<T>) =>
    onChange(list.map((it, idx) => (idx === i ? { ...(it as any), ...(patch as any) } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button type="button" onClick={() => onChange([...list, blank()])}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          <FaPlus /> {addLabel}
        </button>
      </div>
      <div className="space-y-3">
        {list.length === 0 && (
          <p className="text-xs text-gray-400 border-2 border-dashed rounded-md p-4 text-center">
            None yet — use “{addLabel}”.
          </p>
        )}
        {list.map((item, i) => (
          <div key={i} className="p-3 border border-gray-200 rounded-md bg-gray-50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500">#{i + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="px-1.5 text-xs text-gray-500 disabled:opacity-30" title="Move up">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}
                  className="px-1.5 text-xs text-gray-500 disabled:opacity-30" title="Move down">↓</button>
                <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))}
                  className="text-red-500 hover:text-red-700 ml-1" title="Remove"><FaTrash size={12} /></button>
              </div>
            </div>
            {render(item, (patch) => setAt(i, patch), i)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Hero Block Editor
export const HeroBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Hero title"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle</label>
        <input
          type="text"
          value={data?.subtitle || ''}
          onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Hero subtitle"
        />
      </div>
      <ImageInputWithActions
        value={data?.imageUrl || ''}
        onChange={(url) => onChange({ ...data, imageUrl: url })}
        label="Background Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="hero"
        fieldPath="imageUrl"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Text</label>
        <input
          type="text"
          value={data?.callToActionText || ''}
          onChange={(e) => onChange({ ...data, callToActionText: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="e.g., Shop Now"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Link</label>
        <input
          type="text"
          value={data?.callToActionLink || ''}
          onChange={(e) => onChange({ ...data, callToActionLink: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="/products or https://..."
        />
      </div>
    </div>
  );
};

// Text Block Editor
export const TextBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Section title"
        />
      </div>
      {/* Real WYSIWYG — authors had to hand-write HTML tags in a bare textarea. */}
      <HtmlField
        label="Content"
        value={data?.content}
        onChange={(html) => onChange({ ...data, content: html })}
        placeholder="Write your content…"
        minHeight={220}
      />
    </div>
  );
};

// Image Block Editor
export const ImageBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <ImageInputWithActions
        value={data?.image || ''}
        onChange={(url) => onChange({ ...data, image: url })}
        label="Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="image"
        fieldPath="image"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Alt Text</label>
        <input
          type="text"
          value={data?.alt || ''}
          onChange={(e) => onChange({ ...data, alt: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Image alt text"
        />
      </div>
    </div>
  );
};

// Text-Image Block Editor
export const TextImageBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <HtmlField
        label="Content"
        value={data?.content}
        onChange={(html) => onChange({ ...data, content: html })}
        placeholder="Write the section copy…"
        minHeight={180}
      />
      <ImageInputWithActions
        value={data?.image || ''}
        onChange={(url) => onChange({ ...data, image: url })}
        label="Image"
        placeholder="Enter image URL or upload"
        productId={pageId}
        sectionId="text-image"
        fieldPath="image"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Image Position</label>
        <select
          value={data?.imagePosition || 'left'}
          onChange={(e) => onChange({ ...data, imagePosition: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
    </div>
  );
};

// Features Block Editor — icon picker (or emoji/URL), rich-text description,
// an optional image per feature, and reorderable items.
export const FeaturesBlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Section title" />
    <TextField label="Subtitle" value={data?.subtitle} onChange={(v) => onChange({ ...data, subtitle: v })} placeholder="Optional intro line" />
    <ItemsField
      label="Features" addLabel="Add Feature"
      items={data?.items}
      onChange={(items) => onChange({ ...data, items })}
      blank={() => ({ icon: '', iconName: '', title: '', description: '', image: '' })}
      render={(item: any, set, i) => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <IconPicker
              label="Icon"
              value={item.iconName || ''}
              // Icon picker and emoji/URL are alternatives — setting one clears
              // the other so the renderer never has to guess which wins.
              onChange={(name) => set({ iconName: name, ...(name ? { icon: '' } : {}) })}
            />
            <TextField label="Or emoji / image URL" value={item.icon}
              onChange={(v) => set({ icon: v, ...(v ? { iconName: '' } : {}) })} placeholder="✨ or https://..." />
          </div>
          <TextField label="Title" value={item.title} onChange={(v) => set({ title: v })} placeholder="Feature title" />
          <HtmlField label="Description" value={item.description} onChange={(v) => set({ description: v })} minHeight={90} />
          <ImageInputWithActions value={item.image || ''} onChange={(url) => set({ image: url })}
            label="Image (optional)" placeholder="Upload or paste URL"
            productId={pageId} sectionId="features" fieldPath={'items.' + i + '.image'} />
        </>
      )}
    />
  </div>
);

// CTA Block Editor — rich body copy + optional background image.
export const CTABlockEditor: React.FC<{ data: any; onChange: (data: any) => void; pageId?: string }> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Ready to start?" />
    <TextField label="Subtitle" value={data?.subtitle} onChange={(v) => onChange({ ...data, subtitle: v })} />
    <HtmlField label="Body text (optional)" value={data?.description}
      onChange={(v) => onChange({ ...data, description: v })} minHeight={110} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <TextField label="Button Text" value={data?.buttonText} onChange={(v) => onChange({ ...data, buttonText: v })} placeholder="Shop now" />
      <TextField label="Button Link" value={data?.buttonLink} onChange={(v) => onChange({ ...data, buttonLink: v })} placeholder="/products" />
    </div>
    <ImageInputWithActions value={data?.backgroundImage || ''} onChange={(url) => onChange({ ...data, backgroundImage: url })}
      label="Background Image (optional)" placeholder="Upload or paste URL"
      productId={pageId} sectionId="cta" fieldPath="backgroundImage" />
  </div>
);

// Product Categories Block Editor
export const ProductCategoriesBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Section Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Shop by Category"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Categories</label>
        <input
          type="number"
          min={1}
          max={24}
          value={data?.limit ?? 8}
          onChange={(e) => onChange({ ...data, limit: parseInt(e.target.value, 10) || 8 })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <p className="text-xs text-gray-500 mt-1">Number of categories to display (1–24)</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
        <select
          value={data?.layout || 'grid'}
          onChange={(e) => onChange({ ...data, layout: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="grid">Grid</option>
          <option value="carousel">Carousel</option>
        </select>
      </div>
    </div>
  );
};

// Product Cards Block Editor
export const ProductCardsBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Section Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Featured Products"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Product Limit</label>
        <input
          type="number"
          min={1}
          max={24}
          value={data?.limit ?? 8}
          onChange={(e) => onChange({ ...data, limit: parseInt(e.target.value, 10) || 8 })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <p className="text-xs text-gray-500 mt-1">Number of products to display (1–24)</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
        <select
          value={data?.sort || 'newest'}
          onChange={(e) => onChange({ ...data, sort: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category Slug</label>
        <input
          type="text"
          value={data?.categorySlug || ''}
          onChange={(e) => onChange({ ...data, categorySlug: e.target.value.trim() })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="e.g. jackets (leave empty for all)"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
        <select
          value={data?.layout || 'grid'}
          onChange={(e) => onChange({ ...data, layout: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="grid">Grid</option>
          <option value="carousel">Carousel</option>
        </select>
      </div>
    </div>
  );
};

// Product Selection Block Editor (manual product slugs)
export const ProductSelectionBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const slugs = (data?.productSlugs || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean);
  const slugStr = slugs.join(', ');

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Section Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Handpicked for You"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Product Slugs (comma-separated)</label>
        <input
          type="text"
          value={slugStr}
          onChange={(e) =>
            onChange({
              ...data,
              productSlugs: e.target.value
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
                .join(','),
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          placeholder="product-slug-1, product-slug-2, product-slug-3"
        />
        <p className="text-xs text-gray-500 mt-1">Enter product slugs in the order you want them displayed</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
        <select
          value={data?.layout || 'grid'}
          onChange={(e) => onChange({ ...data, layout: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="grid">Grid</option>
          <option value="carousel">Carousel</option>
        </select>
      </div>
    </div>
  );
};

// Product Featured Block Editor (single product highlight)
export const ProductFeaturedBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Section Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Product of the Week"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Product Slug *</label>
        <input
          type="text"
          value={data?.productSlug || ''}
          onChange={(e) => onChange({ ...data, productSlug: e.target.value.trim().toLowerCase() })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="product-slug"
        />
        <p className="text-xs text-gray-500 mt-1">The slug of the product to feature</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action Text</label>
        <input
          type="text"
          value={data?.ctaText || 'View Product'}
          onChange={(e) => onChange({ ...data, ctaText: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
    </div>
  );
};

// Product Best Sellers Block Editor
export const ProductBestSellersBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Section Title</label>
        <input
          type="text"
          value={data?.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Best Sellers"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Product Limit</label>
        <input
          type="number"
          min={1}
          max={24}
          value={data?.limit ?? 8}
          onChange={(e) => onChange({ ...data, limit: parseInt(e.target.value, 10) || 8 })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <p className="text-xs text-gray-500 mt-1">Number of products (1–24)</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tag for Best Sellers</label>
        <input
          type="text"
          value={data?.tagSlug || 'bestseller'}
          onChange={(e) => onChange({ ...data, tagSlug: e.target.value.trim().toLowerCase() })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="bestseller"
        />
        <p className="text-xs text-gray-500 mt-1">Products with this tag are shown. If none, falls back to newest products.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
        <select
          value={data?.layout || 'grid'}
          onChange={(e) => onChange({ ...data, layout: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="grid">Grid</option>
          <option value="carousel">Carousel</option>
        </select>
      </div>
    </div>
  );
};

// FAQ Accordion Block Editor — rich-text answers + reorderable questions.
export const FAQAccordionBlockEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Frequently asked questions" />
    <ItemsField
      label="FAQ Items" addLabel="Add FAQ"
      items={data?.items}
      onChange={(items) => onChange({ ...data, items })}
      blank={() => ({ question: '', answer: '' })}
      render={(item: any, set) => (
        <>
          <TextField label="Question" value={item.question} onChange={(v) => set({ question: v })} placeholder="Question" />
          <HtmlField label="Answer" value={item.answer} onChange={(v) => set({ answer: v })} minHeight={110} placeholder="Answer…" />
        </>
      )}
    />
  </div>
);

