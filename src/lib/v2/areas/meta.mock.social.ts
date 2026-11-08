/**
 * DEVELOPMENT ONLY sample data for lane META-15B (`?mock=meta` on a dev server; imported only by `meta.mock.ts`, which
 * a production build never bundles): the Publisher (posts across this month, one failed), comments from the Page,
 * Instagram and Threads, social insights, the `social` setting, lead forms and leads, events health, one product's
 * Meta status and the inbox with WhatsApp, Messenger and Instagram threads. State changes live in memory until reload.
 * Data is built lazily (at the first call), so this module never touches `meta.mock.ts` while both load.
 */
import type {
  CatalogFacts, CatalogHealth, EventDay, EventQuality, EventSettings, EventsHealth, EventsReadResult, LeadForm, LeadFormInput, LeadFormOptions, LeadForms, MetaLead, MetaLeads,
  PageSyncResult, ProductMetaStatus, SocialChannel, SocialComment, SocialInsights, SocialPost, SocialPostInput, SocialPostsQuery,
  SocialSettings, SocialSettingsGroups,
} from './meta';
import type { InboxItem, InboxMessage, InboxSettings, InboxThread, MessengerProfile } from '../messaging';

/* META-20: these helpers are exported so the other development mocks (`meta.mock.live.ts`) use them, not a copy. */
export const fresh = (): boolean => {
  try { return new URLSearchParams(window.location.search).get('mockvariant') === 'fresh'; } catch { return false; }
};
export const wait = <T,>(v: T, ms = 160): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
export const refuse = (status: number, message: string, code = 'marketing.bad_request'): Promise<never> =>
  new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(message), { response: { status, data: { code, message } } })), 220));
export const hoursFrom = (h: number): string => new Date(Date.now() + h * 3_600_000).toISOString();
export const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
/** A time on the day `d` days from today at `h` o'clock local. */
export const at = (d: number, h: number, m = 0): string => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const dayIso = (d: number): string => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

