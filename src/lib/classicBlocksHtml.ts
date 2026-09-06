/**
 * Classic content blocks → editable HTML for the GrapesJS visual builder.
 *
 * When a page that was authored with the classic block editor is opened in the
 * visual builder for the first time, its blocks are converted to real HTML so
 * the existing content is VISIBLE and editable — an empty canvas here reads as
 * data loss.
 *
 * Static blocks (hero, text, features, …) become plain HTML styled by the
 * `.cb-*` classes in BASE_CSS (all selectable/stylable in the style manager).
 * DYNAMIC blocks (product/category grids, contact form) become
 * `data-store-block` placeholders — the builder previews them with live data
 * and the storefront renders them as the real React components, so they keep
 * pulling live products after the page moves to the builder.
 */

const esc = (s: any): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rich-text fields are already HTML — insert raw. Plain fields go through esc(). */
const rich = (s: any): string => String(s ?? '');

const attr = (name: string, v: any): string => (v === undefined || v === null || v === '' ? '' : ` ${name}="${esc(v)}"`);

/** A dynamic placeholder the builder + storefront both understand. */
function storeBlock(kind: string, data: Record<string, any>): string {
  const attrs = Object.entries(data).map(([k, v]) => attr(`data-${k}`, v)).join('');
  return `<div data-store-block="${kind}"${attrs}></div>`;
}

function heroHtml(d: any): string {
  const bg = d.backgroundImage || d.imageUrl || '';
  const cta = d.callToActionText || d.ctaButton?.text;
  const ctaLink = d.callToActionLink || d.ctaButton?.link || '#';
  return `<section class="cb-hero"${bg ? ` style="background-image:url('${esc(bg)}')"` : ''}>
  <div class="cb-hero-inner">
    ${d.title ? `<h1 class="cb-hero-title">${esc(d.title)}</h1>` : ''}
    ${d.subtitle ? `<p class="cb-hero-subtitle">${esc(d.subtitle)}</p>` : ''}
    ${cta ? `<a class="cb-btn" href="${esc(ctaLink)}">${esc(cta)}</a>` : ''}
  </div>
</section>`;
}

function textHtml(d: any): string {
  return `<section class="cb-section cb-narrow">
  ${d.title ? `<h2 class="cb-h2">${esc(d.title)}</h2>` : ''}
  <div class="cb-prose">${rich(d.content)}</div>
</section>`;
}

function imageHtml(d: any): string {
  if (!d.image) return '';
  return `<section class="cb-section cb-narrow"><img class="cb-img" src="${esc(d.image)}" alt="${esc(d.alt || '')}"/></section>`;
}

function textImageHtml(d: any): string {
  const img = d.image ? `<img class="cb-img" src="${esc(d.image)}" alt="${esc(d.alt || '')}"/>` : '';
  const txt = `<div>${d.title ? `<h2 class="cb-h2">${esc(d.title)}</h2>` : ''}<div class="cb-prose">${rich(d.content)}</div></div>`;
  const first = d.imagePosition === 'left' ? img : txt;
  const second = d.imagePosition === 'left' ? txt : img;
  return `<section class="cb-section"><div class="cb-2col">${first}${second}</div></section>`;
}

function featuresHtml(d: any): string {
  const items = (d.items || []).map((it: any) => `
    <div class="cb-card cb-icon-box">
      ${it.image ? `<img class="cb-card-img" src="${esc(it.image)}" alt=""/>` : ''}
      <div class="cb-icon-circle">${esc(it.icon || (it.title || '?')[0])}</div>
      <h3 class="cb-h3">${esc(it.title || '')}</h3>
      <div class="cb-muted">${rich(it.description)}</div>
    </div>`).join('');
  return `<section class="cb-section">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  ${d.subtitle ? `<p class="cb-muted cb-center">${esc(d.subtitle)}</p>` : ''}
  <div class="cb-grid-3">${items}</div>
</section>`;
}

