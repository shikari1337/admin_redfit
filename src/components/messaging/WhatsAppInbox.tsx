import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Inbox as InboxIcon, Loader2, Megaphone, Paperclip, Send, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Chip, EmptyState, BlockSkeleton } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime, formatDay, formatTime } from '@/utils/date';
import type { MsgCatalogueEntry } from '@/services/api';
import {
  messagingAPI, errCode, inboxReplyErrText, dispatchStatusLabel, INBOX_CHANNEL_LABEL,
  type InboxChannel, type InboxCustomer, type InboxItem, type InboxThread,
} from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from './common';

/**
 * The store inbox (MSG-0 section 6, route 8; META-13 adds Messenger and Instagram to the same model): what customers
 * wrote, readable and answerable here. WhatsApp, Messenger and Instagram all allow free replies only within 24 hours of
 * the customer's last message; outside it WhatsApp takes an approved template and Messenger and Instagram take
 * nothing until the customer writes again (the server holds the window; this screen reads `window_open`). Messenger
 * and Instagram threads carry the customer card (orders matched by a phone or e-mail shared in the chat) for staff who
 * may read orders. Polls every 20 seconds while open; no sockets.
 *
 * `channels` defaults to WhatsApp alone (Messaging, WhatsApp, Inbox); with more than one, a channel filter shows the
 * unread count the page passes in `counts`.
 */
export const INBOX_POLL_MS = 20000;

