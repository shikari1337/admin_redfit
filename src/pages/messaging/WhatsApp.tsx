import React, { useCallback, useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsAppLiveStatus } from '@/components/templates/WhatsAppStatusPanel';
import type { MsgCatalogueEntry } from '@/services/api';
import type { Approval } from '@/lib/v2/messaging';
import ChannelOverview from '@/components/messaging/ChannelOverview';
import ChannelTemplates from '@/components/messaging/ChannelTemplates';
import SentLog from '@/components/messaging/SentLog';
import WhatsAppActions from '@/components/messaging/WhatsAppActions';
import WhatsAppConnection from '@/components/messaging/WhatsAppConnection';
import WhatsAppInbox from '@/components/messaging/WhatsAppInbox';
import AppCustomersWhatsAppCard from '@/components/messaging/AppCustomersWhatsAppCard';
import { MessagingHeader, MessagingTabs, SettingsPermNotice, useCommerceCatalogue, useNotificationRows, useTabParam } from '@/components/messaging/common';

/**
 * Messaging, WhatsApp: the one place for the store's WhatsApp: how it is
 * doing (Overview), what customers wrote back (Inbox), which number it goes out from (Connection), the Commerce
 * templates with their Meta approval (Templates), and every message sent
 * (Sent log). Lane ADMIN-MSG-1; contract MSG-0 section 4.
 *
 * Lane MENU-1 whatsapp: the Overview opens with what to act on; the inbox picker offers only the messages
 * Meta approved (the Notifications rows' approval, already read for the Sent log); the gateway's live
 * approval is asked only by someone with `settings.read`, the permission of its route.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'connection', label: 'Connection' },
  { key: 'templates', label: 'Templates' },
  { key: 'log', label: 'Sent log' },
] as const;

const WhatsApp: React.FC = () => {
  const { hasPerm } = useAuth();
  // Inbox + templates: the comms marketing pair. Connection: the `whatsapp_settings` row's settings.* (MSG-2).
  const canWrite = hasPerm('marketing.manage');
  const canReadConnection = hasPerm('settings.read') || hasPerm('settings.manage');
  const canWriteConnection = hasPerm('settings.manage');
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'overview');
  const catalogue = useCommerceCatalogue();
  const notes = useNotificationRows();
  const waEntries = catalogue.entries.filter((e) => e.def.channels.includes('whatsapp'));
  // One gateway check per page, shared by Connection and Templates; only once one of them is open, and only
  // for a caller its route admits (GET /comms/sms-templates/whatsapp/status is settings.read).
  const live = useWhatsAppLiveStatus(canReadConnection && (tab === 'connection' || tab === 'templates') && !catalogue.loading);

  // Meta's approval per message as the server stored it (`GET /comms/notifications`, cell `approval`).
  const approvalByKey = useMemo(() => {
    if (!notes.rows) return null;
    const m = new Map<string, Approval>();
    for (const r of notes.rows) m.set(r.key, r.channels.whatsapp?.approval ?? null);
    return m;
  }, [notes.rows]);
  const approvalOf = useCallback((e: MsgCatalogueEntry): Approval => {
    const m = approvalByKey;
    if (!m) return null;
    return m.get(e.def.key) ?? m.get(`commerce.${e.def.key}`) ?? m.get(e.def.event) ?? null;
  }, [approvalByKey]);

  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={MessageCircle} title="WhatsApp"
        purpose="Order updates, reminders and offers on WhatsApp, sent and received through Growcord's WhatsApp Platform: replies, the number, Meta approval, and what was sent." />
      <MessagingTabs label="WhatsApp" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && (
        <>
          <WhatsAppActions canReadConnection={canReadConnection} rows={notes.rows} rowsFailed={!!notes.failure} onOpen={setTab} />
          <ChannelOverview channel="whatsapp" />
        </>
      )}
      {tab === 'inbox' && <WhatsAppInbox canWrite={canWrite} entries={waEntries} approvalOf={approvalByKey ? approvalOf : undefined} />}
      {tab === 'connection' && (canReadConnection
        ? (
          <>
            <WhatsAppConnection canWrite={canWriteConnection} canWriteTemplates={canWrite} live={live} entries={waEntries} />
            {/* HMAPP-T4b: whether customers who have the store's app also get WhatsApp or SMS. */}
            <AppCustomersWhatsAppCard canWrite={canWriteConnection} />
          </>
        )
        : <SettingsPermNotice what="the WhatsApp connection" />)}
      {tab === 'templates' && <ChannelTemplates channel="whatsapp" catalogue={catalogue} canWrite={canWrite} live={canReadConnection ? live : undefined} />}
      {tab === 'log' && <SentLog channel="whatsapp" messages={notes.messages} />}
    </div>
  );
};

export default WhatsApp;
