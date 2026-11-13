import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsAPI, LiveSummary, LiveCount } from '../../services/analyticsService';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { fmtRupees } from '../../lib/money';
import { localeTime, todayIso } from '../../utils/date';
import { KpiTile, InsightCard, Insight, CompareBars, Unavailable } from '../../components/panelAnalytics/Kit';
import { fmtMoneyShort } from '../../components/panelAnalytics/vizTheme';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

/**
 * Analytics > Realtime. The shop right now, as totals over the last half hour: how many people are on
 * the site, how far each has got (browsing, a product, a cart, checkout, paying, bought) and where they
 * are (page, device, place). Every count comes from `GET /api/v2/insights/realtime/summary`, which has
 * no row cap (the visitor list stops at 100 rows, so "active now" used to read 100 at most). Today's
 * orders and sales come from the commerce panel. The list of sessions is one click away, not the page.
 */

const REFRESH_MS = 30_000;
const count = (n: number | undefined) => Number(n ?? 0).toLocaleString('en-IN');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const words = (s: string | null | undefined) => {
  const t = String(s ?? '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown';
};
/** The page part of an address the storefront sent whole (`https://shop/x?utm=...` reads `/x`). */
const pathOf = (url: string | null | undefined) => {
  const raw = String(url ?? '');
  const noHost = raw.replace(/^[a-zA-Z]+:\/\/[^/]+/, '');
  return noHost.split('?')[0].split('#')[0] || '/';
};
const statusOf = (e: any): number | undefined => e?.response?.status;

/** Rows for the shared bar list: label, bar, count. */
const bars = (rows: LiveCount[], label: (n: string | null) => string = (n) => n || 'Unknown') =>
  rows.map((r) => ({ label: label(r.name), value: Number(r.value) || 0, text: count(r.value) }));

const Block: React.FC<{ title: string; sub?: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <section className="min-w-0 rounded-lg border bg-white p-4 shadow-sm">
    <h2 className="font-semibold text-gray-900">{title}</h2>
    {sub && <p className="mb-3 text-xs text-gray-500">{sub}</p>}
    {!sub && <div className="mb-3" />}
    {children}
  </section>
);

const RealtimeAnalytics: React.FC = () => {
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [summaryState, setSummaryState] = useState<'loading' | 'ok' | 'owner_only' | 'error'>('loading');
  const [today, setToday] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [visitors, setVisitors] = useState<any[] | null>(null);
  const [visitorsError, setVisitorsError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return; // a hidden tab asks nothing
    const day = todayIso();
    const [s, t] = await Promise.allSettled([
      analyticsAPI.getRealtimeSummary(),
      api.get('/analytics/panels/commerce', { params: { from: day, to: day } }),
    ]);
    if (!alive.current) return;
    if (s.status === 'fulfilled' && s.value) { setSummary(s.value); setSummaryState('ok'); }
    else if (s.status === 'rejected') setSummaryState(statusOf(s.reason) === 403 ? 'owner_only' : 'error');
    if (t.status === 'fulfilled') setToday(payload<any>(t.value)?.summary ?? null);
    setUpdatedAt(new Date());
  }, []);

  const loadVisitors = useCallback(async () => {
    try {
      setVisitorsError(null);
      const res = await analyticsAPI.getRealtimeVisitors();
      if (alive.current) setVisitors(payload<any[]>(res) ?? []);
    } catch (e: any) {
      if (alive.current) setVisitorsError(statusOf(e) === 403 ? 'The session list is open to the store owner only.' : 'Could not load the sessions.');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive.current = false; clearInterval(id); };
  }, [load]);

  // The session list is asked for only while it is open.
  useEffect(() => {
    if (!showSessions) return undefined;
    loadVisitors();
    const id = setInterval(loadVisitors, REFRESH_MS);
    return () => clearInterval(id);
  }, [showSessions, loadVisitors]);

  const stage = (key: string) => summary?.stages.find((x) => x.key === key)?.sessions ?? 0;

  const insights = useMemo<Insight[]>(() => {
    if (!summary) return [];
    const out: Insight[] = [];
    const checkout = stage('checkout') + stage('payment');
    const carts = stage('cart');
    const bought = stage('bought');
    if (summary.sessions === 0) {
      out.push({
        tone: 'info', title: 'Nobody is on the shop right now',
        body: <>No visits in the last {summary.minutes} minutes. Visits are counted only from shoppers who allowed analytics in the cookie banner.</>,
      });
    }
    if (checkout > 0) {
      out.push({
        tone: 'good', title: `${count(checkout)} ${plural(checkout, 'person is', 'people are')} at checkout`,
        body: <>They have started checkout or are paying now. If one stops, the cart shows up under abandoned carts.</>,
        action: { label: 'Open abandoned carts', to: '/orders/abandoned-carts' },
      });
    }
    if (carts > 0) {
      out.push({
        tone: 'info', title: `${count(carts)} ${plural(carts, 'cart', 'carts')} not at checkout yet`,
        body: <>{plural(carts, 'This shopper has', 'These shoppers have')} added to the cart but not started checkout in the last {summary.minutes} minutes.</>,
        action: { label: 'Open abandoned carts', to: '/orders/abandoned-carts' },
      });
    }
    if (bought > 0) {
      out.push({ tone: 'good', title: `${count(bought)} ${plural(bought, 'sale', 'sales')} in the last ${summary.minutes} minutes`, body: <>Counted from the shoppers' own purchase events.</> });
    }
    const top = summary.pages[0];
    if (top && summary.sessions >= 5 && top.value / summary.sessions >= 0.3) {
      out.push({
        tone: 'info', title: `${Math.round((top.value / summary.sessions) * 100)}% are on one page`,
        body: <>{count(top.value)} of {count(summary.sessions)} are on <span className="font-mono">{top.name || '/'}</span>. Make sure it loads fast and its products are in stock.</>,
      });
    }
    const mobile = summary.devices.filter((d) => /mobile|phone/i.test(String(d.name))).reduce((t, d) => t + d.value, 0);
    if (summary.sessions >= 5 && mobile / summary.sessions >= 0.7) {
      out.push({ tone: 'info', title: `${Math.round((mobile / summary.sessions) * 100)}% are on a phone`, body: <>Check what you change on a phone first.</> });
    }
    return out;
  }, [summary]);

  const todaySales = Number(today?.gross_sales ?? 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-red-500" />
            </span>
            Realtime
          </h1>
          <p className="text-sm text-gray-500">
            The last {summary?.minutes ?? 30} minutes, refreshed every 30 seconds{updatedAt ? `. Updated ${localeTime(updatedAt, { hour: '2-digit', minute: '2-digit' })}` : ''}.
          </p>
        </div>
        <button type="button" onClick={() => { load(); if (showSessions) loadVisitors(); }}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw className="size-4" aria-hidden /> Refresh
        </button>
      </div>

      {summaryState === 'owner_only' && (
        <Unavailable className="rounded-lg border bg-white p-4">
          Visitor figures are open to the store owner only. Today's orders and sales below are still yours to see.
        </Unavailable>
      )}
      {summaryState === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Could not load the live figures. The page tries again every 30 seconds.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiTile label="On the shop now" value={summary ? count(summary.sessions) : undefined}
          unavailable={summaryState === 'ok' ? undefined : summaryState === 'loading' ? 'Loading...' : 'Not available'}
          sub={summary ? `${count(summary.signed_in)} signed in` : undefined} />
        <KpiTile label="At checkout" value={summary ? count(stage('checkout') + stage('payment')) : undefined}
          unavailable={summaryState === 'ok' ? undefined : summaryState === 'loading' ? 'Loading...' : 'Not available'}
          sub={summary ? `${count(stage('cart'))} more with a cart` : undefined} />
        <KpiTile label="Orders today" value={count(today?.orders)} sub={today ? `${count(today.cancelled_orders)} cancelled` : undefined} />
        <KpiTile label="Sales today" value={<span title={fmtRupees(todaySales)}>{fmtMoneyShort(todaySales)}</span>} sub="Before cancellations and refunds" />
        <KpiTile label="Page views today" value={count(today?.page_views)} className="col-span-2 lg:col-span-1" />
      </div>

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
          </div>
        </section>
      )}

      {summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Block title="How far they got" sub="Each person once, at the furthest step they reached.">
            {summary.sessions > 0
              ? <CompareBars rows={summary.stages.map((s) => ({ label: s.label, value: s.sessions, text: count(s.sessions) }))} />
              : <Unavailable>No one in the last {summary.minutes} minutes.</Unavailable>}
          </Block>
          <Block title="Pages they are on" sub="The page each person viewed last.">
            {summary.pages.length > 0 ? <CompareBars rows={bars(summary.pages, (n) => n || '/')} /> : <Unavailable>No pages yet.</Unavailable>}
          </Block>
          <Block title="Devices">
            {summary.devices.length > 0 ? <CompareBars rows={bars(summary.devices, (n) => words(n))} /> : <Unavailable>No devices yet.</Unavailable>}
          </Block>
          <Block title="Places" sub="City, else country, from the visitor's address.">
            {summary.places.length > 0 ? <CompareBars rows={bars(summary.places)} /> : <Unavailable>No places yet.</Unavailable>}
          </Block>
        </div>
      )}

      <section className="rounded-lg border bg-white shadow-sm">
        <button type="button" onClick={() => setShowSessions((v) => !v)} aria-expanded={showSessions}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-semibold text-gray-900">
          <span>People on the shop{summary ? ` (${count(summary.sessions)})` : ''}</span>
          {showSessions ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        </button>
        {showSessions && (
          <div className="border-t">
            {visitorsError && <p className="p-4 text-sm text-red-700">{visitorsError}</p>}
            {!visitorsError && visitors === null && <p className="p-4 text-sm text-gray-500">Loading...</p>}
            {visitors && visitors.length === 0 && <p className="p-4 text-sm text-gray-500">No one on the shop right now.</p>}
            {visitors && visitors.length > 0 && (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Place and device</th>
                      <th className="px-4 py-2">Last seen</th>
                      <th className="px-4 py-2">Doing</th>
                      <th className="hidden px-4 py-2 sm:table-cell">Page</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visitors.map((v: any, i: number) => {
                      const sid = v.session_id ?? v.sessionId;
                      return (
                        <tr key={sid ?? i} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <Link to={`/analytics/users?session=${encodeURIComponent(sid ?? '')}`} className="font-medium text-gray-900 hover:underline">
                              {v.location || 'Unknown'}
                            </Link>
                            <div className="text-xs text-gray-500">{words(v.device)}</div>
                          </td>
                          <td className="px-4 py-2 text-gray-600">{localeTime(v.last_active ?? v.lastActive, { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2">{words(v.last_action ?? v.lastAction)}</td>
                          <td className="hidden max-w-[16rem] truncate px-4 py-2 font-mono text-xs text-gray-600 sm:table-cell" title={v.page ?? ''}>{pathOf(v.page)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visitors.length >= 100 && (
                  <p className="border-t p-3 text-xs text-gray-500">The list shows the 100 most recent people; the totals above count everyone.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default RealtimeAnalytics;