const chLabel = (c: string) => INBOX_CHANNEL_LABEL[c as InboxChannel] ?? c;
/** A message with no words: its kind as Meta or WhatsApp names it (`share`, `story_mention`, `image`), in words. */
const kindWord = (k: string) => { const t = k.replace(/_/g, ' ').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Message'; };

export interface WhatsAppInboxProps {
  canWrite: boolean;
  entries: MsgCatalogueEntry[];
  channels?: InboxChannel[];
  /** Unread chats per channel, for the filter (the page reads them once for its own summary). */
  counts?: Partial<Record<InboxChannel, number>>;
  /** Where an ad id opens (the Ads Manager), for chats that began from an ad. */
  adHref?: (adId: string) => string;
  /** Called after a read or a reply changes what is unread. */
  onChanged?: () => void;
}

const WhatsAppInbox: React.FC<WhatsAppInboxProps> = ({ canWrite, entries, channels = ['whatsapp'], counts, adHref, onChanged }) => {
  const [channel, setChannel] = useState<InboxChannel>(channels[0] ?? 'whatsapp');
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await messagingAPI.inbox({ status, channel });
      setItems(r.items); setCursor(r.cursor); setFailure(null);
    } catch (e: any) { setFailure(failureOf(e, 'Could not load the inbox.')); }
  }, [status, channel]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => {
    if (failure?.gap) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [load, failure?.gap]);

  const more = async () => {
    if (!cursor) return;
    try { const r = await messagingAPI.inbox({ status, channel, cursor }); setItems((x) => [...(x ?? []), ...r.items]); setCursor(r.cursor); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load more conversations.')); }
  };
  const changed = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  const pickChannel = (c: InboxChannel) => { setChannel(c); setOpenId(null); };

  if (failure?.gap) {
    return <GapNotice what={`The ${chLabel(channel)} inbox (GET /comms/inbox) is not on this server yet. Customers' messages still reach ${channel === 'whatsapp' ? 'the WhatsApp Platform' : 'Meta'}.`} />;
  }

  return (
    <div className="space-y-2">
      {channels.length > 1 && (
        <div role="group" aria-label="Channel" className="flex flex-wrap gap-1.5">
          {channels.map((c) => {
            const n = counts?.[c] ?? 0;
            return (
              <button key={c} type="button" aria-pressed={channel === c} onClick={() => pickChannel(c)}
                className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
                  channel === c ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-soft hover:text-ink')}>
                {chLabel(c)}
                {n > 0 && <span className={cn('rounded-full px-1.5 text-[11px] font-semibold', channel === c ? 'bg-surface text-ink' : 'bg-brand text-brand-ink')} aria-label={`${n} unread`}>{n}</span>}
              </button>
            );
          })}
        </div>
      )}
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
              description={`When a customer writes on ${chLabel(channel)}, the conversation shows up here.`} />
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpenId(c.id)} aria-current={openId === c.id || undefined}
                    className={cn('block w-full px-3 py-2.5 text-left hover:bg-surface-2', openId === c.id && 'bg-surface-2')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('min-w-0 flex-1 truncate text-sm text-ink', c.unread > 0 && 'font-semibold')}>{c.contact.name || (c.contact.handle ? `@${c.contact.handle}` : '') || c.contact.phone_masked || 'Customer'}</span>
                      {c.last?.at && <span className="shrink-0 text-[11px] tabular-nums text-ink-mute">{formatTime(c.last.at)}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{c.last?.direction === 'out' ? 'You: ' : ''}{c.last?.text || 'Attachment'}</span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-ink" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-mute">
                      {c.contact.name && c.contact.handle && <span>@{c.contact.handle}</span>}
                      {c.order_ref && <span>Order {c.order_ref}</span>}
                      {c.last?.direction === 'in' && c.window_open && <span className="font-medium text-amber-700">Waiting for your reply</span>}
                    </div>
                  </button>
                </li>
              ))}
              {cursor && <li className="p-2 text-center"><Button variant="ghost" size="sm" onClick={more}>Older conversations</Button></li>}
            </ul>
          )}
        </div>
        <div className={cn('min-h-0', !openId && 'hidden md:block')}>
          {openId ? (
            <Thread id={openId} channel={channel} canWrite={canWrite} entries={entries} adHref={adHref} onBack={() => setOpenId(null)} onChanged={changed} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-ink-soft">Pick a conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
};

/** The 24 hour rule in one plain sentence, per channel and state. */
function windowText(t: InboxThread): string {
  const ch = chLabel(t.channel);
  if (t.window_open) {
    return t.window_closes_at
      ? `${ch} lets you reply freely until ${formatTime(t.window_closes_at)} on ${formatDay(t.window_closes_at)}, 24 hours after the customer's last message.`
      : `${ch} lets you reply freely for 24 hours after the customer's last message.`;
  }
  return t.channel === 'whatsapp'
    ? 'The customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template.'
    : `The customer last wrote more than 24 hours ago, so ${ch} lets you send nothing until they write again. Their next message opens a new 24 hour window.`;
}

const Thread: React.FC<{
  id: string; channel: InboxChannel; canWrite: boolean; entries: MsgCatalogueEntry[]; adHref?: (adId: string) => string; onBack: () => void; onChanged: () => void;
}> = ({ id, channel, canWrite, entries, adHref, onBack, onChanged }) => {
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
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, INBOX_POLL_MS);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);
  // Opening a conversation reads it, once per conversation.
  useEffect(() => {
    if (!t || markedRef.current === id) return;
    markedRef.current = id;
    messagingAPI.inboxRead(id).then(onChanged).catch(() => { /* reading is best effort; the list stays as the server says */ });
  }, [t, id, onChanged]);

  const ch = (t?.channel ?? channel) as InboxChannel;
  const isWa = ch === 'whatsapp';
  // Outside the window only an approved WhatsApp template may go out; Messenger and Instagram have none yet.
  const templates = useMemo(() => entries.filter((e) => e.def.channels.includes('whatsapp')), [entries]);
  const tpl = isWa ? templates.find((e) => e.def.key === tplKey) ?? null : null;

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
        // 409 comms.wrong_state = the 24 hour window closed (inbox.rs `reply`); the rest in the server's words.
        description: !closed && failureOf(e, '').gap ? 'Replying is not on this server yet.' : inboxReplyErrText(e, ch),
      });
      // The window closed under us: re-read so the composer changes.
      if (closed) load();
    } finally { setSending(false); }
  };

  const missingVar = tpl ? tpl.def.variables.some((v) => !(vars[v.key] ?? '').trim()) : true;
  const canSend = canWrite && !!t && !sending && (t.window_open ? !!text.trim() : isWa && !!tpl && !missingVar);
  const why = !canWrite ? 'Needs the marketing.manage permission'
    : t && !t.window_open && !isWa ? 'Outside the 24 hour window: wait for the customer to write'
      : t && !t.window_open && !tpl ? 'Outside the 24 hour window: pick an approved template'
        : t && !t.window_open && missingVar ? 'Fill every value of the template' : t?.window_open && !text.trim() ? 'Type a reply' : undefined;
  const showCard = !isWa && !!t;

  return (
    <div className="flex h-full max-h-[80vh] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{t?.contact.name || (t?.contact.handle ? `@${t.contact.handle}` : '') || t?.contact.phone_masked || 'Conversation'}</p>
          <p className="truncate text-[11px] text-ink-mute">
            {chLabel(ch)}
            {t?.contact.handle && t.contact.name ? `, @${t.contact.handle}` : ''}
            {t?.contact.name && t.contact.phone_masked ? `, ${t.contact.phone_masked}` : ''}
          </p>
        </div>
        {t && (t.window_open
          ? <Chip tone="green">Reply window open{t.window_closes_at ? ` until ${formatTime(t.window_closes_at)}` : ''}</Chip>
          : <Chip tone="amber">{isWa ? 'Window closed: templates only' : 'Window closed: wait for the customer'}</Chip>)}
      </div>
      {failure ? <div className="p-3">{failure.gap ? <GapNotice what="Reading a conversation is not on this server yet." /> : <ErrorNotice message={failure.message} onRetry={load} />}</div>
        : !t ? <div className="p-3"><BlockSkeleton lines={6} /></div> : (
          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            {showCard && (
              <aside className="order-first shrink-0 border-b border-line bg-surface p-3 xl:order-last xl:w-72 xl:overflow-y-auto xl:border-b-0 xl:border-l" aria-label="Customer">
                <CustomerCard customer={t.customer ?? null} />
                {t.origin_ad_id && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft">
                    <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Began from an ad{adHref ? <> (<Link className="font-medium text-brand underline-offset-2 hover:underline" to={adHref(t.origin_ad_id)}>open the ad</Link>)</> : ` (${t.origin_ad_id})`}.</span>
                  </p>
                )}
              </aside>
            )}
            <div className="flex min-h-0 flex-1 flex-col">
              <ol className="min-h-[14rem] flex-1 space-y-2 overflow-y-auto bg-surface-2 p-3" aria-live="polite">
                {t.messages.length === 0 && <li className="text-center text-xs text-ink-soft">No messages yet.</li>}
                {t.messages.map((m) => (
                  <li key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm', m.direction === 'out' ? 'bg-brand/10 text-ink' : 'bg-surface text-ink')}>
                      {m.template_key && <p className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-mute">Template {m.template_key}</p>}
                      {m.deleted ? <p className="italic text-ink-soft">The customer removed this message.</p>
                        : m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <p className="italic text-ink-soft">{kindWord(m.kind)}</p>}
                      {!m.deleted && m.media_url && <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand underline"><Paperclip className="h-3 w-3" aria-hidden />Open attachment</a>}
                      {!m.deleted && (m.attachments ?? 0) > 1 && <p className="text-[11px] text-ink-mute">{m.attachments} attachments; the first is linked.</p>}
                      <p className="mt-1 text-right text-[10px] tabular-nums text-ink-mute" title={formatDateTime(m.at)}>
                        {formatTime(m.at)}{m.direction === 'out' && m.by ? `, ${m.by}` : ''}{m.direction === 'out' && m.status ? `, ${dispatchStatusLabel(m.status)}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
                <li ref={endRef} aria-hidden />
              </ol>
              <div className="space-y-2 border-t border-line p-3">
                <p className={cn('text-xs', t.window_open ? 'text-ink-soft' : 'text-amber-800')}>{windowText(t)}</p>
                {t.window_open ? (
                  <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" aria-label="Reply" disabled={!canWrite}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) { e.preventDefault(); send(); } }} />
                ) : isWa ? (
                  <div className="space-y-2">
                    <select aria-label="Template" value={tplKey} onChange={(e) => { setTplKey(e.target.value); setVars({}); }} disabled={!canWrite}
                      className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm">
                      <option value="">Pick a template</option>
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
                ) : null}
                {(t.window_open || isWa) && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={send} disabled={!canSend} title={why}>
                      {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

/** The store customer beside a Messenger or Instagram chat, matched by a phone or e-mail they shared (META-13). */
const CustomerCard: React.FC<{ customer: InboxCustomer | null }> = ({ customer }) => {
  if (!customer) {
    return (
      <div className="text-xs text-ink-soft">
        <p className="font-medium text-ink">No store customer matched yet</p>
        <p className="mt-0.5">Ask for a phone number or e-mail to see their orders here.</p>
      </div>
    );
  }
  const contact = [customer.phone_masked, customer.email_masked].filter(Boolean).join(', ');
  return (
    <div className="text-sm">
      <p className="font-semibold text-ink">{customer.name || 'Store customer'}</p>
      <p className="text-xs text-ink-soft">Matched by {customer.matched_by === 'email' ? 'e-mail' : 'phone'}{contact ? `: ${contact}` : ''}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-soft"><ShoppingBag className="h-3.5 w-3.5" aria-hidden />{customer.orders_found} order{customer.orders_found === 1 ? '' : 's'}{customer.more ? ', maybe more' : ''}</p>
      {customer.orders.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-md border border-line">
          {customer.orders.map((o) => (
            <li key={o.id} className="px-2 py-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/orders/${encodeURIComponent(o.id)}`} className="font-medium text-brand underline-offset-2 hover:underline">{o.number || 'Order'}</Link>
                <span className="tabular-nums text-ink">{o.total ?? ''}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2 text-ink-mute">
                <span>{[o.status, o.payment_status].filter(Boolean).map((x) => String(x).replace(/_/g, ' ')).join(', ')}</span>
                {o.at && <span>{formatDay(o.at)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WhatsAppInbox;