function pic(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="hsl(${hue} 55% 90%)"/><circle cx="460" cy="130" r="95" fill="hsl(${hue} 45% 70%)" opacity=".4"/><rect x="230" y="190" width="140" height="250" rx="24" fill="#fff" stroke="hsl(${hue} 45% 60%)" stroke-width="6"/><rect x="262" y="140" width="76" height="56" rx="10" fill="hsl(${hue} 45% 60%)"/><text x="300" y="510" font-family="Helvetica,Arial" font-size="30" font-weight="700" fill="hsl(${hue} 50% 25%)" text-anchor="middle">${label.slice(0, 22)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── Publisher ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** The seeded `social` setting (META-12 `social/settings.rs` defaults). */
const SOCIAL_DEFAULTS: SocialSettingsGroups = {
  channels: {
    facebook_page: { max_chars: 63206, max_media: 10, video: true, carousel: true, reels: true, stories: true, first_comment: true, image_extensions: [], video_extensions: ['mp4', 'mov'] },
    instagram: { max_chars: 2200, max_media: 20, video: true, carousel: true, reels: true, stories: true, first_comment: true, max_hashtags: 30, max_mentions: 20, image_extensions: ['jpg', 'jpeg'], video_extensions: ['mp4', 'mov'] },
    threads: { max_chars: 500, max_media: 20, video: true, carousel: true, reels: false, stories: false, first_comment: false, max_links: 5, count_emoji_bytes: true, image_extensions: ['jpg', 'jpeg', 'png'], video_extensions: ['mp4', 'mov'] },
  },
  scheduler: { batch: 10, claim_seconds: 300, check_seconds: 60, give_up_hours: 24, media_link_hours: 24, min_lead_minutes: 1, max_days_ahead: 365, reply_wait_seconds: 3, reply_checks: 5 },
  comments: { reconcile_posts: 10, reconcile_comments: 50, private_reply_days: 7, page_size: 50 },
  insights: { nightly_days: 3, max_range_days: 90, default_days: 28, post_days: 30, post_limit: 50 },
  page: { sync: false, push_on_change: false, fields: ['phone', 'website', 'location', 'hours'], hours: {} },
};
let SOCIAL_STORED: SocialSettingsGroups = { scheduler: { give_up_hours: 12 } };
const mergeDeep = (a: any, b: any): any => {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = mergeDeep(a[k], b[k]);
  return out;
};
const socialSettings = (): SocialSettings => ({ settings: mergeDeep(SOCIAL_DEFAULTS, SOCIAL_STORED), defaults: SOCIAL_DEFAULTS, stored: SOCIAL_STORED });

function channels(): SocialChannel[] {
  const lim = socialSettings().settings.channels as any;
  if (fresh()) {
    return ['facebook_page', 'instagram', 'threads'].map((key) => ({ key, account: null, connected: false, can_publish: false, limits: lim[key], reason: 'Connect Meta first, then pick the Page and Instagram account in setup.' }));
  }
  return [
    { key: 'facebook_page', account: { id: '104455667788990', name: 'Homeomed', handle: null }, connected: true, can_publish: true, limits: lim.facebook_page, reason: null },
    { key: 'instagram', account: { id: '17841400011122233', name: 'homeomed.in', handle: 'homeomed.in' }, connected: true, can_publish: true, limits: lim.instagram, reason: null },
    { key: 'threads', account: null, connected: false, can_publish: false, limits: lim.threads, reason: 'Threads is not connected. Connect it in Connections to post there.' },
  ];
}

const M = (key: string, name: string, hue: number) => ({ gallery_id: key, key, kind: 'image', name, url: pic(name.replace(/\.\w+$/, ''), hue) });
let POSTS: SocialPost[] | null = null;
function posts(): SocialPost[] {
  if (POSTS) return POSTS;
  const base = (id: string, o: Partial<SocialPost>): SocialPost => ({
    id, kind: 'feed', status: 'draft', text: '', link: null, media: [], first_comment: null, schedule_at: null, scheduled_by: null, published_at: null,
    created_by: 'Wasim', updated_by: 'Wasim', created_at: minutesAgo(60 * 24 * 3), updated_at: minutesAgo(60 * 5), channels: [], notes: [], ...o,
  });
  const pub = (key: string, d: number, metrics: Record<string, number>, extra: Record<string, unknown> = {}) => ({
    key, account_id: null, text: null, status: 'published', external_id: `${key}_${Math.abs(d)}91`, permalink: key === 'instagram' ? `https://www.instagram.com/p/DQ${Math.abs(d)}hm/` : `https://www.facebook.com/104455667788990/posts/${Math.abs(d)}2219`,
    error: null, attempts: 1, published_at: at(d, 10), metrics, metrics_at: minutesAgo(300), ...extra,
  });
  const pend = (key: string) => ({ key, account_id: null, text: null, status: 'pending', external_id: null, permalink: null, error: null, attempts: 0, published_at: null, metrics: null });
  POSTS = [
    base('sp_1', { status: 'published', kind: 'carousel', text: 'Winter is here. Keep your family kit ready: Arsenicum Alb, Belladonna and Bryonia, all in one box. Free delivery above 499 rupees.', media: [M('products/gallery/winter-kit.jpg', 'Winter kit.jpg', 205), M('products/gallery/arsenicum.jpg', 'Arsenicum Alb.jpg', 28)], link: 'https://homeomed.in/collections/winter-care', published_at: at(-6, 10), schedule_at: at(-6, 10), channels: [pub('facebook_page', -6, { post_media_view: 4210, post_total_media_view_unique: 3180, post_clicks: 96 }), pub('instagram', -6, { views: 6120, reach: 4870, likes: 312, comments: 18, saved: 41, shares: 22 })] }),
    base('sp_2', { status: 'published', kind: 'reel', text: 'Mother tinctures explained in 30 seconds. Which one do you keep at home?', media: [{ gallery_id: 'videos/mt-explained.mp4', key: 'videos/mt-explained.mp4', kind: 'video', name: 'mt-explained.mp4', url: pic('Reel: MT', 265) }], published_at: at(-4, 18), schedule_at: at(-4, 18), channels: [pub('instagram', -4, { views: 18450, reach: 12990, likes: 904, comments: 61, saved: 230, shares: 117 }), pub('facebook_page', -4, { post_media_view: 7330, post_total_media_view_unique: 5120, post_clicks: 140 })] }),
    base('sp_3', { status: 'failed', kind: 'feed', text: 'Calendula ointment is back in stock in the 25 g tube. Gentle on small cuts and dry skin.', media: [M('products/gallery/calendula.png', 'Calendula.png', 45)], schedule_at: at(-2, 11), channels: [
      pub('facebook_page', -2, { post_media_view: 1980, post_total_media_view_unique: 1504, post_clicks: 37 }),
      { key: 'instagram', account_id: null, text: null, status: 'failed', external_id: null, permalink: null, error: 'Instagram takes only JPEG pictures; Calendula.png is a PNG. Pick a JPEG and try again.', attempts: 1, published_at: null, metrics: null },
    ] }),
    base('sp_4', { status: 'published', kind: 'story', text: null, media: [M('banners/diwali-hampers.jpg', 'Diwali hampers.jpg', 340)], published_at: at(-1, 9), schedule_at: at(-1, 9), channels: [pub('instagram', -1, { views: 2140, reach: 1990, replies: 7, shares: 3 })] }),
    base('sp_5', { status: 'scheduled', kind: 'feed', text: 'Exam season stress? Talk to your homeopath about Kali Phos 6X. Our pharmacists answer on WhatsApp from 9 to 7.', media: [M('products/gallery/kali-phos.jpg', 'Kali Phos 6X.jpg', 152)], schedule_at: at(1, 10, 30), scheduled_by: 'Wasim', channels: [pend('facebook_page'), pend('instagram')], first_comment: 'Shop Kali Phos 6X: homeomed.in/kali-phos' }),
    base('sp_6', { status: 'scheduled', kind: 'reel', text: 'Bach Rescue Remedy for travel days. Small bottle, fits in any bag.', media: [{ gallery_id: 'videos/rescue.mp4', key: 'videos/rescue.mp4', kind: 'video', name: 'rescue.mp4', url: pic('Reel: Rescue', 12) }], schedule_at: at(3, 19), scheduled_by: 'Ayesha', channels: [pend('instagram'), pend('facebook_page')] }),
    base('sp_7', { status: 'scheduled', kind: 'carousel', text: 'Biochemic 12 salts: what each one is traditionally used for. Save this post.', media: [M('products/gallery/salts-1.jpg', 'Salts 1 to 4.jpg', 28), M('products/gallery/salts-2.jpg', 'Salts 5 to 8.jpg', 45), M('products/gallery/salts-3.jpg', 'Salts 9 to 12.jpg', 182)], schedule_at: at(6, 12), scheduled_by: 'Wasim', channels: [pend('instagram'), pend('facebook_page')] }),
    base('sp_8', { status: 'scheduled', kind: 'feed', text: 'Thank you for 12,000 followers! A small gift code for you in our story today.', media: [M('banners/thanks-12k.jpg', '12,000 thank you.jpg', 205)], schedule_at: at(9, 17), scheduled_by: 'Ayesha', channels: [pend('facebook_page'), pend('instagram')] }),
    base('sp_9', { status: 'draft', kind: 'feed', text: 'Hair fall is the number one question in our inbox. Here are the remedies people ask about most.', media: [M('products/gallery/hair-care.jpg', 'Hair care.jpg', 182)], channels: [pend('facebook_page'), pend('instagram')] }),
    base('sp_10', { status: 'published', kind: 'feed', text: 'Behind the scenes: every order is packed and checked by a registered pharmacist in Lucknow.', media: [M('products/gallery/packing.jpg', 'Packed with care.jpg', 152)], published_at: at(-9, 13), schedule_at: at(-9, 13), channels: [pub('facebook_page', -9, { post_media_view: 3020, post_total_media_view_unique: 2410, post_clicks: 58 }), pub('instagram', -9, { views: 5230, reach: 4100, likes: 288, comments: 14, saved: 19, shares: 9 })] }),
    base('sp_11', { status: 'published', kind: 'feed', text: 'Dr. Reckeweg R-series is here. Swipe to see the most asked for drops this month.', media: [M('products/gallery/r-series.jpg', 'R-series.jpg', 12)], published_at: at(-13, 11), schedule_at: at(-13, 11), channels: [pub('facebook_page', -13, { post_media_view: 2650, post_total_media_view_unique: 2010, post_clicks: 77 }), pub('instagram', -13, { views: 4410, reach: 3520, likes: 199, comments: 9, saved: 25, shares: 6 })] }),
  ];
  return POSTS;
}

function checkPost(input: Partial<SocialPostInput>): string | null {
  const chs = channels();
  for (const k of input.channels ?? []) {
    const ch = chs.find((c) => c.key === k);
    if (!ch?.can_publish) return `${k === 'threads' ? 'Threads' : k} cannot publish: ${ch?.reason ?? 'not connected'}`;
    const text = input.per_channel?.[k]?.text ?? input.text ?? '';
    if (text.length > ch.limits.max_chars) return `The text is ${text.length} characters; ${k === 'instagram' ? 'Instagram' : k === 'threads' ? 'Threads' : 'the Page'} takes at most ${ch.limits.max_chars}.`;
  }
  return null;
}

const postsMock = {
  socialChannels: () => wait<SocialChannel[]>(channels()),
  socialPosts: (q: SocialPostsQuery) => {
    if (fresh()) return wait({ posts: [] as SocialPost[], total: 0 });
    const from = q.from ? new Date(q.from).getTime() : -Infinity;
    const to = q.to ? new Date(q.to).getTime() + (q.to.length === 10 ? 86_400_000 : 0) : Infinity;
    const list = posts().filter((p) => {
      const t = new Date(p.published_at ?? p.schedule_at ?? p.updated_at ?? '').getTime();
      const inRange = p.status === 'draft' ? !q.from : t >= from && t < to;
      return inRange && (!q.status || p.status === q.status) && (!q.channel || p.channels.some((c) => c.key === q.channel));
    });
    return wait({ posts: list, total: list.length }, 220);
  },
  socialPost: (id: string) => { const p = posts().find((x) => x.id === id); return p ? wait(p) : refuse(404, 'No such post', 'marketing.not_found'); },
  createSocialPost: (input: SocialPostInput) => {
    const bad = checkPost(input);
    if (bad) return refuse(400, bad);
    const p: SocialPost = {
      id: `sp_${posts().length + 1}`, kind: input.kind, status: input.schedule_at ? 'scheduled' : 'draft', text: input.text, link: input.link,
      media: input.media.map((k, i) => ({ gallery_id: k, key: k, kind: /\.(mp4|mov)$/i.test(k) ? 'video' : 'image', name: k.split('/').pop() ?? k, url: pic(k.split('/').pop() ?? 'Picture', (i * 61) % 360) })),
      first_comment: input.first_comment, schedule_at: input.schedule_at, scheduled_by: input.schedule_at ? 'Preview' : null, published_at: null,
      created_by: 'Preview', updated_by: 'Preview', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      channels: input.channels.map((key) => ({ key, account_id: null, text: input.per_channel?.[key]?.text ?? null, status: 'pending', external_id: null, permalink: null, error: null, attempts: 0, published_at: null, metrics: null })),
      notes: input.channels.includes('instagram') && input.link ? [{ channel: 'instagram', message: 'Instagram makes no link in a caption clickable; the link is left out there' }] : [],
    };
    POSTS = [...posts(), p];
    return wait(p, 420);
  },
  updateSocialPost: (id: string, input: Partial<SocialPostInput>) => {
    const p = posts().find((x) => x.id === id);
    if (!p) return refuse(404, 'No such post', 'marketing.not_found');
    if (p.channels.some((c) => c.status === 'published' || c.status === 'publishing') && p.status !== 'failed') return refuse(409, 'This post is already published on a channel, so it cannot be changed here.', 'marketing.conflict');
    const bad = checkPost({ ...input, channels: input.channels ?? p.channels.map((c) => c.key) });
    if (bad) return refuse(400, bad);
    const schedule = input.schedule_at === undefined ? p.schedule_at : input.schedule_at;
    const next: SocialPost = { ...p, ...(input.text !== undefined ? { text: input.text } : {}), ...(input.kind ? { kind: input.kind } : {}), ...(input.first_comment !== undefined ? { first_comment: input.first_comment } : {}), schedule_at: schedule, status: schedule ? 'scheduled' : 'draft', updated_at: new Date().toISOString(), updated_by: 'Preview' };
    POSTS = posts().map((x) => (x.id === id ? next : x));
    return wait(next, 380);
  },
  deleteSocialPost: (id: string) => { POSTS = posts().filter((x) => x.id !== id); return wait({ ok: true }); },
  publishSocialPost: (id: string) => {
    const p = posts().find((x) => x.id === id);
    if (!p) return refuse(404, 'No such post', 'marketing.not_found');
    const now = new Date().toISOString();
    const next: SocialPost = {
      ...p, status: 'published', published_at: now,
      channels: p.channels.map((c) => (c.status === 'published' ? c : { ...c, status: 'published', error: null, attempts: (c.attempts ?? 0) + 1, published_at: now, external_id: `${c.key}_new`, permalink: c.key === 'instagram' ? 'https://www.instagram.com/p/DQnewhm/' : 'https://www.facebook.com/104455667788990/posts/new' })),
    };
    POSTS = posts().map((x) => (x.id === id ? next : x));
    return wait(next, 900);
  },
};

/* ── Comments ───────────────────────────────────────────────────────────────────────────────────────────────── */

let COMMENTS: SocialComment[] | null = null;
function comments(): SocialComment[] {
  if (COMMENTS) return COMMENTS;
  const c = (id: string, channel: string, post: string, name: string, handle: string | null, text: string, mins: number, o: Partial<SocialComment> = {}): SocialComment => ({
    id, channel, kind: 'comment', post_id: post, object_id: `${post}_obj`, author: { id: `u_${id}`, name, handle }, text,
    permalink: channel === 'instagram' ? 'https://www.instagram.com/p/DQ6hm/' : 'https://www.facebook.com/104455667788990/posts/62219', status: 'open', hidden: false,
    commented_at: minutesAgo(mins), reply: null, private_reply: null,
    post_excerpt: ({ sp_1: 'Winter care kit: Arnica, Rhus Tox and Camphor, packed and sealed. Free delivery above 999 rupees.', sp_2: 'Which mother tincture helps you sleep better? Our pharmacist explains in 60 seconds.', sp_10: null } as Record<string, string | null>)[post] ?? null, ...o,
  });
  COMMENTS = [
    c('cm_1', 'instagram', 'sp_2', 'Priya Sharma', 'priya.wellness', 'Which mother tincture is good for sleep? My father cannot sleep well since last month.', 38),
    c('cm_2', 'facebook_page', 'sp_1', 'Rakesh Gupta', null, 'Do you deliver to Gorakhpur? Last time my order took 9 days.', 95),
    c('cm_3', 'instagram', 'sp_2', 'Neha', 'neha.k.92', 'Price of Schwabe Arnica Q 30 ml?', 140),
    c('cm_4', 'facebook_page', 'sp_1', 'Amit Verma', null, 'Is the winter kit available as COD?', 260),
    c('cm_5', 'instagram', 'sp_1', 'quick.loans.offer', 'quick.loans.offer', 'Get instant loan in 10 minutes, DM now!!!', 300, { status: 'hidden', hidden: true }),
    c('cm_6', 'instagram', 'sp_10', 'Dr. Sana Siddiqui', 'dr.sana.homeo', 'Lovely to see pharmacists packing every order. Keep it up!', 60 * 26, { status: 'replied', reply: { text: 'Thank you, doctor! Means a lot to our team.', at: minutesAgo(60 * 25), by: 'Ayesha', error: null } }),
    c('cm_7', 'facebook_page', 'sp_11', 'Mohd. Irfan', null, 'R89 for hair fall, how many drops a day?', 60 * 30, { private_reply: { id: 'pm_1', at: minutesAgo(60 * 29), by: 'Wasim' }, status: 'replied', reply: { text: 'We have sent you a message with the details.', at: minutesAgo(60 * 29), by: 'Wasim', error: null } }),
    c('cm_8', 'instagram', 'sp_2', 'Kavya', 'kavya.r', 'Saved! Please do one on Bach flowers next.', 60 * 40, { status: 'replied', reply: { text: 'Coming next week, stay tuned.', at: minutesAgo(60 * 39), by: 'Ayesha', error: null } }),
    c('cm_9', 'facebook_page', 'sp_10', 'Suresh Iyer', null, 'Ordered twice, both times genuine sealed bottles. Recommended.', 60 * 50, { status: 'replied', reply: { text: 'Thank you, Suresh ji!', at: minutesAgo(60 * 49), by: 'Wasim', error: null } }),
  ];
  return COMMENTS;
}
const setComment = (id: string, f: (c: SocialComment) => SocialComment) => {
  COMMENTS = comments().map((c) => (c.id === id ? f(c) : c));
  return wait(comments().find((c) => c.id === id)!, 380);
};
const commentsMock = {
  socialComments: (q: { channel?: string; status?: string; q?: string }) => {
    if (fresh()) return wait({ comments: [] as SocialComment[], total: 0 });
    const term = (q.q ?? '').toLowerCase();
    const list = comments().filter((c) => (!q.channel || c.channel === q.channel) && (q.status ? c.status === q.status : c.status !== 'deleted')
      && (!term || `${c.text} ${c.author.name}`.toLowerCase().includes(term)));
    return wait({ comments: list, total: list.length }, 200);
  },
  replySocialComment: (id: string, text: string) => setComment(id, (c) => ({ ...c, status: 'replied', reply: { text, at: new Date().toISOString(), by: 'Preview', error: null } })),
  hideSocialComment: (id: string, hidden: boolean) => setComment(id, (c) => ({ ...c, hidden, status: hidden ? 'hidden' : c.reply ? 'replied' : 'open' })),
  deleteSocialComment: (id: string) => setComment(id, (c) => ({ ...c, status: 'deleted' })),
  privateReplySocialComment: (id: string, _text: string) => setComment(id, (c) => ({ ...c, private_reply: { id: 'pm_new', at: new Date().toISOString(), by: 'Preview' } })),
};

/* ── Insights ───────────────────────────────────────────────────────────────────────────────────────────────── */

function insights(q: { from?: string; to?: string; channel?: string }): SocialInsights {
  const to = q.to ?? dayIso(-1);
  const from = q.from ?? dayIso(-28);
  const n = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);
  const days = (f: (i: number) => Record<string, number>) => Array.from({ length: n }, (_, i) => {
    const d = new Date(from); d.setDate(d.getDate() + i);
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, metrics: f(i) };
  });
  const wave = (i: number, base: number, amp: number) => Math.round(base + amp * Math.sin(i / 2.3) + (i % 7 === 5 ? amp * 1.6 : 0));
  const sum = (ds: Array<{ metrics: Record<string, number> }>) => ds.reduce<Record<string, number>>((t, d) => { for (const [k, v] of Object.entries(d.metrics)) t[k] = k === 'page_follows' ? v : (t[k] ?? 0) + v; return t; }, {});
  const fb = days((i) => ({ page_media_view: wave(i, 2100, 600), page_total_media_view_unique: wave(i, 1500, 420), page_post_engagements: wave(i, 160, 60), page_follows: 12480 + i * 6, page_daily_follows_unique: wave(i, 14, 6), page_views_total: wave(i, 120, 40) }));
  const ig = days((i) => ({ views: wave(i, 4800, 1700), reach: wave(i, 3100, 1000), accounts_engaged: wave(i, 390, 140), total_interactions: wave(i, 610, 230), likes: wave(i, 470, 180), comments: wave(i, 26, 10), shares: wave(i, 31, 14), saves: wave(i, 44, 18) }));
  const all: SocialInsights['channels'] = {
    facebook_page: { account: { id: '104455667788990', name: 'Homeomed', handle: null }, days: fb, totals: sum(fb), synced_at: minutesAgo(60 * 7), error: null, refused: [] },
    instagram: { account: { id: '17841400011122233', name: 'homeomed.in', handle: 'homeomed.in' }, days: ig, totals: sum(ig), synced_at: minutesAgo(60 * 7), error: null, refused: ['follows_and_unfollows'] },
    threads: { account: null, days: [], totals: {} },
  };
  return { from, to, channels: q.channel ? { [q.channel]: all[q.channel] } : all };
}

