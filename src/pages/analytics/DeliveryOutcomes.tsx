import React, { useMemo, useState } from 'react';
import DateRangeBar, { useDateRange, previousRange, PanelRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import {
  ChartCard, KpiTile, InsightCard, Insight, Segmented, SplitBar, TimeSeries, ordinalRamp, Unavailable,
} from '../../components/panelAnalytics/Kit';
import { SERIES, fmtBucket, fmtMoneyCompact } from '../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Download, RotateCcw, Search, X } from 'lucide-react';

/**
 * Analytics > Delivery & RTO. What became of the orders placed in a period, built to decide from:
 * the headline tiles, a few plain sentences on what to act on, where RTO comes from (COD and
 * prepaid by ads and organic), the weekly trend, what the open orders are waiting for, and a
 * sortable table by any group (payment, campaign, place, PIN code, courier, product, brand, period).
 * Every figure, rule, label and option list comes from the server
 * (`GET /api/v2/insights/panels/outcomes` and `/outcomes/overview`, one classification behind
 * both); the page only arranges them and words the sentences.
 */

interface Outcome {
  key?: string; pay?: string; traffic?: string; week?: string;
  placed: number; placed_value: number;
  delivered: number; delivered_value: number;
  returned: number; returned_value: number;
  rto: number; rto_value: number; rto_order_value: number; rto_in_transit: number; rto_value_per_order: number;
  lost: number; lost_value: number; lost_rate: number;
  cancelled: number; open: number; open_value: number; stale: number; resolved: number;
  delivery_rate: number; rto_rate: number; return_rate: number;
  left_out_recent?: number;
}
interface Labelled { key: string; label: string }
interface OptionRow { value: string; orders: number }
interface Knobs { mature_days: number; stale_days: number; min_resolved: number }
interface Stage { key: string; label: string; orders: number; value: number; stale: number }
interface Hotspot { group_by: string; label: string; cod_only: boolean; rows: Outcome[] }
interface Overview {
  knobs: Knobs;
  hotspot_min_resolved: number;
  totals: Outcome;
  matrix: Outcome[];
  trend: Outcome[];
  open: { total: number; stale: number; stale_days: number; rto_in_transit: number; stages: Stage[] };
  hotspots: Record<string, Hotspot>;
  labels: { pay: Labelled[]; traffic: Labelled[] };
  definitions: Record<string, string>;
}
interface GroupReport {
  group_by: string;
  group_label: string;
  item_level: boolean;
  rows: Outcome[];
  hidden: { groups: number; placed: number };
  totals: Outcome;
  options: Record<string, OptionRow[]>;
  groups: (Labelled & { item_level?: boolean })[];
  knobs: Knobs;
}

type FilterKey = 'traffic' | 'payment_method' | 'gateway' | 'campaign' | 'source' | 'medium';
type Filters = Partial<Record<FilterKey, string>>;

/** The filters the report takes, and which option list (from the answer) fills each. */
const FILTERS: { key: FilterKey; label: string; list: string }[] = [
  { key: 'payment_method', label: 'Payment', list: 'payment_methods' },
  { key: 'traffic', label: 'Ads or organic', list: 'traffic' },
  { key: 'campaign', label: 'Campaign', list: 'campaigns' },
  { key: 'source', label: 'Source', list: 'sources' },
  { key: 'medium', label: 'Medium', list: 'mediums' },
  { key: 'gateway', label: 'Gateway', list: 'gateways' },
];

const DEFAULT_MATURE_DAYS = 10;
const DEFAULT_STALE_DAYS = 10;
const DEFAULT_MIN_RESOLVED = 5;
const PAYMENT_RULES = '/settings/payment-discount';

const count = (v: number | undefined) => Number(v ?? 0).toLocaleString('en-IN');
const pct = (v: number | undefined) => `${Number(v ?? 0).toFixed(1)}%`;
/** Indian compact money for tiles and sentences: full rupees below a lakh, then "4.68 L", "1.2 Cr". */
const short = (v: number | undefined) => {
  const n = Number(v ?? 0);
  if (Math.abs(n) < 100_000) return `₹${Math.round(n).toLocaleString('en-IN')}`;
  return fmtMoneyCompact(n, 2).replace(/(\d)([A-Za-z]+)$/, '$1 $2');
};
/** A rate over a pair of counts (one decimal, 0 when nothing resolved). */
const rateOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Sum outcome rows (counts and values) and recompute the rates from the sums. */
function sumRows(rows: Outcome[]): Outcome {
  const keys: (keyof Outcome)[] = ['placed', 'placed_value', 'delivered', 'delivered_value', 'returned', 'returned_value',
    'rto', 'rto_value', 'rto_order_value', 'rto_in_transit', 'lost', 'lost_value', 'cancelled', 'open', 'open_value', 'stale', 'resolved'];
  const out: any = {};
  for (const k of keys) out[k] = rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  out.delivery_rate = rateOf(out.delivered, out.resolved);
  out.rto_rate = rateOf(out.rto, out.resolved);
  out.return_rate = rateOf(out.returned, out.resolved);
  out.lost_rate = rateOf(out.lost, out.resolved);
  out.rto_value_per_order = out.rto > 0 ? out.rto_value / out.rto : 0;
  return out as Outcome;
}

/** A number box that commits on blur or Enter (one request per decision, not per keystroke). */
const NumberBox: React.FC<{ value: number; min: number; max: number; onCommit: (n: number) => void; label: string; className?: string }> = ({
  value, min, max, onCommit, label, className,
}) => {
  const [draft, setDraft] = useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const c = Math.min(max, Math.max(min, n));
    setDraft(String(c));
    if (c !== value) onCommit(c);
  };
  return (
    <input type="number" inputMode="numeric" aria-label={label} min={min} max={max} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={`w-14 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-center text-sm tabular-nums ${className ?? ''}`} />
  );
};

