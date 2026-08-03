/**
 * GrapesJS plugin: store-aware blocks for the page visual builder.
 *
 * DYNAMIC blocks (live data) serialize as EMPTY placeholder divs —
 *   <div data-store-block="product-grid" data-category="dilutions" …></div>
 * The editor previews them with REAL products/categories fetched from the
 * store API (preview DOM lives only in the view, never exported); the
 * storefront renders the same placeholders as real React components
 * (ProductCard grid, category cards, working contact form).
 *
 * STATIC blocks (icon box, image box, panel, CTA, stats, testimonial, hero)
 * are plain HTML styled by the exported `.cb-*` rules (BASE_CSS), fully
 * customizable in the style manager.
 */
import type { Editor } from 'grapesjs';
import api from '../services/api';
import { BASE_CSS } from './classicBlocksHtml';

export interface StoreBlocksOpts {
  categories?: { id: string; label: string }[];
  brands?: { id: string; label: string }[];
  /** id = "attrSlug:valueSlug" */
  attributes?: { id: string; label: string }[];
}

const rows = (r: any): any[] => (Array.isArray(r?.data?.data) ? r.data.data : Array.isArray(r?.data) ? r.data : []);
const fmtPrice = (p: any): string => {
  const n = Number(p?.price ?? p?.selling_price ?? p?.final_price ?? p?.mrp ?? 0);
  return n > 0 ? `₹${n.toLocaleString('en-IN')}` : '';
};
const imgOf = (p: any): string => {
  const i = p?.image || (Array.isArray(p?.images) ? p.images[0] : null);
  return typeof i === 'string' ? i : i?.url || '';
};

// Previews re-fetch on every trait change — cache per param-set for the session.
const previewCache = new Map<string, Promise<any[]>>();
function fetchPreview(path: string, params: Record<string, any>): Promise<any[]> {
  const key = path + JSON.stringify(params);
  let p = previewCache.get(key);
  if (!p) {
    p = api.get(path, { params }).then(rows).catch(() => []);
    previewCache.set(key, p);
  }
  return p;
}

function productParams(a: Record<string, any>): Record<string, any> {
  const p: Record<string, any> = { limit: Number(a['data-limit']) || 8, active: true };
  if (a['data-category']) p.categorySlug = a['data-category'];
  if (a['data-brand']) p.brand = a['data-brand'];
  if (a['data-tag']) p.tag = a['data-tag'];
  if (a['data-slugs']) p.slugs = a['data-slugs'];
  if (a['data-sort']) p.sort = a['data-sort'];
  const [attrSlug, attrVal] = String(a['data-attr'] || '').split(':');
  if (attrSlug && attrVal) { p.filterAttr = attrSlug; p.filterValue = attrVal; }
  return p;
}

const SHELL_STYLE = 'min-height:120px;padding:18px;border:1px dashed #94a3b8;border-radius:12px;background:#f8fafc;font-family:Arial,sans-serif';
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shell(label: string, title: string | undefined, hint: string, body: string): string {
  return `<div style="${SHELL_STYLE}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0369a1;background:#e0f2fe;padding:3px 8px;border-radius:99px">${esc(label)} · live</span>
      <span style="font-size:11px;color:#94a3b8">${esc(hint)}</span>
    </div>
    ${title ? `<div style="font-size:19px;font-weight:700;color:#111827;margin-bottom:10px">${esc(title)}</div>` : ''}
    ${body}
  </div>`;
}

