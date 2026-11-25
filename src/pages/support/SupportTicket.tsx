/**
 * One ticket to Growcord (TICKETS-1): its facts, the conversation oldest first, and the reply box.
 *
 * The store's messages sit on the right, Growcord's on the left, status lines small in the middle.
 * Files sit under the message they came with; files sent with the ticket itself sit under its
 * first words. Read on open, after the person's own reply or close, and when they come back to
 * this browser tab (at most every 30 seconds); never on a timer. Without support.manage the page
 * is read only: no reply box and no Close button.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { BlockSkeleton, Btn, EmptyState, Page, SectionCard, StatusChip } from '@/components/erp';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { errorText, supportAPI } from '@/services/api';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/lib/utils';
import { useRefetchOnReturn } from '@/lib/pageActive';
import {
  PRIORITY_TONE, STATUS_TONE, asDetail, priorityText, relatedText, statusText,
  type Attachment, type TicketDetail, type TicketFile,
} from '@/lib/support';
import AttachmentPicker from '@/components/support/AttachmentPicker';
import TicketFileItem from '@/components/support/TicketFileItem';
import { sendAttachments } from '@/components/support/sendAttachments';

function Files({ ticketId, files }: { ticketId: string; files: TicketFile[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {files.map((f) => <TicketFileItem key={f.id} ticketId={ticketId} file={f} />)}
    </div>
  );
}

function Bubble({ mine, who, when, children }: { mine: boolean; who: string; when: string | null; children: React.ReactNode }) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')} data-thread-message={mine ? 'store' : 'growcord'}>
      <div className={cn('w-fit min-w-0 max-w-[85%] md:max-w-[70%]', mine && 'text-right')}>
        <div className="mb-1 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{who}</span>
          {when && <span>, {formatDateTime(when)}</span>}
        </div>
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-left text-sm text-gray-900',
            mine ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-white shadow-sm',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default function SupportTicket() {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPerm, user } = useAuth();
  const canManage = hasPerm('support.manage');

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const s = location.state as { notice?: unknown } | null;
    return typeof s?.notice === 'string' ? s.notice : null;
  });

  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const ask = useRef(0);

  // The notice handed over by New ticket is shown once, not again after a page reload.
  useEffect(() => {
    if ((location.state as { notice?: unknown } | null)?.notice) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const load = useCallback(async (quiet = false) => {
    if (!id) return;
    const n = (ask.current += 1);
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const d = asDetail(await supportAPI.get(id));
      if (n !== ask.current) return;
      if (!d) throw new Error('This ticket could not be read.');
      setDetail(d);
      setError(null);
    } catch (err) {
      if (n !== ask.current) return;
      setError(errorText(err, 'This ticket could not be loaded.'));
    } finally {
      if (n === ask.current) { setLoading(false); setRefreshing(false); }
    }
  }, [id]);

  useEffect(() => { setDetail(null); void load(); }, [load]);
  useRefetchOnReturn(() => { void load(true); });

  /** Files under their message; the ticket's own files (no message) go under its first words. */
  const { top, byMessage } = useMemo(() => {
    const byMessage = new Map<string, TicketFile[]>();
    const top: TicketFile[] = [];
    const ids = new Set((detail?.messages ?? []).map((m) => m.id));
    for (const f of detail?.files ?? []) {
      if (f.message_id && ids.has(f.message_id)) byMessage.set(f.message_id, [...(byMessage.get(f.message_id) ?? []), f]);
      else top.push(f);
    }
    return { top, byMessage };
  }, [detail]);

  const sendReply = async () => {
    if (!detail || sending) return;
    const words = reply.trim();
    if (!words && !files.length) { setReplyError('Write your reply, or add a file.'); return; }
    setReplyError(null);
    setSending('Sending');
    let messageId = '';
    try {
      // A reply of files only has no words: the server takes an empty body and the files follow.
      const m: any = await supportAPI.reply(detail.ticket.id, words);
      messageId = String(m?.id ?? '');
    } catch (err) {
      setReplyError(errorText(err, 'Your reply could not be sent. Please try again.'));
      setSending(null);
      return;
    }
    setReply('');
    if (files.length) {
      setSending(files.length === 1 ? 'Adding your file' : `Adding your ${files.length} files`);
      try {
        await sendAttachments(detail.ticket.id, files, messageId || undefined);
        setFiles([]);
      } catch (err) {
        setReplyError(`Your reply was sent, but the files were not added: ${errorText(err, 'the upload failed')}. Press Send again to add them.`);
      }
    }
    setSending(null);
    await load(true);
  };

  const closeTicket = async () => {
    if (!detail || closing) return;
    if (!window.confirm('Close this ticket? If you reply later, it opens again.')) return;
    setClosing(true);
    setReplyError(null);
    try {
      await supportAPI.close(detail.ticket.id);
      await load(true);
    } catch (err) {
      setReplyError(errorText(err, 'The ticket could not be closed. Please try again.'));
    } finally {
      setClosing(false);
    }
  };

  const back = (
    <Link to="/support" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
      <ArrowLeft className="size-4" /> All tickets
    </Link>
  );

  if (loading && !detail) {
    return (
      <Page width="narrow">
        {back}
        <div className="rounded-xl border border-gray-200 bg-white p-5"><BlockSkeleton lines={6} /></div>
      </Page>
    );
  }

  if (!detail) {
    return (
      <Page width="narrow">
        {back}
        <div className="rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={LifeBuoy}
            title={error ?? 'This ticket could not be found.'}
            action={<Btn variant="outline" onClick={() => load()}><RefreshCw /> Try again</Btn>}
          />
        </div>
      </Page>
    );
  }

  const t = detail.ticket;
  const done = t.status === 'closed' || t.status === 'resolved';
  const late = !!t.due_at && !done && new Date(t.due_at).getTime() < Date.now();
  const me = (user?.email ?? '').toLowerCase();
  const storeName = (name: string) => (me && name.toLowerCase() === me ? 'You' : name || 'Your team');

  return (
    <Page width="narrow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        <Btn variant="ghost" size="sm" onClick={() => load(true)} disabled={refreshing} title="Check for new answers">
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Btn>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          <span>{notice}</span>
          <button type="button" className="shrink-0" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-500">Ticket {t.ticket_number}</div>
            <h1 className="mt-0.5 break-words text-xl font-semibold text-gray-900">{t.subject}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip status={t.status} tone={STATUS_TONE[t.status] ?? 'neutral'} label={statusText(t.status)} />
              <StatusChip status={t.priority} tone={PRIORITY_TONE[t.priority] ?? 'neutral'} label={`${priorityText(t.priority)} priority`} />
            </div>
          </div>
          {canManage && t.status !== 'closed' && (
            <Btn variant="outline" onClick={closeTicket} disabled={closing}>
              {closing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Close ticket
            </Btn>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
          <Fact label="About">
            {relatedText(t.related_to)}
            {t.related_ref && <span className="text-gray-600">: {t.related_ref}</span>}
          </Fact>
          <Fact label="Needed by">
            {t.due_at
              ? <span className={late ? 'font-medium text-red-700' : undefined}>{formatDateTime(t.due_at)}{late ? ' (late)' : ''}</span>
              : <span className="text-gray-500">Not set</span>}
          </Fact>
          <Fact label="Growcord person on it">
            {t.assigned_to_name || <span className="text-gray-500">Not assigned yet</span>}
          </Fact>
          <Fact label="Raised by">
            {storeName(t.raised_by_name)}{t.created_at ? `, ${formatDateTime(t.created_at)}` : ''}
          </Fact>
          {t.status === 'resolved' && t.resolved_at && <Fact label="Solved on">{formatDateTime(t.resolved_at)}</Fact>}
          {t.status === 'closed' && t.closed_at && <Fact label="Closed on">{formatDateTime(t.closed_at)}</Fact>}
        </dl>
      </SectionCard>

      <section className="space-y-4" aria-label="Conversation" data-ticket-thread>
        <Bubble mine who={storeName(t.raised_by_name)} when={t.created_at}>
          {t.description
            ? <p className="whitespace-pre-wrap break-words">{t.description}</p>
            : <p className="text-gray-500">{t.subject}</p>}
          <Files ticketId={t.id} files={top} />
        </Bubble>

        {detail.messages.map((m) => {
          if (m.author_kind === 'system') {
            return (
              <div key={m.id} className="text-center text-xs text-gray-500" data-thread-message="system">
                <span className="rounded-full bg-gray-100 px-3 py-1">{m.body}</span>
                {m.created_at && <span className="ml-2">{formatDateTime(m.created_at)}</span>}
                <Files ticketId={t.id} files={byMessage.get(m.id) ?? []} />
              </div>
            );
          }
          const mine = m.author_kind === 'store';
          const words = m.body.trim();
          const own = byMessage.get(m.id) ?? [];
          return (
            <Bubble key={m.id} mine={mine} who={mine ? storeName(m.author_name) : `Growcord${m.author_name ? `, ${m.author_name}` : ''}`} when={m.created_at}>
              {words && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              {!words && !own.length && <p className="text-gray-500">No words and no files came with this message.</p>}
              <Files ticketId={t.id} files={own} />
            </Bubble>
          );
        })}
      </section>

      {canManage ? (
        <SectionCard title="Reply to Growcord" description={done ? `This ticket is ${t.status === 'closed' ? 'closed' : 'solved'}. Your reply opens it again.` : undefined}>
          <div className="space-y-3" data-ticket-reply>
            <Textarea
              value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={20000}
              placeholder="Write your reply" aria-label="Your reply" disabled={!!sending}
            />
            <AttachmentPicker items={files} onChange={setFiles} disabled={!!sending} />
            {replyError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{replyError}</p>}
            <div className="flex justify-end">
              <Btn onClick={sendReply} disabled={!!sending || (!reply.trim() && !files.length)}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ?? 'Send reply'}
              </Btn>
            </div>
          </div>
        </SectionCard>
      ) : (
        <p className="text-center text-xs text-gray-500">You can read this ticket. To reply, ask your store admin for the support permission.</p>
      )}
    </Page>
  );
}
