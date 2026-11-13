import React from 'react';
import { Handshake } from 'lucide-react';
import { Page, PageHeader, TabBar } from '@/components/erp';
import { useTabParam } from '@/components/messaging/common';
import { NotServed, useLoad } from '@/pages/panels/erp/shared';
import { isNotServed } from '@/lib/v2/erp';
import { getTerms } from '@/lib/v2/partners';
import PartnerApplications from '@/components/partners/PartnerApplications';
import PartnerMoney from '@/components/partners/PartnerMoney';
import PartnerTerms from '@/components/partners/PartnerTerms';
import { ProgrammeState } from '@/components/partners/common';

/**
 * PARTNERS: the store's partner (affiliate) programme (HMAPP design 60, AD02 to AD04). People who
 * apply in the app to earn by sharing; a person approves or refuses each one, releases held
 * commissions, and builds and pays the monthly payout batches through Books.
 *
 * Tabs follow the B2B page's pattern (`pages/B2B.tsx`). The terms read is loaded once here: every
 * tab needs to know whether the programme is on, and the platform's highest rate.
 *
 * Routes: Retain `/api/v2/retain/partners*` (lane HMAPP-T5, not on the live server yet).
 */
const TABS = [
  { key: 'applications', label: 'Applications and partners' },
  { key: 'money', label: 'Commissions and payouts' },
  { key: 'terms', label: 'Terms' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const Partners: React.FC = () => {
  const [tab, setTab] = useTabParam<TabKey>(TABS.map((t) => t.key), 'applications');
  const terms = useLoad(getTerms, []);

  return (
    <Page>
      <PageHeader
        icon={Handshake}
        title="Partners"
        description="People who earn by sharing your shop. A person checks every application, every held commission and every payout."
      />
      {terms.error && isNotServed(terms.error) ? (
        // One plain state for the whole page: every partner route ships in the same release.
        <NotServed what="The partner programme" />
      ) : (
        <>
          <ProgrammeState terms={terms} onOpenTerms={() => setTab('terms')} />
          <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />
          {tab === 'applications' && <PartnerApplications terms={terms.data} />}
          {tab === 'money' && <PartnerMoney />}
          {tab === 'terms' && <PartnerTerms terms={terms} />}
        </>
      )}
    </Page>
  );
};

export default Partners;
