import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange, previousRange, PanelRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats, fetchRanged } from '../../components/panelAnalytics/usePanelStats';
import { ChartCard, CategoryBars, KpiTile, DeltaLine, InsightCard, Insight } from '../../components/panelAnalytics/Kit';
import { SERIES } from '../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';
import { Download, Search } from 'lucide-react';

/**
 * Analytics → Sales Insights. The decision view: which brands, items, categories, campaigns and
 * places bring the money, how each moved against the previous period of equal length, and the
 * few things worth acting on. Every figure is server-computed (the commerce and marketing panels
 * and the custom report's dimensions); cancelled orders are excluded throughout. Item-level
 * breakdowns (brand, item, category) count line revenue; the others count order totals.
 */

interface BreakdownDef { key: string; label: string }
const BREAKDOWNS: BreakdownDef[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'product', label: 'Item' },
  { key: 'category', label: 'Category' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'source_medium', label: 'Source / medium' },
  { key: 'channel', label: 'Channel' },
  { key: 'coupon', label: 'Coupon' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'payment_method', label: 'Payment' },
];
const NO_CAMPAIGN = '(no campaign)';
const REPORT_URL = '/analytics/panels/custom-report';

interface Report { rows?: any[]; item_level?: boolean; label?: string }
interface Row {
  name: string; orders: number; units: number | null; sales: number;
  prevSales: number | null; share: number; change: number | null; changePct: number | null;
}

/** One dimension for the range and, when there is one, the previous period (shared 60 s cache). */
function useBreakdown(dimension: string | null, range: PanelRange, prev: PanelRange | null) {
  const [state, setState] = useState<{ cur: Report | null; prev: Report | null; loading: boolean; error: string | null }>(
    { cur: null, prev: null, loading: !!dimension, error: null });
  useEffect(() => {
    if (!dimension) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([
      fetchRanged<Report>(REPORT_URL, range, { dimension }),
      prev ? fetchRanged<Report>(REPORT_URL, prev, { dimension }).catch(() => null) : Promise.resolve(null),
    ])
      .then(([cur, p]) => { if (alive) setState({ cur, prev: p, loading: false, error: null }); })
      .catch((e) => {
        if (alive) setState({ cur: null, prev: null, loading: false, error: e?.response?.data?.message ?? 'Could not load this breakdown.' });
      });
    return () => { alive = false; };
  }, [dimension, range.from, range.to, prev?.from, prev?.to]);
  return state;
}

/** This period's rows beside the previous period's, plus the names that stopped selling. */
function mergeRows(cur: Report | null, prev: Report | null): Row[] {
  const curRows = cur?.rows ?? [];
  const prevBy = new Map<string, any>();
  for (const r of prev?.rows ?? []) prevBy.set(String(r.dimension), r);
  const total = curRows.reduce((t, r) => t + Number(r.gross_sales ?? 0), 0);
  const out: Row[] = curRows.map((r) => {
    const name = String(r.dimension);
    const sales = Number(r.gross_sales ?? 0);
    const prevSales = prev ? Number(prevBy.get(name)?.gross_sales ?? 0) : null;
    return {
      name, orders: Number(r.orders ?? 0), units: r.units != null ? Number(r.units) : null, sales, prevSales,
      share: total > 0 ? (sales / total) * 100 : 0,
      change: prevSales === null ? null : sales - prevSales,
      changePct: prevSales ? ((sales - prevSales) / prevSales) * 100 : null,
    };
  });
  if (prev) {
    const seen = new Set(out.map((r) => r.name));
    for (const [name, p] of prevBy) {
      const prevSales = Number(p.gross_sales ?? 0);
      if (seen.has(name) || prevSales <= 0) continue;
      out.push({ name, orders: 0, units: cur?.item_level ? 0 : null, sales: 0, prevSales, share: 0, change: -prevSales, changePct: -100 });
    }
  }
  return out;
}

function movers(rows: Row[], dir: 'up' | 'down', n: number): Row[] {
  return rows
    .filter((r) => r.change !== null && (dir === 'up' ? r.change > 0 : r.change < 0))
    .sort((a, b) => (dir === 'up' ? b.change! - a.change! : a.change! - b.change!))
    .slice(0, n);
}

