import React from 'react';
import { Repeat } from 'lucide-react';
import RetentionJourneys from '@/components/messaging/RetentionJourneys';
import StockSignups from '@/components/messaging/StockSignups';
import { MessagingHeader, MessagingTabs, useTabParam } from '@/components/messaging/common';

/**
 * MESSAGING, RETENTION (lane ADMIN-REV-1, REV-0 plan): the journeys that bring
 * buyers back (welcome, cart and payment recovery, reorder reminder, win-back,
 * feedback after delivery) with their on/off switch and results, the button that
 * installs Retain's recommended set (all off until a person turns each on), the
 * reorder interval, and who signed up to hear when a sold-out product is back.
 * Every read is Retain's own route (`retentionAPI` in `lib/v2/messaging.ts`); a
 * route this server does not serve yet says so instead of going blank.
 */
const TABS = [
  { key: 'journeys', label: 'Journeys' },
  { key: 'signups', label: 'Back-in-stock sign-ups' },
] as const;

const Retention: React.FC = () => {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.key), 'journeys');
  return (
    <div className="space-y-4 pb-12">
      <MessagingHeader icon={Repeat} title="Retention"
        purpose="Messages that bring buyers back after an order, which ones are on and what they achieved, and who is waiting for a sold-out product." />
      <MessagingTabs label="Retention" tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'journeys' && <RetentionJourneys />}
      {tab === 'signups' && <StockSignups />}
    </div>
  );
};

export default Retention;
