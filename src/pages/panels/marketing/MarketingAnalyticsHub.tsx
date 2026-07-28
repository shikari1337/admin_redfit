import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * Marketing analytics — Campaigns / Ads / Attribution tabs (panel-native) plus
 * quick links to the full store & user analytics pages (existing modules).
 */
const TABS = ['campaigns', 'ads', 'attribution'] as const;

const MarketingAnalyticsHub: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]>('campaigns');
  const [campaignRows, setCampaignRows] = useState<any[]>([]);
  const [ads, setAds] = useState<any>(null);
  const [attr, setAttr] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    if (tab === 'campaigns') {
      api.get('/marketing-hub/analytics/campaigns').then((r) => setCampaignRows(payload(r) ?? []))
        .catch((e) => setError(e?.response?.data?.message ?? e.message));
    } else if (tab === 'ads') {
      api.get('/marketing-hub/analytics/ads').then((r) => setAds(payload(r)))
        .catch((e) => setError(e?.response?.data?.message ?? e.message));
    } else {
      api.get('/marketing-hub/analytics/attribution').then((r) => setAttr(payload(r)))
        .catch((e) => setError(e?.response?.data?.message ?? e.message));
    }
  }, [tab]);

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Marketing Analytics</h1>
          <p className="text-sm text-gray-500">
            Campaign funnels, ad performance and revenue attribution. Full store & user analytics live under{' '}
            <a href="/analytics/store" className="underline">Analytics</a> /{' '}
            <a href="/analytics/users" className="underline">Users</a>.
          </p>
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:bg-gray-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === 'campaigns' && (
        <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Campaign</th><th>Channel</th><th>Status</th>
                <th className="text-right">Sent</th><th className="text-right">Failed</th>
                <th className="text-right">Open</th><th className="text-right">Click</th>
                <th className="text-right">Conv.</th><th className="text-right">Cost ₹</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaignRows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-1.5 font-medium">{c.name}</td>
                  <td className="uppercase text-xs">{c.channel}</td>
                  <td className="capitalize text-xs">{c.status}</td>
                  <td className="text-right">{c.recipients_sent}</td>
                  <td className="text-right">{c.recipients_failed}</td>
                  <td className="text-right">{pct(c.opened, c.recipients_sent)}</td>
                  <td className="text-right">{pct(c.clicked, c.recipients_sent)}</td>
                  <td className="text-right">{c.converted}</td>
                  <td className="text-right font-mono">{c.actual_cost != null ? Number(c.actual_cost).toFixed(2) : '—'}</td>
                </tr>
              ))}
              {campaignRows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-gray-500">No campaign data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ads' && ads && (
        <div className="space-y-3">
          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="px-4 py-2">Platform</th><th className="text-right">Campaigns</th>
                  <th className="text-right">Active</th><th className="text-right">Impressions</th>
                  <th className="text-right">Clicks</th><th className="text-right">Spend ₹</th>
                  <th className="text-right">Conversions</th></tr>
              </thead>
              <tbody className="divide-y">
                {ads.platforms.map((p: any) => (
                  <tr key={p.platform}>
                    <td className="px-4 py-1.5 uppercase text-xs font-medium">{p.platform}</td>
                    <td className="text-right">{p.campaigns}</td>
                    <td className="text-right">{p.active}</td>
                    <td className="text-right">{Number(p.impressions).toLocaleString()}</td>
                    <td className="text-right">{Number(p.clicks).toLocaleString()}</td>
                    <td className="text-right font-mono">{Number(p.spend).toFixed(0)}</td>
                    <td className="text-right">{Number(p.conversions).toFixed(0)}</td>
                  </tr>
                ))}
                {ads.platforms.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-500">No ad campaigns yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold">Attributed paid revenue (90 days, proof-of-click)</div>
            {(ads.attributed_revenue_90d ?? []).length === 0
              ? <div className="text-sm text-gray-500">No orders attributed to paid channels yet.</div>
              : (
                <div className="flex flex-wrap gap-3">
                  {ads.attributed_revenue_90d.map((r: any) => (
                    <div key={r.channel} className="rounded border p-3 text-sm">
                      <div className="text-xs uppercase text-gray-500">{r.channel.replace('_', ' ')}</div>
                      <div className="text-lg font-bold">₹{Number(r.revenue).toFixed(0)}</div>
                      <div className="text-xs text-gray-400">{r.orders} orders</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {tab === 'attribution' && attr && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          {attr.summary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
              {Object.entries(attr.summary).slice(0, 8).map(([k, v]: any) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-xs uppercase text-gray-500">{k.replace(/_/g, ' ')}</div>
                  <div className="text-lg font-bold">{typeof v === 'number' ? v.toLocaleString() : String(v)}</div>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(attr.channels) && (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1">Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue ₹</th></tr>
              </thead>
              <tbody className="divide-y">
                {attr.channels.map((c: any) => (
                  <tr key={c.channel}>
                    <td className="py-1 capitalize">{String(c.channel ?? 'direct').replace(/_/g, ' ')}</td>
                    <td className="text-right">{c.orders}</td>
                    <td className="text-right font-mono">{Number(c.revenue ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-gray-400">Full attribution report (first/last-touch models, campaigns, devices): Analytics → Marketing.</p>
        </div>
      )}
    </div>
  );
};

export default MarketingAnalyticsHub;