/* ── Lead forms and leads ───────────────────────────────────────────────────────────────────────────────────── */

let FORMS: LeadForm[] = [
  { id: '1182736450091', name: 'Free consultation with our homeopath', status: 'ACTIVE', locale: 'EN_US', created_time: minutesAgo(60 * 24 * 41), last_read_at: minutesAgo(42), last_read_status: 'ok', last_read_error: null, leads_seen: 214, leads_captured: 214 },
  { id: '1182736450092', name: 'Wholesale and clinic supply enquiry', status: 'ACTIVE', locale: 'EN_US', created_time: minutesAgo(60 * 24 * 18), last_read_at: minutesAgo(42), last_read_status: 'ok', last_read_error: null, leads_seen: 37, leads_captured: 36 },
  { id: '1182736450093', name: 'Hindi: muft paramarsh', status: 'ACTIVE', locale: 'HI_IN', created_time: minutesAgo(60 * 24 * 9), last_read_at: minutesAgo(60 * 3), last_read_status: 'failed', last_read_error: 'Meta: (#200) Requires leads_retrieval permission to manage the object.', leads_seen: 12, leads_captured: 12 },
  { id: '1182736450080', name: 'Diwali hamper pre-booking', status: 'ARCHIVED', locale: 'EN_US', created_time: minutesAgo(60 * 24 * 70), last_read_at: minutesAgo(60 * 24 * 12), last_read_status: 'ok', last_read_error: null, leads_seen: 88, leads_captured: 88 },
];
let LEADS: MetaLead[] | null = null;
function leads(): MetaLead[] {
  if (LEADS) return LEADS;
  const ads = [{ id: '120210000099001', name: 'Consultation: lead form, women 30 to 55' }, { id: '120210000099002', name: 'Wholesale: clinics and chemists' }, { id: null, name: null }];
  LEADS = Array.from({ length: 46 }, (_, i) => {
    const f = FORMS[i % 7 === 3 ? 1 : i % 9 === 4 ? 2 : 0];
    const ad = f.id === FORMS[1].id ? ads[1] : i % 5 === 2 ? ads[2] : ads[0];
    const status = i % 6 === 0 ? 'won' : i % 4 === 1 ? 'open' : i % 7 === 2 ? 'lost' : i < 4 ? 'new' : 'open';
    return {
      lead_id: `9188${String(70000 + i * 37)}`, capture_id: `cap_${i + 1}`, form: { id: f.id, name: f.name }, ad,
      campaign: { id: ad.id ? '120210000099000' : null, name: ad.id ? (f.id === FORMS[1].id ? 'Wholesale enquiries, November' : 'Free consultation, Lucknow and Kanpur') : null },
      name: i % 11 === 6 ? null : LEAD_NAMES[i % LEAD_NAMES.length],
      created_at: minutesAgo(18 + i * 211), meta_created_at: minutesAgo(19 + i * 211), party_id: `party_${i + 1}`, deal_id: i % 3 === 0 ? `deal_${i + 1}` : null, status,
    };
  });
  return LEADS;
}
/** A sample of META-9D's options (the server keeps the full table). */
const LEAD_OPTIONS: LeadFormOptions = {
  question_types: [
    ['FULL_NAME', 'Full name', 'contact'], ['FIRST_NAME', 'First name', 'contact'], ['EMAIL', 'E-mail', 'contact'], ['PHONE', 'Phone number', 'contact'],
    ['WHATSAPP_NUMBER', 'WhatsApp number', 'contact'], ['CITY', 'City', 'address'], ['STATE', 'State', 'address'], ['POST_CODE', 'Postal code', 'address'],
    ['COMPANY_NAME', 'Company name', 'work'], ['JOB_TITLE', 'Job title', 'work'], ['DOB', 'Date of birth', 'personal'], ['GENDER', 'Gender', 'personal'],
    ['DATE_TIME', 'Date and time (appointment)', 'other'], ['CUSTOM', 'Your own question', 'custom'],
  ].map(([key, label, group]) => ({ key, label, group, custom: key === 'CUSTOM' })),
  button_types: [['VIEW_WEBSITE', 'View website'], ['CALL_BUSINESS', 'Call business'], ['MESSAGE_BUSINESS', 'Message business'], ['DOWNLOAD', 'Download'],
    ['SCHEDULE_APPOINTMENT', 'Schedule appointment'], ['VIEW_ON_FACEBOOK', 'View on Facebook'], ['PROMO_CODE', 'Promo code'], ['NONE', 'No button']].map(([key, label]) => ({ key, label })),
  default_button_type: 'VIEW_ON_FACEBOOK', default_button_type_with_website: 'VIEW_WEBSITE', max_questions: 15, privacy_link_text_max: 70,
  not_offered: [{ key: 'STORE_LOOKUP', label: 'needs a store locator set up at Meta' }, { key: 'SLIDER', label: 'needs a range this API does not send' }],
};
const LEAD_NAMES = ['Anjali Mehta', 'Rohit Singh', 'Farah Khan', 'Vikram Rao', 'Sneha Pillai', 'Arjun Nair', 'Pooja Desai', 'Imran Qureshi', 'Meera Joshi', 'Kunal Bose'];
const leadsMock = {
  leadFormOptions: () => wait<LeadFormOptions>(LEAD_OPTIONS),
  leadForms: () => wait<LeadForms>(fresh() ? { page_id: null, page_name: null, rows: [] } : { page_id: '104455667788990', page_name: 'Homeomed', rows: FORMS }),
  createLeadForm: (input: LeadFormInput) => {
    if (!input.questions.length) return refuse(400, 'A lead form needs 1 to 15 questions');
    const f: LeadForm = { id: `11827364501${FORMS.length + 10}`, name: input.name, status: 'ACTIVE', locale: input.locale ?? 'EN_US', created_time: new Date().toISOString(), last_read_at: null, last_read_status: null, last_read_error: null, leads_seen: 0, leads_captured: 0 };
    FORMS = [f, ...FORMS];
    return wait(f, 600);
  },
  archiveLeadForm: (id: string) => { FORMS = FORMS.map((f) => (f.id === id ? { ...f, status: 'ARCHIVED' } : f)); return wait({ id, archived: true }, 400); },
  metaLeads: (q: { form_id?: string; limit?: number; offset?: number }) => {
    if (fresh()) return wait<MetaLeads>({ rows: [], total: 0, limit: 50, offset: 0 });
    const rows = leads().filter((l) => !q.form_id || l.form?.id === q.form_id);
    const limit = q.limit ?? 25; const offset = q.offset ?? 0;
    return wait<MetaLeads>({ rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset }, 200);
  },
};

