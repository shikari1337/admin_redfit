/**
 * Marketing > Social > Comments (`/panel/marketing/social/comments`, lane META-15B, routes of META-12).
 *
 * One list for the Facebook Page, Instagram and Threads, fed by Meta's webhooks and an hourly read. Leads with how
 * many comments wait for an answer. Each comment can be answered in public, hidden or shown again, deleted, or
 * answered with one private message (Meta allows one, within the window the `social` setting keeps); that chat then
 * continues in the inbox. Every action names the person and lands in the connections audit log on the server.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Eye, Loader2, Lock, MessageSquareReply, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/erp';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { metaSocialApi, type SocialComment } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, ago, linkCls, plural, useLoad, writeError, type Tone } from '../common';
import { SOCIAL_ROUTES, metaHref } from '../routes';
import { ChannelMark, channelName, useSetup, useSocialChannels, when } from './shared';

/** Rows a page shows (a screen choice, not a store setting). */
const PAGE = 20;
const STATUS: Record<string, { text: string; tone: Tone }> = {
  open: { text: 'Waiting for an answer', tone: 'warn' }, replied: { text: 'Answered', tone: 'good' }, hidden: { text: 'Hidden', tone: 'neutral' }, deleted: { text: 'Deleted', tone: 'neutral' },
};

const CommentsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('marketing.manage');
  const canRemove = hasPerm('marketing.delete');
  const setupQ = useSetup();
  const chQ = useSocialChannels();
  const settingsQ = useLoad(() => metaSocialApi.settings().catch(() => null), []);
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('open');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const openQ = useLoad(() => metaSocialApi.comments({ status: 'open', limit: 1 }), []);
  const listQ = useLoad(
    () => metaSocialApi.comments({ channel: channel === 'all' ? undefined : channel, status, q: q || undefined, limit: PAGE, offset: (page - 1) * PAGE }),
    [channel, status, q, page],
  );
  const reload = () => { listQ.reload(); openQ.reload(); };
  const days = Number((settingsQ.data?.settings.comments as Record<string, unknown> | undefined)?.private_reply_days) || null;
  const waiting = openQ.data?.total ?? null;
  const channels = chQ.data ?? [];

  return (
    <div className="space-y-5">
      <MetaHeader title="Comments" setup={setupQ.data} description="Comments on your Facebook Page, Instagram and Threads posts, in one list. Answer, hide or message the person." />

      {openQ.error && !openQ.data ? <LoadFailure failure={openQ.error} what="Comments (GET /api/v2/marketing/social/comments) are not served yet." onRetry={openQ.reload} /> : (
        <>
          {waiting === null ? null : waiting > 0 ? (
            <Lead tone="warn" title={`${plural(waiting, 'comment')} waiting for an answer`}
              actions={status !== 'open' ? <Button size="sm" variant="outline" className="bg-white" onClick={() => { setStatus('open'); setPage(1); }}>Show them</Button> : undefined}>
              People see how fast a shop answers. Reply in public, or send one private message when it is about an order or their health.
            </Lead>
          ) : <Lead tone="good" title="Every comment has an answer">New comments appear here within minutes.</Lead>}

          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Channel" value={channel} onChange={(k) => { setChannel(k); setPage(1); }}
              options={[{ key: 'all', label: 'All' }, ...channels.map((c) => ({ key: String(c.key), label: channelName(String(c.key)) }))]} />
            <Segmented label="Status" value={status} onChange={(k) => { setStatus(k); setPage(1); }}
              options={[{ key: 'open', label: 'Waiting' }, { key: 'replied', label: 'Answered' }, { key: 'hidden', label: 'Hidden' }, { key: 'deleted', label: 'Deleted' }]} />
            <form className="flex min-w-0 flex-1 basis-56 items-center gap-1" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPage(1); }}>
              <Input aria-label="Search comments" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search words or names" className="h-9 min-w-0" />
              <Button type="submit" size="sm" variant="outline" aria-label="Search"><Search /></Button>
            </form>
          </div>

          <Section title={STATUS[status]?.text ?? 'Comments'} hint={listQ.data ? plural(listQ.data.total, 'comment') : undefined}>
            {listQ.error && !listQ.data ? <LoadFailure failure={listQ.error} what="Comments could not be read." onRetry={listQ.reload} />
              : !listQ.data ? <p className="text-sm text-gray-500">Loading...</p>
                : !listQ.data.comments.length ? <p className="text-sm text-gray-600">{status === 'open' ? 'Nothing waiting. Comments people leave on your posts show up here.' : 'None here.'}</p> : (
                  <ul className="-my-3 divide-y">
                    {listQ.data.comments.map((c) => <Row key={c.id} c={c} canWrite={canWrite} canRemove={canRemove} privateDays={days} onChanged={reload} />)}
                  </ul>
                )}
            {listQ.data && <Pagination className="mt-4" page={page} pageSize={PAGE} total={listQ.data.total} onPage={setPage} />}
          </Section>
        </>
      )}
    </div>
  );
};

