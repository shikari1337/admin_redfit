/**
 * DEVELOPMENT ONLY sample data for lane META-20 (`?mock=meta` on a dev server; loaded only through `via` in `meta.ts`,
 * whose mock branch a production build drops, so this module is never bundled): the Publisher's Live tab for a sample
 * Indian homeopathy store's Facebook Page. One live on air with comments, one scheduled for tomorrow evening, one kept
 * to start by hand, past lives (one started on Facebook), a cancelled one and one Meta refused. `?mockvariant=fresh`
 * shows a Page with too few followers and no lives. State changes live in memory until reload. The stream key here is
 * a made up placeholder, never a real one.
 */
import type { LiveComments, LiveInput, LiveSettings, LiveStreamKey, SocialComment, SocialLive, SocialLives } from './meta';
import { at, fresh, minutesAgo, refuse, wait } from './meta.mock.social';

const PAGE = { id: '104829371665012', name: 'Homeomed Homeopathy Store', handle: null };
const SETTINGS: LiveSettings = {
  min_followers: 100, check_followers: true, min_lead_minutes: 1, max_days_ahead: 7, title_max: 254, key_repeat: true,
  comments_poll_seconds: 10, page_size: 20,
};

const NO_KEY = { shown_at: null, shown_by: null, shown_count: 0 };
const can = (phase: string, onMeta = true) => ({
  stream_key: onMeta && (phase === 'scheduled' || phase === 'live'),
  go_live: onMeta && phase === 'scheduled',
  end: onMeta && phase === 'live',
  cancel: onMeta && phase === 'scheduled',
});
function live(p: Partial<SocialLive> & Pick<SocialLive, 'id' | 'title' | 'status' | 'phase'>): SocialLive {
  const onMeta = p.external_id !== null;
  return {
    page_id: PAGE.id, external_id: `10${p.id.replace(/\D/g, '').padStart(3, '0')}4937378883406`, video_id: null, description: null,
    planned_start_at: null, origin: 'growcord', permalink: null, live_views: null, started_at: null, ended_at: null, error: null,
    comments: { read_at: null, error: null }, key: NO_KEY, created_by: 'Ananya Rao', updated_by: 'Ananya Rao', ended_by: null,
    canceled_at: null, canceled_by: null, synced_at: minutesAgo(2), created_at: minutesAgo(60 * 26), updated_at: minutesAgo(5),
    ...p,
    can: can(String(p.phase), onMeta),
  };
}

let state: SocialLive[] | null = null;
function lives(): SocialLive[] {
  if (state) return state;
  if (fresh()) { state = []; return state; }
  state = [
    live({
      id: 'live-1', title: 'Monsoon immunity: ask our homeopath anything', status: 'LIVE', phase: 'live',
      description: 'Dr Meera Kulkarni answers your questions on colds, coughs and fevers in the rainy season. Ask in the comments.',
      planned_start_at: minutesAgo(20), started_at: minutesAgo(18), live_views: 143,
      permalink: 'https://www.facebook.com/104829371665012/videos/1046293837201/',
      comments: { read_at: minutesAgo(0.2), error: null },
      key: { shown_at: minutesAgo(31), shown_by: 'Ananya Rao', shown_count: 1 },
    }),
    live({
      id: 'live-2', title: 'Dr Reckeweg R-series: what each remedy is for', status: 'SCHEDULED_UNPUBLISHED', phase: 'scheduled',
      description: 'A walk through the R-series combinations we stock, with the dosage on each label.', planned_start_at: at(1, 19),
      created_at: minutesAgo(60 * 3),
    }),
    live({
      id: 'live-3', title: 'Store tour: the new arrivals shelf', status: 'UNPUBLISHED', phase: 'scheduled', planned_start_at: null,
      created_at: minutesAgo(12), updated_at: minutesAgo(12), created_by: 'Rohit Menon', updated_by: 'Rohit Menon',
    }),
    live({
      id: 'live-4', title: 'Diwali offers: combo packs explained', status: 'VOD', phase: 'ended', planned_start_at: at(-1, 19),
      started_at: at(-1, 19, 2), ended_at: at(-1, 19, 44), live_views: 612, video_id: '1046293837188',
      permalink: 'https://www.facebook.com/104829371665012/videos/1046293837188/', ended_by: 'Ananya Rao',
      key: { shown_at: at(-1, 18, 40), shown_by: 'Ananya Rao', shown_count: 2 },
      comments: { read_at: at(-1, 20), error: null },
    }),
    live({
      id: 'live-5', title: '', status: 'VOD', phase: 'ended', origin: 'facebook', started_at: at(-3, 11, 5), ended_at: at(-3, 11, 31),
      live_views: 88, video_id: '1046293837120', permalink: 'https://www.facebook.com/104829371665012/videos/1046293837120/',
      created_by: null, updated_by: null, created_at: at(-3, 11, 5),
    }),
    live({
      id: 'live-6', title: 'Weekend Q and A on skin care remedies', status: 'canceled', phase: 'canceled', planned_start_at: at(2, 11),
      canceled_at: minutesAgo(60 * 49), canceled_by: 'Rohit Menon', created_at: minutesAgo(60 * 72),
    }),
    live({
      id: 'live-7', title: 'Kids and homeopathy: teething, colic and sleep', status: 'failed', phase: 'failed', external_id: null,
      planned_start_at: at(3, 18), error: 'Meta refused the live video: Invalid time for an event', created_at: minutesAgo(60 * 5),
    }),
  ];
  return state;
}

