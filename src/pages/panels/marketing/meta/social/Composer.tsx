/**
 * The Publisher's composer and post view (lane META-15B, routes of `docs/PORT_NOTES/META-12.md` section 1).
 *
 * One post to several channels: the channels and their limits come from `GET /social/channels` (the `social` store
 * setting), so every counter and check here reads a channel's own numbers. Media come from the store's gallery
 * through the shared media browser (its storage key is the gallery id the route takes). A post is saved as a draft,
 * scheduled at a time on the store's clock, or published now (saved, then `POST /social/posts/{id}/publish`). Once a
 * channel is published the server refuses edits and deletes, so such a post opens as its results, with a retry for
 * the channels that failed.
 */
import React, { useMemo, useState } from 'react';
import { Bookmark, ExternalLink, Heart, ImagePlus, Loader2, MessageCircle, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MediaLibraryBrowser, { type MediaFile } from '@/components/common/MediaLibraryBrowser';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fromStoreDateTimeInput, storeDateTimeInput } from '@/utils/date';
import { metaSocialApi, type SocialChannel, type SocialPost, type SocialPostInput, type SocialPostKind } from '@/lib/v2/areas/meta';
import { Lead, StateChip, linkCls, num, plural, writeError } from '../common';
import {
  ChannelMark, channelName, countHashtags, countLinks, countMentions, failedChannels, isLocked, limitProblems, metricLabel, metricValue,
  statusTone, statusWord, textLength, when,
} from './shared';

export interface ComposerCan { write: boolean; send: boolean; remove: boolean }
interface Picked { key: string; kind: string; name: string; url: string | null }

const KIND_WORD: Record<string, string> = { feed: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story' };
const KIND_HELP: Record<string, string> = {
  feed: 'Text with a picture, a few pictures or a video.',
  carousel: 'Several pictures or videos people swipe through.',
  reel: 'One vertical video.',
  story: 'One picture or video for a day; no text.',
};
/** The next half hour on the store's clock, as a `datetime-local` value. */
const nextSlot = (day?: string): string => {
  if (day) return `${day}T10:00`;
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return storeDateTimeInput(d);
};

const Composer: React.FC<{
  channels: SocialChannel[];
  post: SocialPost | null;
  day?: string;
  can: ComposerCan;
  onClose: () => void;
  onChanged: () => void;
}> = ({ channels, post, day, can, onClose, onChanged }) => {
  const [current, setCurrent] = useState<SocialPost | null>(post);
  const [editing, setEditing] = useState(!post || !isLocked(post));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[94vh] max-w-5xl gap-0 overflow-y-auto p-0">
        {current && !editing
          ? <PostView post={current} channels={channels} can={can} onClose={onClose} onEdit={() => setEditing(true)} onChanged={(p) => { setCurrent(p); onChanged(); }} />
          : <Editor key={current?.updated_at ?? 'new'} channels={channels} post={current} day={day} can={can} onClose={onClose}
              onDone={(p) => { setCurrent(p); setEditing(false); onChanged(); }} onDeleted={() => { onChanged(); onClose(); }} />}
      </DialogContent>
    </Dialog>
  );
};

/* The editor */