const DeliveryOutcomes: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const prevRange = useMemo(() => previousRange(range), [range.from, range.to]);
  const [filters, setFilters] = useState<Filters>({});
  const [settled, setSettled] = useState(false);
  const [matureDays, setMatureDays] = useState(DEFAULT_MATURE_DAYS);
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS);
  const [groupBy, setGroupBy] = useState('state');
  const [minResolved, setMinResolved] = useState(DEFAULT_MIN_RESOLVED);

  const knobs = { mature_days: settled ? matureDays : undefined, stale_days: staleDays };
  const overview = usePanelStats<Overview>('outcomes/overview', range, true, { ...filters, ...knobs });
  const prev = usePanelStats<Overview>('outcomes/overview', prevRange ?? {}, !!prevRange, { ...filters, ...knobs });
  const report = usePanelStats<GroupReport>('outcomes', range, true, { ...filters, ...knobs, group_by: groupBy, min_resolved: minResolved });

  const o = overview.data;
  const t = o?.totals;
  const pt = prevRange ? prev.data?.totals ?? null : null;
  const labels = o?.labels;
  const word = (kind: 'pay' | 'traffic', key?: string) => labels?.[kind]?.find((l) => l.key === key)?.label ?? key ?? '';
  const valueWord = (filter: FilterKey, value: string) => (filter === 'traffic' ? word('traffic', value)
    : filter === 'payment_method' || filter === 'gateway' ? (labels?.pay.find((l) => l.key === value)?.label ?? value) : value);

  const setFilter = (k: FilterKey, v: string) => setFilters((f) => {
    const next = { ...f };
    if (v) next[k] = v; else delete next[k];
    return next;
  });
  const reset = () => { setFilters({}); setSettled(false); setMatureDays(DEFAULT_MATURE_DAYS); };
  const active = Object.keys(filters).length > 0 || settled;

  const insights = useMemo(() => (o ? actOn(o, { settled, matureDays, word }) : []), [o, settled, matureDays]);

  const vs = 'vs previous period';
  const relDelta = (cur: number, before: number | undefined, text: (n: number) => string, goodWhen: 'up' | 'down' = 'up') =>
    (pt ? { current: cur, previous: before ?? 0, label: vs, goodWhen, previousText: text(before ?? 0) } : null);
  const ptsDelta = (cur: number, before: number | undefined, resolvedBefore: number | undefined, goodWhen: 'up' | 'down') =>
    (pt && (resolvedBefore ?? 0) > 0 ? { current: cur, previous: before ?? 0, label: vs, goodWhen, mode: 'points' as const, previousText: pct(before) } : null);
  const busy = overview.loading && !!o;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Delivery &amp; RTO</h1>
          <p className="text-sm text-gray-500">What became of the orders placed in the period, where RTO comes from, and what to act on.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      <FilterBar options={report.data?.options} filters={filters} onChange={setFilter} valueWord={valueWord}
        settled={settled} onSettled={setSettled} matureDays={matureDays} onMatureDays={setMatureDays}
        active={active} onReset={reset} />

      {overview.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overview.error}</div>}
      {overview.loading && !o && <div className="p-8 text-sm text-gray-500">Loading delivery outcomes...</div>}

      {t && o && (
        <>
          <section aria-label="Headline figures" className={`grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 ${busy ? 'opacity-60' : ''}`}>
            <KpiTile label="Orders placed" value={count(t.placed)}
              sub={<span title={fmtRupees(t.placed_value)}>{short(t.placed_value)} placed</span>}
              delta={relDelta(t.placed, pt?.placed, count)} />
            <KpiTile label="Delivered" value={count(t.delivered)}
              sub={<span title={fmtRupees(t.delivered_value)}>{short(t.delivered_value)} delivered</span>}
              delta={relDelta(t.delivered, pt?.delivered, count)} />
            <KpiTile label="Delivery rate" value={t.resolved > 0 ? pct(t.delivery_rate) : 'None yet'}
              sub={`of ${count(t.resolved)} resolved orders`}
              delta={t.resolved > 0 ? ptsDelta(t.delivery_rate, pt?.delivery_rate, pt?.resolved, 'up') : null} />
            <KpiTile label="RTO rate" value={t.resolved > 0 ? pct(t.rto_rate) : 'None yet'}
              sub={(
                <>
                  <div>{count(t.rto)} {plural(t.rto, 'order', 'orders')} sent back</div>
                  <div title={fmtRupees(t.lost_value)}>{count(t.lost)} lost or damaged (not RTO)</div>
                </>
              )}
              delta={t.resolved > 0 ? ptsDelta(t.rto_rate, pt?.rto_rate, pt?.resolved, 'down') : null} />
            <KpiTile label="RTO value lost" value={<span title={fmtRupees(t.rto_value)}>{short(t.rto_value)}</span>}
              sub={(
                <>
                  <div title={fmtRupees(t.rto_value_per_order)}>{t.rto > 0 ? `${short(t.rto_value_per_order)} per RTO order` : 'No RTO orders'}</div>
                  <div title={fmtRupees(t.lost_value)}>Lost or damaged: {short(t.lost_value)}</div>
                </>
              )}
              delta={relDelta(t.rto_value, pt?.rto_value, short, 'down')} />
            <KpiTile label="Still open" value={count(t.open)}
              sub={(
                <a href="#open-orders" className="inline-flex items-center font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
                  See breakdown <ChevronRight aria-hidden className="size-3.5" />
                </a>
              )} />
          </section>

          <Notes t={t} settled={settled} matureDays={matureDays} />

          {insights.length > 0 && (
            <section aria-labelledby="act-on">
              <h2 id="act-on" className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
              </div>
            </section>
          )}

          {t.placed === 0 ? (
            <Unavailable>No orders were placed in this period.</Unavailable>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <Matrix o={o} word={word} dim={busy} />
                <OpenOrders o={o} staleDays={staleDays} onStaleDays={setStaleDays} dim={busy} />
              </div>
              <Trend o={o} dim={busy} />
            </>
          )}
        </>
      )}

      <GroupTable state={report} groupBy={groupBy} onGroup={setGroupBy} minResolved={minResolved}
        onMinResolved={setMinResolved} range={range} word={word} />

      {o?.definitions && <Definitions defs={o.definitions} />}
    </div>
  );
};