/* ── Events health ──────────────────────────────────────────────────────────────────────────────────────────── */

let EVENT_SETTINGS: EventSettings = { pixelId: '1187654321098765', pixelIdFromFallback: false, serverEventsOn: true, serverTokenSet: true, testEventCode: '', businessEvents: true, productLevelEvents: true };
let LAST_READ = minutesAgo(60 * 6);
const EVENTS: Array<[string, number, number, number | null, number | null, boolean]> = [
  // event, browser per day, server share, dedupe %, match quality, ours (sent by our server log)
  ['PageView', 5400, 0.92, 88, 6.1, false], ['ViewContent', 2300, 0.95, 91, 7.4, false], ['AddToCart', 410, 0.9, 84, 7.9, false],
  ['InitiateCheckout', 150, 0.94, 79, 8.2, false], ['Purchase', 62, 1, 97, 9.1, true], ['Lead', 9, 0.6, 41, 5.2, false],
  ['OrderDelivered', 0, 1, null, 8.6, true], ['CODConfirmed', 0, 1, null, 8.4, true], ['OrderReturnedToOrigin', 0, 1, null, 7.7, true],
];
function health(daysN = 14): EventsHealth {
  const days: EventDay[] = [];
  for (let d = daysN; d >= 1; d--) {
    for (const [event, browser, share, dedupe, emq, ours] of EVENTS) {
      const f = 1 + 0.18 * Math.sin(d / 1.7);
      const server = event === 'OrderDelivered' ? Math.round(44 * f) : event === 'CODConfirmed' ? Math.round(21 * f) : event === 'OrderReturnedToOrigin' ? Math.round(3 * f) : Math.round(browser * share * f);
      const received = browser ? Math.round(browser * f) + Math.round(server * (1 - (dedupe ?? 0) / 100)) : server;
      const failed = ours && d === 3 && event === 'Purchase' ? 4 : ours && event === 'OrderReturnedToOrigin' && d === 5 ? 1 : 0;
      days.push({
        date: dayIso(-d), event, received: d === 1 && event === 'Lead' ? null : received, received_server: server,
        deduped: dedupe === null ? null : Math.max(0, Math.min(100, Math.round(dedupe - (d === 3 && event === 'Purchase' ? 22 : 0)))),
        match_quality: emq, coverage: browser ? Math.round(share * 100) : null, sent: ours ? server + failed : null, failed: ours ? failed : null, sending: ours && d === 1 ? 1 : ours ? 0 : null,
      });
    }
  }
  const quality: EventQuality[] = EVENTS.map(([event, , share, dedupe, emq]) => ({
    event, read_on: dayIso(0), match_quality: emq, deduped: dedupe, coverage: Math.round(share * 100),
    match_keys: [{ identifier: 'email', coverage: event === 'Purchase' ? 96 : 41 }, { identifier: 'phone', coverage: event === 'Purchase' ? 99 : 38 }, { identifier: 'external_id', coverage: 72 }, { identifier: 'fbp', coverage: 88 }, { identifier: 'client_ip_address', coverage: 100 }],
    diagnostics: event === 'Lead' ? [{ name: 'Low deduplication', description: 'Fewer than half of your browser Lead events have a server copy with the same event id.', solution: 'Send Lead from the server with the browser event id.', percentage: 59 }]
      : event === 'PageView' ? [{ name: 'Missing customer information', description: 'Most PageView events carry no e-mail or phone, so Meta matches fewer people.', solution: 'Logged in shoppers are matched once they sign in; nothing to change here.', percentage: 71 }] : [],
  }));
  return {
    pixel_id: EVENT_SETTINGS.pixelId, from: dayIso(-daysN), to: dayIso(-1), days, quality,
    last_read: { at: LAST_READ, status: 'ok', token: 'connection', error: null },
    last_error: { at: minutesAgo(60 * 50), source: 'send', event: 'Purchase', message: 'Meta refused 4 Purchase events: (#100) Invalid parameter: event_time is more than 7 days in the past.' },
    test_event_code: EVENT_SETTINGS.testEventCode || null, server_events: EVENT_SETTINGS.serverEventsOn, product_level_events: EVENT_SETTINGS.productLevelEvents, business_events: EVENT_SETTINGS.businessEvents,
    notes: EVENT_SETTINGS.testEventCode ? [`Test events are on: every server event carries the code ${EVENT_SETTINGS.testEventCode} and shows in Test Events. Remove the code when you are done.`] : [],
  };
}
const eventsMock = {
  eventSettings: () => wait<EventSettings>(EVENT_SETTINGS),
  saveEventSettings: (patch: Partial<{ pixelId: string; testEventCode: string; businessEvents: boolean; productLevelEvents: boolean }>) => {
    EVENT_SETTINGS = { ...EVENT_SETTINGS, ...patch, ...(patch.pixelId !== undefined ? { pixelIdFromFallback: false } : {}) };
    return wait({ ok: true }, 380);
  },
  eventsHealth: (days?: number) => wait<EventsHealth>(health(days ?? 14), 260),
  eventsReadNow: () => { LAST_READ = new Date().toISOString(); return wait<EventsReadResult>({ pixel_id: EVENT_SETTINGS.pixelId, status: 'ok', events: EVENTS.length, days: 7, token: 'connection', error: null }, 900); },
};

