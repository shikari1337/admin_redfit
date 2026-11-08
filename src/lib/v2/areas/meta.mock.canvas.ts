/**
 * DEVELOPMENT ONLY sample data for lane META-19 (`?mock=meta` on a dev server; imported only by `meta.mock.ts`, which a
 * production build never bundles): the Instant Experiences of a sample Indian homeopathy store, Meta's templates and the
 * editor's options as `meta_ads/canvas.rs` answers them. Changes live in memory until reload. `?mockvariant=fresh`
 * starts with none.
 */
import type { Canvas, CanvasElement, CanvasInput, CanvasList, CanvasOptions, CanvasPreview, CanvasTemplate } from './meta';

const fresh = (): boolean => {
  try { return new URLSearchParams(window.location.search).get('mockvariant') === 'fresh'; } catch { return false; }
};
const wait = <T,>(v: T, ms = 180): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const refuse = (status: number, message: string): Promise<never> =>
  new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(message), { response: { status, data: { code: 'marketing.bad_request', message } } })), 220));
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

function pic(label: string, hue: number, w = 1080, h = 1080): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue} 55% 90%)"/><circle cx="${w * 0.78}" cy="${h * 0.2}" r="${Math.min(w, h) * 0.16}" fill="hsl(${hue} 45% 70%)" opacity=".45"/><rect x="${w * 0.38}" y="${h * 0.3}" width="${w * 0.24}" height="${h * 0.42}" rx="30" fill="#fff" stroke="hsl(${hue} 45% 60%)" stroke-width="8"/><rect x="${w * 0.43}" y="${h * 0.22}" width="${w * 0.14}" height="${h * 0.09}" rx="12" fill="hsl(${hue} 45% 60%)"/><text x="${w / 2}" y="${h * 0.86}" font-family="Helvetica,Arial" font-size="${Math.round(Math.min(w, h) / 20)}" font-weight="700" fill="hsl(${hue} 50% 25%)" text-anchor="middle">${label.slice(0, 26)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const media = (file: string, label: string, hue: number, w = 1080, h = 1080) => ({
  gallery_id: `stores/homeomed/products/gallery/${file}`, url: pic(label, hue, w, h), name: file, kind: 'image', width: w, height: h,
});

const OPTIONS: CanvasOptions = {
  mock: false,
  mock_reason: null,
  page: { id: '104729563318842', name: 'Homeomed India' },
  elements: [
    { key: 'header', label: 'Header', help: "A bar at the top holding one picture, such as the store's logo.", fields: ['media', 'color'] },
    { key: 'photo', label: 'Photo', help: "A picture from the store's media; tapping it can open a link.", fields: ['media', 'style', 'link'] },
    { key: 'video', label: 'Video', help: "A video from the store's media.", fields: ['media', 'style'] },
    { key: 'text', label: 'Text', help: 'A block of words.', fields: ['text', 'align', 'font_size', 'text_color', 'color'] },
    { key: 'button', label: 'Button', help: 'A button that opens a link.', fields: ['text', 'link', 'style', 'align', 'color', 'text_color'] },
    { key: 'carousel', label: 'Carousel', help: 'Pictures people swipe through; each can open a link.', fields: ['items', 'style', 'link'] },
    { key: 'product_set', label: 'Products from a product set', help: "Products of a product set of the store's Meta catalog.", fields: ['product_set_id', 'max_items', 'show_in_feed'] },
    { key: 'footer', label: 'Footer button', help: 'A button that stays at the bottom of the screen.', fields: ['text', 'link', 'style', 'color', 'text_color'] },
  ],
  templates: [
    { key: 'get_new_customers', label: 'Get new customers', help: null, template_id: '133471657203838', needs_catalog: null },
    { key: 'showcase_business', label: 'Showcase your business', help: null, template_id: '1063217037112304', needs_catalog: null },
    { key: 'sell_without_catalog', label: 'Sell products (without catalog)', help: null, template_id: '424787857903852', needs_catalog: false },
    { key: 'sell_lifestyle', label: 'Sell products: lifestyle layout', help: null, template_id: '1369752616394017', needs_catalog: null },
    { key: 'sell_grid', label: 'Sell products: grid layout', help: null, template_id: '1932289657009030', needs_catalog: true },
  ],
  styles: {
    photo: ['FIT_TO_WIDTH', 'FIT_TO_WIDTH_EXPANDABLE', 'FIT_TO_HEIGHT'], video: ['FIT_TO_WIDTH', 'FIT_TO_HEIGHT'],
    carousel: ['FIT_TO_WIDTH', 'FIT_TO_HEIGHT'], button: ['BUTTON_OUTLINE', 'BUTTON_FILLED'], align: ['LEFT', 'CENTER', 'RIGHT'],
  },
  limits: { elements: 30, carousel_items: 10, text: 2000, button: 80, name: 200, thumbnails: 4 },
  collection_rule: 'A collection ad without a catalog opens an Instant Experience: its first photo or video is the cover, and four more pictures of it (photos or carousel pictures) show under the cover.',
  not_built: [
    { key: 'PRODUCT_LIST', why: 'Named catalog products: use products from a product set instead.' },
    { key: 'STORE_LOCATOR', why: "Needs the Page's store locations, and Instagram does not show it (Meta's Instant Experiences guide)." },
    { key: 'LEAD_FORM', why: 'Instant forms open from lead ads (Create ad, Leads).' },
    { key: 'TEMPLATE_VIDEO', why: "Meta's automatic catalog video: a catalog collection ad makes it." },
    { key: 'EXISTING_POST', why: 'A Page or Instagram post inside an Instant Experience is not offered yet.' },
  ],
};