// Filter bar

const FilterBar: React.FC<{
  options?: Record<string, OptionRow[]>; filters: Filters; onChange: (k: FilterKey, v: string) => void;
  valueWord: (k: FilterKey, v: string) => string;
  settled: boolean; onSettled: (v: boolean) => void; matureDays: number; onMatureDays: (n: number) => void;
  active: boolean; onReset: () => void;
}> = ({ options, filters, onChange, valueWord, settled, onSettled, matureDays, onMatureDays, active, onReset }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => {
        const list = options?.[f.list] ?? [];
        const current = filters[f.key] ?? '';
        // Keep a chosen value listed even when the new range has no order with it.
        const listed = current && !list.some((x) => x.value === current) ? [{ value: current, orders: 0 }, ...list] : list;
        return (
          <select key={f.key} aria-label={f.label} value={current} onChange={(e) => onChange(f.key, e.target.value)}
            className={`max-w-[11rem] rounded-md border px-2 py-1.5 text-sm ${current ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-600'}`}>
            <option value="">{f.label}: all</option>
            {listed.map((x) => <option key={x.value} value={x.value}>{valueWord(f.key, x.value)} ({count(x.orders)})</option>)}
          </select>
        );
      })}
      <label className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700">
        <input type="checkbox" checked={settled} onChange={(e) => onSettled(e.target.checked)} className="size-4" />
        Only orders placed at least
        <NumberBox value={matureDays} min={1} max={365} onCommit={(n) => { onMatureDays(n); onSettled(true); }} label="Days since the order was placed" />
        days ago
      </label>
      {active && (
        <button type="button" onClick={onReset}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
          <RotateCcw aria-hidden className="size-4" /> Reset
        </button>
      )}
    </div>
    {active && (
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Active filters">
        {FILTERS.filter((f) => filters[f.key]).map((f) => (
          <Chip key={f.key} text={`${f.label}: ${valueWord(f.key, filters[f.key]!)}`} onRemove={() => onChange(f.key, '')} />
        ))}
        {settled && <Chip text={`Placed ${matureDays}+ days ago`} onRemove={() => onSettled(false)} />}
      </div>
    )}
  </div>
);

const Chip: React.FC<{ text: string; onRemove: () => void }> = ({ text, onRemove }) => (
  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gray-800">
    <span className="truncate">{text}</span>
    <button type="button" onClick={onRemove} aria-label={`Remove ${text}`} className="rounded-full p-0.5 hover:bg-gray-200">
      <X aria-hidden className="size-3" />
    </button>
  </span>
);