function ctaHtml(d: any): string {
  const bg = d.backgroundImage ? ` style="background-image:url('${esc(d.backgroundImage)}')"` : '';
  return `<section class="cb-cta"${bg}>
  <div class="cb-cta-inner">
    ${d.title ? `<h2 class="cb-cta-title">${esc(d.title)}</h2>` : ''}
    ${d.subtitle ? `<p class="cb-cta-sub">${esc(d.subtitle)}</p>` : ''}
    ${d.description ? `<div class="cb-cta-sub">${rich(d.description)}</div>` : ''}
    ${d.buttonText ? `<a class="cb-btn cb-btn-light" href="${esc(d.buttonLink || '#')}">${esc(d.buttonText)}</a>` : ''}
  </div>
</section>`;
}

function faqHtml(d: any): string {
  const items = (d.items || []).map((it: any) => `
    <div class="cb-faq-item">
      <div class="cb-faq-q">${esc(it.question || '')}</div>
      <div class="cb-faq-a">${rich(it.answer)}</div>
    </div>`).join('');
  return `<section class="cb-section cb-narrow">
  ${d.title ? `<h2 class="cb-h2">${esc(d.title)}</h2>` : ''}
  ${items}
</section>`;
}

function testimonialsHtml(d: any): string {
  const items = (d.items || []).map((t: any) => `
    <figure class="cb-card cb-testimonial">
      ${Number(t.rating) > 0 ? `<div class="cb-stars">${'★'.repeat(Math.max(0, Math.min(5, Math.round(Number(t.rating)))))}</div>` : ''}
      <blockquote class="cb-quote">${rich(t.quote)}</blockquote>
      <figcaption class="cb-tst-who">
        ${t.avatar ? `<img class="cb-avatar" src="${esc(t.avatar)}" alt=""/>` : ''}
        <span><b>${esc(t.name || '')}</b>${t.role ? `<i>${esc(t.role)}</i>` : ''}</span>
      </figcaption>
    </figure>`).join('');
  return `<section class="cb-section">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  ${d.subtitle ? `<p class="cb-muted cb-center">${esc(d.subtitle)}</p>` : ''}
  <div class="cb-grid-3">${items}</div>
</section>`;
}

function videoHtml(d: any): string {
  const url = String(d?.url ?? '');
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/)?.[1];
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1];
  const embed = yt ? `https://www.youtube.com/embed/${yt}` : vimeo ? `https://player.vimeo.com/video/${vimeo}` : '';
  const media = embed
    ? `<iframe class="cb-video" src="${esc(embed)}" allowfullscreen></iframe>`
    : `<video class="cb-video" src="${esc(url)}" controls${d.poster ? ` poster="${esc(d.poster)}"` : ''}></video>`;
  return `<section class="cb-section cb-narrow">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  <div class="cb-video-wrap">${media}</div>
  ${d.caption ? `<div class="cb-muted cb-center">${rich(d.caption)}</div>` : ''}
</section>`;
}

function galleryHtml(d: any): string {
  const cols = Math.max(1, Math.min(6, Number(d?.columns) || 3));
  const items = (d.images || []).map((img: any) => `
    <figure class="cb-gallery-item">
      <img src="${esc(img.url)}" alt="${esc(img.alt || '')}"/>
      ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}
    </figure>`).join('');
  return `<section class="cb-section">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  <div class="cb-gallery" style="grid-template-columns:repeat(${cols},1fr)">${items}</div>
</section>`;
}

function statsHtml(d: any): string {
  const items = (d.items || []).map((s: any) => `
    <div class="cb-card cb-stat">
      <div class="cb-stat-value">${esc(s.value ?? '')}${esc(s.suffix ?? '')}</div>
      <div class="cb-muted">${esc(s.label ?? '')}</div>
    </div>`).join('');
  return `<section class="cb-section">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  <div class="cb-grid-4">${items}</div>
</section>`;
}

function timelineHtml(d: any): string {
  const items = (d.items || []).map((m: any) => `
    <li class="cb-tl-item">
      ${m.date ? `<time class="cb-tl-date">${esc(m.date)}</time>` : ''}
      ${m.title ? `<h3 class="cb-h3">${esc(m.title)}</h3>` : ''}
      <div class="cb-muted">${rich(m.description)}</div>
      ${m.image ? `<img class="cb-tl-img" src="${esc(m.image)}" alt=""/>` : ''}
    </li>`).join('');
  return `<section class="cb-section cb-narrow">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  <ol class="cb-timeline">${items}</ol>
</section>`;
}