const person = (id: string, name: string) => ({ id, name, handle: null });
function comment(id: string, liveId: string, who: [string, string], text: string, ago: number, extra: Partial<SocialComment> = {}): SocialComment {
  return {
    id, channel: 'facebook_page', kind: 'comment', post_id: null, post_excerpt: null, object_id: liveId, author: person(...who), text,
    permalink: null, status: 'open', hidden: false, commented_at: minutesAgo(ago), reply: null, private_reply: null, ...extra,
  };
}
let notes: Record<string, SocialComment[]> | null = null;
function commentsOf(): Record<string, SocialComment[]> {
  if (notes) return notes;
  notes = {
    'live-1': [
      comment('lc-1', 'live-1', ['501', 'Priya Sharma'], 'Is Arnica 30 safe for my 6 year old after a fall? She bumped her knee yesterday.', 2),
      comment('lc-2', 'live-1', ['502', 'Rahul Verma'], 'Which potency for a seasonal cold, 30 or 200?', 6, {
        status: 'replied', reply: { text: 'For most colds 30C is enough; take it three times a day and stop when you feel better. Dr Meera covers this at minute 12.', at: minutesAgo(5), by: 'Ananya Rao', error: null },
      }),
      comment('lc-3', 'live-1', ['503', 'Meena Iyer'], 'Do you ship to Coimbatore? Same day dispatch?', 9),
      comment('lc-4', 'live-1', ['504', 'Quick Money Club'], 'Earn 5000 daily from home, DM me now', 11, { status: 'hidden', hidden: true }),
      comment('lc-5', 'live-1', ['505', 'Farhan Ali'], 'Thank you doctor, very helpful session. Please do one on allergies too.', 13),
      comment('lc-6', 'live-1', ['506', 'Kavita Joshi'], 'Please talk about Calc Phos for teething, my son is 9 months old and not sleeping well at night because of it.', 16),
    ],
    'live-4': [
      comment('lc-7', 'live-4', ['507', 'Sunil Patil'], 'Is the cold and flu combo available in 30 ml bottles?', 60 * 24 + 30, {
        status: 'replied', reply: { text: 'Yes, both 30 ml and 100 ml. The link is in the post above.', at: minutesAgo(60 * 24 + 20), by: 'Ananya Rao', error: null },
      }),
      comment('lc-8', 'live-4', ['508', 'Deepa Nair'], 'Will the Diwali offer apply on Bach flower remedies?', 60 * 24 + 35),
    ],
  };
  return notes;
}
const LATER = [
  ['509', 'Arjun Reddy', 'Can I take this along with my regular BP tablets?'],
  ['510', 'Sneha Kapoor', 'Joined late, will the recording stay on the page?'],
  ['511', 'Vikram Singh', 'What is the dose of Belladonna for fever in adults?'],
];
let polls = 0;

const find = (id: string) => lives().find((l) => l.id === id);
const set = (id: string, patch: Partial<SocialLive>): SocialLive | null => {
  const l = find(id);
  if (!l) return null;
  Object.assign(l, patch, { updated_at: new Date().toISOString() });
  l.can = can(String(l.phase), l.external_id !== null);
  return l;
};
const order = (l: SocialLive) => l.started_at ?? l.planned_start_at ?? l.created_at ?? '';