function renderProductPreview(el: HTMLElement, attrs: Record<string, any>) {
  const cols = Math.max(2, Math.min(6, Number(attrs['data-cols']) || 4));
  const params = productParams(attrs);
  const scope = attrs['data-category'] ? `category: ${attrs['data-category']}`
    : attrs['data-brand'] ? `brand: ${attrs['data-brand']}`
    : attrs['data-attr'] ? `attribute: ${attrs['data-attr']}`
    : attrs['data-tag'] ? `tag: ${attrs['data-tag']}`
    : attrs['data-slugs'] ? 'hand-picked' : 'latest';
  el.innerHTML = shell('Products', attrs['data-title'], `${scope} · ${params.limit} max`,
    `<div style="color:#94a3b8;font-size:13px">Loading products…</div>`);
  const token = String(Date.now() + Math.random());
  (el as any)._pvToken = token;
  fetchPreview('/products', params).then((list) => {
    if ((el as any)._pvToken !== token) return;
    const cards = list.slice(0, params.limit).map((p) => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;text-align:center">
        <div style="height:86px;display:flex;align-items:center;justify-content:center;margin-bottom:8px">
          ${imgOf(p) ? `<img src="${esc(imgOf(p))}" style="max-height:86px;max-width:100%;object-fit:contain"/>` : '<span style="font-size:24px">🧴</span>'}
        </div>
        <div style="font-size:11.5px;font-weight:600;color:#374151;line-height:1.3;height:30px;overflow:hidden">${esc(p.name)}</div>
        <div style="font-size:12px;font-weight:700;color:#0f766e;margin-top:4px">${fmtPrice(p)}</div>
      </div>`).join('');
    el.innerHTML = shell('Products', attrs['data-title'], `${scope} · showing ${Math.min(list.length, params.limit)}`,
      list.length
        ? `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px">${cards}</div>`
        : `<div style="color:#f59e0b;font-size:13px">No products match — adjust Category / Brand / Attribute in Settings (⚙ traits panel)</div>`);
  });
}

