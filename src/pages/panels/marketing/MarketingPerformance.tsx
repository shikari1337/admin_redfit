import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from 'lucide-react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';
import { useAuth } from '../../../contexts/AuthContext';
import { Page, PageHeader, StatCard, StatGrid, Btn, CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { Lead, LoadFailure, moneyMajor, num, plural, useLoad, type Tone } from './meta/common';
import { paceState, pctOf } from './budgetPace';

/**
 * Performance (`/panel/marketing/performance`): the economics of marketing on one screen. Opens with what to act on
 * (budget pace, efficiency below the healthy floor), then the figures: sales, spend, revenue per rupee of marketing,
 * paid return, cost per new customer, lifetime value, repeat rate; then month-to-date pacing, sales by the channel that
 * brought the order (last click) and the RFM segments with one click to make a list.
 *
 * Reads `GET /marketing-hub/analytics/kpis?days` (v2 `/marketing/analytics/kpis`, amounts as Money in the store's
 * currency) and `GET /marketing-hub/audiences/system`; writes `POST /marketing-hub/audiences/lists/from-system`.
 */

const WINDOWS = [7, 30, 60, 90, 180] as const;
/** The healthy floors a performance marketer reads against: sales at least 3 times marketing spend, and lifetime value
 *  at least 3 times the cost of winning the customer. */
const MER_FLOOR = 3;
const LTV_CAC_FLOOR = 3;

const ratio = (v: number | null | undefined): string => (v === null || v === undefined ? 'Not known' : `${Number(v).toFixed(1)} times`);

const MarketingPerformance: React.FC = () => {
  const { hasPerm } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [info, setInfo] = useState('');
  const [writeErr, setWriteErr] = useState('');
  const [making, setMaking] = useState('');

  const kpisQ = useLoad(() => api.get('/marketing-hub/analytics/kpis', { params: { days } }).then((r) => payload<any>(r)), [days]);
  const rfmQ = useLoad(() => api.get('/marketing-hub/audiences/system').then((r) => ((payload<any[]>(r) ?? []) as any[]).filter((a) => String(a?.key ?? '').startsWith('rfm_'))), []);

  const k = kpisQ.data;
  const cur = k?.currency ?? 'INR';
  const m = (v: unknown) => moneyMajor(Number(v ?? 0), cur);
  const budget = k?.budget;
  const hasBudget = Number(budget?.monthly_total ?? 0) > 0;
  const pace = hasBudget ? paceState(budget?.pace) : null;

  /* What to act on */
  const acts: Array<{ key: string; tone: Tone; text: React.ReactNode }> = [];
  if (k) {
    if (pace && pace.tone !== 'good') acts.push({ key: 'pace', tone: pace.tone, text: `Marketing is ${pace.text}: ${m(budget.mtd_spend)} spent of ${m(budget.monthly_total)}, with ${pctOf(budget.month_progress)} of the month gone.` });
    if (k.mer != null && Number(k.mer) < MER_FLOOR) acts.push({ key: 'mer', tone: 'warn', text: `Sales are ${ratio(k.mer)} marketing spend, below the healthy ${MER_FLOOR} times.` });
    if (k.ltv_to_cac != null && Number(k.ltv_to_cac) < LTV_CAC_FLOOR) acts.push({ key: 'ltv', tone: 'warn', text: `A customer is worth ${ratio(k.ltv_to_cac)} what it costs to win one; aim for ${LTV_CAC_FLOOR} times or more.` });
    if (!hasBudget) acts.push({ key: 'budget', tone: 'info', text: <>No monthly budget is set, so overspending cannot be caught. <Link className="font-medium underline" to="/panel/marketing/settings">Set a budget</Link></> });
  }
  const leadTone: Tone = acts.some((a) => a.tone === 'bad') ? 'bad' : acts.some((a) => a.tone === 'warn') ? 'warn' : acts.length ? 'info' : 'good';

  const makeList = async (key: string) => {
    setMaking(key); setInfo(''); setWriteErr('');
    try {
      const d = payload<any>(await api.post('/marketing-hub/audiences/lists/from-system', { system: key }));
      setInfo(`List "${d?.list?.name ?? key}" made with ${plural(Number(d?.inserted ?? 0), 'member')}.`);
    } catch (e: any) {
      setWriteErr(e?.response?.data?.message ?? e?.message ?? 'The list could not be made.');
    } finally { setMaking(''); }
  };

  const channels: any[] = k?.channels ?? [];
  const revenue = Number(k?.revenue ?? 0);

  return (
    <Page>
      <PageHeader
        title="Performance"
        icon={LineChart}
        description="What marketing costs and what it brings in: efficiency, cost per customer, budget pace and where orders came from."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="sr-only">Window</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border bg-white px-2 py-1.5 text-sm">
                {WINDOWS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </label>
            <Btn size="sm" variant="outline" onClick={() => { kpisQ.reload(); rfmQ.reload(); }} disabled={kpisQ.loading}>Refresh</Btn>
          </>
        }
      />

      {info && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</div>}
      {writeErr && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{writeErr}</div>}

      {kpisQ.error && !k ? (
        <LoadFailure failure={kpisQ.error} what="Marketing performance" onRetry={kpisQ.reload} />
      ) : !k ? (
        <StatGrid cols={4}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />)}</StatGrid>
      ) : (
        <div className={cn('space-y-6', kpisQ.loading && 'opacity-60')}>
          <Lead tone={leadTone} title={acts.length ? `${plural(acts.length, 'thing')} to look at` : 'Marketing is paying its way'}>
            {acts.length > 0 && <ul className="list-disc space-y-1 pl-5">{acts.map((a) => <li key={a.key}>{a.text}</li>)}</ul>}
          </Lead>

          <StatGrid cols={4}>
            <StatCard label="Sales" value={m(k.revenue)} sub={`${plural(Number(k.orders ?? 0), 'order')}, average ${m(k.aov)}`} />
            <StatCard label="Marketing spend" value={m(k.spend?.total)} sub={`Messages ${m(k.spend?.campaigns)}, ads ${m(k.spend?.ads)}`} />
            <StatCard label="Sales per 1 spent" value={k.mer != null ? Number(k.mer).toFixed(1) : 'No spend'} tone={k.mer != null && Number(k.mer) < MER_FLOOR ? 'bad' : 'default'} sub="All sales divided by marketing spend" />
            <StatCard label="Paid return" value={k.paid_roas != null ? Number(k.paid_roas).toFixed(1) : 'No ad spend'} sub="Sales from ad clicks divided by ad spend" />
            <StatCard label="Cost per new customer" value={Number(k.cac ?? 0) > 0 ? m(k.cac) : 'No new customers'} sub={`${plural(Number(k.new_customers ?? 0), 'new customer')}`} />
            <StatCard label="Lifetime value" value={m(k.ltv)} sub="Average spend of a buyer so far" />
            <StatCard label="Value to cost" value={k.ltv_to_cac != null ? Number(k.ltv_to_cac).toFixed(1) : 'Not known'} tone={k.ltv_to_cac != null && Number(k.ltv_to_cac) < LTV_CAC_FLOOR ? 'warn' : 'default'} sub={`Lifetime value per customer cost, aim for ${LTV_CAC_FLOOR} or more`} />
            <StatCard label="Repeat rate" value={pctOf(k.repeat_rate)} sub={`${pctOf(k.attributed_share)} of sales came from marketing`} />
          </StatGrid>

          <section className={cn(CARD, 'p-4')} aria-labelledby="perf-pace">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="perf-pace" className="text-base font-semibold text-gray-900">Budget this month</h2>
              <Link to="/panel/marketing/settings" className="text-sm font-medium text-primary hover:underline">Set budgets</Link>
            </div>
            {hasBudget ? (
              <div>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>{m(budget.mtd_spend)} spent of {m(budget.monthly_total)}</span>
                  {pace && <span className={pace.tone === 'bad' ? 'font-medium text-red-600' : pace.tone === 'warn' ? 'text-amber-700' : 'text-emerald-700'}>{pace.text}</span>}
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round((Number(budget.mtd_spend ?? 0) / Number(budget.monthly_total)) * 100))}>
                  <div className={cn('h-3', pace?.tone === 'bad' ? 'bg-red-500' : 'bg-primary')}
                    style={{ width: `${Math.min((Number(budget.mtd_spend ?? 0) / Number(budget.monthly_total)) * 100, 100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-500">{pctOf(budget.month_progress)} of the month gone</div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No monthly budget is set. Add one in Settings to see the pace and be told about overspending.</p>
            )}
          </section>

          <section className={cn(CARD, 'overflow-hidden')} aria-labelledby="perf-ch">
            <div className="border-b px-4 py-3">
              <h2 id="perf-ch" className="text-base font-semibold text-gray-900">Sales by channel</h2>
              <p className="text-xs text-gray-500">The channel of the last click before each order.</p>
            </div>
            {channels.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No orders in this window.</p>
            ) : (
              <>
                <table className="hidden w-full text-sm sm:table">
                  <thead className="text-left text-xs text-gray-500">
                    <tr className="border-b"><th className="px-4 py-2 font-medium">Channel</th><th className="px-4 py-2 text-right font-medium">Orders</th><th className="px-4 py-2 text-right font-medium">Sales</th><th className="px-4 py-2 text-right font-medium">Share</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {channels.map((c) => (
                      <tr key={c.channel}>
                        <td className="px-4 py-2 capitalize">{String(c.channel ?? 'direct').replace(/_/g, ' ')}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{num(Number(c.orders ?? 0))}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{m(c.revenue)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{revenue > 0 ? pctOf(Number(c.revenue ?? 0) / revenue) : 'Not known'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y sm:hidden">
                  {channels.map((c) => (
                    <li key={c.channel} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 capitalize">{String(c.channel ?? 'direct').replace(/_/g, ' ')}<span className="block text-xs text-gray-500">{plural(Number(c.orders ?? 0), 'order')}</span></span>
                      <span className="text-right tabular-nums">{m(c.revenue)}<span className="block text-xs text-gray-500">{revenue > 0 ? pctOf(Number(c.revenue ?? 0) / revenue) : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      <section className={cn(CARD, 'p-4')} aria-labelledby="perf-rfm">
        <h2 id="perf-rfm" className="text-base font-semibold text-gray-900">Customer segments</h2>
        <p className="mb-3 text-xs text-gray-500">Grouped by how recently, how often and how much they buy. Make a list to send a campaign to one group.</p>
        {rfmQ.error ? (
          <LoadFailure failure={rfmQ.error} what="Customer segments" onRetry={rfmQ.reload} />
        ) : rfmQ.loading && !rfmQ.data ? (
          <p className="text-sm text-gray-500">Loading the segments...</p>
        ) : !(rfmQ.data ?? []).length ? (
          <p className="text-sm text-gray-500">No customer segments yet. They appear once customers have ordered.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {(rfmQ.data ?? []).map((a: any) => (
              <div key={a.key} className="rounded-lg border p-3" title={a.description}>
                <div className="text-xs text-gray-500">{a.label}</div>
                <div className="text-xl font-bold tabular-nums">{num(Number(a.count ?? 0))}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <Link to="/panel/marketing/campaigns" className="font-medium text-primary hover:underline">Campaign</Link>
                  {hasPerm('marketing.manage') && (
                    <button type="button" onClick={() => makeList(a.key)} disabled={making === a.key} className="font-medium text-primary hover:underline disabled:opacity-50">
                      {making === a.key ? 'Making...' : 'Make list'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </Page>
  );
};

export default MarketingPerformance;