/** The same reading as `canvas.rs` `collection_of`. */
function collectionOf(c: CanvasInput): { ready: boolean; note: string | null } {
  const body = c.elements.filter((e) => e.type !== 'header' && e.type !== 'footer');
  const cover = body[0] && (body[0].type === 'photo' || body[0].type === 'video') ? body[0] : null;
  let sized = 0; let unknown = 0;
  const count = (m?: { width?: number | null; height?: number | null } | null) => { if (m?.width && m?.height) sized += 1; else unknown += 1; };
  body.forEach((e) => {
    if (e === cover) return;
    if (e.type === 'photo') count(e.media);
    if (e.type === 'carousel') (e.items ?? []).forEach(count);
  });
  if (!cover) return { ready: false, note: "A collection uses the Instant Experience's first photo or video as its cover: put one first (after the header)." };
  if (body.some((e) => e.type === 'product_set')) return { ready: false, note: 'Products from a product set make a catalog collection: pick Collection with a product set instead, or take that element out.' };
  if (sized < 4) return { ready: false, note: `A collection shows four pictures under the cover: add ${4 - sized} more photos or carousel pictures after the cover${unknown ? ', or pick again the pictures whose size was not read' : ''}.` };
  return { ready: true, note: null };
}

let seq = 0;
const madeIds = (els: CanvasElement[]): CanvasElement[] => els.map((e) => {
  seq += 1;
  const base = 120873400 + seq * 7;
  return {
    ...e,
    meta_id: String(base),
    children: e.type === 'carousel' ? (e.items ?? []).map((_, j) => String(base + j + 1)) : e.type === 'header' || e.type === 'footer' ? [String(base + 1)] : [],
  };
});

function canvasOf(id: string, input: CanvasInput, over: Partial<Canvas> = {}): Canvas {
  const col = collectionOf(input);
  const metaId = `2289${id.replace(/\D/g, '').padStart(11, '7')}`;
  return {
    id, source: 'growcord', status: 'draft', ...input, elements: madeIds(input.elements),
    meta_canvas_id: metaId, canvas_link: `https://fb.com/canvas_doc/${metaId}`, is_published: false, is_hidden: false,
    collection_ready: col.ready, collection_note: col.note, built_at: minutesAgo(40), build_error: null, build_failed_step: null,
    publish_error: null, last_refusal: null, mock: false, steps: [], created_at: minutesAgo(45), updated_at: minutesAgo(40), published_at: null,
    ...over,
  };
}

const DIWALI: CanvasInput = {
  name: 'Diwali wellness hampers',
  template: 'sell_without_catalog',
  background_color: 'FFFFF8F0',
  elements: [
    { type: 'header', media: media('homeomed-logo-wide.png', 'Homeomed', 28, 1200, 300), color: 'FFFFFFFF' },
    { type: 'photo', media: media('diwali-hamper-cover.jpg', 'Diwali hampers', 35, 1080, 1350), style: 'FIT_TO_WIDTH_EXPANDABLE', link: 'https://homeomed.in/collections/diwali-hampers' },
    { type: 'text', text: 'Gift wellness this Diwali. Hampers of mother tinctures, biochemic salts and Bach flower remedies, gift wrapped, from 699 rupees.', align: 'CENTER', font_size: 16, text_color: 'FF3F2D1C' },
    { type: 'carousel', style: 'FIT_TO_WIDTH', link: 'https://homeomed.in/collections/diwali-hampers', items: [
      media('hamper-immunity.jpg', 'Immunity hamper', 140), media('hamper-calm.jpg', 'Calm and sleep hamper', 260),
      media('hamper-skin.jpg', 'Skin glow hamper', 330), media('hamper-family.jpg', 'Family first aid hamper', 10),
    ] },
    { type: 'button', text: 'See all hampers', link: 'https://homeomed.in/collections/diwali-hampers', style: 'BUTTON_OUTLINE', align: 'CENTER' },
    { type: 'footer', text: 'Shop the Diwali hampers', link: 'https://homeomed.in/collections/diwali-hampers', style: 'BUTTON_FILLED', color: 'FFB45309', text_color: 'FFFFFFFF' },
  ],
};

