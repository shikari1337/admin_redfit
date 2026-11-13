import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsAppLiveStatus } from '@/components/templates/WhatsAppStatusPanel';
import ChannelOverview from '@/components/messaging/ChannelOverview';
import ChannelTemplates from '@/components/messaging/ChannelTemplates';
import SentLog from '@/components/messaging/SentLog';
import WhatsAppConnection from '@/components/messaging/WhatsAppConnection';
import WhatsAppInbox from '@/components/messaging/WhatsAppInbox';
import AppCustomersWhatsAppCard from '@/components/messaging/AppCustomersWhatsAppCard';
import { MessagingHeader, MessagingTabs, SettingsPermNotice, useCommerceCatalogue, useNotificationRows, useTabParam } from '@/components/messaging/common';

/**
 * MESSAGING ▸ WHATSAPP — the one place for the store's WhatsApp: how it is
 * doing (Overview), what customers wrote back (Inbox), which number it goes out from (Connection), the Commerce
 * templates with their Meta approval (Templates), and every message sent
 * (Sent log). Lane ADMIN-MSG-1; contract MSG-0 §4.
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
  const { messages } = useNotificationRows();
  const waEntries = catalogue.entries.filter((e) => e.def.channels.includes('whatsapp'));
  // One gateway check per page, shared by Connection and Templates; only once one of them is open.
  const live = useWhatsAppLiveStatus((tab === 'connection' || tab === 'templates') && !catalogue.loading);

  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={MessageCircle} title="WhatsApp"
        purpose="Order updates, reminders and offers on WhatsApp, sent and received through Growcord’s WhatsApp Platform — replies, the number, Meta approval, and what was sent." />
      <MessagingTabs label="WhatsApp" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <ChannelOverview channel="whatsapp" />}
      {tab === 'inbox' && <WhatsAppInbox canWrite={canWrite} entries={waEntries} />}
      {tab === 'connection' && (canReadConnection
        ? (
          <>
            <WhatsAppConnection canWrite={canWriteConnection} canWriteTemplates={canWrite} live={live} entries={waEntries} />
            {/* HMAPP-T4b: whether customers who have the store's app also get WhatsApp or SMS. */}
            <AppCustomersWhatsAppCard canWrite={canWriteConnection} />
          </>
        )
        : <SettingsPermNotice what="the WhatsApp connection" />)}
      {tab === 'templates' && <ChannelTemplates channel="whatsapp" catalogue={catalogue} canWrite={canWrite} live={live} />}
      {tab === 'log' && <SentLog channel="whatsapp" messages={messages} />}
    </div>
  );
};

export default WhatsApp;