function pricingHtml(d: any): string {
  const plans = (d.plans || []).map((p: any) => `
    <div class="cb-card cb-plan${p.highlighted ? ' cb-plan-hot' : ''}">
      <h3 class="cb-h3">${esc(p.name || '')}</h3>
      <div class="cb-plan-price">${esc(p.price ?? '')}<span>${esc(p.period ?? '')}</span></div>
      <ul class="cb-plan-features">${(Array.isArray(p.features) ? p.features : []).map((f: string) => `<li>✓ ${esc(f)}</li>`).join('')}</ul>
      ${p.ctaText ? `<a class="cb-btn" href="${esc(p.ctaLink || '#')}">${esc(p.ctaText)}</a>` : ''}
    </div>`).join('');
  return `<section class="cb-section">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  ${d.subtitle ? `<p class="cb-muted cb-center">${esc(d.subtitle)}</p>` : ''}
  <div class="cb-grid-3">${plans}</div>
</section>`;
}

/** One classic block → canvas HTML. Dynamic blocks stay LIVE via placeholders. */
// ── Homepage blocks ─────────────────────────────────────────────────────────
//
// The homepage is built from a DIFFERENT, richer block vocabulary than CMS
// pages (`HomeClient.tsx`'s 18 types). None of them had a converter, so opening
// the homepage in the builder showed 2 blocks out of 21 and a screen of blank
// space — everything else fell through `default: return ''`.
//
// The split below is deliberate:
//  • Blocks whose content is DATA (product rows, brand/category grids, live
//    stats, API-sourced FAQs, Google reviews, the banner carousel) become
//    `data-store-block` placeholders. The builder previews them and the
//    storefront mounts the REAL component through `HomeClient`'s own block
//    router, so they keep pulling live data and can't drift from the homepage.
//  • Blocks whose content is COPY (trust bar, promo images, banners, why-choose-us,
//    newsletter, info strip, CTA) become real editable HTML — text, images,
//    colours and layout all directly editable with the style manager.
//
// Structured values (a carousel's slides, a product row's `config`) ride in a
// single attribute, BASE64-encoded — not raw JSON.
//
// Raw JSON does not survive the trip. `routes/pages.ts` deliberately reverses
// the global xss-clean escaping on every string (COMMON_MISTAKES #20), which
// turns the `&quot;` this correctly writes back into a bare `"` — INSIDE a
// double-quoted attribute. The value then terminates at the first key and the
// rest of the JSON is re-parsed as junk attributes; observed live as
// `data-items="[{" title title title`. Base64's alphabet (A-Z a-z 0-9 + / =)
// contains nothing that decode touches, so it arrives intact.
const json = (v: any): string => {
  if (v === undefined || v === null) return '';
  const s = JSON.stringify(v);
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `b64:${btoa(bin)}`;
};

/**
 * Icon fields hold either a lucide component NAME ("ShieldCheck") or an emoji.
 *
 * A component name can't render in plain HTML, and falling back to the title's
 * first letter produced "1 / F / E / E / S" across the trust bar — technically
 * honest, visually broken. These map to the closest emoji instead: it renders
 * everywhere without a font or icon library, and — the point — it stays plain
 * text the author can simply retype to change, which an inline SVG would not.
 */
const LUCIDE_GLYPHS: Record<string, string> = {
  shieldcheck: '🛡️', shield: '🛡️', truck: '🚚', refreshcw: '↩️', rotateccw: '↩️',
  headphones: '🎧', creditcard: '💳', lock: '🔒', package: '📦', award: '🏆',
  shoppingbag: '🛍️', shoppingcart: '🛒', star: '⭐', heart: '❤️', users: '👥',
  leaf: '🌿', checkcircle: '✅', check: '✅', clock: '⏱️', gift: '🎁',
  phone: '📞', mail: '✉️', mappin: '📍', percent: '🏷️', zap: '⚡', thumbsup: '👍',
  stethoscope: '🩺', pill: '💊', flask: '⚗️', flaskconical: '⚗️', sparkles: '✨',
};

