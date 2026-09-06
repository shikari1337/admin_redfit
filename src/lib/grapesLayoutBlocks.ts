/**
 * GrapesJS plugin: the layout / content UI components for the page builder.
 *
 * Complements `grapesStoreBlocks.ts` (which owns the LIVE, data-driven store
 * blocks — product grids, category cards, contact form). Everything here is
 * static markup the storefront renders straight from the exported HTML, so it
 * needs no runtime support on the other side: what you see in the canvas is
 * literally what ships.
 *
 * Two rules shaped this file:
 *  1. **No block may need JavaScript on the storefront.** The accordion is
 *     `<details>/<summary>`, not a click handler; the video is an iframe, not a
 *     player script. The storefront renders builder HTML as sanitized markup —
 *     any block relying on injected JS would silently do nothing there.
 *  2. **Anything configurable is a TRAIT, not a "go and edit the HTML".**
 *     A video takes a YouTube URL and works out the embed; a map takes an
 *     address. Both then export a plain iframe whose host is on the sanitizer's
 *     allow-list, so the setting survives the security layer instead of being
 *     stripped on save.
 */
import type { Editor } from 'grapesjs';

const svg = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const CAT_LAYOUT = 'Layout';
const CAT_CONTENT = 'Content';
const CAT_MEDIA = 'Media';

/** Styles for the blocks below. Registered into the project stylesheet (same
 *  mechanism `classicBlocksHtml`'s BASE_CSS uses) so they EXPORT with the page
 *  — the storefront has no stylesheet of its own for builder markup. */
export const LAYOUT_CSS = `
.pb-row{display:flex;flex-wrap:wrap;gap:20px;align-items:stretch}
.pb-col{flex:1 1 0;min-width:220px}
.pb-container{max-width:1180px;margin:0 auto;padding:40px 20px}
.pb-btn{display:inline-block;padding:12px 26px;border-radius:8px;background:#0f766e;color:#fff;
  font-weight:700;font-size:14px;text-decoration:none;line-height:1.2}
.pb-btn--outline{background:transparent;border:2px solid currentColor;color:#0f766e}
.pb-btn--light{background:#fff;color:#0f766e}
.pb-divider{border:0;border-top:1px solid #e5e7eb;margin:0}
.pb-spacer{height:40px}
.pb-note{border-left:4px solid #0ea5e9;background:#f0f9ff;padding:14px 18px;border-radius:0 8px 8px 0;
  font-size:14px;line-height:1.6;color:#0c4a6e}
.pb-note--warn{border-color:#f59e0b;background:#fffbeb;color:#78350f}
.pb-note--ok{border-color:#10b981;background:#ecfdf5;color:#064e3b}
.pb-faq{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff}
.pb-faq+.pb-faq{margin-top:10px}
.pb-faq>summary{cursor:pointer;padding:14px 18px;font-weight:600;font-size:14.5px;color:#111827;list-style:none}
.pb-faq>summary::-webkit-details-marker{display:none}
.pb-faq>summary::after{content:"+";float:right;font-weight:400;font-size:18px;color:#6b7280}
.pb-faq[open]>summary::after{content:"\\2212"}
.pb-faq-body{padding:0 18px 16px;font-size:14px;line-height:1.7;color:#4b5563}
.pb-figure{margin:0}
.pb-figure img{width:100%;height:auto;border-radius:10px;display:block}
.pb-figure figcaption{margin-top:8px;font-size:12.5px;color:#6b7280;text-align:center}
.pb-embed{width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block}
.pb-embed--map{aspect-ratio:4/3}
.pb-social{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.pb-social a{color:#374151;text-decoration:none;font-size:14px;font-weight:600}
.pb-badges{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}
.pb-badge{display:flex;align-items:center;gap:10px;font-size:13.5px;color:#374151;font-weight:600}
.pb-badge span:first-child{font-size:22px;line-height:1}
@media (max-width:767px){
  .pb-row{gap:14px}
  .pb-col{flex:1 1 100%}
  .pb-container{padding:28px 16px}
}
`;

