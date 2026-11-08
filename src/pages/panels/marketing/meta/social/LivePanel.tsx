/**
 * Marketing > Social > Publisher, Live tab (lane META-20, routes `/api/v2/marketing/social/live...` of
 * `growcord-rs/apps/marketing/core/src/api/social.rs`).
 *
 * Leads with what to act on: a live on air (its viewers, its comments, end it), a live Meta refused, why the store
 * cannot go live (no Page, too few followers), or the next live and when to start the streaming app. Then the lives:
 * on air, coming up, past. The stream key is read from Meta only when a person asks, shown in its dialog with copy
 * buttons, and dropped from the screen when the dialog closes; the server never lists it. Ending and cancelling ask
 * first. Comments written during a live are the Comments list's rows (reply, hide, delete, private message), read
 * from Meta again every few seconds (the `social` setting) while the live is on air.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Copy, ExternalLink, KeyRound, Loader2, MessageSquare, Plus, Radio, RefreshCw, Settings2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/erp';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fromStoreDateTimeInput, storeDateTimeInput } from '@/utils/date';
import { metaLiveApi, metaSocialApi, type LiveSettings, type LiveStreamKey, type SocialLive, type SocialSettingsGroups } from '@/lib/v2/areas/meta';
import { Lead, LoadFailure, Section, StateChip, ago, num, plural, useLoad, writeError, type Tone } from '../common';
import { connectionsHref } from '../routes';
import { CommentRow } from './CommentsPage';
import { when } from './shared';

export interface LiveCan { write: boolean; send: boolean; remove: boolean }

/** Rows of comments a page shows (a screen choice, not a store setting). */
const COMMENTS_PAGE = 20;
const PHASE: Record<string, { text: string; tone: Tone }> = {
  scheduled: { text: 'Coming up', tone: 'info' }, live: { text: 'On air', tone: 'bad' }, ended: { text: 'Ended', tone: 'neutral' },
  canceled: { text: 'Cancelled', tone: 'neutral' }, failed: { text: 'Not made', tone: 'bad' },
};
const phaseOf = (l: SocialLive) => PHASE[l.phase] ?? { text: l.status, tone: 'neutral' as Tone };
const titleOf = (l: SocialLive) => l.title.trim() || (l.origin === 'facebook' ? 'Live started on Facebook' : 'Untitled live');
/** When it is (or was) on: started, else planned, else made. */
const timeOf = (l: SocialLive) => l.started_at ?? l.planned_start_at ?? l.created_at;
const byTime = (a: SocialLive, b: SocialLive) => String(timeOf(a) ?? '').localeCompare(String(timeOf(b) ?? ''));

