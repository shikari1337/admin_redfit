/**
 * Marketing > Inbox (`/panel/marketing/inbox`, lane META-15B, contract META-W2 META-13): WhatsApp, Messenger and
 * Instagram chats in one inbox, one channel at a time (the Comms inbox serves one channel per list; META-13 PORT_NOTES
 * section 5 item 3). It opens with what to act on: chats waiting for a reply (oldest first, since their 24 hour
 * window closes first), unread chats per channel, a chat setting Meta refused, messages not reaching the inbox yet.
 * Then the store inbox itself (`components/messaging/WhatsAppInbox`, extended with the channel filter and the
 * customer card, not copied).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import WhatsAppInbox, { INBOX_POLL_MS } from '@/components/messaging/WhatsAppInbox';
import { useCommerceCatalogue } from '@/components/messaging/common';
import { INBOX_CHANNELS, INBOX_CHANNEL_LABEL, isGap, messagingAPI, type InboxChannel, type InboxItem } from '@/lib/v2/messaging';
import { metaApi } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { Lead, ago, linkCls, plural, useLoad } from '../common';
import { ADS_ROUTES, META_ROUTES, SOCIAL_ROUTES, metaHref } from '../routes';

interface ChannelSummary { items: InboxItem[]; unread: number; gap: boolean; error: boolean }

/** Each channel's open chats, read once for the summary and the filter's unread counts, again every poll. */
export function useInboxSummary(channels: InboxChannel[]) {
  const [byChannel, setByChannel] = useState<Partial<Record<InboxChannel, ChannelSummary>>>({});
  const load = useCallback(async () => {
    const pairs = await Promise.all(channels.map(async (c) => {
      try {
        const r = await messagingAPI.inbox({ channel: c, status: 'open' });
        return [c, { items: r.items, unread: r.items.filter((i) => i.unread > 0).length, gap: false, error: false }] as const;
      } catch (e) {
        return [c, { items: [], unread: 0, gap: isGap(e), error: !isGap(e) }] as const;
      }
    }));
    setByChannel(Object.fromEntries(pairs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.join(',')]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  return { byChannel, reload: load };
}

const InboxPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm('marketing.manage');
  const setupQ = useLoad(() => metaApi.setup(), []);
  const settingsQ = useLoad(() => messagingAPI.inboxSettings(), []);
  const catalogue = useCommerceCatalogue();
  const waEntries = catalogue.entries.filter((e) => e.def.channels.includes('whatsapp'));
  const { byChannel, reload } = useInboxSummary(INBOX_CHANNELS);

  const counts = Object.fromEntries(INBOX_CHANNELS.map((c) => [c, byChannel[c]?.unread ?? 0])) as Record<InboxChannel, number>;
  const waiting = INBOX_CHANNELS
    .flatMap((c) => (byChannel[c]?.items ?? []).filter((i) => i.window_open && i.last?.direction === 'in').map((i) => ({ ...i, channel: c })))
    .sort((a, b) => String(a.last?.at ?? '').localeCompare(String(b.last?.at ?? '')));
  const unreadTotal = INBOX_CHANNELS.reduce((n, c) => n + counts[c], 0);
  const failedPush = (settingsQ.data?.pushed ?? []).filter((p) => !p.ok);
  const messagingRow = setupQ.data?.items.find((i) => i.key === 'messaging') ?? null;
  const notReaching = messagingRow && messagingRow.state !== 'done';
  const name = (i: InboxItem) => i.contact.name || (i.contact.handle ? `@${i.contact.handle}` : '') || i.contact.phone_masked || 'A customer';
  const loaded = INBOX_CHANNELS.every((c) => byChannel[c]);

  return (
    <div className="space-y-5">
      <MetaHeader title="Inbox" setup={setupQ.data}
        description="WhatsApp, Messenger and Instagram chats in one place, with the customer's orders beside the chat."
        actions={(
          <>
            <Button size="sm" variant="outline" asChild><Link to={metaHref(SOCIAL_ROUTES.messengerSettings)}><Settings2 /> Messenger settings</Link></Button>
            <Button size="sm" variant="outline" asChild><Link to="/messaging/whatsapp?tab=templates">WhatsApp templates</Link></Button>
          </>
        )} />

      {notReaching && (
        <Lead tone="warn" title="Messenger and Instagram messages do not reach this inbox yet"
          actions={<Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(META_ROUTES.setup)}>Open setup</Link></Button>}>
          {messagingRow?.missing_permissions?.length ? `Meta has not allowed: ${messagingRow.missing_permissions.join(', ')}. Reconnect Meta and allow messages. ` : 'Finish the messaging row in setup. '}
          {messagingRow?.note ?? ''}
        </Lead>
      )}
      {failedPush.length > 0 && (
        <Lead tone="bad" title={`${failedPush.map((p) => INBOX_CHANNEL_LABEL[p.platform as InboxChannel] ?? p.platform).join(' and ')} did not take your chat settings`}
          actions={<Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(SOCIAL_ROUTES.messengerSettings)}>Open Messenger settings</Link></Button>}>
          {failedPush.map((p) => <p key={p.platform}>{p.error}</p>)}
        </Lead>
      )}
      {loaded && (waiting.length ? (
        <Lead tone="warn" title={`${plural(waiting.length, 'chat')} waiting for your reply`}>
          <p>The longest waiting close first: each chat takes free replies only within 24 hours of the customer's last message.</p>
          <ul className="mt-1 space-y-0.5">
            {waiting.slice(0, 4).map((i) => (
              <li key={i.id}><b>{name(i)}</b> on {INBOX_CHANNEL_LABEL[i.channel]}, waiting since {ago(i.last?.at)}{i.last?.text ? `: "${i.last.text.slice(0, 80)}${i.last.text.length > 80 ? '...' : ''}"` : ''}</li>
            ))}
            {waiting.length > 4 && <li>and {plural(waiting.length - 4, 'more chat')}</li>}
          </ul>
        </Lead>
      ) : unreadTotal ? (
        <Lead tone="info" title={`${plural(unreadTotal, 'unread chat')}`}>
          {INBOX_CHANNELS.filter((c) => counts[c]).map((c) => `${INBOX_CHANNEL_LABEL[c]} ${counts[c]}`).join(', ')}
        </Lead>
      ) : (
        <Lead tone="good" title="Every chat is answered">New messages show up here within 20 seconds.</Lead>
      ))}

      <WhatsAppInbox canWrite={canWrite} entries={waEntries} channels={INBOX_CHANNELS} counts={counts} onChanged={reload}
        adHref={(id) => metaHref(ADS_ROUTES.manager, { level: 'ad', focus: id })} />

      <p className="text-xs text-gray-500">
        Messages sent to your Page or Instagram account arrive here once Meta passes them on.
        {' '}<Link className={linkCls} to={metaHref(SOCIAL_ROUTES.comments)}>Comments on your posts</Link> have their own page.
      </p>
    </div>
  );
};

export default InboxPage;