/** The quiet facts under the tiles: what the maturity knob left out, and when there are no returns. */
const Notes: React.FC<{ t: Outcome; settled: boolean; matureDays: number }> = ({ t, settled, matureDays }) => {
  const lines: string[] = [];
  if (settled) lines.push(`${count(t.left_out_recent)} ${plural(t.left_out_recent ?? 0, 'order', 'orders')} placed in the last ${matureDays} days left out.`);
  if (t.returned === 0) lines.push('No customer returns recorded in this period.');
  else lines.push(`${count(t.returned)} ${plural(t.returned, 'order', 'orders')} returned by the customer (${pct(t.return_rate)} of resolved), ${short(t.returned_value)}.`);
  if (t.cancelled > 0) lines.push(`${count(t.cancelled)} cancelled.`);
  return <p className="text-sm text-gray-500">{lines.join(' ')}</p>;
};

// What to act on

/** The plain sentences, computed from the overview. Nothing is said without the volume to back it. */
function actOn(o: Overview, ctx: { settled: boolean; matureDays: number; word: (k: 'pay' | 'traffic', key?: string) => string }): Insight[] {
  const out: Insight[] = [];
  const t = o.totals;
  const min = Math.max(1, o.hotspot_min_resolved);
  const cod = sumRows(o.matrix.filter((r) => r.pay === 'cod'));
  const pre = sumRows(o.matrix.filter((r) => r.pay === 'prepaid'));
  const codName = ctx.word('pay', 'cod');
  const preName = ctx.word('pay', 'prepaid');

  if (cod.resolved >= min && pre.resolved >= min && cod.rto_rate > pre.rto_rate) {
    const ratio = pre.rto_rate > 0 ? cod.rto_rate / pre.rto_rate : null;
    const times = ratio === null ? null : ratio >= 10 ? Math.round(ratio).toString() : ratio.toFixed(1);
    out.push({
      tone: 'bad',
      title: times
        ? `${codName} orders come back ${times} times as often as ${preName.toLowerCase()} (${pct(cod.rto_rate)} vs ${pct(pre.rto_rate)}).`
        : `${codName} orders come back ${pct(cod.rto_rate)} of the time; ${preName.toLowerCase()} orders never did.`,
      body: <>{codName} sent back {count(cod.rto)} orders worth {short(cod.rto_value)}; {preName.toLowerCase()} {count(pre.rto)} worth {short(pre.rto_value)}.</>,
      action: { label: 'Open payment rules', to: PAYMENT_RULES },
    });
  }

  const cells = o.matrix.filter((r) => r.resolved >= min);
  const worst = [...cells].sort((a, b) => b.rto_rate - a.rto_rate)[0];
  if (worst && cells.length > 1 && worst.rto > 0) {
    const name = `${ctx.word('pay', worst.pay)} from ${ctx.word('traffic', worst.traffic).toLowerCase()}`;
    const share = t.rto > 0 ? Math.round((worst.rto / t.rto) * 100) : 0;
    out.push({
      tone: 'bad',
      title: `${name}: RTO ${pct(worst.rto_rate)}, the worst segment.`,
      body: <>{count(worst.rto)} of {count(worst.resolved)} resolved orders went back ({short(worst.rto_value)} of goods), {share}% of all RTO orders.</>,
    });
  }

  const codAvg = cod.resolved > 0 ? cod.rto_rate : t.rto_rate;
  const pins = (o.hotspots.pincode_cod?.rows ?? []).filter((r) => r.key !== 'Unknown' && r.rto_rate > codAvg).slice(0, 5);
  if (pins.length > 0) {
    const agg = sumRows(pins);
    out.push({
      tone: 'bad',
      title: `${pins.length === 1 ? 'This PIN code' : `These ${pins.length} PIN codes`} returned ${pct(agg.rto_rate)} of ${pins.length === 1 ? 'its' : 'their'} ${codName} orders: consider blocking ${codName} there.`,
      body: <>{pins.map((p) => `${p.key} (${p.rto} of ${p.resolved})`).join(', ')}. Store {codName} average: {pct(codAvg)}. {short(agg.rto_value)} of goods came back from them.</>,
      action: { label: 'Open payment rules', to: PAYMENT_RULES },
    });
  }

  if (o.open.total > 0) {
    const top = [...o.open.stages].sort((a, b) => b.orders - a.orders)[0];
    out.push({
      tone: o.open.stale > 0 ? 'bad' : 'info',
      title: o.open.stale > 0
        ? `${count(o.open.total)} orders still open, ${count(o.open.stale)} not updated for ${o.open.stale_days}+ days.`
        : `${count(o.open.total)} orders still open.`,
      body: top && top.orders > 0 ? <>Most are {top.label.toLowerCase()} ({count(top.orders)}). Chase the ones not updated first.</> : null,
      action: { label: 'See the breakdown', to: '#open-orders' },
    });
  }

  if (t.lost > 0) {
    out.push({
      tone: 'bad',
      title: `${count(t.lost)} ${plural(t.lost, 'order was', 'orders were')} lost or damaged by the courier (${short(t.lost_value)}).`,
      body: <>The courier's failure, not the buyer's, so they are not in the RTO rate. Raise them with the courier.</>,
    });
  }

  const couriers = (o.hotspots.courier?.rows ?? []).filter((r) => r.resolved < t.resolved);
  const badCourier = couriers[0];
  if (badCourier && badCourier.rto_rate > t.rto_rate) {
    out.push({
      tone: 'bad',
      title: `Courier ${badCourier.key}: RTO ${pct(badCourier.rto_rate)}, above the store's ${pct(t.rto_rate)}.`,
      body: <>{count(badCourier.rto)} of {count(badCourier.resolved)} resolved orders went back. Compare couriers in the table below (group by Courier).</>,
    });
  }

  const campaign = (o.hotspots.campaign?.rows ?? []).find((r) => !r.key?.startsWith('(') && r.rto_rate > t.rto_rate);
  if (campaign) {
    out.push({
      tone: 'bad',
      title: `Campaign ${campaign.key}: RTO ${pct(campaign.rto_rate)}.`,
      body: <>{count(campaign.rto)} of {count(campaign.resolved)} resolved orders went back ({short(campaign.rto_value)}), against {pct(t.rto_rate)} for the store.</>,
    });
  }

  if (!ctx.settled && t.placed > 0 && t.open / t.placed >= 0.2) {
    out.push({
      tone: 'info',
      title: `${Math.round((t.open / t.placed) * 100)}% of the orders are still open.`,
      body: <>Recent orders have not reached a final outcome, so these rates can still move. Tick "Only orders placed at least {ctx.matureDays} days ago" for settled figures.</>,
    });
  }
  return out;
}