/** YouTube / Vimeo watch URL → embeddable src. Returns '' when it isn't one,
 *  so a half-typed URL clears the frame instead of embedding nonsense. */
function toEmbedUrl(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)?.[1];
  if (yt) return `https://www.youtube.com/embed/${yt}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  // Already an embed URL on an allowed host → pass through.
  if (/^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(url)) return url;
  return '';
}

export default function layoutBlocks(editor: Editor) {
  const bm = editor.BlockManager;
  const dc = editor.DomComponents;

  // ── Component types with real behaviour ────────────────────────────────────

  /**
   * Video embed. The author pastes the URL they actually have (a normal
   * youtube.com/watch link); the component derives the embed src. Storing the
   * original in `data-video` keeps the trait round-trippable when the page is
   * reopened — reading it back off the iframe `src` would show them a URL they
   * never typed.
   */
  dc.addType('pb-video', {
    isComponent: (el: any) => (el?.tagName === 'IFRAME' && el?.getAttribute?.('data-pb') === 'video'
      ? { type: 'pb-video' } : false),
    model: {
      defaults: {
        name: 'Video',
        tagName: 'iframe',
        droppable: false,
        attributes: {
          'data-pb': 'video', class: 'pb-embed', allowfullscreen: 'true',
          frameborder: '0', loading: 'lazy',
          allow: 'accelerometer; clipboard-write; encrypted-media; picture-in-picture',
        },
        traits: [
          { type: 'text', name: 'data-video', label: 'YouTube or Vimeo URL', placeholder: 'https://youtube.com/watch?v=…' },
        ] as any,
      },
      init(this: any) {
        this.on('change:attributes:data-video', () => {
          this.addAttributes({ src: toEmbedUrl(this.getAttributes()['data-video']) });
        });
      },
    },
  });

  /**
   * Map embed. Google's `?output=embed` form needs no API key and no billing
   * account, which matters for a store that just wants its shop on the page.
   */
  dc.addType('pb-map', {
    isComponent: (el: any) => (el?.tagName === 'IFRAME' && el?.getAttribute?.('data-pb') === 'map'
      ? { type: 'pb-map' } : false),
    model: {
      defaults: {
        name: 'Map',
        tagName: 'iframe',
        droppable: false,
        attributes: {
          'data-pb': 'map', class: 'pb-embed pb-embed--map', frameborder: '0', loading: 'lazy',
          referrerpolicy: 'no-referrer-when-downgrade',
        },
        traits: [
          { type: 'text', name: 'data-address', label: 'Address or place', placeholder: 'MG Road, Bengaluru' },
          { type: 'select', name: 'data-zoom', label: 'Zoom', options: [
            { id: '10', name: 'City' }, { id: '14', name: 'Area' }, { id: '17', name: 'Street' },
          ] },
        ] as any,
      },
      init(this: any) {
        const sync = () => {
          const a = this.getAttributes();
          const q = String(a['data-address'] || '').trim();
          const z = String(a['data-zoom'] || '14');
          this.addAttributes({
            src: q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${encodeURIComponent(z)}&output=embed` : '',
          });
        };
        this.on('change:attributes:data-address change:attributes:data-zoom', sync);
      },
    },
  });

  // ── Blocks ────────────────────────────────────────────────────────────────
  const add = (id: string, label: string, category: string, icon: string, content: string, extra: Record<string, any> = {}) =>
    bm.add(id, { label, category, media: icon, content, ...extra });

  // Layout
  add('pb-section', 'Section', CAT_LAYOUT,
    svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
    `<section class="pb-container"><h2>Section heading</h2><p>Drop anything inside this padded container.</p></section>`);

  for (const [n, label] of [[2, '2 Columns'], [3, '3 Columns'], [4, '4 Columns']] as const) {
    add(`pb-cols-${n}`, label, CAT_LAYOUT,
      svg(Array.from({ length: n }, (_, i) => `<rect x="${2 + i * (20 / n)}" y="5" width="${18 / n - 1}" height="14" rx="1"/>`).join('')),
      `<div class="pb-row">${Array.from({ length: n }, () => '<div class="pb-col"><p>Column</p></div>').join('')}</div>`);
  }

  add('pb-spacer', 'Spacer', CAT_LAYOUT,
    svg('<path d="M4 8h16M4 16h16"/><path d="M12 8v8" stroke-dasharray="2 2"/>'),
    `<div class="pb-spacer"></div>`);

  add('pb-divider', 'Divider', CAT_LAYOUT,
    svg('<path d="M3 12h18"/>'),
    `<hr class="pb-divider"/>`);

  // Content
  add('pb-heading', 'Heading', CAT_CONTENT,
    svg('<path d="M6 4v16M18 4v16M6 12h12"/>'),
    `<h2>Your heading here</h2>`);

  add('pb-paragraph', 'Paragraph', CAT_CONTENT,
    svg('<path d="M4 6h16M4 11h16M4 16h10"/>'),
    `<p>Write your copy here. Double-click to edit, and use the Style tab for typography.</p>`);

  add('pb-button', 'Button', CAT_CONTENT,
    svg('<rect x="3" y="8" width="18" height="8" rx="4"/>'),
    `<a class="pb-btn" href="/products">Shop now</a>`);

  add('pb-faq', 'FAQ item', CAT_CONTENT,
    svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V14"/><path d="M12 17h.01"/>'),
    // <details> gives a working accordion with ZERO JavaScript on the
    // storefront, which is the only kind that survives the HTML-only render.
    `<details class="pb-faq"><summary>What is your return policy?</summary>
      <div class="pb-faq-body">Answer goes here. Edit this text directly.</div></details>`);

  add('pb-note', 'Notice box', CAT_CONTENT,
    svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'),
    `<div class="pb-note">Use this for shipping notes, offers or anything that needs to stand out.</div>`);

  add('pb-badges', 'Trust badges', CAT_CONTENT,
    svg('<path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z"/><path d="M9.5 12l1.8 1.8L15 10"/>'),
    `<div class="pb-badges">
      <div class="pb-badge"><span>🛡️</span><span>100% Authentic</span></div>
      <div class="pb-badge"><span>🚚</span><span>Fast Delivery</span></div>
      <div class="pb-badge"><span>↩️</span><span>Easy Returns</span></div>
      <div class="pb-badge"><span>🎧</span><span>Expert Support</span></div>
    </div>`);

  add('pb-social', 'Social links', CAT_CONTENT,
    svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
    `<div class="pb-social">
      <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer">Instagram</a>
      <a href="https://youtube.com/" target="_blank" rel="noopener noreferrer">YouTube</a>
    </div>`);

  // Media — every image block starts on a real placeholder so the picker has
  // something to replace; double-clicking any image opens the Media Library
  // (upload / choose existing / paste URL).
  add('pb-image', 'Image', CAT_MEDIA,
    svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/>'),
    `<img class="pb-figure" src="https://via.placeholder.com/1200x675.png?text=Click+to+choose+an+image" alt="" loading="lazy"/>`);

  add('pb-figure', 'Image + caption', CAT_MEDIA,
    svg('<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M4 21h16"/>'),
    `<figure class="pb-figure">
      <img src="https://via.placeholder.com/1200x675.png?text=Click+to+choose+an+image" alt="" loading="lazy"/>
      <figcaption>Describe this image</figcaption>
    </figure>`);

  add('pb-video', 'Video (YouTube/Vimeo)', CAT_MEDIA,
    svg('<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/>'),
    `<iframe data-pb="video" class="pb-embed" frameborder="0" loading="lazy" allowfullscreen="true"
      allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
      src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`);

  add('pb-map', 'Map', CAT_MEDIA,
    svg('<path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15M15 6v15"/>'),
    `<iframe data-pb="map" data-address="MG Road, Bengaluru" data-zoom="14" class="pb-embed pb-embed--map"
      frameborder="0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?q=MG%20Road%2C%20Bengaluru&z=14&output=embed"></iframe>`);

  // Ship the stylesheet with the project so the exported page carries it.
  editor.on('load', () => {
    try { (editor as any).Css?.addRules?.(LAYOUT_CSS); } catch { /* older API — blocks still render via their own markup */ }
  });
}
