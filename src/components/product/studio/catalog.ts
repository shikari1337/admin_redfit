/**
 * The section CATALOGUE — every section a product page can carry, where it
 * renders, what its editor is, and which display options make sense for it.
 * DATA ONLY; ProductPageStudio reads it.
 */
import type { ContentBlock, DisplaySettings, Frontend } from './types';

export type SectionEditorKind =
  | 'html' | 'faqItems' | 'formContent'
  | 'features' | 'whySpeedster' | 'whyUs' | 'stylingGuide' | 'instagram' | 'faqLegacy' | 'testimonials' | 'washCare' | 'gallery' | 'videos'
  | 'toggle' | 'custom';

export type DisplayOption = keyof DisplaySettings;

export interface SectionDef {
  id: string;
  name: string;
  description: string;
  /** Which frontends actually read this section. */
  frontends: Frontend[];
  group: 'storefront' | 'template';
  editor: SectionEditorKind;
  /** Default content when the section has never been saved. */
  defaults?: () => any;
  /** Display options this section honours. */
  display: DisplayOption[];
  /** Built-in on/off only (the content comes from the product's own fields). */
  toggleOnly?: boolean;
  /** Where the content itself is edited when not here. */
  editedIn?: string;
}

// Each list names ONLY options the renderers read (storefront lib/pageSections.ts, ecom
// utils/pageSections.ts). An option that changes nothing is a decoy — do not add one here
// without teaching the renderer first.
/** Storefront tabs: the tab label is the heading; tabs are not individually hideable. */
const TEXT_DISPLAY: DisplayOption[] = ['heading', 'frontends'];
/** Storefront shelves with their own heading line (FAQs, reviews, related). */
const SHELF_DISPLAY: DisplayOption[] = ['heading', 'hideOn', 'width', 'background', 'spacing', 'frontends', 'anchor'];
/** Shelves whose component prints its own heading (Q&A, recently viewed). */
const BARE_SHELF_DISPLAY: DisplayOption[] = ['hideOn', 'frontends'];
/** Template sections: the heading lives in the section's content; the wrapper adds visibility + background. */
const TEMPLATE_DISPLAY: DisplayOption[] = ['hideOn', 'background', 'frontends', 'anchor'];
const RICH_DISPLAY: DisplayOption[] = ['heading', 'width', 'background', 'hideOn', 'headingSize', 'spacing', 'frontends', 'anchor'];

/**
 * Sections the Next.js storefront renders. The first six carry per-product
 * TEXT overrides; the rest are shelves whose content comes from elsewhere and
 * which this page can switch off or re-title for THIS product only (the
 * store-wide switch lives in Appearance ▸ Product page).
 */
export const STOREFRONT_SECTIONS: SectionDef[] = [
  { id: 'short-description', name: 'Short description', description: 'Overrides the product’s short description at the top of the page.', frontends: ['storefront'], group: 'storefront', editor: 'html', defaults: () => ({ content: '' }), display: ['frontends'] },
  { id: 'description', name: 'Description', description: 'Rich description shown in the Description tab.', frontends: ['storefront'], group: 'storefront', editor: 'html', defaults: () => ({ content: '' }), display: TEXT_DISPLAY },
  { id: 'specifications', name: 'Specifications', description: 'The specification tables (edited under Product data below).', frontends: ['storefront', 'ecom'], group: 'storefront', editor: 'toggle', toggleOnly: true, editedIn: 'product', display: ['heading', 'frontends'] },
  { id: 'dosage', name: 'Dosage', description: 'Dosage tab — how to take it.', frontends: ['storefront'], group: 'storefront', editor: 'html', defaults: () => ({ content: '' }), display: TEXT_DISPLAY },
  { id: 'important-info', name: 'Important information', description: 'Safety, storage and usage notes tab.', frontends: ['storefront'], group: 'storefront', editor: 'html', defaults: () => ({ content: '' }), display: TEXT_DISPLAY },
  { id: 'form-content', name: 'Per-form content', description: 'Different description / dosage per product form (Dilution, Mother Tincture…) — the page shows the block matching the chosen variant.', frontends: ['storefront'], group: 'storefront', editor: 'formContent', defaults: () => ({ forms: {} }), display: ['frontends'] },
  { id: 'faqs', name: 'FAQs', description: 'Question & answer list under the highlights.', frontends: ['storefront'], group: 'storefront', editor: 'faqItems', defaults: () => ({ items: [] }), display: SHELF_DISPLAY },
  { id: 'reviews', name: 'Customer reviews', description: 'Ratings, reviews and the write-a-review form.', frontends: ['storefront'], group: 'storefront', editor: 'toggle', toggleOnly: true, editedIn: 'Reviews', display: SHELF_DISPLAY },
  { id: 'qa', name: 'Questions & answers', description: 'Shopper questions answered by the store.', frontends: ['storefront'], group: 'storefront', editor: 'toggle', toggleOnly: true, editedIn: 'Product Q&A', display: BARE_SHELF_DISPLAY },
  { id: 'related-products', name: 'Related products', description: 'The similar-products carousel.', frontends: ['storefront'], group: 'storefront', editor: 'toggle', toggleOnly: true, editedIn: 'Related tab', display: SHELF_DISPLAY },
  { id: 'recently-viewed', name: 'Recently viewed', description: 'The shopper’s recently viewed row.', frontends: ['storefront'], group: 'storefront', editor: 'toggle', toggleOnly: true, display: BARE_SHELF_DISPLAY },
];

