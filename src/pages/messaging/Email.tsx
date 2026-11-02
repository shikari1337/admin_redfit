import React from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ChannelOverview from '@/components/messaging/ChannelOverview';
import ChannelTemplates from '@/components/messaging/ChannelTemplates';
import SentLog from '@/components/messaging/SentLog';
import EmailSender from '@/components/messaging/EmailSender';
import BrandingPanel from '@/components/messaging/BrandingPanel';
import { MessagingHeader, MessagingTabs, SettingsPermNotice, useCommerceCatalogue, useNotificationRows, useTabParam } from '@/components/messaging/common';

/**
 * MESSAGING ▸ EMAIL — the store's email in one place: how it is doing
 * (Overview), who it comes from and through which server (Sender & SMTP), the
 * header and footer it wears (Branding — the same form as Notifications ▸
 * Branding), the Commerce templates, and every email sent. Lane ADMIN-MSG-1.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sender', label: 'Sender & SMTP' },
  { key: 'branding', label: 'Branding' },
  { key: 'templates', label: 'Templates' },
  { key: 'log', label: 'Sent log' },
] as const;

const Email: React.FC = () => {
  const { hasPerm } = useAuth();
  // Templates: the comms template pair (marketing.*). The sender is the `smtp` store setting: settings.* (MSG-2).
  const canWrite = hasPerm('marketing.manage');
  const canReadSender = hasPerm('settings.read') || hasPerm('settings.manage');
  const canWriteSender = hasPerm('settings.manage');
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'overview');
  const catalogue = useCommerceCatalogue();
  const { messages } = useNotificationRows();

  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={Mail} title="Email"
        purpose="Order emails, receipts and reminders — who they come from, how they look, and what was sent." />
      <MessagingTabs label="Email" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <ChannelOverview channel="email" />}
      {tab === 'sender' && (canReadSender
        ? <EmailSender canWrite={canWriteSender} />
        : <SettingsPermNotice what="the email sender and SMTP account" />)}
      {tab === 'branding' && <BrandingPanel messages={messages} previewChannel="email" />}
      {tab === 'templates' && <ChannelTemplates channel="email" catalogue={catalogue} canWrite={canWrite} />}
      {tab === 'log' && <SentLog channel="email" messages={messages} />}
    </div>
  );
};

export default Email;