const MT_RANGE: CanvasInput = {
  name: 'Mother tinctures: the German range',
  template: null,
  background_color: null,
  elements: [
    { type: 'photo', media: media('mt-range-hero.jpg', 'Mother tinctures', 95, 1080, 1080), style: 'FIT_TO_WIDTH' },
    { type: 'text', text: 'Over 400 mother tinctures from Dr. Reckeweg, Schwabe and SBL, sealed and stored away from light.', align: 'LEFT', font_size: 15 },
    { type: 'photo', media: { gallery_id: 'stores/homeomed/products/gallery/mt-shelf.jpg', url: pic('The shelf', 100), name: 'mt-shelf.jpg', kind: 'image', width: null, height: null } },
    { type: 'footer', text: 'Shop mother tinctures', link: 'https://homeomed.in/forms/mother-tincture', style: 'BUTTON_FILLED' },
  ],
};

let CANVASES: Canvas[] | null = null;
function all(): Canvas[] {
  if (CANVASES) return CANVASES;
  CANVASES = fresh() ? [] : [
    canvasOf('6f1c2a40-3b7e-4f7a-9a51-2d0c7e1b8a01', DIWALI, { status: 'published', is_published: true, published_at: minutesAgo(60 * 26), built_at: minutesAgo(60 * 27), created_at: minutesAgo(60 * 28), updated_at: minutesAgo(60 * 26) }),
    canvasOf('0b9e5d12-77c4-4b8e-8f20-6a3d1c9e4f02', MT_RANGE, { updated_at: minutesAgo(12), built_at: minutesAgo(12) }),
    canvasOf('a43d7e88-1f20-4c6b-b0e9-5c2f8d3a7e03', { ...MT_RANGE, name: 'Bach flower remedies, first try', elements: MT_RANGE.elements.slice(0, 2) }, {
      meta_canvas_id: null, canvas_link: null, built_at: minutesAgo(130), updated_at: minutesAgo(130),
      build_error: "(#100) Param canvas_photo[photo_url] must be a valid URL that Meta can reach. The picture's address answered 403.",
      build_failed_step: 'element 1 (photo)',
    }),
  ];
  return CANVASES;
}
const META_MADE: Canvas = {
  id: '228971044518236', source: 'meta', name: 'Store opening offer (made in Ads Manager)', status: 'published', template: null, background_color: null, elements: [],
  meta_canvas_id: '228971044518236', canvas_link: 'https://fb.com/canvas_doc/228971044518236', is_published: true, is_hidden: false,
  collection_ready: null, collection_note: "Made in Meta's tools: Meta names its collection thumbnails when an ad uses it.", updated_at: Math.floor(Date.now() / 1000) - 9 * 86_400,
};

