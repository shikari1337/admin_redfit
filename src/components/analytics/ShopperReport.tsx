import React, { useState } from 'react';
import type { PanelRange } from '../panelAnalytics/DateRangeBar';
import { usePanelStats } from '../panelAnalytics/usePanelStats';
import { KpiTile, Unavailable } from '../panelAnalytics/Kit';
import { fmtMoneyShort } from '../panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';

/**
 * Analytics dashboard: how shoppers buy. Every figure is `GET /analytics/panels/shoppers`
 * (orders.read). Cancelled orders are already out. The captions are the definitions the query uses.
 */

const count = (n: number | undefined | null) => Number(n ?? 0).toLocaleString('en-IN');
const money = (v: number | undefined | null) => <span title={fmtRupees(v ?? 0)}>{fmtMoneyShort(v ?? 0)}</span>;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole >= 0.1 ? 0 : 1)}%` : '—');

const CHANNEL: Record<string, string> = {
  google_ads: 'Google Ads', meta_ads: 'Meta Ads', microsoft_ads: 'Microsoft Ads', tiktok_ads: 'TikTok Ads',
  organic_search: 'Organic search', organic_social: 'Organic social', referral: 'Referral',
  email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push', affiliate: 'Affiliate',
  direct: 'Direct', other: 'Other', unknown: 'Unknown',
};
const channel = (c: string) => CHANNEL[c] ?? c.replace(/_/g, ' ');

const STEP: Record<string, string> = {
  view_page: 'Landed', search: 'Searched', view_product: 'Viewed a product', add_to_cart: 'Added to cart',
  checkout: 'Checkout', payment: 'Payment', purchase: 'Bought',
};
const pathLabel = (path: string) => path.split(' → ').map((s) => STEP[s.trim()] ?? s.trim()).join(' → ');

interface BrandProduct { product: string; orders: number; units: number; gross_sales: number }
interface Brand { brand: string; orders: number; units: number; gross_sales: number; products: BrandProduct[] }
interface SearchRow { query: string; searches: number; listed: number; avg_results: number | null; clicks: number; orders: number; sales: number }
interface Journey { path: string; sessions: number; orders: number }
interface Recovery { channel: string; sent: number; failed: number; orders: number; sales: number }
interface ChannelPath { path: string; visitors: number; orders: number; sales: number }

const n = (v: unknown) => Number(v ?? 0) || 0;

const Section: React.FC<{ title: string; caption: string; children: React.ReactNode }> = ({ title, caption, children }) => (
  <section className="space-y-3">
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{caption}</p>
    </div>
    {children}
  </section>
);

const Table: React.FC<{ heads: string[]; children: React.ReactNode }> = ({ heads, children }) => (
  <div className="overflow-x-auto rounded-lg border bg-white">
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
          {heads.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y">{children}</tbody>
    </table>
  </div>
);

const ShopperReport: React.FC<{ range: PanelRange }> = ({ range }) => {
  const { data, loading, error, status } = usePanelStats<any>('shoppers', range);
  const [openBrand, setOpenBrand] = useState<string | null>(null);

  if (status === 404) {
    return <Unavailable>Shopper reports are not on this API yet.</Unavailable>;
  }
  if (error && status === 403) {
    return <Unavailable className="rounded-lg border bg-white p-4">Shopper reports need permission to read orders. Ask the store owner to grant it.</Unavailable>;
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  }
  if (loading && !data) {
    return <div className="p-4 text-sm text-gray-500">Loading shopper reports…</div>;
  }
  if (!data) return null;

  const brands = (data.brands ?? []) as Brand[];
  const active = openBrand === '' ? null : (openBrand ?? brands[0]?.brand ?? null);
  const pipe = data.pipeline ?? {};
  const stages = [
    { label: 'Visits', count: n(pipe.visitors) },
    { label: 'Viewed a product', count: n(pipe.product_views) },
    { label: 'Added to cart', count: n(pipe.carts) },
    { label: 'Checkout', count: n(pipe.checkouts) },
    { label: 'Payment', count: n(pipe.payments) },
    { label: 'Orders', count: n(pipe.orders) },
  ];
  const pace = data.pace ?? {};
  const oneOrders = n(pace.one_time_orders);
  const tookOrders = n(pace.took_time_orders);
  const paceOrders = oneOrders + tookOrders;
  const minutes = pace.median_minutes == null ? null : n(pace.median_minutes);
  const tookTime = minutes == null
    ? 'No timed visit yet'
    : minutes >= 90
      ? `Median ${Math.round(minutes / 60)} hours on the buying visit`
      : `Median ${Math.round(minutes)} minutes on the buying visit`;
  const searches = (data.searches ?? []) as SearchRow[];
  const totals = data.search_totals ?? {};
  const journeys = (data.journeys ?? []) as Journey[];
  const recovery = (data.recovery ?? []) as Recovery[];
  const channels = data.channels ?? {};
  const paths = (data.channel_paths ?? []) as ChannelPath[];
  const recoveredSales = recovery.reduce((t, r) => t + n(r.sales), 0);
  const recoveredOrders = recovery.reduce((t, r) => t + n(r.orders), 0);

  return (
    <div className="space-y-8" data-testid="shopper-report">
      <Section
        title="Each brand’s top sellers"
        caption="Line revenue, cancelled orders left out. Open a brand for the items that made it. A variation’s own brand wins over the product’s brand."
      >
        {brands.length === 0 ? <Unavailable>No brand sales in this period.</Unavailable> : (
          <div className="overflow-hidden rounded-lg border bg-white">
            {brands.map((b) => {
              const open = active === b.brand;
              return (
                <div key={b.brand} className="border-b last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenBrand(open ? '' : b.brand)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">{b.brand}</span>
                    <span className="shrink-0 text-sm tabular-nums text-gray-600">
                      {money(b.gross_sales)} · {count(b.orders)} orders · {count(b.units)} units
                    </span>
                  </button>
                  {open && (
                    <table className="w-full text-sm">
                      <tbody className="divide-y bg-gray-50">
                        {(b.products ?? []).map((p) => (
                          <tr key={p.product}>
                            <td className="px-3 py-2 pl-6 text-gray-800">{p.product}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{count(p.orders)} orders</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600">{count(p.units)} units</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">{money(p.gross_sales)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Sales pipeline"
        caption="Visits are sessions. Orders are orders placed, not sessions that reached the thank-you page, so the last step can be higher or lower than payment."
      >
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stages.map((s, i) => (
            <div key={s.label} className="rounded-lg border bg-white p-3">
              <div className="text-xs font-medium text-gray-500">{s.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{count(s.count)}</div>
              <div className="mt-1 text-xs text-gray-500">
                {i === 0 ? 'Everyone who visited' : `${pct(s.count, stages[i - 1].count)} of the previous step`}
              </div>
            </div>
          ))}
        </div>
        {n(pipe.sales) > 0 && <p className="text-sm text-gray-500">Orders in the pipeline are worth {money(pipe.sales)}.</p>}
      </Section>

      <Section
        title="One-time checkout, and shoppers who took time"
        caption="One-time means the order was the shopper’s only recorded visit, placed within 30 minutes of the first page. Took time means an earlier signed-in visit, or a buying visit longer than 30 minutes. Orders with no visit attached are listed apart, not guessed into either."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiTile label="One-time checkout" value={count(oneOrders)} sub={<>{money(pace.one_time_sales)} · {pct(oneOrders, paceOrders)} of timed orders</>} />
          <KpiTile label="Took time" value={count(tookOrders)} sub={<>{money(pace.took_time_sales)} · {tookTime}</>} />
          <KpiTile label="No visit linked" value={count(pace.unlinked_orders)} sub={<>{money(pace.unlinked_sales)} · tracking was off, or the purchase event never arrived</>} />
        </div>
      </Section>

      <Section
        title="Journey of shoppers"
        caption="The most common paths in the period. Repeated actions in one visit count once, in the order they first happened."
      >
        {journeys.length === 0 ? <Unavailable>No visits recorded in this period.</Unavailable> : (
          <Table heads={['Path', 'Visits', 'Bought']}>
            {journeys.map((j) => (
              <tr key={j.path}>
                <td className="px-3 py-2 text-gray-800">{pathLabel(j.path)}</td>
                <td className="px-3 py-2 tabular-nums">{count(j.sessions)}</td>
                <td className="px-3 py-2 tabular-nums">{count(j.orders)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Search"
        caption="Every search, how many products were shown, and whether a shown product was opened within 30 minutes. A buy is an order in that visit, or by the same signed-in customer, after that open and within 7 days of the search. One order is credited to the search they opened last, so it is not counted twice. Product lists are recorded from now on; older searches still count a product opened before the next search."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Searches" value={count(totals.searches)} sub={n(totals.listed) > 0 ? `${count(totals.listed)} stored the products shown` : 'No stored result lists yet'} />
          <KpiTile label="Opened a result" value={count(totals.clicks)} sub={pct(n(totals.clicks), n(totals.searches)) + ' of searches'} />
          <KpiTile label="Went on to buy" value={count(totals.orders)} sub={pct(n(totals.orders), n(totals.clicks)) + ' of clicks'} />
          <KpiTile label="Sales from those clicks" value={money(totals.sales)} />
        </div>
        {searches.length === 0 ? <Unavailable>No searches recorded in this period.</Unavailable> : (
          <Table heads={['Search', 'Searches', 'Shown', 'Opened', 'Bought', 'Sales']}>
            {searches.map((r) => (
              <tr key={r.query}>
                <td className="px-3 py-2 font-medium text-gray-900">{r.query}</td>
                <td className="px-3 py-2 tabular-nums">{count(r.searches)}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.avg_results == null || n(r.listed) === 0 ? '—' : Math.round(n(r.avg_results)).toLocaleString('en-IN')}</td>
                <td className="px-3 py-2 tabular-nums">{count(r.clicks)} <span className="text-gray-400">{pct(n(r.clicks), n(r.searches))}</span></td>
                <td className="px-3 py-2 tabular-nums">{count(r.orders)}</td>
                <td className="px-3 py-2 tabular-nums">{money(r.sales)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Sales brought back by abandoned-cart messages"
        caption="Messages sent in the period, by channel. An order is credited to the last reminder that reached the cart before it was placed, and only once. Email, SMS and WhatsApp are separate."
      >
        {recovery.length === 0 ? <Unavailable>No recovery messages or recovered orders in this period.</Unavailable> : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiTile label="Orders brought back" value={count(recoveredOrders)} />
              <KpiTile label="Sales brought back" value={money(recoveredSales)} />
            </div>
            <Table heads={['Channel', 'Sent', 'Failed', 'Orders', 'Sales']}>
              {recovery.map((r) => (
                <tr key={r.channel}>
                  <td className="px-3 py-2 font-medium text-gray-900">{channel(r.channel)}</td>
                  <td className="px-3 py-2 tabular-nums">{count(r.sent)}</td>
                  <td className="px-3 py-2 tabular-nums">{count(r.failed)}</td>
                  <td className="px-3 py-2 tabular-nums">{count(r.orders)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(r.sales)}</td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Section>

      <Section
        title="Shoppers who came in through more than one channel"
        caption="A visitor who arrived through two or more channels in the period, in the order those channels first appeared. Sales are the orders they placed in the same period."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile label="One channel" value={count(channels.one_visitors)} sub={<>{count(channels.one_orders)} orders · {money(channels.one_sales)}</>} />
          <KpiTile label="Several channels" value={count(channels.multi_visitors)} sub={<>{count(channels.multi_orders)} orders · {money(channels.multi_sales)}</>} />
        </div>
        {paths.length === 0 ? <Unavailable>No visitor came in through more than one channel in this period.</Unavailable> : (
          <Table heads={['Channels, in the order they arrived', 'Visitors', 'Orders', 'Sales']}>
            {paths.map((p) => (
              <tr key={p.path}>
                <td className="px-3 py-2 text-gray-800">{p.path.split(' → ').map((c) => channel(c.trim())).join(' → ')}</td>
                <td className="px-3 py-2 tabular-nums">{count(p.visitors)}</td>
                <td className="px-3 py-2 tabular-nums">{count(p.orders)}</td>
                <td className="px-3 py-2 tabular-nums">{money(p.sales)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
};

export default ShopperReport;