const Row: React.FC<{ c: SocialComment; canWrite: boolean; canRemove: boolean; privateDays: number | null; onChanged: () => void }> = ({ c, canWrite, canRemove, privateDays, onChanged }) => {
  const { toast } = useToast();
  const [box, setBox] = useState<'reply' | 'private' | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const st = STATUS[c.status] ?? { text: c.status, tone: 'neutral' as Tone };
  const ageDays = c.commented_at ? (Date.now() - new Date(c.commented_at).getTime()) / 86_400_000 : 0;
  const privateClosed = privateDays !== null && ageDays > privateDays;
  const who = c.author.name ?? c.author.handle ?? 'Someone';

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast({ title: label }); setBox(null); setText(''); setConfirmDelete(false); onChanged(); }
    catch (e) { toast({ title: 'Not done', description: writeError(e, `${channelName(c.channel)} refused.`), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <li className="py-3">
      <div className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700" aria-hidden>{who.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium text-gray-900">{who}</span>
            {c.author.handle && c.author.handle !== who && <span className="text-xs text-gray-500">@{c.author.handle}</span>}
            <ChannelMark channel={c.channel} withName />
            <span className="text-xs text-gray-500" title={when(c.commented_at)}>{ago(c.commented_at)}</span>
            <StateChip tone={st.tone} className="ml-auto">{st.text}</StateChip>
          </div>
          {c.post_excerpt && <p className="truncate text-xs text-gray-500" title={c.post_excerpt}>On the post: {c.post_excerpt}</p>}
          <p className={cn('whitespace-pre-wrap break-words text-sm text-gray-900', (c.hidden || c.status === 'deleted') && 'text-gray-500')}>{c.text ?? ''}</p>
          {c.permalink && <a className={cn(linkCls, 'text-xs')} href={c.permalink} target="_blank" rel="noreferrer">See it on {channelName(c.channel)}</a>}
          {c.reply && (
            <div className={cn('rounded-md px-3 py-2 text-sm', c.reply.error ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-800')}>
              {c.reply.error ? <>Your reply did not go out: {c.reply.error}</> : <><span className="text-xs text-gray-500">Your reply{c.reply.by ? `, by ${c.reply.by}` : ''}{c.reply.at ? `, ${ago(c.reply.at)}` : ''}</span><br />{c.reply.text}</>}
            </div>
          )}
          {c.private_reply && (
            <p className="text-xs text-gray-600"><Lock className="mr-1 inline h-3 w-3" />Private message sent{c.private_reply.by ? ` by ${c.private_reply.by}` : ''}{c.private_reply.at ? `, ${ago(c.private_reply.at)}` : ''}. The chat continues in the <Link className={linkCls} to={metaHref(SOCIAL_ROUTES.inbox)}>Inbox</Link>.</p>
          )}

          {canWrite && c.status !== 'deleted' && box === null && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <Button size="sm" variant="outline" onClick={() => { setBox('reply'); setText(''); }}><MessageSquareReply /> Reply</Button>
              {!c.private_reply && <Button size="sm" variant="outline" onClick={() => { setBox('private'); setText(''); }} disabled={privateClosed} title={privateClosed ? `Meta allows a private message only within ${privateDays} days of the comment` : undefined}><Lock /> Message privately</Button>}
              <Button size="sm" variant="ghost" onClick={() => act(c.hidden ? 'Shown again' : 'Hidden', () => metaSocialApi.hideComment(c.id, !c.hidden))} disabled={busy}>{c.hidden ? <><Eye /> Show</> : <><EyeOff /> Hide</>}</Button>
              {canRemove && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 /> Delete</Button>}
            </div>
          )}
          {box && (
            <div className="space-y-2 rounded-md border bg-white p-2">
              <p className="text-xs text-gray-600">
                {box === 'reply'
                  ? `A public reply under the comment, as your ${channelName(c.channel)} account.`
                  : <>One private message to {who}{privateDays ? `; Meta allows one, within ${privateDays} days of the comment` : ''}. Their answer and the rest of the chat are in the <Link className={linkCls} to={metaHref(SOCIAL_ROUTES.inbox)}>Inbox</Link>.</>}
              </p>
              <Textarea aria-label={box === 'reply' ? 'Reply' : 'Private message'} rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setBox(null)} disabled={busy}>Cancel</Button>
                <Button size="sm" disabled={busy || !text.trim()}
                  onClick={() => (box === 'reply'
                    ? act('Reply posted', () => metaSocialApi.replyComment(c.id, text.trim()))
                    : act('Private message sent', () => metaSocialApi.privateReply(c.id, text.trim())))}>
                  {busy && <Loader2 className="animate-spin" />} {box === 'reply' ? 'Post reply' : 'Send message'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {confirmDelete && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmDelete(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Delete this comment?</DialogTitle><DialogDescription>{who} on {channelName(c.channel)}</DialogDescription></DialogHeader>
            <p className="break-words text-sm text-gray-800">"{c.text}"</p>
            <p className="text-sm text-gray-600">It is removed from {channelName(c.channel)} for good. To keep it out of sight without removing it, hide it instead.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button variant="destructive" disabled={busy} onClick={() => act('Comment deleted', () => metaSocialApi.deleteComment(c.id))}>{busy && <Loader2 className="animate-spin" />} Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
};

/** META-20: the Live tab lists a live video's comments with this same row (reply, hide, delete, private message). */
export { Row as CommentRow };

export default CommentsPage;
