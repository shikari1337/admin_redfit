/**
 * Marketing > Social > Publisher (`/panel/marketing/social/publisher`, lane META-15B, routes of META-12).
 *
 * Leads with what to act on: posts that failed on a channel (with that channel's own words and a retry that sends
 * only to the channels that failed) and channels that cannot post (with the reason and where to fix it). Then the
 * calendar, by month or week on the store's clock: each post sits on the day it went or goes out, with its status in
 * words and colour; a day opens a new post for that day. Drafts are listed under the calendar. The composer, the post
 * view and the settings are their own files in this folder.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Settings2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isoDate, localeTime, todayIso } from '@/utils/date';
import { metaSocialApi, type SocialChannel, type SocialPost } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, plural, useLoad, writeError } from '../common';
import { connectionsHref } from '../routes';
import Composer, { type ComposerCan } from './Composer';
import PublisherSettings from './PublisherSettings';
import LivePanel from './LivePanel';
import { ChannelMark, STATUS_DOT, channelName, civilDay as dayFmt, failedChannels, firstLine, postTime, statusTone, statusWord, useSetup, useSocialChannels } from './shared';

/* Days as `YYYY-MM-DD` on the store's calendar; the arithmetic runs on UTC noon so no zone shifts a day. */
const toUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = toUtc(iso); d.setUTCDate(d.getUTCDate() + n); return fromUtc(d); };
/** Weeks start on Monday. */
const weekStart = (iso: string) => addDays(iso, -((toUtc(iso).getUTCDay() + 6) % 7));
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => { const d = toUtc(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + n); return fromUtc(d); };

const PublisherPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const { toast } = useToast();
  const can: ComposerCan = { write: hasPerm('marketing.manage'), send: hasPerm('marketing.send'), remove: hasPerm('marketing.delete') };
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'week' ? 'week' : 'month';
  /* META-20: the Live tab (live video on the Facebook Page), `?tab=live`. */
  const tab = sp.get('tab') === 'live' ? 'live' : 'posts';
  const today = todayIso();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('day') ?? '') ? String(sp.get('day')) : today;
  const setParams = (p: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(p).forEach(([k, v]) => n.set(k, v)); setSp(n, { replace: true }); };

  const range = useMemo(() => {
    if (view === 'week') { const from = weekStart(anchor); return { from, to: addDays(from, 6) }; }
    const from = weekStart(monthStart(anchor));
    const last = addDays(addMonths(anchor, 1), -1);
    return { from, to: addDays(weekStart(last), 6) };
  }, [view, anchor]);

  const setupQ = useSetup();
  const chQ = useSocialChannels();
  const postsQ = useLoad(() => metaSocialApi.posts({ from: range.from, to: range.to, limit: 200 }), [range.from, range.to]);
  const draftsQ = useLoad(() => metaSocialApi.posts({ status: 'draft', limit: 50 }), []);
  const failedQ = useLoad(() => metaSocialApi.posts({ status: 'failed', limit: 20 }), []);
  const reload = () => { postsQ.reload(); draftsQ.reload(); failedQ.reload(); };

  const [open, setOpen] = useState<{ post: SocialPost | null; day?: string } | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const channels = chQ.data ?? [];

  const byDay = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    for (const p of postsQ.data?.posts ?? []) {
      const t = postTime(p);
      if (!t || p.status === 'draft') continue;
      const k = isoDate(t);
      m.set(k, [...(m.get(k) ?? []), p].sort((a, b) => String(postTime(a)).localeCompare(String(postTime(b)))));
    }
    return m;
  }, [postsQ.data]);

  const retry = async (p: SocialPost) => {
    setBusy(p.id);
    try {
      const next = await metaSocialApi.publishPost(p.id);
      const still = failedChannels(next);
      toast({ title: still.length ? `Failed again on ${still.map((c) => channelName(String(c.key))).join(' and ')}` : 'Published on every channel', variant: still.length ? 'destructive' : undefined });
      reload();
    } catch (e) { toast({ title: 'Not sent again', description: writeError(e, 'The channels refused.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const pushPage = async () => {
    setBusy('page');
    try {
      const r = await metaSocialApi.syncPage();
      const words: Record<string, string> = { pushed: 'Page details sent to Facebook', unchanged: 'Nothing changed since the last push', nothing: 'The store settings hold no Page details to send', skipped: 'Page details are not sent: there is no Facebook Page the Publisher can write to. Pick the Page on the Meta connection, or reconnect Meta.' };
      toast({ title: words[r.status] ?? `Page details: ${r.status}`, description: r.error ?? undefined, variant: r.status === 'failed' ? 'destructive' : undefined });
    } catch (e) { toast({ title: 'Page details not sent', description: writeError(e, 'Facebook refused.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const failed = failedQ.data?.posts ?? [];
  const blocked = channels.filter((c) => !c.can_publish);
  const soon = (postsQ.data?.posts ?? []).filter((p) => p.status === 'scheduled' && postTime(p) && isoDate(postTime(p)) >= today && isoDate(postTime(p)) <= addDays(today, 7));
  const days = useMemo(() => { const out: string[] = []; for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d); return out; }, [range]);
  const title = view === 'week'
    ? `${dayFmt(range.from, { day: 'numeric', month: 'short' })} to ${dayFmt(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : dayFmt(anchor, { month: 'long', year: 'numeric' });
  const canPost = channels.some((c) => c.can_publish);
  const newOn = (day?: string) => (can.write && canPost ? setOpen({ post: null, day: day && day >= today ? day : undefined }) : undefined);

  return (
    <div className="space-y-5">
      <MetaHeader title="Publisher" setup={setupQ.data}
        description="Plan, schedule and post to your Facebook Page, Instagram and Threads, and see how each post did."
        actions={(
          <>
            {can.write && <Button size="sm" onClick={() => newOn()} disabled={!canPost} title={canPost ? undefined : 'No channel can post yet'}><Plus /> New post</Button>}
            {can.write && <Button size="sm" variant="outline" onClick={pushPage} disabled={busy === 'page'}>{busy === 'page' ? <Loader2 className="animate-spin" /> : <Store />} Push Page details now</Button>}
            <Button size="sm" variant="outline" onClick={() => setSettings(true)}><Settings2 /> Settings</Button>
          </>
        )} />

      <Segmented label="Publisher tab" value={tab} onChange={(k) => setParams({ tab: k })} options={[{ key: 'posts', label: 'Posts' }, { key: 'live', label: 'Live' }]} />

      {tab === 'live' ? <LivePanel can={can} /> : chQ.error && !chQ.data ? <LoadFailure failure={chQ.error} what="The Publisher (GET /api/v2/marketing/social/channels) is not served yet." onRetry={chQ.reload} /> : (
        <>
          {failed.map((p) => (
            <Lead key={p.id} tone="bad" title={`"${firstLine(p)}" failed on ${failedChannels(p).map((c) => channelName(String(c.key))).join(' and ')}`}
              actions={(
                <>
                  {can.send && <Button size="sm" onClick={() => retry(p)} disabled={busy === p.id}>{busy === p.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} Try again</Button>}
                  <Button size="sm" variant="outline" className="bg-white" onClick={() => setOpen({ post: p })}>Open</Button>
                </>
              )}>
              <ul className="space-y-0.5">{failedChannels(p).map((c) => <li key={String(c.key)}><b>{channelName(String(c.key))}:</b> {c.error ?? 'No reason was given.'}</li>)}</ul>
              <p className="mt-1 text-xs">Trying again sends only to the channels that failed. Fix the cause first when the reason names one.</p>
            </Lead>
          ))}
          {blocked.length > 0 && (
            <Lead tone="warn" title={blocked.length === 1 ? `${channelName(String(blocked[0].key))} cannot post` : `${plural(blocked.length, 'channel')} cannot post`}>
              <ul className="space-y-0.5">
                {blocked.map((c: SocialChannel) => (
                  <li key={String(c.key)} className="flex flex-wrap items-baseline gap-x-2">
                    <span><b>{channelName(String(c.key))}:</b> {c.reason ?? 'Not connected.'}</span>
                    <Link className={linkCls} to={connectionsHref(c.key === 'threads' ? 'threads' : 'meta')}>Open the connection</Link>
                  </li>
                ))}
              </ul>
            </Lead>
          )}
          {!failed.length && !blocked.length && chQ.data && (
            <Lead tone="good" title="Nothing waiting on you">{soon.length ? `${plural(soon.length, 'post')} going out in the next 7 days.` : 'Nothing is scheduled for the next 7 days.'}</Lead>
          )}

          <Section title={title}
            hint={postsQ.data ? `${plural((postsQ.data.posts ?? []).filter((p) => p.status !== 'draft').length, 'post')} in view. Times are your store's.` : undefined}
            actions={(
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex">
                  <Button size="sm" variant="outline" className="rounded-r-none" aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
                    onClick={() => setParams({ day: view === 'week' ? addDays(anchor, -7) : addMonths(anchor, -1) })}><ChevronLeft /></Button>
                  <Button size="sm" variant="outline" className="rounded-none border-x-0" onClick={() => setParams({ day: today })}>Today</Button>
                  <Button size="sm" variant="outline" className="rounded-l-none" aria-label={view === 'week' ? 'Next week' : 'Next month'}
                    onClick={() => setParams({ day: view === 'week' ? addDays(anchor, 7) : addMonths(anchor, 1) })}><ChevronRight /></Button>
                </div>
                <Segmented size="sm" label="Calendar view" value={view} onChange={(k) => setParams({ view: k })} options={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }]} />
              </div>
            )}>
            {postsQ.error && !postsQ.data ? <LoadFailure failure={postsQ.error} what="Posts (GET /api/v2/marketing/social/posts) are not served yet." onRetry={postsQ.reload} /> : (
              <>
                <Legend />
                {view === 'month'
                  ? <MonthGrid canAdd={can.write && canPost} days={days} month={anchor.slice(0, 7)} today={today} byDay={byDay} onOpen={(p) => setOpen({ post: p })} onDay={newOn} onMore={(d) => setParams({ view: 'week', day: d })} />
                  : <WeekGrid canAdd={can.write && canPost} days={days} today={today} byDay={byDay} onOpen={(p) => setOpen({ post: p })} onDay={newOn} />}
                <Agenda days={days} today={today} byDay={byDay} onOpen={(p) => setOpen({ post: p })} />
              </>
            )}
          </Section>

          <Section title="Drafts" hint={draftsQ.data ? plural(draftsQ.data.posts.length, 'draft') : undefined}>
            {draftsQ.error && !draftsQ.data ? <LoadFailure failure={draftsQ.error} what="Drafts could not be read." onRetry={draftsQ.reload} />
              : !draftsQ.data ? <p className="text-sm text-gray-500">Loading...</p>
                : !draftsQ.data.posts.length ? <p className="text-sm text-gray-600">No drafts. A post kept as a draft waits here until you schedule or publish it.</p> : (
                  <ul className="-my-2 divide-y">
                    {draftsQ.data.posts.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setOpen({ post: p })} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left hover:bg-gray-50">
                          {p.media[0]?.url && <img src={p.media[0].url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                          <span className="min-w-0 flex-1 basis-48">
                            <span className="block truncate text-sm font-medium text-gray-900">{firstLine(p)}</span>
                            <span className="block text-xs text-gray-500">Changed {ago(p.updated_at)}{p.updated_by ? ` by ${p.updated_by}` : ''}</span>
                          </span>
                          <span className="flex flex-wrap gap-2">{p.channels.map((c) => <ChannelMark key={String(c.key)} channel={String(c.key)} withName />)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
          </Section>
        </>
      )}

      {open && chQ.data && <Composer channels={channels} post={open.post} day={open.day} can={can} onClose={() => setOpen(null)} onChanged={reload} />}
      {settings && <PublisherSettings canWrite={can.write} onClose={() => { setSettings(false); chQ.reload(); }} />}
    </div>
  );
};

const Legend: React.FC = () => (
  <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
    {['scheduled', 'published', 'failed'].map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', STATUS_DOT[s])} aria-hidden />{statusWord(s)}</span>)}
  </p>
);

/** One post on the calendar: its status dot and word, time, channels and first line. */
const Chip: React.FC<{ p: SocialPost; onOpen: (p: SocialPost) => void; full?: boolean }> = ({ p, onOpen, full }) => {
  const t = postTime(p);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(p); }} title={`${statusWord(p.status)}: ${firstLine(p)}`}
      className={cn('flex w-full min-w-0 items-start gap-1.5 rounded border bg-white px-1.5 py-1 text-left text-[11px] leading-tight hover:border-gray-400',
        p.status === 'failed' && 'border-red-300 bg-red-50')}>
      <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', STATUS_DOT[p.status] ?? 'bg-gray-400')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-gray-500">
          <span className="tabular-nums">{t ? localeTime(t, { hour: 'numeric', minute: '2-digit' }) : ''}</span>
          {p.channels.map((c) => <ChannelMark key={String(c.key)} channel={String(c.key)} />)}
          <span className="sr-only">{statusWord(p.status)}</span>
        </span>
        <span className={cn('block text-gray-900', full ? 'line-clamp-3' : 'truncate')}>{firstLine(p)}</span>
      </span>
    </button>
  );
};

const WEEKDAYS = (days: string[]) => days.slice(0, 7).map((d) => dayFmt(d, { weekday: 'short' }));

const MonthGrid: React.FC<{ canAdd: boolean; days: string[]; month: string; today: string; byDay: Map<string, SocialPost[]>; onOpen: (p: SocialPost) => void; onDay: (d: string) => void; onMore: (d: string) => void }> = ({ canAdd, days, month, today, byDay, onOpen, onDay, onMore }) => (
  <div className="hidden sm:block">
    <div className="grid grid-cols-7 border-b text-xs font-medium text-gray-500">{WEEKDAYS(days).map((w) => <div key={w} className="px-1.5 py-1">{w}</div>)}</div>
    <div className="grid grid-cols-7 border-l">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const inMonth = d.startsWith(month);
        return (
          <div key={d} {...(canAdd && d >= today ? { role: 'button', tabIndex: 0, title: 'New post on this day', onClick: () => onDay(d), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onDay(d); } } : {})}
            aria-label={`${dayFmt(d, { day: 'numeric', month: 'long' })}, ${plural(list.length, 'post')}`}
            className={cn('min-h-28 min-w-0 space-y-1 border-b border-r p-1 text-left', inMonth ? 'bg-white' : 'bg-gray-50', d < today && 'bg-gray-50/70')}>
            <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs', d === today ? 'bg-gray-900 font-semibold text-white' : inMonth ? 'text-gray-800' : 'text-gray-400')}>{Number(d.slice(8))}</span>
            {list.slice(0, 3).map((p) => <Chip key={p.id} p={p} onOpen={onOpen} />)}
            {list.length > 3 && <button type="button" onClick={(e) => { e.stopPropagation(); onMore(d); }} className="text-[11px] font-medium text-primary hover:underline">{list.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  </div>
);

const WeekGrid: React.FC<{ canAdd: boolean; days: string[]; today: string; byDay: Map<string, SocialPost[]>; onOpen: (p: SocialPost) => void; onDay: (d: string) => void }> = ({ canAdd, days, today, byDay, onOpen, onDay }) => (
  <div className="hidden grid-cols-7 gap-2 sm:grid">
    {days.map((d) => {
      const list = byDay.get(d) ?? [];
      return (
        <div key={d} className={cn('flex min-h-64 min-w-0 flex-col rounded-md border bg-white', d === today && 'border-gray-900')}>
          <div className="border-b px-2 py-1.5 text-xs">
            <span className="font-medium text-gray-500">{dayFmt(d, { weekday: 'short' })}</span>{' '}
            <span className={cn('font-semibold', d === today ? 'text-gray-900' : 'text-gray-700')}>{dayFmt(d, { day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="flex-1 space-y-1.5 p-1.5">{list.map((p) => <Chip key={p.id} p={p} onOpen={onOpen} full />)}</div>
          {canAdd && d >= today && <button type="button" onClick={() => onDay(d)} className="border-t px-2 py-1 text-left text-[11px] text-gray-500 hover:bg-gray-50 hover:text-gray-900"><Plus className="mr-0.5 inline h-3 w-3" />Post this day</button>}
        </div>
      );
    })}
  </div>
);

/** Phones: the same posts as a list of days (only days with posts, and today). */
const Agenda: React.FC<{ days: string[]; today: string; byDay: Map<string, SocialPost[]>; onOpen: (p: SocialPost) => void }> = ({ days, today, byDay, onOpen }) => {
  const shown = days.filter((d) => byDay.has(d) || d === today);
  return (
    <ol className="space-y-3 sm:hidden">
      {shown.map((d) => (
        <li key={d}>
          <p className={cn('text-xs font-semibold', d === today ? 'text-gray-900' : 'text-gray-600')}>{d === today ? 'Today, ' : ''}{dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <ul className="mt-1 space-y-1.5">
            {(byDay.get(d) ?? []).map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><Chip p={p} onOpen={onOpen} full /></div>
                <StateChip tone={statusTone(p.status)} className="mt-1 shrink-0">{statusWord(p.status)}</StateChip>
              </li>
            ))}
            {!byDay.has(d) && <li className="text-xs text-gray-500">Nothing planned.</li>}
          </ul>
        </li>
      ))}
    </ol>
  );
};

export default PublisherPage;
