/**
 * What the social pages share (lane META-15B, contract META-W2-social META-12): channel names and marks, post status
 * words and colours, the text counters each channel's limits are checked with, and metric labels. Limits themselves
 * always come from `GET /marketing/social/channels` (the `social` store setting); nothing here holds a number of Meta's.
 */
import React from 'react';
import { AtSign, Facebook, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import { metaApi, metaSocialApi, type SocialChannel, type SocialLimits, type SocialPost } from '@/lib/v2/areas/meta';
import { localeDateTime } from '@/utils/date';
import { useLoad, type Tone } from '../common';

/* Channels */

const CHANNEL_NAME: Record<string, string> = { facebook_page: 'Facebook Page', instagram: 'Instagram', threads: 'Threads' };
/** A channel key in words ("Facebook Page"), with a plain fallback for a channel added later. */
export const channelName = (key: string | null | undefined): string => {
  if (!key) return '';
  return CHANNEL_NAME[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { facebook_page: Facebook, instagram: Instagram, threads: AtSign };
/** A channel's small mark beside its name; the name is always written too, so colour never carries it alone. */
export const ChannelMark: React.FC<{ channel: string; className?: string; withName?: boolean }> = ({ channel, className, withName }) => {
  const Icon = ICON[channel] ?? AtSign;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-gray-700', className)}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      {withName ? channelName(channel) : <span className="sr-only">{channelName(channel)}</span>}
    </span>
  );
};

/** The store's three channels and what each may do, one load per page. */
export const useSocialChannels = () => useLoad(() => metaSocialApi.channels(), []);
/** The setup checklist, only for the connection chip in the page header. */
export const useSetup = () => useLoad(() => metaApi.setup(), []);

/* Post status */

export const POST_STATUS: Record<string, { text: string; tone: Tone }> = {
  draft: { text: 'Draft', tone: 'neutral' },
  scheduled: { text: 'Scheduled', tone: 'info' },
  publishing: { text: 'Publishing', tone: 'info' },
  pending: { text: 'Waiting', tone: 'neutral' },
  published: { text: 'Published', tone: 'good' },
  failed: { text: 'Failed', tone: 'bad' },
};
export const statusWord = (s: string | null | undefined) => (s ? POST_STATUS[s]?.text ?? s.replace(/_/g, ' ') : '');
export const statusTone = (s: string | null | undefined): Tone => (s ? POST_STATUS[s]?.tone ?? 'neutral' : 'neutral');

/** The calendar dot and border colours per status (state, so the admin's status tokens, always beside a word). */
export const STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-400', scheduled: 'bg-blue-500', publishing: 'bg-blue-500', published: 'bg-emerald-600', failed: 'bg-red-600',
};

/** When the post goes or went out: published time, else the scheduled time. */
export const postTime = (p: SocialPost): string | null => p.published_at ?? p.schedule_at ?? null;
/** A post's channels failed somewhere, published nowhere yet, or both. */
export const failedChannels = (p: SocialPost) => p.channels.filter((c) => c.status === 'failed');
/** Once a channel is published or publishing, the server refuses edits and deletes (409). */
export const isLocked = (p: SocialPost) => p.channels.some((c) => c.status === 'published' || c.status === 'publishing');
/** A store calendar day (`YYYY-MM-DD`) in words; read at noon UTC so no zone moves it to another day. */
export const civilDay = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};
export const when = (iso: string | null | undefined) => (iso ? localeDateTime(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
/** The first line of the text, for a calendar chip or a list row. */
export const firstLine = (p: Pick<SocialPost, 'text' | 'kind' | 'media'>): string => {
  const t = (p.text ?? '').trim().split('\n')[0];
  if (t) return t;
  if (p.kind === 'story') return 'Story';
  return p.media.length ? (p.media[0].name ?? 'Picture') : 'No text';
};

/* Counters: each channel's own rule, from its limits */

const EMOJI = /\p{Extended_Pictographic}/u;
const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
/** The length a channel counts: characters, with an emoji as its UTF-8 bytes where the channel says so (Threads). */
export function textLength(text: string, limits: Pick<SocialLimits, 'count_emoji_bytes'> | null | undefined): number {
  let n = 0;
  for (const ch of Array.from(text)) n += limits?.count_emoji_bytes && EMOJI.test(ch) && enc ? enc.encode(ch).length : 1;
  return n;
}
export const countHashtags = (t: string) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
export const countMentions = (t: string) => (t.match(/(^|\s)@[\p{L}\p{N}_.]+/gu) ?? []).length;
export const countLinks = (t: string) => (t.match(/https?:\/\/\S+/g) ?? []).length;

export interface Problem { channel: string; text: string }
/** What breaks a channel's limits, in words, for the text, media and kind picked. */
export function limitProblems(ch: SocialChannel, text: string, media: Array<{ key: string; kind: string }>, kind: string): Problem[] {
  const out: Problem[] = [];
  const l = ch.limits;
  const name = channelName(ch.key);
  const len = textLength(text, l);
  if (l.max_chars && len > l.max_chars) out.push({ channel: ch.key, text: `${name} takes at most ${l.max_chars.toLocaleString('en-IN')} characters; this is ${len.toLocaleString('en-IN')}.` });
  if (l.max_hashtags != null && countHashtags(text) > l.max_hashtags) out.push({ channel: ch.key, text: `${name} takes at most ${l.max_hashtags} hashtags.` });
  if (l.max_mentions != null && countMentions(text) > l.max_mentions) out.push({ channel: ch.key, text: `${name} takes at most ${l.max_mentions} mentions.` });
  if (l.max_links != null && countLinks(text) > l.max_links) out.push({ channel: ch.key, text: `${name} takes at most ${l.max_links} links.` });
  if (l.max_media && media.length > l.max_media) out.push({ channel: ch.key, text: `${name} takes at most ${l.max_media} files in one post.` });
  if (kind === 'reel' && !l.reels) out.push({ channel: ch.key, text: `${name} has no Reels here.` });
  if (kind === 'story' && !l.stories) out.push({ channel: ch.key, text: `${name} has no stories here.` });
  if (kind === 'carousel' && !l.carousel) out.push({ channel: ch.key, text: `${name} takes no carousel here.` });
  if (!l.video && media.some((m) => m.kind === 'video')) out.push({ channel: ch.key, text: `${name} takes no video here.` });
  const ext = (k: string) => (k.split('?')[0].split('.').pop() ?? '').toLowerCase();
  for (const m of media) {
    const allowed = m.kind === 'video' ? l.video_extensions : l.image_extensions;
    if (allowed && allowed.length && !allowed.includes(ext(m.key))) {
      out.push({ channel: ch.key, text: `${name} takes only ${allowed.map((x) => x.toUpperCase()).join(' or ')} ${m.kind === 'video' ? 'videos' : 'pictures'}; ${m.key.split('/').pop()} is not.` });
    }
  }
  return out;
}

/* Metrics */

const METRIC_LABEL: Record<string, string> = {
  page_media_view: 'Views', page_total_media_view_unique: 'People reached', page_post_engagements: 'Post engagement', page_follows: 'Followers',
  page_daily_follows_unique: 'New follows', page_daily_unfollows_unique: 'Unfollows', page_views_total: 'Page visits',
  views: 'Views', reach: 'Reach', accounts_engaged: 'Accounts engaged', total_interactions: 'Interactions', likes: 'Likes', comments: 'Comments',
  shares: 'Shares', saves: 'Saves', saved: 'Saves', follows_and_unfollows: 'Follows and unfollows', replies: 'Replies', reposts: 'Reposts', quotes: 'Quotes',
  followers_count: 'Followers', post_media_view: 'Views', post_total_media_view_unique: 'People reached', post_reactions_by_type_total: 'Reactions', post_clicks: 'Clicks',
};
/** A metric key in words; a key Meta adds later reads as its own words. */
export const metricLabel = (k: string) => METRIC_LABEL[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
/** A metric value as a number: Meta answers some (reactions by type) as a map, summed here. */
export const metricValue = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).reduce<number>((s, x) => s + (typeof x === 'number' ? x : 0), 0);
  return null;
};