/* ── One product on the Meta catalog (CAT-08) ───────────────────────────────────────────────────────────────── */

const productMock = {
  productMetaStatus: (productId: string) => wait<ProductMetaStatus>({
    product_id: productId, channel_id: 'ch_fb',
    items: [
      { variation_id: 'v_1', retailer_id: 'SBL-ARNI-30C-30', title: 'SBL Arnica Montana Dilution 30C, 30 ml', status: 'synced', messages: [], pushed_at: minutesAgo(14), meta_review_status: 'approved' },
      { variation_id: 'v_2', retailer_id: 'SBL-ARNI-200C-30', title: 'SBL Arnica Montana Dilution 200C, 30 ml', status: 'warning', messages: [{ level: 'warning', code: 'gtin_missing', text: 'No GTIN (barcode): Meta matches products better with one.' }], pushed_at: minutesAgo(14), meta_review_status: 'approved' },
      { variation_id: 'v_3', retailer_id: 'SBL-ARNI-1M-30', title: 'SBL Arnica Montana Dilution 1M, 30 ml', status: 'synced', messages: [], pushed_at: minutesAgo(14), meta_review_status: 'approved' },
    ],
  }, 300),
};

/* ── Catalog health and the store's origin and importer defaults (CAT-10, CAT-11) ───────────────────────────── */