const iconGlyph = (icon: any, title: any): string => {
  const raw = String(icon ?? '').trim();
  if (!raw) return String(title ?? '?').trim().charAt(0).toUpperCase();
  // Non-ASCII = already an emoji/symbol → use as-is.
  if (!/^[\x20-\x7e]+$/.test(raw)) return raw;
  return LUCIDE_GLYPHS[raw.toLowerCase().replace(/[^a-z]/g, '')]
    ?? String(title ?? raw).trim().charAt(0).toUpperCase();
};

function iconCardsHtml(d: any, opts: { cls: string; cols?: number }): string {
  const items = (d.items || []).map((it: any) => `
    <div class="cb-card cb-icon-box">
      <div class="cb-icon-circle">${esc(iconGlyph(it.icon, it.title))}</div>
      <h3 class="cb-h3">${esc(it.title || '')}</h3>
      <div class="cb-muted">${esc(it.desc || it.description || '')}</div>
    </div>`).join('');
  const cols = opts.cols || Math.min(4, Math.max(2, (d.items || []).length || 3));
  return `<section class="cb-section ${opts.cls}">
  ${d.title ? `<h2 class="cb-h2 cb-center">${esc(d.title)}</h2>` : ''}
  ${d.subtitle ? `<p class="cb-muted cb-center" style="margin:-6px 0 22px">${esc(d.subtitle)}</p>` : ''}
  <div class="cb-grid-${cols === 3 ? '3' : '4'}">${items}</div>
</section>`;
}

function promoBannersHtml(d: any): string {
  const banners = (d.banners || []).filter((b: any) => b?.imageUrl);
  if (!banners.length) return '';
  const cols = Math.max(1, Math.min(4, Number(d.columns) || banners.length));
  const cells = banners.map((b: any) => {
    const img = `<img class="cb-img" src="${esc(b.imageUrl)}" alt="${esc(b.title || '')}" loading="lazy"/>`;
    return b.buttonUrl ? `<a href="${esc(b.buttonUrl)}">${img}</a>` : img;
  }).join('');
  return `<section class="cb-section"><div class="cb-promo" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div></section>`;
}

function fullWidthBannerHtml(d: any): string {
  return `<section class="cb-cta">
  <div class="cb-cta-inner">
    ${d.badge ? `<span class="cb-badge">${esc(d.badge)}</span>` : ''}
    ${d.title ? `<h2 class="cb-cta-title">${esc(d.title)}</h2>` : ''}
    ${d.subtitle ? `<p class="cb-cta-sub">${esc(d.subtitle)}</p>` : ''}
    ${d.buttonText ? `<a class="cb-btn cb-btn-light" href="${esc(d.buttonUrl || '#')}">${esc(d.buttonText)}</a>` : ''}
  </div>
</section>`;
}

function ctaBannerHtml(d: any): string {
  const btn = (text: any, url: any, light: boolean) =>
    (text ? `<a class="cb-btn${light ? ' cb-btn-light' : ' cb-btn-outline'}" href="${esc(url || '#')}">${esc(text)}</a>` : '');
  return `<section class="cb-cta">
  <div class="cb-cta-inner">
    ${d.title ? `<h2 class="cb-cta-title">${esc(d.title)}</h2>` : ''}
    ${d.subtitle ? `<p class="cb-cta-sub">${esc(d.subtitle)}</p>` : ''}
    <div class="cb-btn-row">
      ${btn(d.buttonText, d.buttonUrl, true)}
      ${btn(d.secondaryButtonText, d.secondaryButtonUrl, false)}
    </div>
  </div>
</section>`;
}