export const liveMock = {
  list: (q: { phase?: string; check?: boolean; limit?: number; offset?: number }): Promise<SocialLives> => {
    const all = lives().filter((l) => !q.phase || l.phase === q.phase).sort((a, b) => order(b).localeCompare(order(a)));
    const followers = fresh() ? 84 : 2316;
    const eligibility = q.check ? {
      page: PAGE, can_schedule: followers >= 100, followers, min_followers: 100, followers_error: null,
      reason: followers >= 100 ? null : `Meta lets a Page go live only with at least 100 followers; this Page has ${followers}.`,
    } : null;
    return wait({ lives: all.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 20)), total: all.length, settings: SETTINGS, eligibility });
  },
  schedule: (input: LiveInput): Promise<SocialLive> => {
    if (!input.title.trim()) return refuse(400, 'Give the live a title');
    if (fresh()) return refuse(409, 'Meta lets a Page go live only with at least 100 followers; this Page has 84', 'marketing.conflict');
    const l = live({
      id: `live-${Date.now()}`, title: input.title.trim(), description: input.description, planned_start_at: input.planned_start,
      status: input.planned_start ? 'SCHEDULED_UNPUBLISHED' : 'UNPUBLISHED', phase: 'scheduled', created_by: 'Preview',
      updated_by: 'Preview', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    lives().unshift(l);
    return wait(l, 420);
  },
  get: (id: string): Promise<SocialLive> => {
    const l = find(id);
    return l ? wait(l) : refuse(404, 'No such live video', 'marketing.not_found');
  },
  streamKey: (id: string): Promise<LiveStreamKey> => {
    const l = find(id);
    if (!l) return refuse(404, 'No such live video', 'marketing.not_found');
    if (!l.can.stream_key) return refuse(409, 'This live video is over; a new live has its own stream key', 'marketing.conflict');
    l.key = { shown_at: new Date().toISOString(), shown_by: 'Preview', shown_count: l.key.shown_count + 1 };
    const server = 'rtmps://live-api-s.facebook.com:443/rtmp/';
    const key = 'FB-0000000000000000-0-PLACEHOLDER-NOT-A-REAL-KEY';
    return wait({ url: server + key, server, key, secure: true, note: 'Anyone with this key can stream to your Page. Paste it into your streaming app only; do not share or post it.' }, 380);
  },
  act: (id: string, op: 'go_live' | 'end' | 'cancel'): Promise<SocialLive> => {
    const l = find(id);
    if (!l) return refuse(404, 'No such live video', 'marketing.not_found');
    const now = new Date().toISOString();
    if (op === 'go_live') {
      if (!l.can.go_live) return refuse(409, 'Only a live that has not started can be started', 'marketing.conflict');
      return wait(set(id, { status: 'LIVE', phase: 'live', started_at: now, live_views: 0 }) as SocialLive, 500);
    }
    if (op === 'end') {
      if (!l.can.end) return refuse(409, 'Only a live that is on air can be ended', 'marketing.conflict');
      return wait(set(id, { status: 'VOD', phase: 'ended', ended_at: now, ended_by: 'Preview', video_id: '1046293837999' }) as SocialLive, 500);
    }
    if (!l.can.cancel) return refuse(409, 'Only a live that has not started can be cancelled; end it instead', 'marketing.conflict');
    return wait(set(id, { status: 'canceled', phase: 'canceled', canceled_at: now, canceled_by: 'Preview' }) as SocialLive, 400);
  },
  comments: (id: string, q: { refresh?: boolean; limit?: number; offset?: number }): Promise<LiveComments> => {
    const l = find(id);
    if (!l) return refuse(404, 'No such live video', 'marketing.not_found');
    const all = (commentsOf()[id] ??= []);
    let kept = 0;
    if (q.refresh && l.phase === 'live') {
      polls += 1;
      const next = LATER[Math.floor(polls / 3) - 1];
      if (polls % 3 === 0 && next && !all.some((c) => c.author.id === next[0])) {
        all.unshift(comment(`lc-new-${polls}`, id, [next[0], next[1]], next[2], 0));
        kept = 1;
      }
      l.comments = { read_at: new Date().toISOString(), error: null };
      l.live_views = (l.live_views ?? 0) + 3;
    }
    const shown = all.filter((c) => c.status !== 'deleted');
    return wait({ live: l, read: q.refresh ? { kept, error: null } : null, comments: shown.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 50)), total: shown.length });
  },
};