let HEALTH: CatalogHealth = {
  api_failing_since: null, api_last_ok_at: minutesAgo(4), api_last_error: null,
  fallback: { state: 'standby', feed_id: '1209384756123', since: minutesAgo(60 * 30), error: null, feed_url: 'https://api.gc.mw/api/v2/commerce/public/feeds/homeomed/facebook_catalog/sample-token.xml' },
  diagnostics: [
    { kind: 'ATTRIBUTES_MISSING', severity: 'MUST_FIX', title: 'Products missing an image', text: 'Meta cannot show these products in ads or the shop until they have at least one image.', action: 'Add images', action_uri: 'https://business.facebook.com/commerce/', affected_items: 21, entity: 'product_item', sample_ids: ['SBL-ARNI-Q-30', 'REC-BELL-200C-30', 'SCH-NUXV-1M-30'] },
    { kind: 'PRICE_MISMATCH', severity: 'MUST_FIX', title: 'Price differs from the website', text: 'The price on the product page is not the one in the catalog.', action: null, action_uri: null, affected_items: 15, entity: 'product_item', sample_ids: ['BAK-RHUS-30C-30', 'ADL-PULS-200C-30'] },
    { kind: 'GTIN_MISSING', severity: 'OPPORTUNITY', title: 'Add GTINs to match products', text: 'Products with a barcode (GTIN) are matched better in ads.', action: null, action_uri: null, affected_items: 812, entity: 'product_item', sample_ids: [] },
  ],
  diagnostics_read_at: minutesAgo(60 * 9), diagnostics_error: null, localized_at: minutesAgo(60 * 9), localized_error: null,
  note: 'The API push works again, while Meta still fetches the hosted feed. Stop the fallback when you are ready: Meta disables the ads of a deleted feed\'s items.',
};
let FACTS: CatalogFacts = {
  originCountry: 'IN', importerName: '', manufacturerInfo: '',
  importerAddress: { street1: '', street2: '', city: '', region: '', postalCode: '', country: '' },
};
const catalogExtrasMock = {
  catalogHealth: () => wait<CatalogHealth>(fresh() ? { ...HEALTH, fallback: { ...HEALTH.fallback, state: 'off', feed_id: null, since: null }, diagnostics: [], note: null } : HEALTH, 220),
  removeFeedFallback: () => { HEALTH = { ...HEALTH, fallback: { ...HEALTH.fallback, state: 'off', feed_id: null, since: new Date().toISOString() }, note: null }; return wait<CatalogHealth>(HEALTH, 700); },
  catalogFacts: () => wait<CatalogFacts>(FACTS),
  saveCatalogFacts: (f: CatalogFacts) => { FACTS = f; return wait({ ok: true }, 400); },
};

