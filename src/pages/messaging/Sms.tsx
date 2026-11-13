import React from 'react';
import { Smartphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ChannelOverview from '@/components/messaging/ChannelOverview';
import ChannelTemplates from '@/components/messaging/ChannelTemplates';
import SentLog from '@/components/messaging/SentLog';
import DltPanel from '@/components/messaging/DltPanel';
import SmsGatewayPanel from '@/components/templates/SmsGatewayPanel';
import SmsRoutes from '@/components/messaging/SmsRoutes';
import { AccountBanner, MessagingHeader, MessagingTabs, useCommerceCatalogue, useNotificationRows, useTabParam } from '@/components/messaging/common';

/**
 * MESSAGING, SMS: the store's SMS in one place. How it is doing (Overview),
 * whose account and DLT sender it goes out on and which countries it reaches
 * (Provider), whether each message's words pass as its registered DLT text and
 * the fix (DLT mapping), the Commerce templates, and every SMS sent.
 * Lane ADMIN-MSG-1; MENU-1 sms added the DLT text check.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'provider', label: 'Provider' },
  { key: 'dlt', label: 'DLT mapping' },
  { key: 'templates', label: 'Templates' },
  { key: 'log', label: 'Sent log' },
] as const;

const Sms: React.FC = () => {
  const { hasPerm } = useAuth();
  // Templates: the comms template pair (marketing.*). Provider, DLT mapping: the `/sms-config` routes' settings.* (comms sms_config.rs).
  const canWrite = hasPerm('marketing.manage');
  const canWriteConfig = hasPerm('settings.manage');
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'overview');
  const catalogue = useCommerceCatalogue();
  const notes = useNotificationRows();

  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={Smartphone} title="SMS"
        purpose="OTPs, order updates and reminders by SMS: the account they go out on, their DLT registration, and what was sent." />
      <MessagingTabs label="SMS" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'overview' && <ChannelOverview channel="sms" />}
      {tab === 'provider' && (
        <div className="max-w-3xl space-y-4">
          <AccountBanner own={!!catalogue.cat?.smsOwnHeader}>
            {catalogue.cat?.smsOwnHeader
              ? 'Your own registered DLT sender is in use; your SMS end with your own signature.'
              : 'Growcord\'s DLT sender (header GRWCRD) is in use; your SMS name your store and end with -GROWCORD until you register your own header.'}
          </AccountBanner>
          <SmsRoutes />
          <div className="rounded-lg border border-line bg-surface p-4">
            <SmsGatewayPanel canWrite={canWriteConfig} showDlt={false} onChanged={() => { catalogue.reload(); notes.reload(); }} />
          </div>
          <p className="text-xs text-ink-soft">
            Whether each message passes as its registered DLT text, and the fix, is on the{' '}
            <button type="button" className="font-medium text-ink underline underline-offset-2 hover:no-underline" onClick={() => setTab('dlt')}>DLT mapping</button> tab.
          </p>
        </div>
      )}
      {tab === 'dlt' && <DltPanel canWrite={canWriteConfig} rows={notes.rows} onApplied={() => { catalogue.reload(); notes.reload(); }} />}
      {tab === 'templates' && <ChannelTemplates channel="sms" catalogue={catalogue} canWrite={canWrite} />}
      {tab === 'log' && <SentLog channel="sms" messages={notes.messages} />}
    </div>
  );
};

export default Sms;