function splitBannerHtml(d: any): string {
  const side = (s: any) => {
    if (!s) return '';
    const bg = s.imageUrl ? ` style="background-image:url('${esc(s.imageUrl)}')"` : '';
    return `<div class="cb-split-side"${bg}>
      <div class="cb-split-inner">
        ${s.badge ? `<span class="cb-badge">${esc(s.badge)}</span>` : ''}
        ${s.title ? `<h3 class="cb-split-title">${esc(s.title)}</h3>` : ''}
        ${s.subtitle ? `<p class="cb-split-sub">${esc(s.subtitle)}</p>` : ''}
        ${s.buttonText ? `<a class="cb-btn cb-btn-light" href="${esc(s.buttonUrl || '#')}">${esc(s.buttonText)}</a>` : ''}
      </div>
    </div>`;
  };
  return `<section class="cb-section"><div class="cb-2col cb-split">${side(d.left)}${side(d.right)}</div></section>`;
}

function newsletterHtml(d: any): string {
  const badges = (d.badges || []).map((b: any) => `<span class="cb-badge">${esc(b)}</span>`).join('');
  return `<section class="cb-section cb-narrow cb-center cb-newsletter">
  ${d.title ? `<h2 class="cb-h2">${esc(d.title)}</h2>` : ''}
  ${d.subtitle ? `<p class="cb-muted">${esc(d.subtitle)}</p>` : ''}
  <div class="cb-news-form">
    <input class="cb-news-input" type="email" placeholder="${esc(d.placeholder || 'Enter your email')}"/>
    <a class="cb-btn" href="#">${esc(d.buttonText || 'Subscribe')}</a>
  </div>
  ${badges ? `<div class="cb-badge-row">${badges}</div>` : ''}
</section>`;
}

function blockToHtml(block: any): string {
  const d = block?.data || {};
  switch (block?.blockType) {
    case 'hero':          return heroHtml(d);
    case 'text':          return textHtml(d);
    case 'image':         return imageHtml(d);
    case 'text-image':    return textImageHtml(d);
    case 'features':      return featuresHtml(d);
    case 'cta':           return ctaHtml(d);
    case 'faq-accordion': return faqHtml(d);
    case 'testimonials':  return testimonialsHtml(d);
    case 'video':         return videoHtml(d);
    case 'gallery':       return galleryHtml(d);
    case 'stats':         return statsHtml(d);
    case 'timeline':      return timelineHtml(d);
    case 'pricing':       return pricingHtml(d);
    case 'contact-form':  return storeBlock('contact-form', { title: d.title, description: d.description });
    case 'product-cards':
      return storeBlock('product-grid', { title: d.title, category: d.categorySlug, sort: d.sort, limit: d.limit || 8 });
    case 'product-best-sellers':
      return storeBlock('product-grid', { title: d.title, tag: d.tagSlug || 'bestseller', limit: d.limit || 8 });
    case 'product-selection':
      return storeBlock('product-grid', { title: d.title, slugs: d.productSlugs, limit: d.limit || 8 });
    case 'product-featured':
      return storeBlock('product-grid', { title: d.title, slugs: d.productSlug, limit: 1, cols: 2 });
    case 'product-categories':
      return storeBlock('category-grid', { title: d.title, limit: d.limit || 8 });

    // ── Homepage vocabulary (HomeClient.tsx) ────────────────────────────────
    // Data-driven → live placeholder, so the storefront mounts the real
    // component and the section keeps working after conversion.
    case 'hero-carousel':
      return storeBlock('hero-carousel', {
        source: d.source || 'items', location: d.location,
        items: json(d.items), 'fallback-slides': json(d.fallbackSlides),
      });
    case 'product-row':
      return storeBlock('product-row', {
        title: d.title, subtitle: d.subtitle, badge: d.badge,
        'view-all-url': d.viewAllUrl, 'accent-color': d.accentColor, config: json(d.config),
      });
    case 'category-grid':
      return storeBlock('category-grid', {
        title: d.title, subtitle: d.subtitle, limit: d.limit || 8, 'view-all-url': d.viewAllUrl,
      });
    case 'brand-grid':
      return storeBlock('brand-grid', {
        title: d.title, subtitle: d.subtitle, limit: d.limit || 12, 'view-all-url': d.viewAllUrl,
      });
    case 'health-concerns-grid':
      return storeBlock('health-concerns-grid', {
        title: d.title, subtitle: d.subtitle, limit: d.limit || 16, 'parent-slug': d.parentSlug,
      });
    case 'google-reviews':
      return storeBlock('google-reviews', { title: d.title, subtitle: d.subtitle });
    case 'stats-bar':
      // Each stat's value is resolved live from a `source` ("products",
      // "customers"…), so this can't become static numbers.
      return storeBlock('stats-bar', { items: json(d.items) });

    // Copy-driven → real editable HTML.
    case 'trust-bar':       return iconCardsHtml(d, { cls: 'cb-trust', cols: 4 });
    case 'info-strip':      return iconCardsHtml(d, { cls: 'cb-info', cols: 4 });
    case 'why-choose-us':   return iconCardsHtml(d, { cls: 'cb-why', cols: 3 });
    case 'promo-banners':   return promoBannersHtml(d);
    case 'full-width-banner': return fullWidthBannerHtml(d);
    case 'cta-banner':      return ctaBannerHtml(d);
    case 'split-banner':    return splitBannerHtml(d);
    case 'newsletter':      return newsletterHtml(d);

    case 'builder':       return String(d.html || '');
    default:
      // Never silently drop an unknown block — that is exactly how 19 of the
      // homepage's 21 blocks became blank space. Emit a visible, editable
      // placeholder naming the type so the author can see what is there and
      // decide, instead of the section simply vanishing from the canvas.
      return `<section class="cb-section cb-unknown"><div class="cb-card cb-center">
    <div class="cb-muted"><b>${esc(block?.blockType || 'Unknown block')}</b></div>
    <div class="cb-muted" style="font-size:12.5px;margin-top:4px">This section has no visual-builder equivalent yet. It stays on the page until you delete it here.</div>
  </div></section>`;
  }
}