/** Sections only the single-product template (ecom) renders. */
export const TEMPLATE_SECTIONS: SectionDef[] = [
  { id: 'features', name: 'Features box', description: 'Three-up trust features (Top quality, Easy exchange, Free shipping).', frontends: ['ecom'], group: 'template', editor: 'features', defaults: () => ({ items: [{ title: '', description: '', iconType: 'check' }] }), display: TEMPLATE_DISPLAY },
  { id: 'whySpeedster', name: 'Why choose this', description: 'Heading, subtitle, one image and three benefit items.', frontends: ['ecom'], group: 'template', editor: 'whySpeedster', defaults: () => ({ heading: '', subtitle: '', imageUrl: '', items: [{ title: '', description: '', iconType: 'shield' }, { title: '', description: '', iconType: 'star' }, { title: '', description: '', iconType: 'bolt' }] }), display: TEMPLATE_DISPLAY },
  { id: 'videos', name: 'Product videos', description: 'Video feed — uses the videos on the Media tab.', frontends: ['ecom'], group: 'template', editor: 'videos', defaults: () => ({ heading: 'See it in action', subtitle: '' }), display: TEMPLATE_DISPLAY },
  { id: 'testimonials', name: 'Testimonials', description: 'Review highlights with rating filters.', frontends: ['ecom'], group: 'template', editor: 'testimonials', defaults: () => ({ heading: '', subtitle: '', showRatingFilters: true }), display: TEMPLATE_DISPLAY },
  { id: 'washCare', name: 'Care instructions', description: 'Care / usage instructions with icons (edited under Product data).', frontends: ['ecom'], group: 'template', editor: 'washCare', defaults: () => ({ heading: 'Care instructions' }), display: TEMPLATE_DISPLAY },
  { id: 'customerOrderGallery', name: 'Customer order gallery', description: 'Customer photos (from the Media tab).', frontends: ['ecom'], group: 'template', editor: 'gallery', defaults: () => ({ heading: 'Customer orders', subtitle: '' }), display: TEMPLATE_DISPLAY },
  { id: 'stylingGuide', name: 'Styling / usage guide', description: 'Tips with an image each.', frontends: ['ecom'], group: 'template', editor: 'stylingGuide', defaults: () => ({ heading: '', subtitle: '', items: [] }), display: TEMPLATE_DISPLAY },
  { id: 'instagramFeed', name: 'Instagram feed', description: 'A grid of posts.', frontends: ['ecom'], group: 'template', editor: 'instagram', defaults: () => ({ username: '', heading: 'Follow us on Instagram', posts: [] }), display: TEMPLATE_DISPLAY },
  { id: 'faq', name: 'FAQ (from the FAQ library)', description: 'Questions pulled from the store FAQ categories.', frontends: ['ecom'], group: 'template', editor: 'faqLegacy', defaults: () => ({ mode: 'category', selectedCategories: ['general'], randomCount: 5, heading: 'Frequently asked questions', subtitle: '' }), display: TEMPLATE_DISPLAY },
  { id: 'productQa', name: 'Questions & answers (template)', description: 'Shopper Q&A block on the single-product template.', frontends: ['ecom'], group: 'template', editor: 'toggle', toggleOnly: true, editedIn: 'Product Q&A', display: TEMPLATE_DISPLAY },
  { id: 'tags', name: 'Tags (template)', description: 'Product tag chips on the single-product template.', frontends: ['ecom'], group: 'template', editor: 'toggle', toggleOnly: true, editedIn: 'General tab', display: TEMPLATE_DISPLAY },
  { id: 'whyUs', name: 'Why us', description: 'Store-level benefits grid.', frontends: ['ecom'], group: 'template', editor: 'whyUs', defaults: () => ({ heading: 'Why choose us?', subtitle: '', benefits: [] }), display: TEMPLATE_DISPLAY },
];

export const APLUS_DEF: SectionDef = {
  id: 'aplusContent', name: 'Product highlights (A+ content)',
  description: 'Rich content blocks — banners, image + text, feature grids, FAQ, tables, video. Reorder the blocks inside; this row sets where the whole group sits.',
  frontends: ['storefront', 'ecom'], group: 'storefront', editor: 'toggle', display: RICH_DISPLAY,
};

export const ALL_BUILTIN: SectionDef[] = [...STOREFRONT_SECTIONS, APLUS_DEF, ...TEMPLATE_SECTIONS];
export const BUILTIN_BY_ID: Record<string, SectionDef> = Object.fromEntries(ALL_BUILTIN.map((d) => [d.id, d]));