function previewHtml(c: Canvas): string {
  const blocks = c.elements.map((e) => {
    if (e.type === 'header') return `<div style="padding:10px;background:#fff;border-bottom:1px solid #eee;text-align:center"><img src="${e.media?.url ?? ''}" style="height:36px"/></div>`;
    if (e.type === 'photo') return `<img src="${e.media?.url ?? ''}" style="width:100%;display:block"/>`;
    if (e.type === 'text') return `<p style="padding:12px 16px;margin:0;font:${e.font_size ?? 15}px/1.45 Helvetica,Arial;text-align:${(e.align ?? 'CENTER').toLowerCase()};color:#3f2d1c">${e.text ?? ''}</p>`;
    if (e.type === 'carousel') return `<div style="display:flex;gap:6px;overflow-x:auto;padding:8px">${(e.items ?? []).map((m) => `<img src="${m.url ?? ''}" style="width:70%;flex:0 0 70%;border-radius:6px"/>`).join('')}</div>`;
    if (e.type === 'button') return `<div style="padding:10px 16px"><div style="border:1px solid #b45309;color:#b45309;text-align:center;padding:10px;border-radius:6px;font:600 14px Helvetica,Arial">${e.text ?? ''}</div></div>`;
    if (e.type === 'footer') return `<div style="position:sticky;bottom:0;padding:10px 16px;background:#fff;border-top:1px solid #eee"><div style="background:#b45309;color:#fff;text-align:center;padding:12px;border-radius:6px;font:600 14px Helvetica,Arial">${e.text ?? ''}</div></div>`;
    return '';
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#fff8f0;font-family:Helvetica,Arial">${blocks}</body></html>`;
}

export const canvasMock = {
  canvasOptions: () => wait<CanvasOptions>(OPTIONS),
  canvasTemplate: (key: string): Promise<CanvasTemplate> => {
    const t = OPTIONS.templates.find((x) => x.key === key);
    if (!t) return refuse(404, 'No such template');
    const layouts: Record<string, CanvasTemplate['elements']> = {
      sell_without_catalog: [{ type: 'photo', name: 'Cover' }, { type: 'text', name: 'Headline' }, { type: 'carousel', name: 'Products' }, { type: 'text', name: 'Details' }, { type: 'footer', name: 'Shop button' }],
      get_new_customers: [{ type: 'photo', name: 'Cover' }, { type: 'text', name: 'Offer' }, { type: 'button', name: 'Offer button' }, { type: 'footer', name: 'Footer' }],
      showcase_business: [{ type: 'video', name: 'Intro video' }, { type: 'text', name: 'About' }, { type: 'carousel', name: 'Highlights' }, { type: 'button', name: 'Visit' }],
      sell_lifestyle: [{ type: 'photo', name: 'Lifestyle picture' }, { type: 'text', name: 'Story' }, { type: 'photo', name: 'Second picture' }, { type: 'footer', name: 'Shop button' }],
      sell_grid: [{ type: 'photo', name: 'Cover' }, { type: 'product_set', name: 'Products' }, { type: 'footer', name: 'Shop button' }],
    };
    return wait<CanvasTemplate>({
      key: t.key, label: t.label, template_id: t.template_id, needs_catalog: t.needs_catalog,
      elements: (layouts[key] ?? []).map((e) => ({ ...e, meta_type: e.type.toUpperCase() })),
      unsupported: key === 'get_new_customers' ? [{ meta_type: 'STORE_LOCATOR', name: 'Find a store', why: OPTIONS.not_built[1].why }] : [],
      mock: false, error: null, note: null,
    }, 400);
  },
  canvases: () => wait<CanvasList>({ mock: false, mock_reason: null, page: OPTIONS.page, items: [...all().filter((c) => c.status !== 'discarded'), META_MADE], errors: [] }),
  canvas: (id: string) => {
    const c = all().find((x) => x.id === id);
    return c ? wait(c) : refuse(404, 'Instant Experience not found');
  },
  createCanvas: (input: CanvasInput) => {
    if (!input.name.trim()) return refuse(400, 'name is required (at most 200 characters)');
    if (!input.elements.length) return refuse(400, 'An Instant Experience takes 1 to 30 elements');
    const c = canvasOf(`c0ffee00-0000-4000-8000-${String(Date.now()).slice(-12)}`, input, { updated_at: new Date().toISOString(), built_at: new Date().toISOString(), created_at: new Date().toISOString() });
    CANVASES = [c, ...all()];
    return wait(c, 900);
  },
  updateCanvas: (id: string, input: CanvasInput) => {
    const cur = all().find((x) => x.id === id);
    if (!cur) return refuse(404, 'Instant Experience not found');
    if (cur.status === 'published') return refuse(409, 'This Instant Experience is published; Meta changes only an unpublished one. Make a new one.');
    const c = canvasOf(id, input, { created_at: cur.created_at, updated_at: new Date().toISOString(), built_at: new Date().toISOString() });
    CANVASES = all().map((x) => (x.id === id ? c : x));
    return wait(c, 800);
  },
  canvasPreview: (id: string) => {
    const c = [...all(), META_MADE].find((x) => x.id === id || x.meta_canvas_id === id);
    if (!c) return refuse(404, 'Instant Experience not found');
    if (!c.meta_canvas_id) return wait<CanvasPreview>({ id, html: null, mock: false, note: null, error: 'It is not on Meta yet: save it again to make it.' });
    return wait<CanvasPreview>({ id, html: c.source === 'meta' ? null : previewHtml(c), error: c.source === 'meta' ? 'Meta did not send a preview of this one.' : null, note: null, mock: false }, 500);
  },
  publishCanvas: (id: string) => {
    const cur = all().find((x) => x.id === id);
    if (!cur) return refuse(404, 'Instant Experience not found');
    if (cur.status === 'published') return refuse(409, 'This Instant Experience is already published.');
    if (!cur.meta_canvas_id) return refuse(422, 'This Instant Experience is not on Meta yet: open it and save it again.');
    const c: Canvas = { ...cur, status: 'published', is_published: true, published_at: new Date().toISOString() };
    CANVASES = all().map((x) => (x.id === id ? c : x));
    return wait(c, 700);
  },
  discardCanvas: (id: string) => {
    const cur = all().find((x) => x.id === id);
    if (!cur) return refuse(404, 'Instant Experience not found');
    if (cur.status === 'published') return refuse(422, 'A published Instant Experience stays on the Page (Meta deletes none); ads that use it keep it.');
    const c: Canvas = { ...cur, status: 'discarded' };
    CANVASES = all().map((x) => (x.id === id ? c : x));
    return wait(c, 300);
  },
};