function renderCategoryPreview(el: HTMLElement, attrs: Record<string, any>) {
  const limit = Number(attrs['data-limit']) || 8;
  const cols = Math.max(2, Math.min(6, Number(attrs['data-cols']) || 4));
  el.innerHTML = shell('Category cards', attrs['data-title'], `${limit} max`,
    `<div style="color:#94a3b8;font-size:13px">Loading categories…</div>`);
  const token = String(Date.now() + Math.random());
  (el as any)._pvToken = token;
  fetchPreview('/categories', { active: true, limit: 200 }).then((list) => {
    if ((el as any)._pvToken !== token) return;
    const tops = list.filter((c: any) => !c.parent && !c.parent_id && !c.parentId).slice(0, limit);
    const use = tops.length ? tops : list.slice(0, limit);
    const cards = use.map((c: any) => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;text-align:center">
        ${(c.image_url || c.imageUrl || c.image) ? `<img src="${esc(c.image_url || c.imageUrl || c.image)}" style="height:56px;max-width:100%;object-fit:contain;margin-bottom:6px"/>` : '<div style="font-size:22px;margin-bottom:6px">🗂</div>'}
        <div style="font-size:12px;font-weight:600;color:#374151">${esc(c.name)}</div>
      </div>`).join('');
    el.innerHTML = shell('Category cards', attrs['data-title'], `showing ${use.length}`,
      `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px">${cards}</div>`);
  });
}

function renderContactPreview(el: HTMLElement, attrs: Record<string, any>) {
  el.innerHTML = shell('Contact form', attrs['data-title'] || 'Contact us', 'posts to /contact/submit', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:9px;font-size:12px;color:#9ca3af;background:#fff">Your name *</div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:9px;font-size:12px;color:#9ca3af;background:#fff">Email address *</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:9px;font-size:12px;color:#9ca3af;background:#fff;height:56px;margin-bottom:8px">How can we help?</div>
    <div style="background:#0f766e;color:#fff;border-radius:8px;padding:10px;text-align:center;font-size:13px;font-weight:700">Send message</div>`);
}

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'price-asc', label: 'Price: low → high' },
  { id: 'price-desc', label: 'Price: high → low' },
];
const COL_OPTIONS = [2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `${n} columns` }));
const optNone = { id: '', label: '— none —' };

/** View that re-renders its live preview whenever a trait/attribute changes. */
const liveView = (paint: (el: HTMLElement, attrs: Record<string, any>) => void) => ({
  init(this: any) {
    this.listenTo(this.model, 'change:attributes', () => this.render());
  },
  onRender(this: any) {
    paint(this.el as HTMLElement, this.model.getAttributes());
  },
});

const svg = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export default function storeBlocks(editor: Editor, opts: StoreBlocksOpts = {}) {
  const catOpts = [optNone, ...(opts.categories || [])];
  const brandOpts = [optNone, ...(opts.brands || [])];
  const attrOpts = [optNone, ...(opts.attributes || [])];

  const isKind = (kind: string) => (el: any) =>
    !!(el?.getAttribute && el.getAttribute('data-store-block') === kind);

  // ── Dynamic component types ────────────────────────────────────────────────
  editor.DomComponents.addType('store-product-grid', {
    isComponent: (el: any) => (isKind('product-grid')(el) ? { type: 'store-product-grid' } : false),
    model: {
      defaults: {
        name: 'Products (live)',
        droppable: false,
        attributes: { 'data-store-block': 'product-grid', 'data-limit': '8', 'data-sort': 'newest', 'data-cols': '4' },
        traits: [
          { type: 'text', name: 'data-title', label: 'Heading' },
          { type: 'select', name: 'data-category', label: 'Category', options: catOpts },
          { type: 'select', name: 'data-brand', label: 'Brand', options: brandOpts },
          { type: 'select', name: 'data-attr', label: 'Attribute', options: attrOpts },
          { type: 'text', name: 'data-tag', label: 'Tag slug (e.g. bestseller)' },
          { type: 'text', name: 'data-slugs', label: 'Product slugs (comma-sep)' },
          { type: 'number', name: 'data-limit', label: 'Max products' },
          { type: 'select', name: 'data-sort', label: 'Sort', options: SORT_OPTIONS },
          { type: 'select', name: 'data-cols', label: 'Columns', options: COL_OPTIONS },
        ] as any,
      },
    },
    view: liveView(renderProductPreview) as any,
  });

  editor.DomComponents.addType('store-category-grid', {
    isComponent: (el: any) => (isKind('category-grid')(el) ? { type: 'store-category-grid' } : false),
    model: {
      defaults: {
        name: 'Category cards (live)',
        droppable: false,
        attributes: { 'data-store-block': 'category-grid', 'data-limit': '8', 'data-cols': '4' },
        traits: [
          { type: 'text', name: 'data-title', label: 'Heading' },
          { type: 'number', name: 'data-limit', label: 'Max categories' },
          { type: 'select', name: 'data-cols', label: 'Columns', options: COL_OPTIONS },
        ] as any,
      },
    },
    view: liveView(renderCategoryPreview) as any,
  });

  editor.DomComponents.addType('store-contact-form', {
    isComponent: (el: any) => (isKind('contact-form')(el) ? { type: 'store-contact-form' } : false),
    model: {
      defaults: {
        name: 'Contact form (live)',
        droppable: false,
        attributes: { 'data-store-block': 'contact-form' },
        traits: [
          { type: 'text', name: 'data-title', label: 'Heading' },
          { type: 'text', name: 'data-description', label: 'Intro text' },
        ] as any,
      },
    },
    view: liveView(renderContactPreview) as any,
  });

  // ── Block palette ──────────────────────────────────────────────────────────
  const bm = editor.BlockManager;
  const CAT_PRODUCTS = 'Store · Products';
  const CAT_CONTENT = 'Store · Content';

  const productBlock = (id: string, label: string, attrs: Record<string, string>, icon: string) =>
    bm.add(id, {
      label,
      category: CAT_PRODUCTS,
      media: icon,
      content: `<div data-store-block="product-grid" data-limit="8" data-sort="newest" data-cols="4"${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}></div>`,
    });

  const gridIcon = svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>');
  productBlock('store-products-latest', 'Products — Latest', {}, gridIcon);
  productBlock('store-products-category', 'Products by Category', { 'data-title': 'Shop by category' }, svg('<path d="M4 7h16M4 12h16M4 17h10"/>'));
  productBlock('store-products-brand', 'Products by Brand', { 'data-title': 'Shop the brand' }, svg('<path d="M12 2l2.9 6.26L21 9.27l-5 4.87L17.18 21 12 17.77 6.82 21 8 14.14l-5-4.87 6.1-1.01z"/>'));
  productBlock('store-products-attribute', 'Products by Attribute', { 'data-title': 'Shop by potency' }, svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'));
  productBlock('store-products-tag', 'Best Sellers (tag)', { 'data-tag': 'bestseller', 'data-title': 'Best sellers' }, svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>'));
  productBlock('store-products-picked', 'Hand-picked Products', { 'data-slugs': '', 'data-title': 'Featured picks' }, svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'));

  bm.add('store-category-cards', {
    label: 'Category Cards',
    category: CAT_PRODUCTS,
    media: svg('<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="8" height="9" rx="1"/><rect x="14" y="11" width="7" height="9" rx="1"/>'),
    content: '<div data-store-block="category-grid" data-title="Shop by category" data-limit="8" data-cols="4"></div>',
  });
  bm.add('store-contact-form', {
    label: 'Contact Form',
    category: CAT_PRODUCTS,
    media: svg('<path d="M4 4h16v12H7l-3 3z"/><path d="M8 9h8M8 12h5"/>'),
    content: '<div data-store-block="contact-form" data-title="Contact us"></div>',
  });

  const contentBlock = (id: string, label: string, icon: string, content: string) =>
    bm.add(id, { label, category: CAT_CONTENT, media: icon, content });

  contentBlock('store-hero', 'Hero Banner', svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15l3-3 2 2 5-5"/>'),
    `<section class="cb-hero"><div class="cb-hero-inner"><h1 class="cb-hero-title">Big headline</h1><p class="cb-hero-subtitle">Say something inviting about your store or offer</p><a class="cb-btn" href="#">Shop now</a></div></section>`);
  contentBlock('store-icon-box', 'Icon Box', svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 16 0v1"/>'),
    `<div class="cb-card cb-icon-box"><div class="cb-icon-circle">★</div><h3 class="cb-h3">Why choose us</h3><div class="cb-muted">Describe a benefit, service or guarantee here.</div></div>`);
  contentBlock('store-image-box', 'Image Box', svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
    `<div class="cb-card"><img class="cb-card-img" src="https://via.placeholder.com/640x360.png?text=Image" alt=""/><h3 class="cb-h3">Image box</h3><div class="cb-muted">A picture with supporting copy — swap the image from the asset manager.</div></div>`);
  contentBlock('store-panel', 'Panel / Card', svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>'),
    `<section class="cb-section"><div class="cb-card"><h3 class="cb-h3">Panel heading</h3><div class="cb-prose">Any content can live inside this padded panel — drop more elements in.</div></div></section>`);
  contentBlock('store-cta', 'CTA Banner', svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 12h8M13 9l3 3-3 3"/>'),
    `<section class="cb-cta"><div class="cb-cta-inner"><h2 class="cb-cta-title">Ready to feel better?</h2><p class="cb-cta-sub">Free shipping on orders above ₹500</p><a class="cb-btn cb-btn-light" href="#">Start shopping</a></div></section>`);
  contentBlock('store-stats', 'Stats / Data Cards', svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    `<section class="cb-section"><div class="cb-grid-4">
      <div class="cb-card cb-stat"><div class="cb-stat-value">44k+</div><div class="cb-muted">Products</div></div>
      <div class="cb-card cb-stat"><div class="cb-stat-value">60+</div><div class="cb-muted">Brands</div></div>
      <div class="cb-card cb-stat"><div class="cb-stat-value">15k+</div><div class="cb-muted">Happy customers</div></div>
      <div class="cb-card cb-stat"><div class="cb-stat-value">4.8★</div><div class="cb-muted">Average rating</div></div>
    </div></section>`);
  contentBlock('store-testimonial', 'Testimonial Card', svg('<path d="M3 21c3-1 4-3 4-5H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7c0 4-3 6-9 7z"/>'),
    `<figure class="cb-card cb-testimonial"><div class="cb-stars">★★★★★</div><blockquote class="cb-quote">The remedies arrived quickly and worked wonderfully.</blockquote><figcaption class="cb-tst-who"><span><b>Customer name</b><i>Verified buyer</i></span></figcaption></figure>`);
  contentBlock('store-section', 'Content Section', svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>'),
    `<section class="cb-section"><h2 class="cb-h2">Section heading</h2><div class="cb-prose"><p>Write anything here, or drop columns, images and product grids inside.</p></div></section>`);

  // The .cb-* styles export with the page so static blocks look identical live.
  editor.on('load', () => {
    try { (editor as any).Css?.addRules?.(BASE_CSS); } catch { /* older API — styles arrive via converter seeding */ }
  });
}