/* ── Inbox: WhatsApp, Messenger and Instagram threads (Comms' one model) ─────────────────────────────────────── */

interface MockThread { item: InboxItem; thread: InboxThread }
let THREADS: MockThread[] | null = null;
function threads(): MockThread[] {
  if (THREADS) return THREADS;
  const msg = (id: string, direction: 'in' | 'out', text: string, mins: number, o: Partial<InboxMessage> = {}): InboxMessage => ({ id, direction, kind: 'text', text, media_url: null, template_key: null, status: direction === 'out' ? 'read' : null, at: minutesAgo(mins), by: direction === 'out' ? 'Ayesha' : null, attachments: 0, deleted: false, ...o });
  const t = (id: string, channel: string, name: string | null, contact: Partial<InboxThread['contact']>, messages: InboxMessage[], unread: number, windowOpen: boolean, o: Partial<InboxThread> = {}, orderRef: string | null = null): MockThread => {
    const last = messages[messages.length - 1];
    return {
      item: { id, channel, contact: { name, phone_masked: contact.phone_masked ?? null, handle: contact.handle ?? null }, last: last ? { text: last.text, direction: last.direction, at: last.at } : null, unread, window_open: windowOpen, order_ref: orderRef },
      thread: { id, channel, contact: { name, phone_masked: contact.phone_masked ?? null, handle: contact.handle ?? null }, window_open: windowOpen, window_closes_at: windowOpen ? hoursFrom(24 - (Date.now() - new Date(messages.filter((m) => m.direction === 'in').slice(-1)[0]?.at ?? Date.now()).getTime()) / 3_600_000) : null, messages, customer: null, origin_source: null, origin_ad_id: null, ...o },
    };
  };
  THREADS = [
    t('wa_1', 'whatsapp', 'Rakesh Gupta', { phone_masked: '+91 98•••••210' }, [msg('w1', 'out', 'Your order HM-10482 is out for delivery today.', 300, { kind: 'template', template_key: 'order_out_for_delivery' }), msg('w2', 'in', 'Thank you. Can the courier come after 5 pm?', 22)], 1, true, {}, 'HM-10482'),
    t('wa_2', 'whatsapp', 'Farah Khan', { phone_masked: '+91 99•••••487' }, [msg('w3', 'in', 'Is Bach Rescue Remedy 20 ml in stock?', 60 * 30), msg('w4', 'out', 'Yes, it is. Shall I send you the link?', 60 * 29)], 0, false),
    t('ms_1', 'messenger', 'Anjali Mehta', {}, [
      msg('m1', 'in', 'Hi, I ordered Kali Phos 6X last week. Can I add one more bottle to the same order?', 54),
      msg('m2', 'out', 'Hello Anjali! Could you share the phone number you ordered with?', 50),
      msg('m3', 'in', '98•••••112', 47),
      msg('m4', 'out', 'Thank you. That order has already shipped, so I will place a new one with free delivery.', 41),
      msg('m5', 'in', 'Perfect, please go ahead.', 12),
    ], 1, true, {
      origin_source: 'ADS', origin_ad_id: '120210000098811',
      customer: { matched_by: 'phone', name: 'Anjali Mehta', phone_masked: '+91 98•••••112', email_masked: null, orders: [
        { id: 'o_1', number: 'HM-10466', status: 'shipped', payment_status: 'paid', total: '₹ 412.00', at: minutesAgo(60 * 24 * 6) },
        { id: 'o_2', number: 'HM-09871', status: 'delivered', payment_status: 'paid', total: '₹ 1,180.00', at: minutesAgo(60 * 24 * 48) },
        { id: 'o_3', number: 'HM-09102', status: 'delivered', payment_status: 'cod_collected', total: '₹ 640.00', at: minutesAgo(60 * 24 * 101) },
      ], orders_found: 3, more: false },
    }),
    t('ms_2', 'messenger', 'Vikram Rao', {}, [msg('m6', 'in', 'Do you have a clinic in Bengaluru?', 60 * 31), msg('m7', 'out', 'We deliver across India from Lucknow; there is no clinic in Bengaluru yet.', 60 * 30.5)], 0, false),
    t('ig_1', 'instagram', 'Priya Sharma', { handle: 'priya.wellness' }, [msg('i1', 'in', 'Saw your reel on mother tinctures. Which one is for sleep?', 85, { kind: 'text' }), msg('i2', 'in', '', 84, { kind: 'share', text: null, attachments: 1, media_url: 'https://www.instagram.com/reel/DQ4hm/' })], 2, true),
    t('ig_2', 'instagram', 'Kavya R', { handle: 'kavya.r' }, [msg('i3', 'in', 'When is the Bach flower post coming?', 60 * 40), msg('i4', 'out', 'Next week!', 60 * 39)], 0, false),
  ];
  return THREADS;
}
let PROFILE: MessengerProfile = {
  greeting: [{ locale: 'default', text: 'Namaste {{user_first_name}}! Ask us about any remedy, order or delivery. Our pharmacists reply from 9 am to 7 pm.' }],
  ice_breakers: [{ locale: 'default', questions: [{ question: 'Where is my order?', payload: 'ORDER_STATUS' }, { question: 'Talk to a pharmacist', payload: 'PHARMACIST' }, { question: 'Delivery charges and time', payload: 'DELIVERY' }] }],
  persistent_menu: [{ locale: 'default', composer_input_disabled: false, items: [{ type: 'web_url', title: 'Shop remedies', url: 'https://homeomed.in' }, { type: 'postback', title: 'Track my order', payload: 'ORDER_STATUS' }, { type: 'web_url', title: 'Return policy', url: 'https://homeomed.in/pages/return-policy' }] }],
  instagram: true,
};
let PUSHED: InboxSettings['pushed'] = [
  { platform: 'messenger', ok: true, error: null, at: minutesAgo(60 * 24 * 2), by: 'Wasim' },
  { platform: 'instagram', ok: false, error: 'Meta: (#10) Instagram messaging is not enabled for this account. Switch on Allow access to messages in the Instagram app.', at: minutesAgo(60 * 24 * 2), by: 'Wasim' },
];
const inboxMock = {
  inbox: (q: { status?: 'open' | 'all'; channel?: string; cursor?: string | null }) => {
    if (fresh()) return wait({ items: [] as InboxItem[], cursor: null as string | null });
    const list = threads().filter((x) => x.item.channel === (q.channel ?? 'whatsapp') && (q.status === 'all' || x.item.unread > 0 || x.item.window_open)).map((x) => x.item);
    return wait({ items: list, cursor: null as string | null }, 180);
  },
  inboxThread: (id: string) => { const x = threads().find((y) => y.item.id === id); return x ? wait(x.thread, 200) : refuse(404, 'No such conversation', 'comms.not_found'); },
  inboxReply: (id: string, body: { text: string } | { template_key: string; variables: Record<string, string> }) => {
    const x = threads().find((y) => y.item.id === id);
    if (!x) return refuse(404, 'No such conversation', 'comms.not_found');
    if (!x.thread.window_open && 'text' in body) {
      const app = x.thread.channel === 'instagram' ? 'Instagram' : x.thread.channel === 'messenger' ? 'Messenger' : 'WhatsApp';
      return refuse(409, `The 24 hour reply window is closed: the customer has not written in the last 24 hours, and ${app} lets a business answer freely only within 24 hours of the customer's last message. Nothing was sent; the reply can go out once the customer writes again.`, 'comms.wrong_state');
    }
    const m: InboxMessage = { id: `new_${Date.now()}`, direction: 'out', kind: 'text', text: 'text' in body ? body.text : null, media_url: null, template_key: 'template_key' in body ? body.template_key : null, status: 'sent', at: new Date().toISOString(), by: 'Preview', attachments: 0, deleted: false };
    x.thread.messages = [...x.thread.messages, m];
    x.item.last = { text: m.text, direction: 'out', at: m.at };
    return wait(m, 400);
  },
  inboxRead: (id: string) => { const x = threads().find((y) => y.item.id === id); if (x) x.item.unread = 0; return wait({ ok: true }, 100); },
  inboxSettings: () => wait<InboxSettings>({ profile: PROFILE, pushed: PUSHED, updated_by: 'Wasim' }),
  saveInboxSettings: (profile: MessengerProfile) => {
    PROFILE = profile;
    PUSHED = [{ platform: 'messenger', ok: true, error: null, at: new Date().toISOString(), by: 'Preview' }, ...(profile.instagram ? [{ platform: 'instagram', ok: true, error: null, at: new Date().toISOString(), by: 'Preview' }] : [])];
    return wait<InboxSettings>({ profile: PROFILE, pushed: PUSHED, updated_by: 'Preview' }, 700);
  },
  pushInboxSettings: () => {
    PUSHED = PUSHED.map((p) => ({ ...p, ok: true, error: null, at: new Date().toISOString(), by: 'Preview' }));
    return wait<InboxSettings>({ profile: PROFILE, pushed: PUSHED, updated_by: 'Preview' }, 700);
  },
};

/** Spread into `metaMock` (`meta.mock.ts`). */
export const socialMock = {
  ...postsMock,
  ...commentsMock,
  socialInsights: (q: { channel?: string; from?: string; to?: string }) => wait<SocialInsights>(fresh() ? { from: q.from ?? '', to: q.to ?? '', channels: {} } : insights(q), 240),
  syncSocialInsights: (_q: { channel?: string; from?: string; to?: string }) => wait({ ok: true }, 800),
  socialSettings: () => wait<SocialSettings>(socialSettings()),
  saveSocialSettings: (patch: SocialSettingsGroups) => { SOCIAL_STORED = mergeDeep(SOCIAL_STORED, patch); return wait<SocialSettings>(socialSettings(), 400); },
  syncSocialPage: (_force: boolean) => wait<PageSyncResult>({ status: 'pushed', fields: ['phone', 'website', 'location'], error: null }, 700),
  ...leadsMock,
  ...eventsMock,
  ...productMock,
  ...catalogExtrasMock,
  ...inboxMock,
};
