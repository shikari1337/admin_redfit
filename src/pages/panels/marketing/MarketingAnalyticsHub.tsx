import React from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';
import { Page, PageHeader, StatCard, StatGrid, TabBar, CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { useTabParam } from '@/components/messaging/common';
import { LoadFailure, moneyMajor, num, plural, useLoad } from './meta/common';

/**
 * Marketing reports (`/panel/marketing/analytics`): the message campaigns' funnels, ad accounts' totals with the sales
 * their clicks brought, and where orders came from. Each tab reads one route: `GET /marketing-hub/analytics/campaigns`,
 * `/analytics/ads` (v2 `AnalyticsBlockView {currency, data}`) and `/analytics/attribution` (v2 `/attribution/analytics`).
 * The full attribution report (models, campaigns, devices) is Analytics, Marketing.
 */

const TABS = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'ads', label: 'Ad accounts' },
  { key: 'attribution', label: 'Where orders came from' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** A dashboard block's rows and the currency the server named for them. */
const block = (r: any): { data: any; currency: string } => ({ data: payload<any>(r), currency: r?.data?.currency ?? 'INR' });

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'No sends');
const label = (s: unknown) => String(s ?? 'direct').replace(/_/g, ' ');

const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={cn('px-3 py-2 font-medium first:pl-4 last:pr-4', right && 'text-right')}>{children}</th>
);
const Td: React.FC<{ children?: React.ReactNode; right?: boolean; className?: string }> = ({ children, right, className }) => (
  <td className={cn('px-3 py-2 first:pl-4 last:pr-4', right && 'text-right tabular-nums', className)}>{children}</td>
);

const Loading: React.FC = () => <div className={cn(CARD, 'p-6 text-sm text-gray-500')}>Loading the report...</div>;

const CampaignsTab: React.FC = () => {
  const q = useLoad(() => api.get('/marketing-hub/analytics/campaigns').then(block), []);
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Campaign results" onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const rows: any[] = Array.isArray(q.data.data) ? q.data.data : [];
  const cur = q.data.currency;
  if (!rows.length) return <div className={cn(CARD, 'p-6 text-center text-sm text-gray-500')}>No campaign has been sent yet.</div>;
  return (
    <div className={cn(CARD, 'overflow-x-auto')}>
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr className="border-b"><Th>Campaign</Th><Th>Channel</Th><Th>Status</Th><Th right>Sent</Th><Th right>Failed</Th><Th right>Opened</Th><Th right>Clicked</Th><Th right>Orders</Th><Th right>Cost</Th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((c) => {
            const sent = Number(c.recipients_sent ?? 0);
            return (
              <tr key={c.id}>
                <Td className="font-medium text-gray-900">{c.name}</Td>
                <Td className="text-xs uppercase">{c.channel}</Td>
                <Td className="text-xs capitalize">{c.status}</Td>
                <Td right>{num(sent)}</Td>
                <Td right className={Number(c.recipients_failed ?? 0) > 0 ? 'text-red-700' : undefined}>{num(Number(c.recipients_failed ?? 0))}</Td>
                <Td right>{pct(Number(c.opened ?? 0), sent)}</Td>
                <Td right>{pct(Number(c.clicked ?? 0), sent)}</Td>
                <Td right>{num(Number(c.converted ?? 0))}</Td>
                <Td right>{c.actual_cost != null ? moneyMajor(Number(c.actual_cost), cur) : 'Not billed'}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const AdsTab: React.FC = () => {
  const q = useLoad(() => api.get('/marketing-hub/analytics/ads').then(block), []);
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Ad results" onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const cur = q.data.currency;
  const platforms: any[] = q.data.data?.platforms ?? [];
  const paid: any[] = q.data.data?.attributed_revenue_90d ?? [];
  return (
    <div className="space-y-4">
      <div className={cn(CARD, 'overflow-x-auto')}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr className="border-b"><Th>Platform</Th><Th right>Campaigns</Th><Th right>Running</Th><Th right>Seen</Th><Th right>Clicks</Th><Th right>Spend</Th><Th right>Conversions</Th></tr>
          </thead>
          <tbody className="divide-y">
            {platforms.map((p) => (
              <tr key={p.platform}>
                <Td className="text-xs font-medium uppercase">{p.platform}</Td>
                <Td right>{num(Number(p.campaigns ?? 0))}</Td>
                <Td right>{num(Number(p.active ?? 0))}</Td>
                <Td right>{num(Number(p.impressions ?? 0))}</Td>
                <Td right>{num(Number(p.clicks ?? 0))}</Td>
                <Td right>{moneyMajor(Number(p.spend ?? 0), cur)}</Td>
                <Td right>{num(Math.round(Number(p.conversions ?? 0)))}</Td>
              </tr>
            ))}
            {!platforms.length && <tr><td colSpan={7} className="p-6 text-center text-gray-500">No ad account has campaigns yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <section className={cn(CARD, 'p-4')}>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Sales from ad clicks, last 90 days</h2>
        {!paid.length ? (
          <p className="text-sm text-gray-500">No order has come from an ad click yet.</p>
        ) : (
          <StatGrid cols={4}>
            {paid.map((r) => <StatCard key={r.channel} label={label(r.channel)} value={moneyMajor(Number(r.revenue ?? 0), cur)} sub={plural(Number(r.orders ?? 0), 'order')} />)}
          </StatGrid>
        )}
      </section>
    </div>
  );
};

const AttributionTab: React.FC = () => {
  const q = useLoad(() => api.get('/marketing-hub/analytics/attribution').then((r) => payload<any>(r)), []);
  if (q.error && !q.data) return <LoadFailure failure={q.error} what="Where orders came from" onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const a = q.data;
  const cur = a.currency ?? 'INR';
  const s = a.summary ?? {};
  const channels: any[] = Array.isArray(a.channels) ? a.channels : [];
  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <StatCard label="Orders" value={num(Number(s.orders ?? 0))} />
        <StatCard label="Sales" value={moneyMajor(Number(s.revenue ?? 0), cur)} />
        <StatCard label="From paid ads" value={moneyMajor(Number(s.paid_revenue ?? 0), cur)} sub={s.paid_share != null ? `${Number(s.paid_share).toFixed(1)}% of sales` : undefined} />
        <StatCard label="Repeat orders" value={s.repeat_rate != null ? `${Number(s.repeat_rate).toFixed(1)}%` : 'Not known'} />
      </StatGrid>
      <div className={cn(CARD, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr className="border-b"><Th>Channel</Th><Th right>Orders</Th><Th right>Sales</Th></tr>
          </thead>
          <tbody className="divide-y">
            {channels.map((c) => (
              <tr key={String(c.channel ?? 'direct')}>
                <Td className="capitalize">{label(c.channel)}</Td>
                <Td right>{num(Number(c.orders ?? 0))}</Td>
                <Td right>{moneyMajor(Number(c.revenue ?? 0), cur)}</Td>
              </tr>
            ))}
            {!channels.length && <tr><td colSpan={3} className="p-6 text-center text-gray-500">No orders in this window.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Every model, campaign and device: Analytics, Marketing.</p>
    </div>
  );
};

const MarketingAnalyticsHub: React.FC = () => {
  const [tab, setTab] = useTabParam<TabKey>(TABS.map((t) => t.key), 'campaigns');
  return (
    <Page>
      <PageHeader title="Marketing reports" icon={BarChart3} description="Campaign results, ad accounts and where orders came from." />
      <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'ads' && <AdsTab />}
      {tab === 'attribution' && <AttributionTab />}
    </Page>
  );
};

export default MarketingAnalyticsHub;
