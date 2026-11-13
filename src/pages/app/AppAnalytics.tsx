import React, { useMemo } from 'react';
import { Smartphone } from 'lucide-react';
import { Page, PageHeader } from '@/components/erp';
import DateRangeBar, { previousRange, useDateRange, type PanelRange } from '@/components/panelAnalytics/DateRangeBar';
import {
  ChartCard, CompareBars, InsightCard, KpiTile, TimeSeries, TwinTable, Unavailable, type Insight, type TileDelta,
} from '@/components/panelAnalytics/Kit';
import { SERIES } from '@/components/panelAnalytics/vizTheme';
import { ErrorNote, Loading, Notice, useLoad } from '@/pages/panels/erp/shared';
import { fmtRupees } from '@/lib/money';
import { codeLabel } from '@/lib/v2/appSettings';
import { getAppAnalytics, type AppAnalytics as Figures } from '@/lib/v2/appGrowth';

/**
 * APP ANALYTICS (HMAPP-3 point 7): what the app brings, beside the website. Installs, devices that
 * opened the app, app orders, sales and buyers against the website's, the steps from opening the
 * app to paying, how people searched, where installs came from, and buyers who came back. Every
 * figure is the server's (Insights, lane BB: `GET /api/v2/insights/app/analytics?from&to`,
 * `orders.read`, module analytics, the store's days); the screen computes only shares and the change against the
 * period before. A figure the server does not send says so; it is never shown as 0.
 *
 * The server counts searches without their words (by the way people searched: typed, spoken, a
 * scan), so no health word can reach this screen.
 */

const count = (n: number | null) => (n === null ? null : n.toLocaleString('en-IN'));
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);
const pctText = (n: number | null) => (n === null ? 'not given' : `${n < 10 ? n.toFixed(1) : Math.round(n)}%`);
const notGiven = (v: unknown) => (v === null || v === undefined ? 'not given' : Number(v).toLocaleString('en-IN'));

function rangeWords(r: PanelRange): string {
  if (!r.from && !r.to) return 'all time';
  return `${r.from ?? 'the start'} to ${r.to ?? 'today'}`;
}

function delta(cur: number | null, prev: Figures | null, pick: (f: Figures) => number | null, label: string, money = false): TileDelta | null {
  if (cur === null || !prev) return null;
  const p = pick(prev);
  if (p === null) return null;
  return { current: cur, previous: p, label, previousText: money ? fmtRupees(p) : p.toLocaleString('en-IN') };
}

/** The funnel's step codes (`APP_FUNNEL_STEPS`, the server's keys) in words; a step it adds later reads as its code. */
const STEP_WORDS: Record<string, string> = {
  sessions: 'Opened the app',
  viewed_screen: 'Looked at a screen',
  searched: 'Searched',
  viewed_item: 'Viewed a product',
  added_to_cart: 'Added to the bag',
  began_checkout: 'Began checkout',
  added_payment: 'Chose how to pay',
  ordered: 'Placed an order',
};
const stepWords = (s: { step: string; label: string | null }) => s.label ?? STEP_WORDS[s.step] ?? codeLabel(s.step);