/** Default order when a product has no saved layout: storefront rows, A+ after the tabs, template rows after. */
export function defaultOrderFor(id: string): number {
  const i = ALL_BUILTIN.findIndex((d) => d.id === id);
  return i === -1 ? 900 : i * 10;
}

// ─── A+ blocks ───────────────────────────────────────────────────────────────

export interface BlockDef {
  type: string;
  label: string;
  description: string;
  /** Image slot key for the block's image(s), if any. */
  imageSlot?: string;
  display: DisplayOption[];
  make: () => ContentBlock;
}

export const BLOCK_DEFS: BlockDef[] = [
  { type: 'image', label: 'Full-width banner', description: 'One wide lifestyle or ingredient image with an optional heading.', imageSlot: 'product.aplus.banner', display: ['width', 'imageFit', 'hideOn', 'spacing', 'background', 'frontends', 'anchor'], make: () => ({ type: 'image', data: { heading: '', imageUrl: '', alt: '' } }) },
  { type: 'image_text', label: 'Image + text', description: 'A picture beside a paragraph — one benefit per block.', imageSlot: 'product.aplus.image_text', display: ['width', 'background', 'imageFit', 'hideOn', 'spacing', 'frontends', 'anchor'], make: () => ({ type: 'image_text', data: { heading: '', body: '', imageUrl: '', imagePosition: 'left' } }) },
  { type: 'text', label: 'Text block', description: 'A heading and rich text.', display: ['width', 'background', 'align', 'headingSize', 'hideOn', 'spacing', 'frontends', 'anchor'], make: () => ({ type: 'text', data: { heading: '', body: '' } }) },
  { type: 'highlight_strip', label: 'Highlight strip', description: 'Four short highlights with icons — Water-resistant, 100% genuine…', display: ['columns', 'background', 'hideOn', 'spacing', 'frontends'], make: () => ({ type: 'highlight_strip', items: [{ icon: 'lucide:Star', title: '', text: '' }] }) },
  { type: 'icon_box', label: 'Feature boxes', description: 'Icon + title + one line, in a grid.', display: ['columns', 'background', 'hideOn', 'spacing', 'frontends'], make: () => ({ type: 'icon_box', items: [{ icon: 'lucide:Check', title: '', desc: '' }] }) },
  { type: 'comparison_table', label: 'Comparison table', description: 'Compare pack sizes, potencies or rivals.', display: ['width', 'background', 'hideOn', 'spacing', 'frontends', 'anchor'], make: () => ({ type: 'comparison_table', data: { heading: '', headers: ['', ''], rows: [['', '']] } }) },
  { type: 'faq', label: 'FAQ accordion', description: 'Questions and answers inside the highlights.', display: ['background', 'hideOn', 'spacing', 'frontends', 'anchor'], make: () => ({ type: 'faq', items: [{ q: '', a: '' }] }) },
  { type: 'video', label: 'Embedded video', description: 'YouTube / Vimeo / direct link.', display: ['width', 'hideOn', 'spacing', 'frontends'], make: () => ({ type: 'video', url: '', caption: '' }) },
];

export const BLOCK_BY_TYPE: Record<string, BlockDef> = Object.fromEntries(BLOCK_DEFS.map((b) => [b.type, b]));
BLOCK_BY_TYPE.banner = BLOCK_BY_TYPE.image;

export function blockLabel(block: ContentBlock): string {
  const def = BLOCK_BY_TYPE[block.type];
  const d: any = (block as any).data || {};
  const title = d.heading || (block as any).caption || '';
  return title ? `${def?.label || block.type}: ${title}` : def?.label || block.type;
}

export const DISPLAY_LABELS: Record<DisplayOption, { label: string; help: string }> = {
  heading: { label: 'Heading shown on the page', help: 'Replaces the default title the page prints above this section (e.g. "Product Highlights").' },
  width: { label: 'Width', help: 'Contained keeps it inside the page column; Full stretches edge to edge on wide screens.' },
  background: { label: 'Background', help: 'A soft grey, a brand-tinted or a dark band behind this section.' },
  hideOn: { label: 'Hide on', help: 'Skip this section on phones or on desktops.' },
  collapsed: { label: 'Start collapsed', help: 'Show as a closed accordion the shopper can open.' },
  columns: { label: 'Columns', help: 'How many items sit side by side on desktop.' },
  imageFit: { label: 'Image fit', help: 'Cover fills the box and may crop edges; Contain shows the whole picture.' },
  headingSize: { label: 'Heading size', help: 'Small, medium or large heading.' },
  align: { label: 'Text alignment', help: 'Left or centred.' },
  spacing: { label: 'Spacing', help: 'Vertical breathing room around the section.' },
  anchor: { label: 'Anchor id', help: 'Lets a link jump straight here: #your-anchor.' },
  frontends: { label: 'Show on', help: 'Which of your websites render this section. Leave all ticked unless a section only suits one.' },
};

export const FRONTEND_LABELS: Record<Frontend, string> = { storefront: 'Storefront', ecom: 'Single-product template', template: 'Theme' };