const pct = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)}%`;
const signedRupees = (v: number) => `${v >= 0 ? '+' : '−'}${fmtRupees(Math.abs(v))}`;

const SalesInsights: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const prevRange = useMemo(() => previousRange(range), [range.from, range.to]);
  const vsLabel = prevRange ? 'vs previous period' : '';

  const commerce = usePanelStats<any>('commerce', range);
  const marketing = usePanelStats<any>('marketing', range);
  const [prevCommerce, setPrevCommerce] = useState<any>(null);
  const [prevMarketing, setPrevMarketing] = useState<any>(null);
  useEffect(() => {
    setPrevCommerce(null); setPrevMarketing(null);
    if (!prevRange) return;
    let alive = true;
    fetchRanged<any>('/analytics/panels/commerce', prevRange).then((d) => { if (alive) setPrevCommerce(d); }).catch(() => {});
    fetchRanged<any>('/analytics/panels/marketing', prevRange).then((d) => { if (alive) setPrevMarketing(d); }).catch(() => {});
    return () => { alive = false; };
  }, [prevRange?.from, prevRange?.to]);

  // The breakdowns this API serves (campaign arrives with the insights release that adds it).
  const [served, setServed] = useState<Set<string> | null>(null);
  useEffect(() => {
    api.get('/analytics/panels/custom-report/dimensions')
      .then((res) => setServed(new Set((payload<any[]>(res) ?? []).map((d) => d.key))))
      .catch(() => setServed(new Set(BREAKDOWNS.map((b) => b.key).filter((k) => k !== 'campaign' && k !== 'source_medium'))));
  }, []);
  const tabs = BREAKDOWNS.filter((b) => !served || served.has(b.key));
  const hasCampaign = !!served?.has('campaign');

  // Brand, item and campaign feed the "act on" cards, so they load up front; the open tab loads on demand.
  const brand = useBreakdown('brand', range, prevRange);
  const item = useBreakdown('product', range, prevRange);
  const campaign = useBreakdown(hasCampaign ? 'campaign' : null, range, prevRange);
  const [tab, setTab] = useState('brand');
  const open = useBreakdown(tab, range, prevRange);

  const s = commerce.data?.summary;
  const ps = prevCommerce?.summary ?? null;
  const m = marketing.data?.summary;
  const pm = prevMarketing?.summary ?? null;

  const brandRows = useMemo(() => mergeRows(brand.cur, brand.prev), [brand.cur, brand.prev]);
  const itemRows = useMemo(() => mergeRows(item.cur, item.prev), [item.cur, item.prev]);
  const campaignRows = useMemo(() => mergeRows(campaign.cur, campaign.prev), [campaign.cur, campaign.prev]);

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const selling = itemRows.filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales);
    const itemTotal = selling.reduce((t, r) => t + r.sales, 0);
    if (selling.length >= 5 && itemTotal > 0) {
      let acc = 0; let k = 0;
      while (k < selling.length && acc < itemTotal * 0.8) { acc += selling[k].sales; k += 1; }
      out.push({
        tone: 'info', title: 'Where the money concentrates',
        body: <>{k} of {selling.length} selling items ({pct((k / selling.length) * 100)}) bring 80% of item sales. Keep these in stock first.</>,
      });
    }
    const topBrand = [...brandRows].sort((a, b) => b.sales - a.sales)[0];
    if (topBrand && topBrand.sales > 0) {
      out.push({
        tone: 'info', title: `Top brand: ${topBrand.name}`,
        body: <>{fmtRupees(topBrand.sales)}, {pct(topBrand.share)} of sales{topBrand.change !== null ? <> ({signedRupees(topBrand.change)} {vsLabel})</> : null}.</>,
      });
    }
    const up = movers(itemRows, 'up', 3);
    if (up.length) {
      out.push({
        tone: 'good', title: 'Rising items',
        body: up.map((r) => `${r.name} (${signedRupees(r.change!)})`).join(' · '),
      });
    }
    const down = movers(itemRows, 'down', 3);
    if (down.length) {
      out.push({
        tone: 'bad', title: 'Falling items',
        body: down.map((r) => `${r.name} (${signedRupees(r.change!)})`).join(' · '),
      });
    }
    const stopped = itemRows.filter((r) => r.sales === 0 && (r.prevSales ?? 0) > 0);
    if (stopped.length) {
      const lost = stopped.reduce((t, r) => t + (r.prevSales ?? 0), 0);
      const named = [...stopped].sort((a, b) => (b.prevSales ?? 0) - (a.prevSales ?? 0)).slice(0, 3).map((r) => r.name).join(', ');
      out.push({
        tone: 'bad', title: `${stopped.length} item${stopped.length === 1 ? '' : 's'} stopped selling`,
        body: <>They sold {fmtRupees(lost)} last period and nothing in this one. Check stock and listing first: {named}.</>,
      });
    }
    const brandDown = movers(brandRows, 'down', 2);
    if (brandDown.length) {
      out.push({
        tone: 'bad', title: 'Brands losing ground',
        body: brandDown.map((r) => `${r.name} (${signedRupees(r.change!)}${r.changePct !== null ? `, ${r.changePct.toFixed(0)}%` : ''})`).join(' · '),
      });
    }
    if (campaignRows.length) {
      const tracked = campaignRows.filter((r) => r.name !== NO_CAMPAIGN && r.sales > 0).sort((a, b) => b.sales - a.sales);
      const untracked = campaignRows.find((r) => r.name === NO_CAMPAIGN);
      if (tracked[0]) {
        out.push({
          tone: 'good', title: `Best campaign: ${tracked[0].name}`,
          body: <>{fmtRupees(tracked[0].sales)} from {tracked[0].orders.toLocaleString('en-IN')} orders ({pct(tracked[0].share)} of sales).</>,
        });
      }
      if (untracked && untracked.share > 50) {
        out.push({
          tone: 'info', title: 'Most sales carry no campaign',
          body: <>{pct(untracked.share)} of sales came without a campaign tag. Tag ads and messages with utm_campaign to see what pays back.</>,
        });
      }
    }
    if (m && Number(m.gross_sales) > 0 && Number(m.discount_total) > 0) {
      const rate = (Number(m.discount_total) / Number(m.gross_sales)) * 100;
      out.push({
        tone: rate > 15 ? 'bad' : 'info', title: `Discounts are ${pct(rate)} of sales`,
        body: <>{fmtRupees(m.discount_total)} given away on {Number(m.coupon_orders ?? 0).toLocaleString('en-IN')} coupon orders.</>,
      });
    }
    return out;
  }, [itemRows, brandRows, campaignRows, m, vsLabel]);

  const loadingTop = commerce.loading && !commerce.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Insights</h1>
          <p className="text-sm text-gray-500">Brand, item and campaign sales, how each moved, and what to act on.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {commerce.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{commerce.error}</div>}
      {loadingTop && <div className="p-8 text-sm text-gray-500">Loading sales…</div>}

      {s && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiTile label="Gross sales" value={fmtRupees(s.gross_sales)}
            delta={prevRange ? { current: s.gross_sales, previous: ps?.gross_sales, label: vsLabel } : null} />
          <KpiTile label="Orders" value={Number(s.orders).toLocaleString('en-IN')} sub={`${s.cancelled_orders ?? 0} cancelled`}
            delta={prevRange ? { current: s.orders, previous: ps?.orders, label: vsLabel } : null} />
          <KpiTile label="Average order value" value={fmtRupees(s.aov)}
            delta={prevRange ? { current: s.aov, previous: ps?.aov, label: vsLabel } : null} />
          <KpiTile label="Units per order" value={s.orders > 0 ? (s.units_sold / s.orders).toFixed(2) : '—'}
            delta={prevRange && ps ? { current: s.orders > 0 ? s.units_sold / s.orders : 0, previous: ps.orders > 0 ? ps.units_sold / ps.orders : null, label: vsLabel } : null} />
          <KpiTile label="Collected revenue" value={fmtRupees(s.collected_revenue)} sub="Paid, less refunds"
            delta={prevRange ? { current: s.collected_revenue, previous: ps?.collected_revenue, label: vsLabel } : null} />
          <KpiTile label="New buyers" value={Number(s.new_customers ?? 0).toLocaleString('en-IN')} sub="First order in period"
            delta={prevRange ? { current: s.new_customers, previous: ps?.new_customers, label: vsLabel } : null} />
          <KpiTile label="Returning customers" value={m ? pct(Number(m.returning_order_share ?? 0)) : '—'} sub="Share of identified orders"
            delta={prevRange && m ? { current: m.returning_order_share, previous: pm?.returning_order_share, label: vsLabel } : null} />
          <KpiTile label="Discount rate"
            value={m && Number(m.gross_sales) > 0 ? pct((Number(m.discount_total ?? 0) / Number(m.gross_sales)) * 100) : '—'}
            sub="Discounts ÷ gross sales"
            delta={prevRange && m && pm && Number(pm.gross_sales) > 0
              ? { current: (Number(m.discount_total ?? 0) / Math.max(Number(m.gross_sales), 1)) * 100, previous: (Number(pm.discount_total ?? 0) / Number(pm.gross_sales)) * 100, label: vsLabel, goodWhen: 'down' }
              : null} />
        </div>
      )}

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
          </div>
        </section>
      )}
      {!hasCampaign && served && (
        <p className="text-xs text-gray-500">
          Campaign and source breakdowns appear once the API release that adds them is live; channel-wise sales are available now.
        </p>
      )}

      <BreakdownTable tabs={tabs} tab={tab} onTab={setTab} state={open} hasPrev={!!prevRange} range={range} />
    </div>
  );
};

const BreakdownTable: React.FC<{
  tabs: BreakdownDef[]; tab: string; onTab: (k: string) => void;
  state: { cur: Report | null; prev: Report | null; loading: boolean; error: string | null };
  hasPrev: boolean; range: PanelRange;
}> = ({ tabs, tab, onTab, state, hasPrev, range }) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'sales' | 'change' | 'orders' | 'units'>('sales');
  const [showAll, setShowAll] = useState(false);
  const def = tabs.find((t) => t.key === tab) ?? tabs[0];
  const itemLevel = !!state.cur?.item_level;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = mergeRows(state.cur, state.prev).filter((r) => !q || r.name.toLowerCase().includes(q));
    const key = (r: Row) => (sort === 'change' ? (r.change ?? 0) : sort === 'orders' ? r.orders : sort === 'units' ? (r.units ?? 0) : r.sales);
    return list.sort((a, b) => key(b) - key(a));
  }, [state.cur, state.prev, query, sort]);
  const visible = showAll ? rows : rows.slice(0, 50);
  const chart = rows.filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 12)
    .map((r) => ({ label: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name, value: r.sales }));

  const downloadCsv = () => {
    const head = [def?.label ?? 'Name', 'Orders', ...(itemLevel ? ['Units'] : []), 'Sales', 'Share %', ...(hasPrev ? ['Previous sales', 'Change', 'Change %'] : [])];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [
      r.name, r.orders, ...(itemLevel ? [r.units ?? 0] : []), r.sales.toFixed(2), r.share.toFixed(2),
      ...(hasPrev ? [(r.prevSales ?? 0).toFixed(2), (r.change ?? 0).toFixed(2), r.changePct === null ? '' : r.changePct.toFixed(1)] : []),
    ].map(cell).join(','));
    const blob = new Blob([[head.map(cell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-by-${tab}-${range.from ?? 'alltime'}-${range.to ?? 'today'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Sales by</h2>
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => { onTab(t.key); setShowAll(false); }}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === t.key ? 'border-gray-900 bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {state.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}

      {chart.length > 0 && (
        <ChartCard title={`Top ${def?.label.toLowerCase() ?? ''} by sales`} sub={itemLevel ? 'Line revenue, cancelled orders excluded' : 'Order totals, cancelled orders excluded'}>
          <CategoryBars data={chart} height={240} money />
        </ChartCard>
      )}

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find a ${def?.label.toLowerCase() ?? 'row'}`}
              className="rounded-md border py-1.5 pl-8 pr-2 text-sm" />
          </div>
          <label className="text-sm text-gray-600">Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-md border bg-white px-2 py-1.5 text-sm">
            <option value="sales">Sales</option>
            {hasPrev && <option value="change">Change</option>}
            <option value="orders">Orders</option>
            {itemLevel && <option value="units">Units</option>}
          </select>
          <span className="text-xs text-gray-500">{rows.length.toLocaleString('en-IN')} row(s)</span>
          <button type="button" onClick={downloadCsv} disabled={rows.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">{def?.label}</th>
                <th className="px-4 py-2 text-right">Orders</th>
                {itemLevel && <th className="px-4 py-2 text-right">Units</th>}
                <th className="px-4 py-2 text-right">Sales</th>
                <th className="px-4 py-2">Share</th>
                {itemLevel ? <th className="px-4 py-2 text-right">Avg price</th> : <th className="px-4 py-2 text-right">AOV</th>}
                {hasPrev && <th className="px-4 py-2 text-right">vs previous</th>}
              </tr>
            </thead>
            <tbody className={`divide-y ${state.loading ? 'opacity-60' : ''}`}>
              {state.loading && !state.cur && <tr><td colSpan={7} className="p-6 text-center text-gray-500">Loading…</td></tr>}
              {!state.loading && rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-500">No sales in this range.</td></tr>}
              {visible.map((r) => (
                <tr key={r.name} className={r.sales === 0 ? 'text-gray-400' : undefined}>
                  <td className="max-w-[22rem] truncate px-4 py-1.5" title={r.name}>{r.name}</td>
                  <td className="px-4 py-1.5 text-right font-mono">{r.orders.toLocaleString('en-IN')}</td>
                  {itemLevel && <td className="px-4 py-1.5 text-right font-mono">{(r.units ?? 0).toLocaleString('en-IN')}</td>}
                  <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(r.sales)}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.share)}%`, background: SERIES[0] }} />
                      </div>
                      <span className="w-12 text-xs text-gray-500">{r.share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono">
                    {itemLevel
                      ? (r.units ? fmtRupees(r.sales / r.units) : '—')
                      : (r.orders ? fmtRupees(r.sales / r.orders) : '—')}
                  </td>
                  {hasPrev && (
                    <td className="px-4 py-1.5 text-right">
                      {r.change === null ? '—' : (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-xs">{signedRupees(r.change)}</span>
                          <DeltaLine delta={{ current: r.sales, previous: r.prevSales, label: '' }} />
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > visible.length && (
          <div className="border-t p-3 text-center">
            <button type="button" onClick={() => setShowAll(true)} className="text-sm font-medium text-gray-700 hover:underline">
              Show all {rows.length.toLocaleString('en-IN')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default SalesInsights;