/** The few things worth acting on, each computed from the figures on this page. */
function insightsOf(f: Figures): Insight[] {
  const out: Insight[] = [];
  const appSales = f.app.sales;
  const webSales = f.website.sales;
  // The server's share is of every sale (website, app and other channels); without it, app against website.
  const share = f.app_share_of_sales !== null ? f.app_share_of_sales * 100
    : appSales !== null && webSales !== null ? pct(appSales, appSales + webSales) : null;
  if (appSales !== null && share !== null) {
    out.push({
      tone: 'info',
      title: `The app brought ${pctText(share)} of sales`,
      body: `${fmtRupees(appSales)} in the app${webSales !== null ? ` against ${fmtRupees(webSales)} on the website` : ''}.`,
      action: { label: 'See app offers', to: '/app/offers' },
    });
  }
  let worst: { from: string; to: string; rate: number } | null = null;
  for (let i = 1; i < f.funnel.length; i++) {
    const a = f.funnel[i - 1];
    const b = f.funnel[i];
    if (a.count <= 0) continue;
    const rate = (b.count / a.count) * 100;
    if (!worst || rate < worst.rate) worst = { from: stepWords(a), to: stepWords(b), rate };
  }
  if (worst) {
    out.push({
      tone: worst.rate < 30 ? 'bad' : 'info',
      title: `Most people stop between ${worst.from.toLowerCase()} and ${worst.to.toLowerCase()}`,
      body: `Only ${pctText(worst.rate)} go on to the next step there.`,
      action: { label: 'See the steps', to: '#app-funnel' },
    });
  }
  const searched = f.searches.reduce((s, r) => s + r.count, 0);
  const empty = f.searches.reduce((s, r) => s + (r.no_results ?? 0), 0);
  if (searched > 0 && empty > 0) {
    out.push({
      tone: empty / searched > 0.2 ? 'bad' : 'info',
      title: `${pctText(pct(empty, searched))} of app searches found nothing`,
      body: `${empty.toLocaleString('en-IN')} of ${searched.toLocaleString('en-IN')} searches showed no product. Names, spellings or missing items may be the reason.`,
      action: { label: 'Open products', to: '/products' },
    });
  }
  return out.slice(0, 3);
}

const AppAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const prevRange = useMemo(() => previousRange(range), [range]);
  const cur = useLoad(() => getAppAnalytics(range), [range.from, range.to]);
  const prev = useLoad(() => (prevRange ? getAppAnalytics(prevRange).catch(() => null) : Promise.resolve(null)), [prevRange?.from, prevRange?.to]);
  const f = cur.data;
  const p = prev.data ?? null;
  const vs = prevRange ? `vs ${rangeWords(prevRange)}` : '';

  const days = f?.days ?? [];
  const daySales = days.some((d) => d.app_sales !== null || d.web_sales !== null);
  const insights = useMemo(() => (f ? insightsOf(f) : []), [f]);
  const searchByWay = (f?.searches ?? []).some((s) => s.by_way);

  const funnelRows = (f?.funnel ?? []).map((s, i, all) => {
    const before = i > 0 ? all[i - 1].count : null;
    const rate = before ? (s.count / before) * 100 : null;
    return {
      label: stepWords(s),
      value: s.count,
      text: `${s.count.toLocaleString('en-IN')}${rate === null ? '' : ` (${pctText(rate)} of the step before)`}`,
    };
  });

  const channelRows = f ? [
    { label: 'App orders', value: f.app.orders ?? 0, text: notGiven(f.app.orders), muted: false },
    { label: 'Website orders', value: f.website.orders ?? 0, text: notGiven(f.website.orders), muted: true },
    { label: 'App sales', value: f.app.sales ?? 0, text: f.app.sales === null ? 'not given' : fmtRupees(f.app.sales), muted: false },
    { label: 'Website sales', value: f.website.sales ?? 0, text: f.website.sales === null ? 'not given' : fmtRupees(f.website.sales), muted: true },
    { label: 'App buyers', value: f.app.customers ?? 0, text: notGiven(f.app.customers), muted: false },
    { label: 'Website buyers', value: f.website.customers ?? 0, text: notGiven(f.website.customers), muted: true },
    ...((f.other.orders ?? 0) > 0 ? [
      { label: 'Other channels, orders', value: f.other.orders ?? 0, text: notGiven(f.other.orders), muted: true },
      { label: 'Other channels, sales', value: f.other.sales ?? 0, text: f.other.sales === null ? 'not given' : fmtRupees(f.other.sales), muted: true },
    ] : []),
  ] : [];

  return (
    <Page>
      <PageHeader
        icon={Smartphone}
        title="App analytics"
        description="What the app brings beside the website: installs, devices using it, orders and sales, the steps to an order, searches, where installs came from and who buys again."
        actions={<DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />}
      />

      {cur.loading && !f ? <Loading label="Reading the app's figures" /> : cur.error ? (
        <ErrorNote error={cur.error} what="App analytics" onRetry={() => void cur.reload()} />
      ) : f ? (
        <div className="space-y-4" aria-busy={cur.loading || undefined}>
          {insights.length > 0 && (
            <section aria-label="What to act on" className="grid gap-3 md:grid-cols-3">
              {insights.map((x) => <InsightCard key={x.title} insight={x} />)}
            </section>
          )}

          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Installs" value={count(f.installs)} unavailable={f.installs === null ? 'Not given by the server' : undefined}
              delta={delta(f.installs, p, (x) => x.installs, vs)} spark={days.map((d) => d.installs)} />
            <KpiTile label="Devices that opened the app" value={count(f.active_users)} unavailable={f.active_users === null ? 'Not given by the server' : undefined}
              sub={f.monthly_active !== null ? `${f.monthly_active.toLocaleString('en-IN')} in the last 30 days` : f.sessions !== null ? `${f.sessions.toLocaleString('en-IN')} sessions` : undefined}
              delta={delta(f.active_users, p, (x) => x.active_users, vs)} spark={days.map((d) => d.active_users)} />
            <KpiTile label="App orders" value={count(f.app.orders)} unavailable={f.app.orders === null ? 'Not given by the server' : undefined}
              sub={f.app_share_of_orders !== null ? `${pctText(f.app_share_of_orders * 100)} of all orders` : f.website.orders !== null ? `Website: ${f.website.orders.toLocaleString('en-IN')}` : undefined}
              delta={delta(f.app.orders, p, (x) => x.app.orders, vs)} />
            <KpiTile label="App sales" value={f.app.sales === null ? null : fmtRupees(f.app.sales)} unavailable={f.app.sales === null ? 'Not given by the server' : undefined}
              sub={f.website.sales !== null ? `Website: ${fmtRupees(f.website.sales)}` : undefined}
              delta={delta(f.app.sales, p, (x) => x.app.sales, vs, true)} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="App against the website" sub={`Orders' totals as the server counts them, ${rangeWords(range)}.`}>
              {f.app.orders !== null || f.website.orders !== null ? <CompareBars rows={channelRows} /> : <Unavailable>The server sent no order figures for this range.</Unavailable>}
            </ChartCard>
            <ChartCard
              title="Installs and devices by day"
              table={{
                columns: [
                  { key: 'day', label: 'Day' },
                  { key: 'installs', label: 'Installs', format: notGiven },
                  { key: 'active_users', label: 'Devices', format: notGiven },
                  { key: 'sessions', label: 'Sessions', format: notGiven },
                ],
                rows: days,
                empty: 'No day in this range.',
              }}
            >
              {days.length ? (
                <TimeSeries data={days} xKey="day" granularity="day" height={220}
                  series={[
                    { key: 'installs', name: 'Installs', color: SERIES[0], kind: 'bar' },
                    { key: 'active_users', name: 'Devices', color: SERIES[1], kind: 'line' },
                  ]} />
              ) : <Unavailable>The server sent no daily figures for this range.</Unavailable>}
            </ChartCard>
          </div>

          {daySales && (
            <ChartCard
              title="Sales by day, app and website"
              table={{
                columns: [
                  { key: 'day', label: 'Day' },
                  { key: 'app_sales', label: 'App sales', format: (v) => (v === null ? 'not given' : fmtRupees(v)) },
                  { key: 'web_sales', label: 'Website sales', format: (v) => (v === null ? 'not given' : fmtRupees(v)) },
                ],
                rows: days,
              }}
            >
              <TimeSeries data={days} xKey="day" granularity="day" money
                series={[
                  { key: 'app_sales', name: 'App', color: SERIES[0], kind: 'bar', money: true },
                  { key: 'web_sales', name: 'Website', color: SERIES[1], kind: 'line', money: true },
                ]} />
            </ChartCard>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div id="app-funnel">
              <ChartCard title="From opening the app to an order" sub="Sessions that reached each step, then the app orders placed, and the share that went on from the step before.">
                {funnelRows.length ? <CompareBars rows={funnelRows} /> : <Unavailable>The server sent no steps for this range.</Unavailable>}
              </ChartCard>
            </div>
            <ChartCard title="Searches in the app" sub={searchByWay ? 'By the way people searched. The server keeps no search words.' : 'As the server lists them.'}>
              <TwinTable
                columns={[
                  { key: 'term', label: searchByWay ? 'How' : 'Search', format: (v, row) => (row?.by_way ? codeLabel(String(v)) : String(v)) },
                  { key: 'count', label: 'Searches', format: (v) => Number(v).toLocaleString('en-IN') },
                  { key: 'no_results', label: 'Found nothing', format: notGiven },
                ]}
                rows={f.searches}
                empty="No search in this range."
                maxHeight={320}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Where installs came from" sub="The campaign, partner or source the server matched to each install.">
              <TwinTable
                columns={[
                  { key: 'channel', label: 'Channel', format: (v) => codeLabel(String(v)) },
                  { key: 'source', label: 'Source', format: (v) => v ?? '' },
                  { key: 'campaign', label: 'Campaign', format: (v) => v ?? '' },
                  { key: 'partner', label: 'Partner', format: (v) => v ?? '' },
                  { key: 'installs', label: 'Installs', format: (v) => Number(v).toLocaleString('en-IN') },
                ]}
                rows={f.install_sources}
                empty="No install source in this range."
                maxHeight={320}
              />
            </ChartCard>
            <ChartCard title="Phones">
              <TwinTable
                columns={[
                  { key: 'platform', label: 'Platform', format: (v) => codeLabel(String(v)) },
                  { key: 'installs', label: 'Installs', format: notGiven },
                  { key: 'active_users', label: 'Devices', format: notGiven },
                  { key: 'sessions', label: 'Sessions', format: notGiven },
                ]}
                rows={f.platforms}
                empty="No platform figure in this range."
                maxHeight={320}
              />
            </ChartCard>
          </div>

          <ChartCard title="Who comes back" sub={f.retention.length ? 'Of the devices that installed the app in this range, the share that opened it again after so many days.' : 'Buyers in this range, and how many of them hold two orders or more.'}>
            {f.retention.length ? (
              <CompareBars rows={f.retention.map((r) => ({
                label: r.label ?? `After ${r.after_days} ${r.after_days === 1 ? 'day' : 'days'}`,
                value: r.rate ?? 0,
                text: r.rate === null ? 'not given' : `${pctText(r.rate)}${r.users !== null && r.of !== null ? ` (${r.users.toLocaleString('en-IN')} of ${r.of.toLocaleString('en-IN')})` : ''}`,
              }))} />
            ) : f.repeat_buyers.length ? (
              <CompareBars rows={f.repeat_buyers.map((r) => ({
                label: r.buyers_of === 'app' ? 'Bought in the app' : r.buyers_of === 'other' ? 'Bought elsewhere only' : codeLabel(r.buyers_of),
                value: r.repeat_buyers !== null && r.buyers > 0 ? (r.repeat_buyers / r.buyers) * 100 : 0,
                text: r.repeat_buyers === null ? `${r.buyers.toLocaleString('en-IN')} buyers` : `${pctText(pct(r.repeat_buyers, r.buyers))} buy again (${r.repeat_buyers.toLocaleString('en-IN')} of ${r.buyers.toLocaleString('en-IN')})`,
              }))} />
            ) : <Unavailable>The server sent no return figures for this range.</Unavailable>}
          </ChartCard>

          {f.notes.length > 0 && (
            <Notice tone="info" title="What the server says about these figures">
              <ul className="list-disc space-y-0.5 pl-5">{f.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </Notice>
          )}
        </div>
      ) : null}
    </Page>
  );
};

export default AppAnalytics;
