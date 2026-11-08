/**
 * Marketing > Insights > Ads analytics (`/panel/marketing/ads/analytics`, lane META-15A, contract META-W2 section C).
 *
 * Leads with what to act on (Meta alerts, then the period against the one before), then KPI tiles with the change
 * against the previous period, the store's own count beside Meta's (orders matched by click id and UTM), the
 * daily trend, a breakdown (age, gender, placement, device, region, product, hour, ad) and a table per campaign.
 * CSV export runs the same query on the server. Charts are the shared panel kit (`panelAnalytics/Kit`): one axis
 * per chart, theme colours, a table twin for every chart.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DateRangeBar, { DASHBOARD_PRESETS, useDateRange } from '@/components/panelAnalytics/DateRangeBar';
import { ChartCard, CompareBars, KpiTile, Segmented, TimeSeries, TwinTable, type SeriesDef } from '@/components/panelAnalytics/Kit';
import { SERIES } from '@/components/panelAnalytics/vizTheme';
import { useToast } from '@/hooks/use-toast';
import { saveBlob } from '@/lib/saveBlob';
import { minorToMajor } from '@/lib/v2/money';
import { metaAdsApi, type Attribution, type Breakdown, type InsightMetrics, type InsightsQuery } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { AlertSettingsDialog } from './AlertSettings';
import { Lead, LoadFailure, Section, ago, linkCls, money, num, plural, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { ADS_ROUTES, metaHref } from '../routes';
import { NeedsAdAccount, adAccountOf, roasText, toneOfAlert } from './shared';

/** Used only until the insights reply brings its own `choices` (META-10 sends them as data). */
const ATTRIBUTION: Array<{ key: Attribution; label: string }> = [
  { key: 'default', label: 'Account setting' }, { key: '7d_click_1d_view', label: '7 day click, 1 day view' },
  { key: '7d_click', label: '7 day click' }, { key: '1d_click', label: '1 day click' },
];
const BREAKDOWNS: Array<{ key: Breakdown; label: string }> = [
  { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' }, { key: 'placement', label: 'Placement' }, { key: 'device', label: 'Device' },
  { key: 'region', label: 'Region' }, { key: 'country', label: 'Country' }, { key: 'product_id', label: 'Product' }, { key: 'hour', label: 'Hour' }, { key: 'creative', label: 'Ad' },
];
const TRENDS = [
  { key: 'money', label: 'Spend and sales' }, { key: 'purchases', label: 'Purchases' }, { key: 'clicks', label: 'Clicks' }, { key: 'reach', label: 'Reach' },
] as const;

const cpp = (m: InsightMetrics) => (m.purchases ? Math.round(m.spend_minor / m.purchases) : null);

const AdsAnalyticsPage: React.FC = () => {
  const ctx = useMetaCtx();
  return (
    <div className="space-y-5">
      <MetaHeader title="Ads analytics" setup={ctx.setup} description="What your Meta ads spent and brought back, by day and by audience, next to what your store recorded." />
      {!adAccountOf(ctx) && ctx.setup ? <NeedsAdAccount ctx={ctx} /> : <Analytics canAct={ctx.can.ads} />}
    </div>
  );
};

const Analytics: React.FC<{ canAct: boolean }> = ({ canAct }) => {
  const { toast } = useToast();
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d', DASHBOARD_PRESETS);
  const [compare, setCompare] = useState<'previous' | 'none'>('previous');
  const [attribution, setAttribution] = useState<Attribution>('default');
  const [campaign, setCampaign] = useState('');
  const [breakdown, setBreakdown] = useState<Breakdown>('age');
  const [trend, setTrend] = useState<(typeof TRENDS)[number]['key']>('money');
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const base: InsightsQuery = {
    level: campaign ? 'campaign' : 'account', ids: campaign || undefined, from: range.from, to: range.to, attribution,
  };
  const key = [range.from, range.to, attribution, campaign].join('|');
  const main = useLoad(() => metaAdsApi.insights({ ...base, breakdown, compare }), [key, breakdown, compare]);
  const perCampaign = useLoad(() => metaAdsApi.insights({ ...base, level: 'campaign', breakdown: 'none' }), [key]);
  const campaigns = useLoad(() => metaAdsApi.tree({ level: 'campaign', page_size: 100 }), []);
  const alerts = useLoad(() => metaAdsApi.alerts(), []);

  const d = main.data;
  const cur = d?.currency || 'INR';
  const t = d?.totals;
  const p = d?.compare_totals ?? null;
  const vs = 'vs the period before';

  /** Read this range from Meta now; a long range becomes a report Meta prepares, read on the next refresh. */
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await metaAdsApi.syncInsights({ from: range.from, to: range.to });
      await Promise.all([main.reload(), perCampaign.reload()]);
      toast({ title: r.status === 'running' ? 'Meta is preparing a long report' : 'Updated from Meta', description: r.note ?? undefined });
    } catch (e) { toast({ title: 'Could not update', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' }); }
    finally { setSyncing(false); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await metaAdsApi.exportInsights({ ...base, breakdown, compare: 'none' });
      saveBlob(blob, `meta-ads-${breakdown}-${range.from ?? 'all'}-${range.to ?? 'now'}.csv`);
    } catch (e) { toast({ title: 'Could not export', description: writeError(e, 'The server did not make the file.'), variant: 'destructive' }); }
    finally { setExporting(false); }
  };

  const series: SeriesDef[] = trend === 'money'
    ? [{ key: 'spend', name: 'Spend', color: SERIES[0], kind: 'bar', money: true }, { key: 'sales', name: 'Sales (Meta)', color: SERIES[1], kind: 'line', money: true }]
    : trend === 'purchases' ? [{ key: 'purchases', name: 'Purchases', color: SERIES[0], kind: 'bar' }]
      : trend === 'clicks' ? [{ key: 'clicks', name: 'Clicks', color: SERIES[0], kind: 'bar' }]
        : [{ key: 'reach', name: 'Reach', color: SERIES[0], kind: 'area' }];
  const chartRows = useMemo(() => (d?.series ?? []).map((s) => ({
    bucket: s.date, spend: minorToMajor(s.spend_minor, cur), sales: minorToMajor(s.purchase_value_minor, cur), purchases: s.purchases, clicks: s.clicks, reach: s.reach,
  })), [d, cur]);

  const breakdownRows = (d?.rows ?? []).filter((r) => r.spend_minor > 0);
  const maxRoas = Math.max(0, ...breakdownRows.map((r) => r.roas ?? 0));
  const bestSeg = [...breakdownRows].filter((r) => r.spend_minor >= (t?.spend_minor ?? 0) * 0.05).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  const worstSeg = [...breakdownRows].filter((r) => r.spend_minor >= (t?.spend_minor ?? 0) * 0.05).sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))[0];

  // The server's own lists when it sends them; the fallback lists above otherwise.
  const breakdowns = (d?.choices?.breakdowns?.length ? d.choices.breakdowns.filter((b) => b.key !== 'none') : BREAKDOWNS) as Array<{ key: Breakdown; label: string }>;
  const attributions = (d?.choices?.attributions?.length ? d.choices.attributions : ATTRIBUTION) as Array<{ key: Attribution; label: string }>;
  const breakdownLabel = breakdowns.find((b) => b.key === breakdown)?.label ?? '';
  const metricColumns = (first: string) => [
    { key: 'label', label: first },
    { key: 'spend_minor', label: 'Spend', format: (v: number) => money(v, cur) },
    { key: 'purchases', label: 'Purchases', format: (v: number) => num(v) },
    { key: 'purchase_value_minor', label: 'Sales (Meta)', format: (v: number) => money(v, cur) },
    { key: 'roas', label: 'Return', format: (v: number | null) => roasText(v) },
    { key: 'cpp', label: 'Cost per purchase', format: (_: unknown, r: InsightMetrics) => (cpp(r) === null ? 'n/a' : money(cpp(r), cur)) },
    { key: 'ctr', label: 'CTR', format: (v: number | null) => (v == null ? 'n/a' : `${v.toFixed(2)}%`) },
    { key: 'impressions', label: 'Impressions', format: (v: number) => num(v) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} presets={DASHBOARD_PRESETS} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Compare" size="sm" value={compare} onChange={(k) => setCompare(k as typeof compare)} options={[{ key: 'previous', label: 'Compare with the period before' }, { key: 'none', label: 'No compare' }]} />
        <select aria-label="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="h-8 max-w-[16rem] rounded-md border bg-white px-2 text-xs">
          <option value="">All campaigns</option>
          {(campaigns.data?.rows ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Attribution" value={attribution} onChange={(e) => setAttribution(e.target.value as Attribution)} className="h-8 rounded-md border bg-white px-2 text-xs">
          {attributions.map((a) => <option key={a.key} value={a.key}>Attribution: {a.label}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {d && <span className="text-xs text-gray-500">Updated {ago(d.synced_at)}</span>}
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Bell /> Alert settings</Button>
          {canAct && <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing}>{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Update from Meta</Button>}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting || !d}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV</Button>
        </div>
      </div>

      {main.error && !d ? <LoadFailure failure={main.error} what="Ad insights (GET /api/v2/marketing/meta/insights) are not served yet." onRetry={main.reload} />
        : !d || !t ? <p className="text-sm text-gray-500">Loading...</p> : (
          <>
            <ActOn alerts={alerts.data ?? []} spend={t.spend_minor} value={t.purchase_value_minor} prevRoas={p?.roas ?? null} roas={t.roas} cur={cur}
              best={bestSeg ? `${bestSeg.label} (${roasText(bestSeg.roas)})` : null} worst={worstSeg && worstSeg !== bestSeg ? `${worstSeg.label} (${roasText(worstSeg.roas)})` : null} breakdownLabel={breakdownLabel} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label="Spend" value={money(t.spend_minor, cur)} delta={p ? { current: t.spend_minor, previous: p.spend_minor, label: vs, goodWhen: 'neutral' } : null} spark={d.series.map((s) => s.spend_minor)} />
              <KpiTile label="Sales from ads (Meta)" value={money(t.purchase_value_minor, cur)} delta={p ? { current: t.purchase_value_minor, previous: p.purchase_value_minor, label: vs } : null} spark={d.series.map((s) => s.purchase_value_minor)} />
              <KpiTile label="Return on spend" value={roasText(t.roas)} delta={p && t.roas !== null && p.roas !== null ? { current: t.roas, previous: p.roas, label: vs, previousText: roasText(p.roas) } : null} sub="Sales from ads divided by spend" />
              <KpiTile label="Cost per purchase" value={cpp(t) === null ? 'n/a' : money(cpp(t), cur)} delta={p && cpp(t) !== null && cpp(p) !== null ? { current: cpp(t)!, previous: cpp(p)!, label: vs, goodWhen: 'down' } : null} sub={`${plural(t.purchases, 'purchase')}`} />
              <KpiTile label="Click rate" value={t.ctr === null ? 'n/a' : `${t.ctr.toFixed(2)}%`} delta={p && t.ctr !== null && p.ctr !== null ? { current: t.ctr, previous: p.ctr, label: vs, mode: 'points' } : null} sub={`${num(t.clicks)} clicks`} />
              <KpiTile label="Cost per 1,000 impressions" value={t.cpm_minor === null ? 'n/a' : money(t.cpm_minor, cur)} delta={p && t.cpm_minor !== null && p.cpm_minor !== null ? { current: t.cpm_minor, previous: p.cpm_minor, label: vs, goodWhen: 'down' } : null} />
              <KpiTile label="Reach" value={num(t.reach)} delta={p ? { current: t.reach, previous: p.reach, label: vs } : null} sub={`${num(t.impressions)} impressions`} />
              <KpiTile label="Frequency" value={t.frequency === null ? 'n/a' : t.frequency.toFixed(2)} sub="Times each person saw an ad, on average" />
            </div>

            {(d.report?.running || (d.notes ?? []).length > 0) && (
              <div className="space-y-1 rounded-md border bg-white px-3 py-2 text-xs text-gray-600">
                {d.report?.running && <p className="font-medium text-gray-800">Meta is still preparing part of this range; the figures fill in on the next refresh.</p>}
                {(d.notes ?? []).map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}

            {d.store_truth && <StoreTruth meta={t} truth={d.store_truth} cur={cur} />}

            <ChartCard title="By day" sub={TRENDS.find((x) => x.key === trend)?.label}
              table={{
                columns: [
                  { key: 'bucket', label: 'Day' },
                  { key: 'spend', label: 'Spend', format: (v: number) => money(Math.round(v * 100), cur) },
                  { key: 'sales', label: 'Sales (Meta)', format: (v: number) => money(Math.round(v * 100), cur) },
                  { key: 'purchases', label: 'Purchases', format: (v: number) => num(v) },
                  { key: 'clicks', label: 'Clicks', format: (v: number) => num(v) },
                  { key: 'reach', label: 'Reach', format: (v: number) => num(v) },
                ],
                rows: chartRows,
              }}>
              <div className="mb-3 max-w-full overflow-x-auto">
                <Segmented label="Trend" size="sm" value={trend} onChange={(k) => setTrend(k as typeof trend)} options={TRENDS.map((x) => ({ key: x.key, label: x.label }))} />
              </div>
              <TimeSeries data={chartRows} series={series} granularity="day" money={trend === 'money'} height={280} />
            </ChartCard>

            <ChartCard title={`By ${breakdownLabel.toLowerCase()}`} sub="Return on spend per group; the table has every figure."
              action={<select aria-label="Break down by" value={breakdown} onChange={(e) => setBreakdown(e.target.value as Breakdown)} className="h-8 rounded-md border bg-white px-2 text-xs">
                {breakdowns.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>}
              table={{ columns: metricColumns(breakdownLabel), rows: breakdownRows, footer: { ...t, label: 'Total' }, empty: 'Nothing in this period.' }}>
              {breakdownRows.length ? (
                <CompareBars className="text-sm" rows={breakdownRows.map((r) => ({ label: r.label, value: r.roas ?? 0, text: `${roasText(r.roas)} on ${money(r.spend_minor, cur)}`, muted: maxRoas > 0 && (r.roas ?? 0) < 1 }))} />
              ) : <p className="text-sm text-gray-500">Nothing in this period.</p>}
            </ChartCard>

            <Section title="By campaign" hint="Open a campaign in the Ads Manager to change it." actions={<Link className={`${linkCls} text-sm`} to={metaHref(ADS_ROUTES.manager)}>Ads Manager</Link>}>
              {perCampaign.error && !perCampaign.data ? <LoadFailure failure={perCampaign.error} what="Insights per campaign are not served yet." onRetry={perCampaign.reload} />
                : <TwinTable columns={metricColumns('Campaign')} rows={(perCampaign.data?.rows ?? []).filter((r) => r.spend_minor > 0).sort((a, b) => b.spend_minor - a.spend_minor)} footer={perCampaign.data ? { ...perCampaign.data.totals, label: 'Total' } : undefined} empty="No campaign spent in this period." />}
            </Section>
          </>
        )}
      {settingsOpen && <AlertSettingsDialog canEdit={canAct} currency={cur} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); alerts.reload(); }} />}
    </div>
  );
};

const ActOn: React.FC<{
  alerts: Array<{ kind: string; text: string; id: string | null; level: string }>; spend: number; value: number; roas: number | null; prevRoas: number | null; cur: string;
  best: string | null; worst: string | null; breakdownLabel: string;
}> = ({ alerts, spend, value, roas, prevRoas, cur, best, worst, breakdownLabel }) => {
  const bad = alerts.filter((a) => toneOfAlert(a.kind) === 'bad');
  const lines = [
    ...alerts.map((a) => a.text),
    best && worst ? `By ${breakdownLabel.toLowerCase()}, ${best} returns the most and ${worst} the least.` : '',
  ].filter(Boolean);
  const title = spend === 0 ? 'No spend in this period'
    : `${money(spend, cur)} spent brought ${money(value, cur)} in sales Meta counts${roas !== null ? ` (${roasText(roas)}${prevRoas !== null ? `, was ${roasText(prevRoas)}` : ''})` : ''}`;
  return (
    <Lead tone={bad.length ? 'bad' : alerts.length ? 'warn' : 'good'} title={title}
      actions={alerts.length ? <Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(ADS_ROUTES.rules)}>Recommendations</Link></Button> : undefined}>
      {lines.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : 'Nothing needs you right now.'}
    </Lead>
  );
};

/** Meta's purchases and sales next to the orders the store matched to Meta (by click id and UTM). */
const StoreTruth: React.FC<{ meta: InsightMetrics; truth: { orders: number; revenue_minor: number; matched_by: string[] }; cur: string }> = ({ meta, truth, cur }) => {
  const share = meta.purchase_value_minor ? Math.round((truth.revenue_minor / meta.purchase_value_minor) * 100) : null;
  const storeRoas = meta.spend_minor ? truth.revenue_minor / meta.spend_minor : null;
  const by = truth.matched_by.map((m) => (m === 'click_id' ? "Meta's click id" : m === 'utm' ? 'UTM tags' : m)).join(' and ');
  return (
    <Section title="Meta's count next to your store's" hint={`Your store counts orders it can tie to Meta by ${by}; Meta also counts people who saw an ad and bought later.`}>
      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-gray-500">Sales</p>
          <CompareBars className="mt-2" rows={[
            { label: 'Meta says', value: meta.purchase_value_minor, text: money(meta.purchase_value_minor, cur), muted: true },
            { label: 'Store recorded', value: truth.revenue_minor, text: money(truth.revenue_minor, cur) },
          ]} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Orders</p>
          <CompareBars className="mt-2" rows={[
            { label: 'Meta says', value: meta.purchases, text: num(meta.purchases), muted: true },
            { label: 'Store recorded', value: truth.orders, text: num(truth.orders) },
          ]} />
        </div>
        <div className="text-sm text-gray-800">
          <p><b>{share === null ? 'n/a' : `${share}%`}</b> of the sales Meta claims show up as store orders from Meta.</p>
          <p className="mt-1">Return on spend by the store's count: <b>{roasText(storeRoas)}</b>.</p>
        </div>
      </div>
    </Section>
  );
};

export default AdsAnalyticsPage;
