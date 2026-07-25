import React, { useEffect, useMemo, useState } from 'react';
import { analyticsAPI } from '../../services/analyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Megaphone, Smartphone, Repeat, HelpCircle } from 'lucide-react';

/**
 * Marketing analytics.
 *
 * What earned the revenue: paid vs organic, then broken down by channel,
 * campaign and device — the numbers you reconcile against ad spend. First-touch
 * credits the channel that INTRODUCED the customer; last-touch the one that
 * CLOSED the sale. Compare both before trusting any single ad platform's own
 * reporting.
 */

type Model = 'first' | 'last';

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

const CHANNEL_LABEL: Record<string, string> = {
  google_ads: 'Google Ads', meta_ads: 'Meta Ads', microsoft_ads: 'Microsoft Ads',
  tiktok_ads: 'TikTok Ads', organic_search: 'Organic Search', organic_social: 'Organic Social',
  referral: 'Referral', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp',
  affiliate: 'Affiliate', direct: 'Direct', other: 'Other',
};

const CHANNEL_COLOR: Record<string, string> = {
  google_ads: '#4285F4', meta_ads: '#0866FF', microsoft_ads: '#00A4EF', tiktok_ads: '#EE1D52',
  organic_search: '#34A853', organic_social: '#8B5CF6', referral: '#F59E0B',
  email: '#EC4899', sms: '#14B8A6', whatsapp: '#25D366', affiliate: '#6366F1',
  direct: '#9CA3AF', other: '#6B7280',
};

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const label = (c: string) => CHANNEL_LABEL[c] ?? c;

const Kpi: React.FC<{ title: string; value: string; sub?: string; icon: React.ReactNode; accent?: string }> =
  ({ title, value, sub, icon, accent }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold" style={accent ? { color: accent } : undefined}>{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );

/** A simple revenue-share bar, sorted, coloured by channel. */
const ShareBar: React.FC<{ rows: any[]; total: number }> = ({ rows, total }) => (
  <div className="space-y-2.5">
    {rows.map((r) => {
      const pct = total > 0 ? (r.revenue / total) * 100 : 0;
      const color = CHANNEL_COLOR[r.channel] ?? '#6B7280';
      return (
        <div key={r.channel}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {label(r.channel)}
              {r.is_paid && <Badge variant="outline" className="text-[9px] px-1 py-0">Paid</Badge>}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {inr(r.revenue)} · {r.orders} orders
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1.5)}%`, background: color }} />
          </div>
        </div>
      );
    })}
    {!rows.length && <p className="text-sm text-muted-foreground">No attributed orders in this period.</p>}
  </div>
);

const MarketingAnalytics: React.FC = () => {
  const [range, setRange] = useState('30d');
  const [model, setModel] = useState<Model>('last');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range, model]);

  const load = async () => {
    try {
      setLoading(true); setError(null);
      const days = RANGES.find((r) => r.key === range)?.days ?? null;
      const from = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : undefined;
      const res: any = await analyticsAPI.getMarketing({ from, model });
      setData(res?.data ?? res);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load marketing analytics');
    } finally { setLoading(false); }
  };

  const s = data?.summary ?? {};
  const totalRevenue = Number(s.revenue) || 0;
  const channels = useMemo(() => (data?.by_channel ?? []).slice().sort((a: any, b: any) => b.revenue - a.revenue), [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Marketing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What's driving orders — paid campaigns vs organic, by channel and campaign.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(['last', 'first'] as Model[]).map((m) => (
              <button key={m} onClick={() => setModel(m)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${model === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                title={m === 'last' ? 'Channel that closed the sale' : 'Channel that first introduced the customer'}>
                {m === 'last' ? 'Last touch' : 'First touch'}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border p-0.5">
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${range === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center p-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Attributed revenue" value={inr(s.revenue)} sub={`${s.orders ?? 0} orders · AOV ${inr(s.aov)}`} icon={<TrendingUp className="h-4 w-4" />} />
            <Kpi title="Paid share" value={`${s.paid_share ?? 0}%`} sub={`${inr(s.paid_revenue)} from ads`} icon={<Megaphone className="h-4 w-4" />} accent="#0866FF" />
            <Kpi title="Organic revenue" value={inr(s.organic_revenue)} sub={`${s.organic_orders ?? 0} orders`} icon={<TrendingUp className="h-4 w-4" />} accent="#34A853" />
            <Kpi title="Repeat rate" value={`${s.repeat_rate ?? 0}%`} sub={`avg ${Math.round(s.avg_days_to_convert ?? 0)}d to convert`} icon={<Repeat className="h-4 w-4" />} />
          </div>

          {data?.untracked?.orders > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{data.untracked.orders} orders</strong> ({inr(data.untracked.revenue)}) have no attribution yet —
                these are visits made before tracking was live, or where the storefront didn't send campaign data.
              </span>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by channel</CardTitle></CardHeader>
              <CardContent><ShareBar rows={channels} total={totalRevenue} /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> By device</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Device</th><th className="pb-2 text-right font-medium">Orders</th><th className="pb-2 text-right font-medium">Revenue</th>
                  </tr></thead>
                  <tbody>
                    {(data?.by_device ?? []).map((d: any) => (
                      <tr key={d.device} className="border-t">
                        <td className="py-2 capitalize">{d.device}</td>
                        <td className="py-2 text-right tabular-nums">{d.orders}</td>
                        <td className="py-2 text-right tabular-nums">{inr(d.revenue)}</td>
                      </tr>
                    ))}
                    {!(data?.by_device ?? []).length && <tr><td colSpan={3} className="py-3 text-muted-foreground">No data</td></tr>}
                  </tbody>
                </table>
                <div className="mt-4 flex gap-4 border-t pt-3 text-sm">
                  {(data?.new_vs_repeat ?? []).map((n: any) => (
                    <div key={n.type}>
                      <span className="text-xs capitalize text-muted-foreground">{n.type} customers</span>
                      <p className="font-semibold">{n.orders} · {inr(n.revenue)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Campaign performance (paid)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Campaign</th>
                      <th className="pb-2 font-medium">Channel</th>
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 text-right font-medium">Orders</th>
                      <th className="pb-2 text-right font-medium">New / Repeat</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">AOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.by_campaign ?? []).map((c: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="py-2 font-medium">{c.campaign}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[c.channel] ?? '#6B7280' }} />
                            {label(c.channel)}
                          </span>
                        </td>
                        <td className="py-2 text-muted-foreground">{c.source ?? '—'}</td>
                        <td className="py-2 text-right tabular-nums">{c.orders}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{c.new_orders} / {c.repeat_orders}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{inr(c.revenue)}</td>
                        <td className="py-2 text-right tabular-nums">{inr(c.aov)}</td>
                      </tr>
                    ))}
                    {!(data?.by_campaign ?? []).length && (
                      <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">
                        No paid campaigns tracked yet. Once you run ads with UTMs or click IDs, they'll appear here.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Top sources & mediums</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {(data?.by_source_medium ?? []).slice(0, 12).map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span className="truncate"><span className="font-medium">{r.source}</span>
                      <span className="text-muted-foreground"> / {r.medium}</span></span>
                    <span className="tabular-nums text-muted-foreground">{inr(r.revenue)} · {r.orders}</span>
                  </div>
                ))}
                {!(data?.by_source_medium ?? []).length && <p className="text-sm text-muted-foreground">No data.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default MarketingAnalytics;