export const BASE_CSS = `
.cb-section{max-width:1180px;margin:0 auto;padding:44px 20px}
.cb-narrow{max-width:860px}
.cb-center{text-align:center}
.cb-h2{font-size:28px;font-weight:700;margin:0 0 14px;color:#111827}
.cb-h3{font-size:17px;font-weight:600;margin:0 0 6px;color:#111827}
.cb-muted{color:#6b7280;font-size:14px;line-height:1.6}
.cb-prose{color:#374151;font-size:15px;line-height:1.7}
.cb-btn{display:inline-block;padding:12px 28px;background:#0f766e;color:#fff;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
.cb-btn-light{background:#fff;color:#0f766e}
.cb-img{width:100%;border-radius:12px;display:block}
.cb-hero{position:relative;min-height:380px;display:flex;align-items:center;justify-content:center;text-align:center;background:#0f766e center/cover no-repeat}
.cb-hero-inner{position:relative;max-width:760px;padding:60px 20px}
.cb-hero-title{font-size:42px;font-weight:800;color:#fff;margin:0 0 12px;text-shadow:0 2px 14px rgba(0,0,0,.35)}
.cb-hero-subtitle{font-size:18px;color:rgba(255,255,255,.92);margin:0 0 26px}
.cb-2col{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
.cb-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.cb-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.cb-card{background:#fff;border:1px solid #eef0f3;border-radius:14px;padding:22px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.cb-card-img{width:100%;height:150px;object-fit:cover;border-radius:10px;margin-bottom:14px}
.cb-icon-circle{width:44px;height:44px;border-radius:999px;background:rgba(15,118,110,.1);color:#0f766e;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;margin-bottom:12px}
.cb-cta{position:relative;background:#0f766e center/cover no-repeat;color:#fff;text-align:center;padding:56px 20px}
.cb-cta-inner{max-width:680px;margin:0 auto}
.cb-cta-title{font-size:30px;font-weight:800;margin:0 0 10px}
.cb-cta-sub{color:rgba(255,255,255,.85);font-size:16px;margin:0 0 22px}
.cb-faq-item{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px;overflow:hidden}
.cb-faq-q{padding:14px 18px;font-weight:600;color:#111827;background:#f9fafb}
.cb-faq-a{padding:12px 18px;color:#4b5563;font-size:14px;line-height:1.65}
.cb-stars{color:#f59e0b;letter-spacing:2px;margin-bottom:8px}
.cb-quote{margin:0 0 14px;font-size:14.5px;line-height:1.65;color:#374151}
.cb-tst-who{display:flex;align-items:center;gap:10px;font-size:13px;color:#111827}
.cb-tst-who i{display:block;color:#6b7280;font-style:normal;font-size:12px}
.cb-avatar{width:38px;height:38px;border-radius:999px;object-fit:cover}
.cb-video-wrap{aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;margin-bottom:10px}
.cb-video{width:100%;height:100%;border:0;display:block;object-fit:contain}
.cb-gallery{display:grid;gap:14px}
.cb-gallery-item{margin:0;border-radius:12px;overflow:hidden;border:1px solid #eef0f3}
.cb-gallery-item img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.cb-gallery-item figcaption{padding:8px;text-align:center;font-size:12px;color:#6b7280}
.cb-stat{text-align:center}
.cb-stat-value{font-size:30px;font-weight:800;color:#0f766e}
.cb-timeline{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid #e5e7eb}
.cb-tl-item{position:relative;margin:0 0 26px;padding-left:18px}
.cb-tl-item:before{content:"";position:absolute;left:-24px;top:4px;width:10px;height:10px;border-radius:999px;background:#0f766e}
.cb-tl-date{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#0f766e;font-weight:700}
.cb-tl-img{max-height:200px;border-radius:10px;margin-top:10px}
.cb-plan{display:flex;flex-direction:column}
.cb-plan-hot{outline:2px solid #0f766e}
.cb-plan-price{font-size:30px;font-weight:800;margin:6px 0 14px}
.cb-plan-price span{font-size:13px;color:#6b7280;font-weight:500}
.cb-plan-features{list-style:none;margin:0 0 18px;padding:0;font-size:14px;color:#374151;flex:1}
.cb-plan-features li{margin-bottom:8px}
.cb-badge{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.18);color:inherit;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px}
.cb-btn-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.cb-btn-outline{background:transparent;border:2px solid currentColor}
.cb-promo{display:grid;gap:18px}
.cb-promo img{width:100%;height:auto;border-radius:14px;display:block}
.cb-split{gap:20px}
.cb-split-side{position:relative;min-height:260px;border-radius:16px;overflow:hidden;background:#0f766e center/cover no-repeat;display:flex;align-items:flex-end}
.cb-split-inner{position:relative;padding:26px;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.62),transparent);width:100%}
.cb-split-title{font-size:22px;font-weight:800;margin:0 0 6px}
.cb-split-sub{font-size:14px;margin:0 0 14px;color:rgba(255,255,255,.9)}
.cb-newsletter{background:#f8fafc;border-radius:16px}
.cb-news-form{display:flex;gap:10px;justify-content:center;margin:18px 0 12px;flex-wrap:wrap}
.cb-news-input{flex:1;min-width:220px;max-width:340px;padding:12px 16px;border:1px solid #d1d5db;border-radius:999px;font-size:14px}
.cb-badge-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.cb-badge-row .cb-badge{background:rgba(15,118,110,.1);color:#0f766e}
.cb-trust .cb-card,.cb-info .cb-card{text-align:center}
.cb-trust .cb-icon-circle,.cb-info .cb-icon-circle,.cb-why .cb-icon-circle{margin-left:auto;margin-right:auto}
.cb-unknown .cb-card{border-style:dashed;background:#fafafa}
@media (max-width:900px){.cb-grid-3,.cb-grid-4{grid-template-columns:repeat(2,1fr)}.cb-2col{grid-template-columns:1fr}.cb-promo{grid-template-columns:1fr !important}}
@media (max-width:560px){.cb-grid-3,.cb-grid-4{grid-template-columns:1fr}}
`;

export function classicBlocksToHtml(blocks: any[]): { html: string; css: string } {
  const ordered = (blocks || [])
    .filter((b) => b && b.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const html = ordered.map(blockToHtml).filter(Boolean).join('\n');
  return { html, css: BASE_CSS };
}