const Editor: React.FC<{
  channels: SocialChannel[]; post: SocialPost | null; day?: string; can: ComposerCan; onClose: () => void; onDone: (p: SocialPost) => void; onDeleted: () => void;
}> = ({ channels, post, day, can, onClose, onDone, onDeleted }) => {
  const { toast } = useToast();
  const usable = channels.filter((c) => c.can_publish);
  const [picked, setPicked] = useState<string[]>(post ? post.channels.map((c) => String(c.key)) : usable.map((c) => String(c.key)));
  const [kind, setKind] = useState<SocialPostKind>((post?.kind as SocialPostKind) ?? 'feed');
  const [text, setText] = useState(post?.text ?? '');
  const [own, setOwn] = useState<Record<string, string | null>>(() => Object.fromEntries((post?.channels ?? []).filter((c) => c.text != null).map((c) => [String(c.key), c.text])));
  const [media, setMedia] = useState<Picked[]>((post?.media ?? []).map((m) => ({ key: m.gallery_id ?? m.key, kind: m.kind, name: m.name ?? m.key, url: m.url })));
  const [link, setLink] = useState(post?.link ?? '');
  const [firstComment, setFirstComment] = useState(post?.first_comment ?? '');
  const [mode, setMode] = useState<'draft' | 'schedule' | 'now'>(post?.schedule_at ? 'schedule' : day ? 'schedule' : 'draft');
  const [at, setAt] = useState(post?.schedule_at ? storeDateTimeInput(post.schedule_at) : nextSlot(day));
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const chosen = channels.filter((c) => picked.includes(String(c.key)));
  const allows = (k: string) => k === 'feed' || chosen.every((c) => (k === 'carousel' ? c.limits.carousel : k === 'reel' ? c.limits.reels : c.limits.stories));
  const kinds = ['feed', 'carousel', 'reel', 'story'].filter(allows);
  const firstCommentOk = chosen.some((c) => c.limits.first_comment) && kind !== 'story';
  const textOf = (key: string) => own[key] ?? text;
  const problems = useMemo(() => chosen.flatMap((c) => limitProblems(c, kind === 'story' ? '' : textOf(String(c.key)), media, kind)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen, text, own, media, kind]);
  const scheduleIso = mode === 'schedule' ? fromStoreDateTimeInput(at) : null;

  const blocker = !picked.length ? 'Pick at least one channel.'
    : kind !== 'story' && !text.trim() && !media.length && !link.trim() ? 'Write something or add a picture.'
      : (kind === 'reel' || kind === 'story') && media.length !== 1 ? `A ${KIND_WORD[kind].toLowerCase()} takes exactly one file.`
        : kind === 'reel' && media.some((m) => m.kind !== 'video') ? 'A Reel is a video.'
          : kind === 'carousel' && media.length < 2 ? 'A carousel takes at least two files.'
            : mode === 'schedule' && !scheduleIso ? 'Pick the day and time to post.'
              : problems.length ? 'Fix what the channels refuse first.' : '';

  const input = (): SocialPostInput => ({
    channels: picked,
    text: kind === 'story' ? '' : text,
    per_channel: Object.fromEntries(Object.entries(own).filter(([k, v]) => picked.includes(k) && v != null).map(([k, v]) => [k, { text: v }])),
    media: media.map((m) => m.key),
    link: link.trim() || null,
    kind,
    first_comment: firstCommentOk ? firstComment.trim() || null : null,
    schedule_at: scheduleIso,
  });

  const save = async () => {
    setBusy(true); setError('');
    try {
      let saved = post ? await metaSocialApi.updatePost(post.id, input()) : await metaSocialApi.createPost(input());
      if (mode === 'now') saved = await metaSocialApi.publishPost(saved.id);
      toast({ title: mode === 'now' ? 'Sent to the channels' : mode === 'schedule' ? `Scheduled for ${when(scheduleIso)}` : 'Saved as a draft' });
      onDone(saved);
    } catch (e) { setError(writeError(e, 'The post was not saved.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!post) return;
    setBusy(true); setError('');
    try { await metaSocialApi.deletePost(post.id); toast({ title: 'Post deleted' }); onDeleted(); }
    catch (e) { setError(writeError(e, 'The post was not deleted.')); setConfirmDelete(false); }
    finally { setBusy(false); }
  };
  const toggleMedia = (f: MediaFile) => setMedia((cur) => (cur.some((m) => m.key === f.key) ? cur.filter((m) => m.key !== f.key) : [...cur, { key: f.key, kind: f.kind, name: f.name, url: f.url }]));

  return (
    <>
      <DialogHeader className="border-b px-4 py-3 sm:px-6">
        <DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>
        <DialogDescription>One post for each channel you pick; each channel's own limits are checked as you type.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Post to</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {channels.map((c) => {
                const key = String(c.key);
                const on = picked.includes(key);
                return (
                  <label key={key} className={cn('flex min-w-0 items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm', on && 'border-gray-900 ring-1 ring-gray-900', !c.can_publish && 'cursor-not-allowed opacity-70')}>
                    <input type="checkbox" className="mt-1" disabled={!c.can_publish} checked={on} onChange={(e) => setPicked(e.target.checked ? [...picked, key] : picked.filter((x) => x !== key))} />
                    <span className="min-w-0">
                      <ChannelMark channel={key} withName />
                      <span className="block truncate text-xs text-gray-600">{c.account ? (c.account.handle ? `@${c.account.handle}` : c.account.name) : c.reason ?? 'Not connected'}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p className="text-sm font-medium text-gray-900">Kind</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Segmented label="Kind of post" value={kind} onChange={(k) => setKind(k as SocialPostKind)} options={kinds.map((k) => ({ key: k, label: KIND_WORD[k] ?? k }))} />
              <span className="text-xs text-gray-500">{KIND_HELP[kind]}</span>
            </div>
          </div>

          {kind !== 'story' && (
            <div>
              <Label htmlFor="sp-text">Text</Label>
              <Textarea id="sp-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-1" placeholder="What do you want to say?" />
              <ul className="mt-1.5 space-y-1">
                {chosen.map((c) => {
                  const key = String(c.key);
                  const t = textOf(key);
                  const len = textLength(t, c.limits);
                  const over = !!c.limits.max_chars && len > c.limits.max_chars;
                  const parts = [`${num(len)} of ${num(c.limits.max_chars)} characters`];
                  if (c.limits.max_hashtags != null) parts.push(`${countHashtags(t)} of ${c.limits.max_hashtags} hashtags`);
                  if (c.limits.max_mentions != null) parts.push(`${countMentions(t)} of ${c.limits.max_mentions} mentions`);
                  if (c.limits.max_links != null) parts.push(`${countLinks(t)} of ${c.limits.max_links} links`);
                  return (
                    <li key={key} className="text-xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <ChannelMark channel={key} withName />
                        <span className={cn('tabular-nums', over ? 'font-semibold text-red-700' : 'text-gray-600')}>{parts.join(', ')}</span>
                        <button type="button" className={cn(linkCls, 'text-xs')} onClick={() => setOwn({ ...own, [key]: own[key] == null ? text : null })}>
                          {own[key] == null ? `Different text for ${channelName(key)}` : 'Use the shared text'}
                        </button>
                      </div>
                      {own[key] != null && (
                        <Textarea aria-label={`Text for ${channelName(key)}`} rows={3} value={own[key] ?? ''} onChange={(e) => setOwn({ ...own, [key]: e.target.value })} className="mt-1" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">Pictures and videos <span className="font-normal text-gray-500">({media.length}{chosen.length ? ` of at most ${Math.min(...chosen.map((c) => c.limits.max_media || Infinity))}` : ''})</span></p>
              <Button type="button" size="sm" variant="outline" onClick={() => setBrowsing(true)}><ImagePlus /> Add from store media</Button>
            </div>
            {!media.length ? <p className="mt-1 text-sm text-gray-500">None yet.</p> : (
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {media.map((m, i) => (
                  <li key={m.key} className="relative overflow-hidden rounded-md border bg-gray-50">
                    {m.url ? <img src={m.url} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-xs text-gray-500">{m.kind}</div>}
                    <span className="absolute left-1 top-1 rounded-full bg-gray-900 px-1.5 text-[11px] font-semibold text-white">{i + 1}</span>
                    <button type="button" aria-label={`Remove ${m.name}`} onClick={() => setMedia(media.filter((x) => x.key !== m.key))} className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-700 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
                    <p className="truncate px-1 py-0.5 text-[11px] text-gray-600" title={m.name}>{m.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {kind !== 'story' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sp-link">Link <span className="font-normal text-gray-500">(optional)</span></Label>
                <Input id="sp-link" value={link} onChange={(e) => setLink(e.target.value)} className="mt-1" placeholder="https://" inputMode="url" />
              </div>
              {firstCommentOk && (
                <div>
                  <Label htmlFor="sp-first">First comment <span className="font-normal text-gray-500">(optional)</span></Label>
                  <Input id="sp-first" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} className="mt-1" placeholder="Posted under it as your account" />
                </div>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <Lead tone="bad" title="The channels would refuse this">
              <ul className="list-disc space-y-0.5 pl-5">{problems.map((p, i) => <li key={i}>{p.text}</li>)}</ul>
            </Lead>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">When</legend>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Segmented label="When to post" value={mode} onChange={(k) => setMode(k as typeof mode)}
                options={[{ key: 'draft', label: 'Keep as draft' }, { key: 'schedule', label: 'Schedule' }, ...(can.send ? [{ key: 'now', label: 'Publish now' }] : [])]} />
              {mode === 'schedule' && <Input aria-label="Day and time, store time" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-auto" />}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {mode === 'schedule' ? 'Times are your store\'s. It goes out by itself at that time; you can change it until then.'
                : mode === 'now' ? 'It goes out to every channel picked as soon as you press the button.' : 'Nothing goes out until you schedule or publish it.'}
            </p>
          </fieldset>
        </div>

        <aside className="min-w-0 space-y-3">
          <p className="text-sm font-medium text-gray-900">Preview</p>
          {!chosen.length ? <p className="text-sm text-gray-500">Pick a channel to see how it looks.</p>
            : chosen.map((c) => <Preview key={String(c.key)} channel={c} kind={kind} text={textOf(String(c.key))} media={media} link={link} />)}
        </aside>
      </div>

      <DialogFooter className="flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <p className={cn('min-w-0 flex-1 text-sm', error ? 'text-red-700' : 'text-gray-600')} role="alert">{error || (blocker && !busy ? blocker : '')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {post && can.remove && (confirmDelete
            ? <><span className="self-center text-sm text-gray-800">Delete this post?</span><Button variant="destructive" onClick={remove} disabled={busy}>Delete</Button><Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button></>
            : <Button variant="ghost" className="text-red-700" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 /> Delete</Button>)}
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !!blocker || !can.write}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === 'now' ? <><Send /> Publish now</> : mode === 'schedule' ? 'Schedule' : 'Save draft'}
          </Button>
        </div>
      </DialogFooter>

      {browsing && (
        <Dialog open onOpenChange={(o) => { if (!o) setBrowsing(false); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Pick from your store's media</DialogTitle><DialogDescription>Each click adds or removes a file; they post in the order picked.</DialogDescription></DialogHeader>
            <MediaLibraryBrowser mode="picker" accept={kind === 'reel' ? 'video' : 'all'} selected={media[media.length - 1]?.url ?? null} onSelect={toggleMedia} height="55vh" />
            <DialogFooter><Button onClick={() => setBrowsing(false)}>Done ({plural(media.length, 'file')})</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

/* Previews: plain drawings of how each channel shows a post (the channels make the real one). */

const Preview: React.FC<{ channel: SocialChannel; kind: string; text: string; media: Picked[]; link: string }> = ({ channel, kind, text, media, link }) => {
  const key = String(channel.key);
  const name = channel.account?.name ?? channelName(key);
  const handle = channel.account?.handle ?? name;
  const first = media[0];
  const pic = (cls: string) => (first?.url
    ? <img src={first.url} alt="" className={cn('w-full object-cover', cls)} />
    : <div className={cn('flex w-full items-center justify-center bg-gray-100 text-xs text-gray-400', cls)}>No picture</div>);
  const avatar = <span className="inline-block h-7 w-7 shrink-0 rounded-full bg-gray-800" aria-hidden />;
  const body = (t: string, lines = 'line-clamp-5') => (t ? <p className={cn('whitespace-pre-wrap break-words text-[13px] leading-snug text-gray-900', lines)}>{t}</p> : null);

  if (kind === 'story') {
    return (
      <figure className="space-y-1">
        <figcaption><ChannelMark channel={key} withName /> <span className="text-xs text-gray-500">story</span></figcaption>
        <div className="relative mx-auto w-40 overflow-hidden rounded-xl bg-gray-900">
          {pic('aspect-[9/16]')}
          <span className="absolute left-2 top-2 flex items-center gap-1.5 text-[11px] font-semibold text-white">{avatar}{handle}</span>
        </div>
      </figure>
    );
  }
  if (key === 'instagram') {
    return (
      <figure className="space-y-1">
        <figcaption><ChannelMark channel={key} withName /></figcaption>
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold">{avatar}{handle}</div>
          <div className="relative">{pic(kind === 'reel' ? 'aspect-[4/5]' : 'aspect-square')}{media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 text-[11px] text-white">1/{media.length}</span>}</div>
          <div className="flex items-center gap-3 px-3 pt-2 text-gray-800"><Heart className="h-4 w-4" /><MessageCircle className="h-4 w-4" /><Send className="h-4 w-4" /><Bookmark className="ml-auto h-4 w-4" /></div>
          <div className="px-3 pb-3 pt-1 text-[13px]">{text ? <p className="line-clamp-4 whitespace-pre-wrap break-words"><b>{handle}</b> {text}</p> : null}
            {link && <p className="mt-1 text-[11px] text-gray-500">Links in a caption are not clickable on Instagram.</p>}</div>
        </div>
      </figure>
    );
  }
  if (key === 'threads') {
    return (
      <figure className="space-y-1">
        <figcaption><ChannelMark channel={key} withName /></figcaption>
        <div className="flex gap-2 rounded-lg border bg-white p-3">
          {avatar}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[13px] font-semibold">{handle}</p>
            {body(text, 'line-clamp-6')}
            {media.length > 0 && <div className="flex gap-1.5 overflow-hidden">{media.slice(0, 3).map((m) => (m.url ? <img key={m.key} src={m.url} alt="" className="h-20 w-16 rounded-md object-cover" /> : null))}</div>}
          </div>
        </div>
      </figure>
    );
  }
  return (
    <figure className="space-y-1">
      <figcaption><ChannelMark channel={key} withName /></figcaption>
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center gap-2 px-3 py-2">{avatar}<span className="min-w-0"><span className="block text-[13px] font-semibold">{name}</span><span className="block text-[11px] text-gray-500">Page post</span></span></div>
        <div className="px-3 pb-2">{body(text)}</div>
        {media.length > 1 ? (
          <div className="grid grid-cols-2 gap-0.5">{media.slice(0, 4).map((m) => (m.url ? <img key={m.key} src={m.url} alt="" className="aspect-square w-full object-cover" /> : <div key={m.key} className="aspect-square bg-gray-100" />))}</div>
        ) : media.length === 1 ? pic('aspect-[4/3]') : null}
        {link && !media.length && <div className="border-t bg-gray-50 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500">{link.replace(/^https?:\/\//, '').split('/')[0]}</div>}
      </div>
    </figure>
  );
};

/* A post that went out somewhere: its results per channel, and a retry for the ones that failed. */

export const PostView: React.FC<{ post: SocialPost; channels: SocialChannel[]; can: ComposerCan; onClose: () => void; onEdit: () => void; onChanged: (p: SocialPost) => void }> = ({ post, can, onClose, onEdit, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const failed = failedChannels(post);
  const retry = async () => {
    setBusy(true); setError('');
    try {
      const p = await metaSocialApi.publishPost(post.id);
      const still = failedChannels(p).length;
      toast({ title: still ? `${plural(still, 'channel')} failed again` : 'Published on every channel' });
      onChanged(p);
    } catch (e) { setError(writeError(e, 'It was not sent again.')); }
    finally { setBusy(false); }
  };
  return (
    <>
      <DialogHeader className="border-b px-4 py-3 sm:px-6">
        <DialogTitle className="flex flex-wrap items-center gap-2">Post <StateChip tone={statusTone(post.status)}>{statusWord(post.status)}</StateChip></DialogTitle>
        <DialogDescription>{post.published_at ? `Went out ${when(post.published_at)}` : post.schedule_at ? `Planned for ${when(post.schedule_at)}` : 'Not sent yet'}{post.scheduled_by ? `, scheduled by ${post.scheduled_by}` : ''}.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 px-4 py-4 sm:px-6">
        {failed.length > 0 && (
          <Lead tone="bad" title={`It failed on ${failed.map((c) => channelName(String(c.key))).join(' and ')}`}
            actions={can.send ? <Button size="sm" onClick={retry} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Try again</Button> : undefined}>
            <ul className="space-y-0.5">{failed.map((c) => <li key={String(c.key)}><b>{channelName(String(c.key))}:</b> {c.error ?? 'No reason was given.'}</li>)}</ul>
            <p className="mt-1">Fix the cause first (for a picture, pick another in a new post); trying again sends only to the channels that failed.</p>
          </Lead>
        )}
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0 space-y-2">
            {post.text && <p className="whitespace-pre-wrap break-words text-sm text-gray-900">{post.text}</p>}
            {post.link && <p className="break-all text-sm"><a className={linkCls} href={post.link} target="_blank" rel="noreferrer">{post.link}</a></p>}
            {post.first_comment && <p className="text-xs text-gray-600">First comment: {post.first_comment}</p>}
            {post.notes.length > 0 && (
              <ul className="space-y-0.5 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
                {post.notes.map((n, i) => <li key={i}>{n.channel ? <b>{channelName(n.channel)}: </b> : null}{n.message}</li>)}
              </ul>
            )}
          </div>
          {post.media.length > 0 && (
            <ul className="grid grid-cols-3 gap-1.5 md:grid-cols-2">
              {post.media.map((m) => <li key={m.key}>{m.url ? <img src={m.url} alt={m.name ?? ''} className="aspect-square w-full rounded-md object-cover" /> : <span className="block aspect-square rounded-md bg-gray-100" />}</li>)}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">On each channel</p>
          <ul className="mt-2 divide-y rounded-md border">
            {post.channels.map((c) => {
              const metrics = Object.entries(c.metrics ?? {}).map(([k, v]) => [k, metricValue(v)] as const).filter(([, v]) => v !== null).slice(0, 5);
              return (
                <li key={String(c.key)} className="space-y-1 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelMark channel={String(c.key)} withName />
                    <StateChip tone={statusTone(c.status)}>{statusWord(c.status)}</StateChip>
                    {c.published_at && <span className="text-xs text-gray-500">{when(c.published_at)}</span>}
                    {c.attempts ? <span className="text-xs text-gray-500">{plural(c.attempts, 'try', 'tries')}</span> : null}
                    {c.permalink && <a className={cn(linkCls, 'ml-auto inline-flex items-center gap-1 text-xs')} href={c.permalink} target="_blank" rel="noreferrer">Open on {channelName(String(c.key))} <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                  {c.text != null && c.text !== post.text && <p className="whitespace-pre-wrap break-words text-xs text-gray-700">Own text: {c.text}</p>}
                  {c.error && <p className="text-xs text-red-700">{c.error}</p>}
                  {c.first_comment_error && <p className="text-xs text-amber-800">The first comment was not posted: {c.first_comment_error}</p>}
                  {metrics.length > 0 && (
                    <p className="flex flex-wrap gap-x-3 text-xs text-gray-700">{metrics.map(([k, v]) => <span key={k}><b className="tabular-nums">{num(v)}</b> {metricLabel(k).toLowerCase()}</span>)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <DialogFooter className="gap-2 border-t px-4 py-3 sm:px-6">
        {!isLocked(post) && can.write && <Button variant="outline" onClick={onEdit}>Edit</Button>}
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
};

export default Composer;