// Where RTO comes from (matrix)

const Matrix: React.FC<{ o: Overview; word: (k: 'pay' | 'traffic', key?: string) => string; dim: boolean }> = ({ o, word, dim }) => {
  const pays = o.labels.pay;
  const traffics = o.labels.traffic;
  const cell = (pay?: string, traffic?: string) => sumRows(o.matrix.filter((r) => (!pay || r.pay === pay) && (!traffic || r.traffic === traffic)));
  const min = Math.max(1, o.hotspot_min_resolved);
  const inner = pays.flatMap((p) => traffics.map((tr) => ({ p: p.key, tr: tr.key, r: cell(p.key, tr.key) })));
  const worst = [...inner].filter((c) => c.r.resolved >= min && c.r.rto > 0).sort((a, b) => b.r.rto_rate - a.r.rto_rate)[0];
  const maxRate = Math.max(1, ...inner.map((c) => c.r.rto_rate));
  const Cell: React.FC<{ r: Outcome; isWorst?: boolean; total?: boolean }> = ({ r, isWorst, total }) => (
    <td className={`p-1 align-top sm:p-2 ${total ? 'bg-gray-50' : ''}`}>
      <div className={`rounded-lg border p-1.5 sm:p-2 ${isWorst ? 'border-bad-ink' : 'border-gray-100'}`}
        title={`${count(r.placed)} placed, ${count(r.resolved)} resolved, ${count(r.rto)} RTO, ${fmtRupees(r.rto_value)} RTO value, ${count(r.lost)} lost or damaged (${fmtRupees(r.lost_value)})`}>
        {r.resolved > 0 ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold tabular-nums text-gray-900 sm:text-lg">{pct(r.rto_rate)}</span>
              <span className="hidden text-[11px] text-gray-500 sm:inline">RTO</span>
            </div>
            <div className="my-1 h-1.5 rounded-full bg-gray-100" aria-hidden>
              <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.rto_rate / maxRate) * 100)}%`, background: 'var(--viz-1)' }} />
            </div>
            <div className="text-[11px] leading-snug text-gray-600">
              <div className="hidden sm:block">{pct(r.delivery_rate)} delivered</div>
              <div className="whitespace-nowrap">{count(r.placed)} placed</div>
              <div className="whitespace-nowrap"><span className="sm:hidden">RTO </span><span className="hidden sm:inline">RTO value </span>{short(r.rto_value)}</div>
              <div className="whitespace-nowrap">{count(r.lost)} lost<span className="hidden sm:inline"> or damaged</span></div>
            </div>
            {isWorst && (
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-bad-ink">
                <AlertTriangle aria-hidden className="size-3" /> Worst
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-gray-400">{count(r.placed)} placed, none resolved</div>
        )}
      </div>
    </td>
  );
  return (
    <ChartCard title="Where RTO comes from" sub="RTO rate by payment and traffic, over resolved orders." dim={dim}
      table={{
        columns: [
          { key: 'name', label: 'Segment', align: 'left' },
          { key: 'placed', label: 'Placed', format: (v) => count(v) },
          { key: 'resolved', label: 'Resolved', format: (v) => count(v) },
          { key: 'delivery_rate', label: 'Delivery %', format: (v) => pct(v) },
          { key: 'rto', label: 'RTO', format: (v) => count(v) },
          { key: 'rto_rate', label: 'RTO %', format: (v) => pct(v) },
          { key: 'rto_value', label: 'RTO value', format: (v) => fmtRupees(v) },
          { key: 'lost', label: 'Lost or damaged', format: (v) => count(v) },
          { key: 'lost_value', label: 'Lost value', format: (v) => fmtRupees(v) },
        ],
        rows: inner.map((c) => ({ name: `${word('pay', c.p)}, ${word('traffic', c.tr).toLowerCase()}`, ...c.r })),
        footer: { name: 'All', ...o.totals },
      }}>
      <div className="-mx-1 overflow-x-auto sm:-mx-2">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="w-[3.75rem] p-1 font-medium sm:w-24 sm:p-2" />
              {traffics.map((tr) => <th key={tr.key} className="p-1 font-medium sm:p-2">{tr.label}</th>)}
              <th className="bg-gray-50 p-1 font-medium sm:p-2">All</th>
            </tr>
          </thead>
          <tbody>
            {pays.map((p) => (
              <tr key={p.key}>
                <th scope="row" className="p-1 text-left align-top text-sm font-semibold text-gray-800 sm:p-2">{p.label}</th>
                {traffics.map((tr) => (
                  <Cell key={tr.key} r={cell(p.key, tr.key)} isWorst={worst?.p === p.key && worst?.tr === tr.key} />
                ))}
                <Cell r={cell(p.key)} total />
              </tr>
            ))}
            <tr>
              <th scope="row" className="bg-gray-50 p-1 text-left align-top text-sm font-semibold text-gray-800 sm:p-2">All</th>
              {traffics.map((tr) => <Cell key={tr.key} r={cell(undefined, tr.key)} total />)}
              <Cell r={o.totals} total />
            </tr>
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
};

// Open orders

const OpenOrders: React.FC<{ o: Overview; staleDays: number; onStaleDays: (n: number) => void; dim: boolean }> = ({ o, staleDays, onStaleDays, dim }) => {
  const stages = o.open.stages;
  // The stages a parcel moves through, light to strong; "other" is no step of that order.
  const steps = stages.filter((s) => s.key !== 'other');
  const ramp = ordinalRamp(steps.length);
  const colorOf = (key: string) => (key === 'other' ? 'var(--n-300)' : ramp[steps.findIndex((s) => s.key === key)]);
  return (
    <div id="open-orders" className="scroll-mt-4">
      <ChartCard title="Still open: what they are waiting for" dim={dim}
        sub={`${count(o.open.total)} orders, ${short(o.totals.open_value)}. ${count(o.open.stale)} not updated for ${o.open.stale_days}+ days.`}>
        {o.open.total === 0 ? (
          <Unavailable>No open orders: every order of the period reached an outcome.</Unavailable>
        ) : (
          <SplitBar label="Open orders by stage" testId="open-stages"
            rows={stages.map((s) => ({
              key: s.key, name: s.label, value: s.orders, color: colorOf(s.key),
              detail: s.stale > 0 ? <span className="text-bad-ink">{count(s.stale)} not updated</span> : undefined,
            }))} />
        )}
        <label className="mt-3 flex flex-wrap items-center gap-1 text-xs text-gray-600">
          Not updated: no shipment change for
          <NumberBox value={staleDays} min={1} max={365} onCommit={onStaleDays} label="Days without a shipment update" />
          days.
        </label>
        {o.open.rto_in_transit > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Also {count(o.open.rto_in_transit)} RTO {plural(o.open.rto_in_transit, 'order is', 'orders are')} still on the way back to the store (counted as RTO, not open).
          </p>
        )}
      </ChartCard>
    </div>
  );
};

// Weekly trend

const Trend: React.FC<{ o: Overview; dim: boolean }> = ({ o, dim }) => {
  const [measure, setMeasure] = useState<'rto_rate' | 'delivery_rate'>('rto_rate');
  const pays = o.labels.pay;
  const weeks = useMemo(() => {
    const by = new Map<string, any>();
    for (const r of o.trend) {
      const w = r.week ?? '';
      const row = by.get(w) ?? { week: w };
      row[`${r.pay}_placed`] = r.placed;
      row[`${r.pay}_resolved`] = r.resolved;
      row[`${r.pay}_rto_rate`] = r.resolved > 0 ? r.rto_rate : null;
      row[`${r.pay}_delivery_rate`] = r.resolved > 0 ? r.delivery_rate : null;
      by.set(w, row);
    }
    return [...by.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)));
  }, [o.trend]);
  const colorOf = (i: number) => SERIES[i];
  const rateSeries = pays.map((p, i) => ({ key: `${p.key}_${measure}`, name: p.label, color: colorOf(i) }));
  const volSeries = pays.map((p, i) => ({ key: `${p.key}_placed`, name: p.label, color: colorOf(i), kind: 'bar' as const, stackId: 'placed' }));
  const label = measure === 'rto_rate' ? 'RTO %' : 'Delivery %';
  return (
    <ChartCard title={`${label} by week of order`} dim={dim}
      sub={`${pays.map((p) => p.label).join(' and ')}, over resolved orders. Recent weeks still have open orders.`}
      table={{
        columns: [
          { key: 'week', label: 'Week of', align: 'left', format: (v) => fmtBucket(String(v), 'week') },
          ...pays.flatMap((p) => [
            { key: `${p.key}_placed`, label: `${p.label} placed`, format: (v: any) => count(v) },
            { key: `${p.key}_${measure}`, label: `${p.label} ${label}`, format: (v: any) => (v === null || v === undefined ? 'None resolved' : pct(v)) },
          ]),
        ],
        rows: weeks,
      }}>
      {weeks.length === 0 ? <Unavailable>No orders in this period.</Unavailable> : (
        <div className="space-y-4">
          <Segmented size="sm" label="Measure" value={measure} onChange={(k) => setMeasure(k as typeof measure)}
            options={[{ key: 'rto_rate', label: 'RTO %' }, { key: 'delivery_rate', label: 'Delivery %' }]} />
          <TimeSeries data={weeks} series={rateSeries} granularity="week" xKey="week" percent height={220}
            tooltipLabel={(w) => `Week of ${fmtBucket(String(w), 'week')}`} />
          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">Orders placed per week</div>
            <TimeSeries data={weeks} series={volSeries} granularity="week" xKey="week" height={140}
              tooltipLabel={(w) => `Week of ${fmtBucket(String(w), 'week')}`} />
          </div>
        </div>
      )}
    </ChartCard>
  );
};

// Group table

type SortKey = keyof Outcome | 'key';
const COLUMNS: { key: keyof Outcome; label: string; kind: 'count' | 'rate' | 'money' }[] = [
  { key: 'placed', label: 'Placed', kind: 'count' },
  { key: 'rto_rate', label: 'RTO %', kind: 'rate' },
  { key: 'delivery_rate', label: 'Delivery %', kind: 'rate' },
  { key: 'rto', label: 'RTO', kind: 'count' },
  { key: 'rto_value', label: 'RTO value', kind: 'money' },
  { key: 'rto_value_per_order', label: 'Per RTO order', kind: 'money' },
  { key: 'lost', label: 'Lost or damaged', kind: 'count' },
  { key: 'delivered', label: 'Delivered', kind: 'count' },
  { key: 'returned', label: 'Returned', kind: 'count' },
  { key: 'cancelled', label: 'Cancelled', kind: 'count' },
  { key: 'open', label: 'Open', kind: 'count' },
];
const fmtCell = (c: (typeof COLUMNS)[number], r: Outcome) => {
  const v = Number(r[c.key] ?? 0);
  if (c.kind === 'money') return fmtRupees(v);
  if (c.kind === 'rate') return r.resolved > 0 ? pct(v) : '';
  return count(v);
};

const GroupTable: React.FC<{
  state: { data: GroupReport | null; loading: boolean; error: string | null };
  groupBy: string; onGroup: (k: string) => void; minResolved: number; onMinResolved: (n: number) => void;
  range: PanelRange; word: (k: 'pay' | 'traffic', key?: string) => string;
}> = ({ state, groupBy, onGroup, minResolved, onMinResolved, range, word }) => {
  const data = state.data;
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'placed', dir: 'desc' });
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const groups = data?.groups ?? [];
  const label = groups.find((g) => g.key === groupBy)?.label ?? data?.group_label ?? 'Group';
  const name = (key?: string) => (groupBy === 'traffic' ? word('traffic', key) : groupBy === 'payment_method' ? word('pay', key) : key ?? '');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.rows ?? []).filter((r) => !q || name(r.key).toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => (sort.key === 'key'
      ? String(a.key ?? '').localeCompare(String(b.key ?? '')) * dir
      : (Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0)) * dir));
  }, [data?.rows, sort, query]);
  const visible = all ? rows : rows.slice(0, 50);
  const by = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'key' ? 'asc' : 'desc' }));
  const pick = (k: string) => {
    onGroup(k); setAll(false); setQuery('');
    setSort(k === 'day' || k === 'week' || k === 'month' ? { key: 'key', dir: 'asc' } : { key: 'placed', dir: 'desc' });
  };

  const downloadCsv = () => {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [label, ...COLUMNS.map((c) => c.label), 'Resolved', 'RTO order value', 'Lost value'];
    const line = (n: string, r: Outcome) => [
      n, ...COLUMNS.map((c) => (c.kind === 'money' ? Number(r[c.key] ?? 0).toFixed(2) : c.kind === 'rate' ? Number(r[c.key] ?? 0).toFixed(1) : Number(r[c.key] ?? 0))),
      r.resolved, Number(r.rto_order_value ?? 0).toFixed(2), Number(r.lost_value ?? 0).toFixed(2),
    ].map(q).join(',');
    const lines = rows.map((r) => line(name(r.key), r));
    if (data?.totals) lines.push(line('Total', data.totals));
    const blob = new Blob([[head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delivery-outcomes-by-${groupBy}-${range.from ?? 'alltime'}-${range.to ?? 'today'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sortHead = (k: SortKey, text: string, right = false, sticky = false) => (
    <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'} ${sticky ? 'sticky left-0 z-[1] bg-gray-50' : ''}`}>
      <button type="button" onClick={() => by(k)} className={`inline-flex items-center gap-1 hover:text-gray-800 ${right ? 'flex-row-reverse' : ''}`}>
        {text}
        {sort.key === k && (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}
      </button>
    </th>
  );
  const hidden = data?.hidden;

  return (
    <section id="outcomes-table" className="space-y-3" aria-labelledby="by-group">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 id="by-group" className="mr-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Outcomes by</h2>
        <select aria-label="Group by" value={groupBy} onChange={(e) => pick(e.target.value)}
          className="rounded-md border border-gray-900 bg-white px-2 py-1 text-sm font-medium text-gray-900 sm:hidden">
          {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        {groups.map((g) => (
          <button key={g.key} type="button" aria-pressed={groupBy === g.key} onClick={() => pick(g.key)}
            className={`hidden rounded-full border px-2.5 py-0.5 text-sm font-medium sm:inline-block ${groupBy === g.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {g.label}
          </button>
        ))}
      </div>
      {state.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <div className="relative w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label}`}
              className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm" />
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            At least
            <NumberBox value={minResolved} min={0} max={100000} onCommit={onMinResolved} label="Minimum resolved orders per row" />
            resolved
          </label>
          <button type="button" onClick={downloadCsv} disabled={rows.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download aria-hidden className="size-4" /> CSV
          </button>
        </div>
        <div className="space-y-0.5 px-3 pt-2 text-xs text-gray-500">
          <div>{count(rows.length)} {plural(rows.length, 'row', 'rows')}. Rates are over resolved orders (delivered + returned + RTO + lost or damaged).</div>
          {hidden && hidden.groups > 0 && (
            <div>{count(hidden.groups)} more {plural(hidden.groups, 'row has', 'rows have')} fewer than {minResolved} resolved orders and {plural(hidden.groups, 'is', 'are')} not listed{data?.item_level ? '' : ` (${count(hidden.placed)} orders)`}.</div>
          )}
          {data?.item_level && <div>An order counts under every {label.toLowerCase()} it contains, so the rows add up to more than the total.</div>}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {sortHead('key', label, false, true)}
                {COLUMNS.map((c) => sortHead(c.key, c.label, true))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 ${state.loading ? 'opacity-60' : ''}`}>
              {state.loading && !data && <tr><td colSpan={COLUMNS.length + 1} className="p-6 text-center text-gray-500">Loading...</td></tr>}
              {!state.loading && data && rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} className="p-6 text-center text-gray-500">No row with {minResolved}+ resolved orders in this period.</td></tr>
              )}
              {visible.map((r) => (
                <tr key={r.key ?? ''} className="hover:bg-gray-50">
                  <td className="sticky left-0 max-w-[14rem] truncate bg-white px-3 py-1.5 text-gray-800" title={r.key}>{name(r.key)}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} title={c.key === 'lost' ? fmtRupees(r.lost_value) : undefined}
                      className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-900">{fmtCell(c, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {data?.totals && rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 font-semibold">
                <tr>
                  <td className="sticky left-0 bg-white px-3 py-2">Total{data.item_level ? ' orders' : ''}</td>
                  {COLUMNS.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtCell(c, data.totals)}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {rows.length > visible.length && (
          <div className="border-t border-gray-100 p-3 text-center">
            <button type="button" onClick={() => setAll(true)} className="text-sm font-medium text-gray-700 hover:underline">
              Show all {count(rows.length)}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

// How these numbers are counted

/** The server's definitions, once, collapsed. */
const Definitions: React.FC<{ defs: Record<string, string> }> = ({ defs }) => (
  <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
    <summary className="cursor-pointer select-none font-medium text-gray-800">How these numbers are counted</summary>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      {Object.entries(defs).map(([k, v]) => <li key={k}>{v}</li>)}
    </ul>
  </details>
);

export default DeliveryOutcomes;
