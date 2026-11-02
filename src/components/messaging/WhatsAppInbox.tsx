import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Inbox as InboxIcon, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Chip, EmptyState, BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime, formatTime } from '@/utils/date';
import type { MsgCatalogueEntry } from '@/services/api';
import { messagingAPI, errCode, inboxReplyErrText, dispatchStatusLabel, type InboxItem, type InboxThread } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * WhatsApp ▸ Inbox (MSG-0 §6, route 8): what customers wrote back — replies,
 * button taps — received by Growcord's WhatsApp Platform, readable and
 * answerable here. Inside WhatsApp's 24-hour customer-service window the store
 * may write freely; outside it only an approved template may be sent, so the
 * composer switches to a template picker (the server holds the window; this
 * screen only reads `window_open`). Polls every 20 s while open; no sockets.
 */
const POLL_MS = 20000;

const WhatsAppInbox: React.FC<{ canWrite: boolean; entries: MsgCatalogueEntry[] }> = ({ canWrite, entries }) => {
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await messagingAPI.inbox({ status });
      setItems(r.items); setCursor(r.cursor); setFailure(null);
    } catch (e: any) { setFailure(failureOf(e, 'Could not load the inbox.')); }
  }, [status]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => {
    if (failure?.gap) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, failure?.gap]);

  const more = async () => {
    if (!cursor) return;
    try { const r = await messagingAPI.inbox({ status, cursor }); setItems((x) => [...(x ?? []), ...r.items]); setCursor(r.cursor); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load more conversations.')); }
  };

  if (failure?.gap) {
    return <GapNotice what="The WhatsApp inbox (GET /comms/inbox) is not on this server yet. Customers’ replies still reach the WhatsApp Platform." />;
  }

  return (
    <div className="grid min-h-[60vh] overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className={cn('flex min-h-0 flex-col border-line md:border-r', openId && 'hidden md:flex')}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <div role="group" aria-label="Which conversations" className="inline-flex rounded-md border border-line p-0.5 text-xs">
            {(['open', 'all'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                className={cn('rounded px-2 py-0.5 font-medium', status === s ? 'bg-surface-2 text-ink' : 'text-ink-soft hover:text-ink')}>
                {s === 'open' ? 'Open' : 'All'}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-ink-mute">Checks every 20 s</span>
        </div>
        {failure && <div className="p-2"><ErrorNotice message={failure.message} onRetry={load} /></div>}
        {!items ? <div className="p-3"><BlockSkeleton lines={6} /></div> : items.length === 0 ? (
          <EmptyState icon={InboxIcon} title={status === 'open' ? 'No open conversations' : 'No conversations yet'}
            description="When a customer replies on WhatsApp, the conversation shows up here." />
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {items.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)} aria-current={openId === c.id || undefined}
                  className={cn('block w-full px-3 py-2.5 text-left hover:bg-surface-2', openId === c.id && 'bg-surface-2')}>
                  <div className="flex items-center gap-2">
                    <span className={cn('min-w-0 flex-1 truncate text-sm text-ink', c.unread > 0 && 'font-semibold')}>{c.contact.name || c.contact.phone_masked || 'Customer'}</span>
                    {c.last?.at && <span className="shrink-0 text-[11px] tabular-nums text-ink-mute">{formatTime(c.last.at)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{c.last?.direction === 'out' ? 'You: ' : ''}{c.last?.text || '—'}</span>
                    {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-ink" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                  </div>
                  {c.order_ref && <span className="mt-0.5 block text-[11px] text-ink-mute">Order {c.order_ref}</span>}
                </button>
              </li>
            ))}
            {cursor && <li className="p-2 text-center"><Button variant="ghost" size="sm" onClick={more}>Older conversations</Button></li>}
          </ul>
        )}
      </div>
      <div className={cn('min-h-0', !openId && 'hidden md:block')}>
        {openId ? (
          <Thread id={openId} canWrite={canWrite} entries={entries} onBack={() => setOpenId(null)} onChanged={load} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-ink-soft">Pick a conversation.</div>
        )}
      </div>
    </div>
  );
};

const Thread: React.FC<{ id: string; canWrite: boolean; entries: MsgCatalogueEntry[]; onBack: () => void; onChanged: () => void }> = ({ id, canWrite, entries, onBack, onChanged }) => {
  const { toast } = useToast();
  const [t, setT] = useState<InboxThread | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [text, setText] = useState('');
  const [tplKey, setTplKey] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLLIElement>(null);
  const markedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try { setT(await messagingAPI.inboxThread(id)); setFailure(null); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load this conversation.')); }
  }, [id]);
  useEffect(() => { setT(null); setText(''); setTplKey(''); setVars({}); load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);
  // Opening a conversation reads it — once per conversation.
  useEffect(() => {
    if (!t || markedRef.current === id) return;
    markedRef.current = id;
    messagingAPI.inboxRead(id).then(onChanged).catch(() => { /* reading is best-effort; the list stays as the server says */ });
  }, [t, id, onChanged]);

  // Outside the window only an approved WhatsApp template may go out.
  const templates = useMemo(() => entries.filter((e) => e.def.channels.includes('whatsapp')), [entries]);
  const tpl = templates.find((e) => e.def.key === tplKey) ?? null;

  const send = async () => {
    if (!t) return;
    setSending(true);
    try {
      if (t.window_open) await messagingAPI.inboxReply(id, { text: text.trim() });
      else if (tpl) await messagingAPI.inboxReply(id, { template_key: tpl.def.key, variables: vars });
      setText(''); setVars({});
      await load(); onChanged();
    } catch (e: any) {
      const closed = errCode(e) === 'comms.wrong_state' || e?.response?.status === 409;
      toast({
        variant: 'destructive', title: 'Not sent',
        // 409 comms.wrong_state = the 24-hour window closed (inbox.rs `reply`); the rest in the server's words.
        description: !closed && failureOf(e, '').gap ? 'Replying is not on this server yet.' : inboxReplyErrText(e),
      });
      // The window closed under us: re-read so the composer turns into the template picker.
      if (closed) load();
    } finally { setSending(false); }
  };

  const missingVar = tpl ? tpl.def.variables.some((v) => !(vars[v.key] ?? '').trim()) : true;
  const canSend = canWrite && !!t && !sending && (t.window_open ? !!text.trim() : !!tpl && !missingVar);
  const why = !canWrite ? 'Needs the marketing.manage permission'
    : t && !t.window_open && !tpl ? 'Outside the 24-hour window: pick an approved template'
      : t && !t.window_open && missingVar ? 'Fill every value of the template' : t?.window_open && !text.trim() ? 'Type a reply' : undefined;

  return (
    <div className="flex h-full max-h-[75vh] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{t?.contact.name || t?.contact.phone_masked || 'Conversation'}</p>
          {t?.contact.name && t.contact.phone_masked && <p className="font-mono text-[11px] text-ink-mute">{t.contact.phone_masked}</p>}
        </div>
        {t && (t.window_open
          ? <Chip tone="green">Reply window open{t.window_closes_at ? ` until ${formatTime(t.window_closes_at)}` : ''}</Chip>
          : <Chip tone="amber">Window closed — templates only</Chip>)}
      </div>
      {failure ? <div className="p-3">{failure.gap ? <GapNotice what="Reading a conversation is not on this server yet." /> : <ErrorNotice message={failure.message} onRetry={load} />}</div>
        : !t ? <div className="p-3"><BlockSkeleton lines={6} /></div> : (
          <>
            <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-2 p-3" aria-live="polite">
              {t.messages.length === 0 && <li className="text-center text-xs text-ink-soft">No messages yet.</li>}
              {t.messages.map((m) => (
                <li key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm', m.direction === 'out' ? 'bg-brand/10 text-ink' : 'bg-surface text-ink')}>
                    {m.template_key && <p className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-mute">Template {m.template_key}</p>}
                    {m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <p className="italic text-ink-soft">{m.kind.replace(/_/g, ' ')}</p>}
                    {m.media_url && <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-brand underline">Open attachment</a>}
                    <p className="mt-1 text-right text-[10px] tabular-nums text-ink-mute" title={formatDateTime(m.at)}>
                      {formatTime(m.at)}{m.direction === 'out' && m.status ? ` · ${dispatchStatusLabel(m.status)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
              <li ref={endRef} aria-hidden />
            </ol>
            <div className="space-y-2 border-t border-line p-3">
              {t.window_open ? (
                <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" aria-label="Reply" disabled={!canWrite}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) { e.preventDefault(); send(); } }} />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-ink-soft">The customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template.</p>
                  <select aria-label="Template" value={tplKey} onChange={(e) => { setTplKey(e.target.value); setVars({}); }} disabled={!canWrite}
                    className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm">
                    <option value="">Pick a template…</option>
                    {templates.map((e) => <option key={e.def.key} value={e.def.key}>{e.def.title}</option>)}
                  </select>
                  {tpl && tpl.def.variables.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tpl.def.variables.map((v) => (
                        <label key={v.key} className="block space-y-0.5 text-xs">
                          <span className="text-ink-soft">{v.description || v.key}</span>
                          <Input value={vars[v.key] ?? ''} placeholder={v.example} onChange={(e) => setVars((x) => ({ ...x, [v.key]: e.target.value }))} className="h-8" />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={send} disabled={!canSend} title={why}>
                  {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send
                </Button>
              </div>
            </div>
          </>
        )}
    </div>
  );
};

export default WhatsAppInbox;
