import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle, PlugZap, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlockSkeleton } from '@/components/erp';
import {
  messagingAPI, cellNeedsAttention, fmtCount,
  type NotificationRow, type WhatsAppConfig,
} from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';

/**
 * The WhatsApp Overview tab opens with what to act on, before the numbers (owner: dashboards lead with decisions).
 * Three questions, each answered by the server and each a link to the tab that fixes it:
 *  - can WhatsApp send at all (`GET /comms/whatsapp/config` status: `not_configured`, `off`, `ready`;
 *    asked only with `settings.read`, the route's own permission);
 *  - which messages are switched on but Meta has not approved (the Notifications rows the page already
 *    holds, judged by `cellNeedsAttention`, the same rule the Notifications page uses);
 *  - which chats wait for a reply while the 24 hour window is open (`GET /comms/inbox?status=open`, first page).
 * A question the server cannot answer here is left out, never guessed. Lane MENU-1 whatsapp.
 */
export type WaTab = 'inbox' | 'connection' | 'templates';

interface Item { key: string; tone: 'bad' | 'warn' | 'info'; icon: React.ComponentType<{ className?: string }>; text: string; detail?: string | null; tab: WaTab; action: string }

const TONE: Record<Item['tone'], string> = {
  bad: 'border-bad bg-bad-bg text-bad-ink',
  warn: 'border-warn bg-warn-bg text-warn-ink',
  info: 'border-info bg-info-bg text-info-ink',
};

const WhatsAppActions: React.FC<{
  canReadConnection: boolean;
  /** The page's Notifications rows (`null` while loading). */
  rows: NotificationRow[] | null;
  /** The rows could not be read: the approval question stays unanswered. */
  rowsFailed?: boolean;
  onOpen: (tab: WaTab) => void;
}> = ({ canReadConnection, rows, rowsFailed = false, onOpen }) => {
  const [cfg, setCfg] = useState<WhatsAppConfig | null | undefined>(undefined);
  const [waiting, setWaiting] = useState<{ n: number; more: boolean } | null | undefined>(undefined);

  const load = useCallback(async () => {
    const [c, inbox] = await Promise.allSettled([
      canReadConnection ? messagingAPI.whatsappConfig() : Promise.reject(new Error('no settings.read')),
      messagingAPI.inbox({ status: 'open', channel: 'whatsapp' }),
    ]);
    setCfg(c.status === 'fulfilled' ? c.value : null);
    setWaiting(inbox.status === 'fulfilled'
      ? { n: inbox.value.items.filter((i) => i.last?.direction === 'in' && i.window_open).length, more: !!inbox.value.cursor }
      : null);
  }, [canReadConnection]);
  useEffect(() => { load(); }, [load]);

  if (cfg === undefined || waiting === undefined || (rows === null && !rowsFailed)) {
    return <div aria-busy="true"><BlockSkeleton lines={2} /></div>;
  }

  const items: Item[] = [];
  if (cfg?.status === 'not_configured') {
    items.push({ key: 'number', tone: 'bad', icon: PlugZap, text: 'WhatsApp has no number to send from, so no WhatsApp message goes out.', detail: cfg.note, tab: 'connection', action: 'Open connection' });
  } else if (cfg && (cfg.status === 'off' || !cfg.enabled)) {
    items.push({ key: 'off', tone: 'warn', icon: PlugZap, text: 'WhatsApp sending is switched off; messages go by the next channel in your order.', detail: cfg.note, tab: 'connection', action: 'Open connection' });
  }
  const unapproved = (rows ?? []).filter((r) => !!cellNeedsAttention('whatsapp', r.channels.whatsapp));
  if (unapproved.length > 0) {
    const names = unapproved.slice(0, 3).map((r) => r.label).join(', ');
    items.push({
      key: 'approval', tone: 'warn', icon: ShieldAlert,
      text: `${fmtCount(unapproved.length)} message${unapproved.length === 1 ? ' is' : 's are'} switched on but cannot go out on WhatsApp yet.`,
      detail: `${names}${unapproved.length > 3 ? ` and ${fmtCount(unapproved.length - 3)} more` : ''}.`,
      tab: 'templates', action: 'Open templates',
    });
  }
  if (waiting && waiting.n > 0) {
    items.push({
      key: 'waiting', tone: 'info', icon: MessageCircle,
      text: `${fmtCount(waiting.n)}${waiting.more ? '+' : ''} chat${waiting.n === 1 && !waiting.more ? ' waits' : 's wait'} for your reply while you can still answer freely.`,
      detail: 'WhatsApp allows a free reply for 24 hours after the customer last wrote.',
      tab: 'inbox', action: 'Open inbox',
    });
  }

  if (items.length === 0) {
    // Say "all clear" only when every question was answered.
    const allAnswered = !!cfg && waiting !== null && !!rows;
    return (
      <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
        allAnswered ? 'border-good bg-good-bg text-good-ink' : 'border-line bg-surface text-ink-soft')}>
        {allAnswered ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <span>{allAnswered
          ? 'Nothing to act on: WhatsApp can send, every switched-on message is approved, and no chat is waiting.'
          : 'Nothing to act on in what this account can see. The number and the inbox need their own permissions to check.'}</span>
      </div>
    );
  }

  return (
    <section aria-label="To act on" className="space-y-2">
      <h2 className="text-sm font-semibold text-ink">To act on</h2>
      <ul className="space-y-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.key} className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5', TONE[it.tone])}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{it.text}</p>
                {it.detail && <p className="mt-0.5 text-xs opacity-90">{it.detail}</p>}
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8 bg-surface text-ink" onClick={() => onOpen(it.tab)}>{it.action}</Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default WhatsAppActions;