const LivePanel: React.FC<{ can: LiveCan }> = ({ can }) => {
  const { toast } = useToast();
  const listQ = useLoad(() => metaLiveApi.list({ check: true, limit: 100 }), []);
  const settingsQ = useLoad(() => metaSocialApi.settings().catch(() => null), []);
  const [scheduling, setScheduling] = useState(false);
  const [keyFor, setKeyFor] = useState<SocialLive | null>(null);
  const [confirm, setConfirm] = useState<{ live: SocialLive; what: 'end' | 'cancel' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const data = listQ.data;
  const settings: LiveSettings = data?.settings ?? {};
  const all = data?.lives ?? [];
  const onAir = all.filter((l) => l.phase === 'live');
  const coming = all.filter((l) => l.phase === 'scheduled').sort(byTime);
  /* A refusal leads the tab for three days (a screen choice); it stays listed under past lives. */
  const failed = all.filter((l) => l.phase === 'failed' && l.created_at && Date.now() - new Date(l.created_at).getTime() < 3 * 86_400_000);
  const past = all.filter((l) => l.phase === 'ended' || l.phase === 'canceled' || l.phase === 'failed');
  const elig = data?.eligibility ?? null;
  const blocked = elig ? !elig.can_schedule : false;
  const privateDays = Number((settingsQ.data?.settings.comments as Record<string, unknown> | undefined)?.private_reply_days) || null;
  const shownComments = watching ?? onAir[0]?.id ?? null;

  const goLive = async (l: SocialLive) => {
    setBusy(l.id);
    try {
      const next = await metaLiveApi.goLive(l.id);
      toast({ title: next.phase === 'live' ? 'You are on air' : `Facebook says: ${next.status}`, description: next.phase === 'live' ? undefined : 'Start sending from your streaming app first; Facebook goes live once the video arrives.' });
      listQ.reload();
    } catch (e) { toast({ title: 'Not started', description: writeError(e, 'Facebook refused.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const refresh = async (l: SocialLive) => {
    setBusy(l.id);
    try { await metaLiveApi.get(l.id, true); listQ.reload(); }
    catch (e) { toast({ title: 'Could not read it from Facebook', description: writeError(e, 'Facebook did not answer.'), variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (listQ.error && !data) return <LoadFailure failure={listQ.error} what="Live video (GET /api/v2/marketing/social/live) is not served yet." onRetry={listQ.reload} />;
  if (!data) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-5">
      {onAir.map((l) => (
        <Lead key={l.id} tone="bad" title={<span className="inline-flex flex-wrap items-center gap-2"><Radio className="h-4 w-4" aria-hidden /> On air: {titleOf(l)}</span>}
          actions={(
            <>
              {l.permalink && <Button size="sm" variant="outline" className="bg-white" asChild><a href={l.permalink} target="_blank" rel="noreferrer"><ExternalLink /> Watch</a></Button>}
              {can.send && l.can.end && <Button size="sm" variant="destructive" onClick={() => setConfirm({ live: l, what: 'end' })}><Square /> End live</Button>}
            </>
          )}>
          Started {ago(l.started_at)}{l.live_views != null ? `, ${num(l.live_views)} watching` : ''}. Answer comments below as they come in.
        </Lead>
      ))}
      {failed.map((l) => (
        <Lead key={`f-${l.id}`} tone="bad" title={`Facebook refused "${titleOf(l)}"`}
          actions={can.write ? <Button size="sm" variant="outline" className="bg-white" onClick={() => setScheduling(true)}>Schedule again</Button> : undefined}>
          <p className="break-words">{l.error ?? 'No reason was given.'}</p>
        </Lead>
      ))}
      {blocked && elig && (
        <Lead tone="warn" title="This store cannot go live on Facebook yet"
          actions={!elig.page ? <Button size="sm" variant="outline" className="bg-white" asChild><Link to={connectionsHref('meta')}>Open the Meta connection</Link></Button> : undefined}>
          <p className="break-words">{elig.reason ?? 'Pick the Facebook Page on the Meta connection.'}</p>
          <p className="mt-1 text-xs">Meta also asks that the Facebook account going live is at least 60 days old.</p>
        </Lead>
      )}
      {!onAir.length && !failed.length && !blocked && (
        coming.length
          ? (
            <Lead tone="info" title={`Next: "${titleOf(coming[0])}"${coming[0].planned_start_at ? `, ${when(coming[0].planned_start_at)}` : ''}`}
              actions={can.write && coming[0].can.stream_key ? <Button size="sm" variant="outline" className="bg-white" onClick={() => setKeyFor(coming[0])}><KeyRound /> Stream key</Button> : undefined}>
              {coming[0].planned_start_at
                ? 'Put the stream key in your streaming app and start sending a few minutes before. Nothing goes on air until your app sends video.'
                : 'Start sending from your streaming app, then press Go live here.'}
            </Lead>
          )
          : <Lead tone="good" title="Nothing on air or coming up" actions={can.write ? <Button size="sm" onClick={() => setScheduling(true)}><Plus /> Schedule a live</Button> : undefined}>Plan a live from here; your streaming app sends the video when it is time.</Lead>
      )}

      {(onAir.length > 0 || watching) && shownComments && (
        <LiveCommentsSection id={shownComments} key={shownComments} can={can} privateDays={privateDays} pollSeconds={settings.comments_poll_seconds ?? null}
          onLive={(l) => listQ.setData((d) => (d ? { ...d, lives: d.lives.map((x) => (x.id === l.id ? l : x)) } : d))}
          onClose={watching ? () => setWatching(null) : undefined} />
      )}

      <Section title="Coming up" hint={`${plural(coming.length, 'live')}. Times are your store's.${elig?.followers != null ? ` Your Page has ${num(elig.followers)} followers.` : ''}`}
        actions={(
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Settings2 /> Live settings</Button>
            {can.write && <Button size="sm" onClick={() => setScheduling(true)} disabled={blocked} title={blocked ? elig?.reason ?? undefined : undefined}><Plus /> Schedule a live</Button>}
          </>
        )}>
        {!coming.length ? <p className="text-sm text-gray-600">Nothing planned. A live you schedule waits here with its stream key until it starts.</p> : (
          <ul className="-my-3 divide-y">
            {coming.map((l) => (
              <LiveRow key={l.id} l={l}>
                {can.write && l.can.stream_key && <Button size="sm" variant="outline" onClick={() => setKeyFor(l)}><KeyRound /> Stream key</Button>}
                {can.send && l.can.go_live && <Button size="sm" variant="outline" onClick={() => goLive(l)} disabled={busy === l.id}>{busy === l.id ? <Loader2 className="animate-spin" /> : <Radio />} Go live</Button>}
                <Button size="sm" variant="ghost" onClick={() => refresh(l)} disabled={busy === l.id} aria-label="Read the status from Facebook"><RefreshCw /> Status</Button>
                {can.remove && l.can.cancel && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirm({ live: l, what: 'cancel' })}><Ban /> Cancel</Button>}
              </LiveRow>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Past lives" hint={past.length ? plural(past.length, 'live') : undefined}>
        {!past.length ? <p className="text-sm text-gray-600">None yet. After a live ends, Facebook keeps it on your Page as a video, and it is listed here.</p> : (
          <ul className="-my-3 divide-y">
            {[...past].sort((a, b) => byTime(b, a)).map((l) => (
              <LiveRow key={l.id} l={l}>
                {l.permalink && <Button size="sm" variant="outline" asChild><a href={l.permalink} target="_blank" rel="noreferrer"><ExternalLink /> {l.video_id ? 'Recording' : 'Open'}</a></Button>}
                {l.phase === 'ended' && <Button size="sm" variant="ghost" onClick={() => setWatching(l.id)}><MessageSquare /> Comments</Button>}
              </LiveRow>
            ))}
          </ul>
        )}
      </Section>

      {scheduling && <ScheduleDialog settings={settings} onClose={() => setScheduling(false)} onDone={() => { setScheduling(false); listQ.reload(); }} />}
      {keyFor && <StreamKeyDialog live={keyFor} repeat={settings.key_repeat !== false} onClose={() => { setKeyFor(null); listQ.reload(); }} />}
      {confirm && <ConfirmDialog live={confirm.live} what={confirm.what} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); listQ.reload(); }} />}
      {editing && <LiveSettingsDialog settings={settings} canWrite={can.write} onClose={() => setEditing(false)} onDone={() => { setEditing(false); listQ.reload(); }} />}
    </div>
  );
};

/** One live in a list: phase, title, time, Meta's word, viewers, who; the actions passed in. */
const LiveRow: React.FC<{ l: SocialLive; children?: React.ReactNode }> = ({ l, children }) => {
  const ph = phaseOf(l);
  const t = timeOf(l);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StateChip tone={ph.tone}>{ph.text}</StateChip>
            <span className="min-w-0 break-words text-sm font-medium text-gray-900">{titleOf(l)}</span>
          </div>
          <p className="text-xs text-gray-600">
            {l.phase === 'scheduled' && !l.planned_start_at ? 'Starts when you press Go live' : t ? `${l.started_at ? 'Started' : l.planned_start_at ? 'Planned for' : 'Made'} ${when(t)}` : ''}
            {l.ended_at ? `, ended ${when(l.ended_at)}` : ''}
            {l.canceled_at ? `, cancelled ${ago(l.canceled_at)}${l.canceled_by ? ` by ${l.canceled_by}` : ''}` : ''}
            {l.live_views != null && l.phase !== 'scheduled' ? `. ${num(l.live_views)} viewers` : ''}
            {l.origin === 'facebook' ? '. Started on Facebook' : l.created_by ? `. By ${l.created_by}` : ''}
          </p>
          {l.description && <p className="line-clamp-2 break-words text-xs text-gray-500">{l.description}</p>}
          {l.key.shown_count > 0 && l.phase === 'scheduled' && (
            <p className="text-xs text-gray-500">Stream key shown {plural(l.key.shown_count, 'time')}, last {ago(l.key.shown_at)}{l.key.shown_by ? ` to ${l.key.shown_by}` : ''}.</p>
          )}
          {l.error && l.phase !== 'failed' && <p className="break-words text-xs text-red-700">Facebook said: {l.error}</p>}
          <p className="sr-only">Facebook status {l.status}</p>
        </div>
        {children && <div className="flex flex-wrap gap-1.5">{children}</div>}
      </div>
    </li>
  );
};

/** Comments written on a live: read from Meta again every `pollSeconds` while it is on air. */
const LiveCommentsSection: React.FC<{ id: string; can: LiveCan; privateDays: number | null; pollSeconds: number | null; onLive: (l: SocialLive) => void; onClose?: () => void }> = ({ id, can, privateDays, pollSeconds, onLive, onClose }) => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const q = useLoad(() => metaLiveApi.comments(id, { refresh: true, limit: COMMENTS_PAGE, offset: (page - 1) * COMMENTS_PAGE }), [id, page]);
  const onAir = q.data?.live.phase === 'live';
  const secs = Math.max(5, pollSeconds ?? 10);
  useEffect(() => {
    if (!onAir) return undefined;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') q.reload(); }, secs * 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAir, secs, id, page]);
  /* Each read also answers the live (its viewers, its status); the lists above take it. */
  useEffect(() => {
    if (q.data?.live?.id) onLive(q.data.live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const rows = (q.data?.comments ?? []).filter((c) => status === 'all' || c.status === status);
  const waiting = (q.data?.comments ?? []).filter((c) => c.status === 'open').length;
  const live = q.data?.live;

  return (
    <Section title={live ? `Comments on "${titleOf(live)}"` : 'Comments'}
      hint={q.data ? `${plural(q.data.total, 'comment')}${waiting ? `, ${waiting} waiting on this page` : ''}. ${onAir ? `Read from Facebook every ${secs} seconds while on air.` : 'Read once more after it ended.'}` : undefined}
      actions={(
        <>
          <Segmented size="sm" label="Show" value={status} onChange={setStatus} options={[{ key: 'all', label: 'All' }, { key: 'open', label: 'Waiting' }, { key: 'replied', label: 'Answered' }, { key: 'hidden', label: 'Hidden' }]} />
          <Button size="sm" variant="outline" onClick={q.reload} disabled={q.loading}>{q.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Read now</Button>
          {onClose && <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}
        </>
      )}>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="The live's comments could not be read." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading...</p> : (
          <>
            {q.data.read?.error && <p className="mb-3 break-words rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Facebook did not give the newest comments: {q.data.read.error}</p>}
            {!rows.length ? <p className="text-sm text-gray-600">{onAir ? 'No comments yet. They appear here within seconds.' : 'None here.'}</p> : (
              <ul className="-my-3 divide-y">
                {rows.map((c) => <CommentRow key={c.id} c={c} canWrite={can.write} canRemove={can.remove} privateDays={privateDays} onChanged={q.reload} />)}
              </ul>
            )}
            <Pagination className="mt-4" page={page} pageSize={COMMENTS_PAGE} total={q.data.total} onPage={setPage} />
          </>
        )}
    </Section>
  );
};

/** The next half hour on the store's clock, as a `datetime-local` value. */
const nextSlot = (): string => {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return storeDateTimeInput(d);
};

const ScheduleDialog: React.FC<{ settings: LiveSettings; onClose: () => void; onDone: () => void }> = ({ settings, onClose, onDone }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'at' | 'hand'>('at');
  const [at, setAt] = useState(nextSlot());
  const [busy, setBusy] = useState(false);
  const max = settings.title_max ?? null;
  const days = settings.max_days_ahead ?? null;
  const startIso = mode === 'at' ? fromStoreDateTimeInput(at) : null;
  const len = Array.from(title).length;
  const problem = !title.trim() ? 'Give the live a title.'
    : max && len > max ? `Facebook takes a title of at most ${max} characters; this is ${len}.`
      : mode === 'at' && !startIso ? 'Pick the day and time it starts.' : null;

  const save = async () => {
    setBusy(true);
    try {
      const l = await metaLiveApi.schedule({ title: title.trim(), description: description.trim() || null, planned_start: startIso });
      toast({ title: l.planned_start_at ? `Scheduled for ${when(l.planned_start_at)}` : 'Ready to start', description: 'Open its stream key to set up your streaming app.' });
      onDone();
    } catch (e) { toast({ title: 'Not scheduled', description: writeError(e, 'Facebook refused.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[94vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule a live</DialogTitle>
          <DialogDescription>On your Facebook Page. Nothing goes on air until your streaming app sends video.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="live-title">Title</Label>
              {max ? <span className={cn('text-xs tabular-nums', len > max ? 'text-red-700' : 'text-gray-500')}>{len} of {max}</span> : null}
            </div>
            <Input id="live-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Monsoon immunity, ask our homeopath" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="live-description">What it is about (optional)</Label>
            <Textarea id="live-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Segmented label="When" value={mode} onChange={(k) => setMode(k as 'at' | 'hand')} options={[{ key: 'at', label: 'At a time' }, { key: 'hand', label: 'When I start it' }]} />
            {mode === 'at' && <Input aria-label="Day and time, store time" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-auto max-w-full" />}
            <p className="text-xs text-gray-600">
              {mode === 'at'
                ? `Times are your store's.${days ? ` Facebook takes a live up to ${plural(days, 'day')} ahead.` : ''} It starts when your streaming app sends video at that time.`
                : 'Facebook keeps it ready but hidden; start your streaming app, then press Go live in this tab.'}
            </p>
          </div>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Meta lets a Page go live only with at least {settings.min_followers ?? 100} followers, and the Facebook account must be at least 60 days old.
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          {problem && <p className="text-xs text-gray-600 sm:mr-auto">{problem}</p>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={save} disabled={busy || !!problem}>{busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} {mode === 'at' ? 'Schedule' : 'Make it ready'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The key is asked for only on the button, kept only while this dialog is open, and never written anywhere. */
const StreamKeyDialog: React.FC<{ live: SocialLive; repeat: boolean; onClose: () => void }> = ({ live, repeat, onClose }) => {
  const { toast } = useToast();
  const [key, setKey] = useState<LiveStreamKey | null>(null);
  const [busy, setBusy] = useState(false);
  const shownBefore = live.key.shown_count > 0;

  const show = async () => {
    setBusy(true);
    try { setKey(await metaLiveApi.streamKey(live.id)); }
    catch (e) { toast({ title: 'No stream key', description: writeError(e, 'Facebook refused.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${what} copied` }); }
    catch { toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' }); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setKey(null); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stream key</DialogTitle>
          <DialogDescription className="break-words">For "{titleOf(live)}". Paste these two into your streaming app (OBS and most others ask for a server and a key).</DialogDescription>
        </DialogHeader>
        {!key ? (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Anyone with the key can stream to your Page. It is read from Facebook now, shown only to you, and not kept on this screen after you close it.</p>
            {shownBefore && <p className="text-xs text-gray-600">Shown {plural(live.key.shown_count, 'time')} before, last {ago(live.key.shown_at)}{live.key.shown_by ? ` to ${live.key.shown_by}` : ''}.{repeat ? '' : ' Your store shows it only once.'}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <KeyField label="Server" value={key.server} onCopy={() => copy(key.server, 'Server')} />
            {key.key ? <KeyField label="Stream key" value={key.key} secret onCopy={() => copy(key.key ?? '', 'Stream key')} />
              : <KeyField label="Stream address (server and key in one)" value={key.url} secret onCopy={() => copy(key.url, 'Stream address')} />}
            <p className="text-xs text-gray-600">{key.secure ? 'A secure address (RTMPS). ' : 'Your app must send plain RTMP for this address. '}{key.note}</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setKey(null); onClose(); }}>Close</Button>
          {!key && <Button onClick={show} disabled={busy || (!repeat && shownBefore)}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Show stream key</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const KeyField: React.FC<{ label: string; value: string; secret?: boolean; onCopy: () => void }> = ({ label, value, secret, onCopy }) => (
  <div className="space-y-1">
    <span className="text-xs font-medium text-gray-600">{label}</span>
    <div className="flex min-w-0 items-center gap-1.5">
      <Input readOnly value={value} aria-label={label} className={cn('h-9 min-w-0 flex-1 font-mono text-xs', secret && 'bg-amber-50')} onFocus={(e) => e.currentTarget.select()} autoComplete="off" spellCheck={false} />
      <Button size="sm" variant="outline" onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`}><Copy /> Copy</Button>
    </div>
  </div>
);

const ConfirmDialog: React.FC<{ live: SocialLive; what: 'end' | 'cancel'; onClose: () => void; onDone: () => void }> = ({ live, what, onClose, onDone }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await (what === 'end' ? metaLiveApi.end(live.id) : metaLiveApi.cancel(live.id));
      toast({ title: what === 'end' ? 'Live ended' : 'Live cancelled' });
      onDone();
    } catch (e) { toast({ title: what === 'end' ? 'Not ended' : 'Not cancelled', description: writeError(e, 'Facebook refused.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{what === 'end' ? 'End this live now?' : 'Cancel this live?'}</DialogTitle>
          <DialogDescription className="break-words">"{titleOf(live)}"</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-gray-700">
          {what === 'end'
            ? `Viewers see it end at once${live.live_views ? ` (${num(live.live_views)} watching)` : ''}. Facebook keeps it on your Page as a video. Stop your streaming app afterwards.`
            : 'It is removed from Facebook and its stream key stops working. It stays listed here as cancelled.'}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{what === 'end' ? 'Keep it on air' : 'Keep it'}</Button>
          <Button variant="destructive" onClick={run} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {what === 'end' ? 'End live' : 'Cancel live'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The `live` group of the `social` store setting; only the keys a person changed are sent (merged on the server). */
type NumKey = 'min_followers' | 'max_days_ahead' | 'title_max' | 'comments_poll_seconds';
const NUMBERS: Array<{ k: NumKey; label: string; help: string }> = [
  { k: 'min_followers', label: 'Followers Meta asks for', help: 'Meta: a Page needs at least 100 followers to go live.' },
  { k: 'max_days_ahead', label: 'Latest start, days ahead', help: 'Meta takes a live up to 7 days ahead.' },
  { k: 'title_max', label: 'Most characters in a title', help: 'Meta: 254.' },
  { k: 'comments_poll_seconds', label: 'Seconds between comment reads while on air', help: 'Meta allows reading every few seconds.' },
];
const LiveSettingsDialog: React.FC<{ settings: LiveSettings; canWrite: boolean; onClose: () => void; onDone: () => void }> = ({ settings, canWrite, onClose, onDone }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<LiveSettings>(settings);
  const [busy, setBusy] = useState(false);
  const changed = (Object.keys(draft) as Array<keyof LiveSettings>).filter((k) => draft[k] !== settings[k]);
  const bad = NUMBERS.some(({ k }) => !Number.isInteger(Number(draft[k])) || Number(draft[k]) < 0);
  const save = async () => {
    setBusy(true);
    try {
      const patch: SocialSettingsGroups & { live: Partial<LiveSettings> } = { live: Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<LiveSettings> };
      await metaSocialApi.saveSettings(patch);
      toast({ title: 'Live settings saved' });
      onDone();
    } catch (e) { toast({ title: 'Not saved', description: writeError(e, 'The server refused.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[94vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live settings</DialogTitle>
          <DialogDescription>For this store. Meta's own rules are the defaults; change one only when Meta changes it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {NUMBERS.map(({ k, label, help }) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 basis-48"><Label htmlFor={`live-${k}`}>{label}</Label><p className="text-xs text-gray-500">{help}</p></div>
              <Input id={`live-${k}`} type="number" min={0} step={1} className="h-9 w-28" disabled={!canWrite} value={String(draft[k] ?? '')}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value === '' ? undefined : Number(e.target.value) }))} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><Label htmlFor="live-check">Check followers before scheduling</Label><p className="text-xs text-gray-500">Meta checks again itself.</p></div>
            <Switch id="live-check" checked={draft.check_followers !== false} disabled={!canWrite} onCheckedChange={(v) => setDraft((d) => ({ ...d, check_followers: v }))} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><Label htmlFor="live-repeat">Stream key may be shown again</Label><p className="text-xs text-gray-500">Off: shown once per live; every showing is logged either way.</p></div>
            <Switch id="live-repeat" checked={draft.key_repeat !== false} disabled={!canWrite} onCheckedChange={(v) => setDraft((d) => ({ ...d, key_repeat: v }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {canWrite && <Button onClick={save} disabled={busy || bad || !changed.length}>{busy && <Loader2 className="animate-spin" />} Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LivePanel;
