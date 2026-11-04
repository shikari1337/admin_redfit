import React, { useMemo, useState } from 'react';
import DateRangeBar, { useDateRange, previousRange, PanelRange } from '../../components/panelAnalytics/DateRangeBar';
import { usePanelStats } from '../../components/panelAnalytics/usePanelStats';
import { KpiTile, SplitBar } from '../../components/panelAnalytics/Kit';
import { INK, SERIES, STATUS } from '../../components/panelAnalytics/vizTheme';
import { fmtRupees } from '../../lib/money';
import { ArrowDown, ArrowUp, Download, Info, X } from 'lucide-react';

/**
 * Analytics → Delivery & RTO. What became of the orders placed in a period: delivered, returned
 * by the customer, returned to origin (RTO), cancelled or still open — per payment method,
 * gateway, campaign, source, medium, ads vs organic, channel or period, with filters on the same
 * keys. Every figure, every rule and every option list comes from the server
 * (`GET /api/v2/insights/panels/outcomes`): each order counts once, by its final outcome; the rates
 * are shares of the orders that reached one; the RTO loss is the goods value (total − shipping −
 * COD fee), courier charges not included. The page states the server's own definitions.
 */

interface Outcome {
  key?: string;
  placed: number; placed_value: number;
  delivered: number; delivered_value: number;
  returned: number; returned_value: number;
  rto: number; rto_value: number; rto_order_value: number;
  cancelled: number; open: number; resolved: number;
  delivery_rate: number; rto_rate: number; return_rate: number;
}
interface OptionRow { value: string; orders: number }
interface Outcomes {
  group_by: string;
  group_label: string;
  rows: Outcome[];
  totals: Outcome;
  filters: Record<string, string>;
  options: Record<string, OptionRow[]>;
  groups: { key: string; label: string }[];
  definitions: Record<string, string>;
}

type FilterKey = 'traffic' | 'payment_method' | 'gateway' | 'campaign' | 'source' | 'medium';
type Filters = Partial<Record<FilterKey, string>>;

/** The filters the report takes, and which option list (from the answer) fills each. */
const FILTERS: { key: FilterKey; label: string; list: string }[] = [
  { key: 'traffic', label: 'Ads / organic', list: 'traffic' },
  { key: 'payment_method', label: 'Payment', list: 'payment_methods' },
  { key: 'gateway', label: 'Gateway', list: 'gateways' },
  { key: 'campaign', label: 'Campaign', list: 'campaigns' },
  { key: 'source', label: 'Source', list: 'sources' },
  { key: 'medium', label: 'Medium', list: 'mediums' },
];

/** Display words for the API's fixed words (anything else shows as the server sent it). */
const WORDS: Record<string, Record<string, string>> = {
  traffic: { paid: 'Ads', organic: 'Organic' },
  payment_method: { cod: 'COD', prepaid: 'Prepaid' },
  gateway: { cod: 'COD' },
};
const word = (group: string, key: string | undefined) => (key === undefined ? '' : WORDS[group]?.[key] ?? key);

const pct = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}%`);
const count = (v: number | undefined) => Number(v ?? 0).toLocaleString('en-IN');

type SortKey = keyof Outcome;
const COLUMNS: { key: SortKey; label: string; money?: boolean; rate?: boolean }[] = [
  { key: 'placed', label: 'Placed' },
  { key: 'placed_value', label: 'Placed value', money: true },
  { key: 'delivered', label: 'Delivered' },
  { key: 'delivery_rate', label: 'Delivery %', rate: true },
  { key: 'returned', label: 'Returned' },
  { key: 'return_rate', label: 'Return %', rate: true },
  { key: 'rto', label: 'RTO' },
  { key: 'rto_rate', label: 'RTO %', rate: true },
  { key: 'rto_value', label: 'RTO goods value', money: true },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'open', label: 'Open' },
];

const cell = (c: (typeof COLUMNS)[number], r: Outcome) => {
  const v = Number(r[c.key] ?? 0);
  if (c.money) return fmtRupees(v);
  if (c.rate) return r.resolved > 0 ? pct(v) : '—';
  return count(v);
};

/** The outcome split of one row, for a part-to-whole bar. */
function splitRows(r: Outcome) {
  return [
    { key: 'delivered', name: 'Delivered', value: r.delivered, color: STATUS.good },
    { key: 'returned', name: 'Returned', value: r.returned, color: STATUS.warning },
    { key: 'rto', name: 'RTO', value: r.rto, color: STATUS.critical },
    { key: 'cancelled', name: 'Cancelled', value: r.cancelled, color: INK.muted },
    { key: 'open', name: 'Still open', value: r.open, color: SERIES[0] },
  ];
}

const DeliveryOutcomes: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const prevRange = useMemo(() => previousRange(range), [range.from, range.to]);
  const vsLabel = prevRange ? 'vs previous period' : '';
  const [filters, setFilters] = useState<Filters>({});
  const [groupBy, setGroupBy] = useState('payment_method');

  const main = usePanelStats<Outcomes>('outcomes', range, true, { ...filters, group_by: groupBy });
  const prev = usePanelStats<Outcomes>('outcomes', prevRange ?? {}, !!prevRange, { ...filters, group_by: groupBy });
  // Ads vs organic: the same filters except the traffic one (that split is the point of the section).
  const nonTraffic: Filters = Object.fromEntries(Object.entries(filters).filter(([k]) => k !== 'traffic'));
  const split = usePanelStats<Outcomes>('outcomes', range, true, { ...nonTraffic, group_by: 'traffic' });

  const data = main.data;
  const t = data?.totals;
  const pt = prevRange ? prev.data?.totals ?? null : null;
  const delta = (cur: number | undefined, before: number | undefined, goodWhen: 'up' | 'down' | 'neutral' = 'up') =>
    prevRange && t ? { current: Number(cur ?? 0), previous: pt ? Number(before ?? 0) : null, label: vsLabel, goodWhen } : null;

  const setFilter = (k: FilterKey, v: string) => setFilters((f) => {
    const next = { ...f };
    if (v) next[k] = v; else delete next[k];
    return next;
  });
  const active = Object.keys(filters).length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery &amp; RTO</h1>
          <p className="text-sm text-gray-500">What became of the orders placed in the period, by payment, campaign, source and ads vs organic.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      <FilterBar data={data} filters={filters} onChange={setFilter} onClear={() => setFilters({})} active={active} />

      {main.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{main.error}</div>}
      {main.loading && !data && <div className="p-8 text-sm text-gray-500">Loading outcomes…</div>}

      {t && (
        <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 ${main.loading ? 'opacity-60' : ''}`}>
          <KpiTile label="Orders placed" value={count(t.placed)}
            sub={`${fmtRupees(t.placed_value)} · ${count(t.open)} still open · ${count(t.cancelled)} cancelled`}
            delta={delta(t.placed, pt?.placed)} />
          <KpiTile label="Delivery rate" value={t.resolved > 0 ? pct(t.delivery_rate) : '—'}
            sub={`${count(t.delivered)} of ${count(t.resolved)} resolved orders`}
            delta={t.resolved > 0 ? delta(t.delivery_rate, pt?.delivery_rate) : null} />
          <KpiTile label="RTO rate" value={t.resolved > 0 ? pct(t.rto_rate) : '—'}
            sub={`${count(t.rto)} orders returned to origin`}
            delta={t.resolved > 0 ? delta(t.rto_rate, pt?.rto_rate, 'down') : null} />
          <KpiTile label="Return rate" value={t.resolved > 0 ? pct(t.return_rate) : '—'}
            sub={`${count(t.returned)} orders returned by the customer`}
            delta={t.resolved > 0 ? delta(t.return_rate, pt?.return_rate, 'down') : null} />
          <KpiTile label="RTO goods value lost" value={fmtRupees(t.rto_value)}
            sub="Order total − shipping − COD fee"
            delta={delta(t.rto_value, pt?.rto_value, 'down')} />
        </div>
      )}

      {data?.definitions && <Definitions defs={data.definitions} />}

      <TrafficSection state={split} />

      <GroupTable data={data} loading={main.loading} groupBy={groupBy} onGroup={setGroupBy} range={range} />
    </div>
  );
};

const FilterBar: React.FC<{
  data: Outcomes | null; filters: Filters; active: boolean;
  onChange: (k: FilterKey, v: string) => void; onClear: () => void;
}> = ({ data, filters, active, onChange, onClear }) => (
  <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3 shadow-sm">
    {FILTERS.map((f) => {
      const options = data?.options?.[f.list] ?? [];
      const current = filters[f.key] ?? '';
      // Keep a chosen value listed even when the new range has no order with it.
      const listed = current && !options.some((o) => o.value === current) ? [{ value: current, orders: 0 }, ...options] : options;
      return (
        <label key={f.key} className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
          {f.label}
          <select value={current} onChange={(e) => onChange(f.key, e.target.value)}
            className="max-w-[16rem] rounded-md border bg-white px-2 py-1.5 text-sm text-gray-800">
            <option value="">All</option>
            {listed.map((o) => (
              <option key={o.value} value={o.value}>{word(f.key, o.value)} ({count(o.orders)})</option>
            ))}
          </select>
        </label>
      );
    })}
    {active && (
      <button type="button" onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <X aria-hidden className="size-4" /> Clear filters
      </button>
    )}
  </div>
);

/** The server's own definitions, the RTO loss first. */
const Definitions: React.FC<{ defs: Record<string, string> }> = ({ defs }) => {
  const order = ['rto_value', 'outcome', 'rates', 'traffic'];
  const keys = [...order.filter((k) => defs[k]), ...Object.keys(defs).filter((k) => !order.includes(k))];
  return (
    <div className="flex gap-3 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-gray-400" />
      <ul className="space-y-1">
        {keys.map((k) => <li key={k} className={k === 'rto_value' ? 'font-medium text-gray-800' : undefined}>{defs[k]}</li>)}
      </ul>
    </div>
  );
};

const TrafficSection: React.FC<{ state: { data: Outcomes | null; loading: boolean; error: string | null } }> = ({ state }) => {
  const rows = state.data?.rows ?? [];
  const paid = rows.find((r) => r.key === 'paid');
  const organic = rows.find((r) => r.key === 'organic');
  const gap = paid && organic && paid.resolved > 0 && organic.resolved > 0 ? paid.rto_rate - organic.rto_rate : null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Organic vs Ads</h2>
      {state.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>}
      {state.loading && !state.data && <div className="text-sm text-gray-500">Loading…</div>}
      {gap !== null && (
        <p className="text-sm text-gray-700">
          Ads orders go back to origin {Math.abs(gap) < 0.05 ? 'as often as' : `${Math.abs(gap).toFixed(1)} points ${gap > 0 ? 'more' : 'less'} often than`} organic orders
          ({pct(paid!.rto_rate)} vs {pct(organic!.rto_rate)} of resolved orders).
        </p>
      )}
      <div className={`grid gap-4 md:grid-cols-2 ${state.loading ? 'opacity-60' : ''}`}>
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">{word('traffic', r.key)}</h3>
              <span className="text-sm text-gray-500">{count(r.placed)} orders · {fmtRupees(r.placed_value)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
              <div><dt className="text-xs text-gray-500">Delivery</dt><dd className="font-semibold text-gray-900">{r.resolved > 0 ? pct(r.delivery_rate) : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">RTO</dt><dd className="font-semibold text-gray-900">{r.resolved > 0 ? pct(r.rto_rate) : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">Return</dt><dd className="font-semibold text-gray-900">{r.resolved > 0 ? pct(r.return_rate) : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500">RTO goods lost</dt><dd className="font-semibold text-gray-900">{fmtRupees(r.rto_value)}</dd></div>
            </dl>
            <div className="mt-4">
              <SplitBar label={`${word('traffic', r.key)} orders by outcome`} rows={splitRows(r)} />
            </div>
          </div>
        ))}
        {!state.loading && rows.length === 0 && <div className="text-sm text-gray-500">No orders in this range.</div>}
      </div>
    </section>
  );
};

const GroupTable: React.FC<{
  data: Outcomes | null; loading: boolean; groupBy: string; onGroup: (k: string) => void; range: PanelRange;
}> = ({ data, loading, groupBy, onGroup, range }) => {
  const [sort, setSort] = useState<{ key: SortKey | 'key'; dir: 'asc' | 'desc' }>({ key: 'placed', dir: 'desc' });
  const groups = data?.groups ?? [];
  const label = groups.find((g) => g.key === groupBy)?.label ?? data?.group_label ?? 'Group';
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => (sort.key === 'key'
      ? String(a.key ?? '').localeCompare(String(b.key ?? '')) * dir
      : (Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0)) * dir));
  }, [data?.rows, sort]);
  const by = (key: SortKey | 'key') => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'key' ? 'asc' : 'desc' }));
  const pickGroup = (k: string) => {
    onGroup(k);
    const time = k === 'day' || k === 'week' || k === 'month';
    setSort(time ? { key: 'key', dir: 'asc' } : { key: 'placed', dir: 'desc' });
  };

  const downloadCsv = () => {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [label, ...COLUMNS.map((c) => c.label), 'Resolved', 'RTO order value'];
    const line = (name: string, r: Outcome) => [
      name, ...COLUMNS.map((c) => (c.money ? Number(r[c.key] ?? 0).toFixed(2) : c.rate ? Number(r[c.key] ?? 0).toFixed(1) : Number(r[c.key] ?? 0))),
      r.resolved, Number(r.rto_order_value ?? 0).toFixed(2),
    ].map(q).join(',');
    const lines = rows.map((r) => line(word(groupBy, r.key), r));
    if (data?.totals) lines.push(line('Total', data.totals));
    const blob = new Blob([[head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delivery-outcomes-by-${groupBy}-${range.from ?? 'alltime'}-${range.to ?? 'today'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sortHead = (k: SortKey | 'key', text: string, right = false) => (
    <th key={k} className={`px-3 py-2 ${right ? 'text-right' : ''}`} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => by(k)} className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 ${right ? 'flex-row-reverse' : ''}`}>
        {text}
        {sort.key === k && (sort.dir === 'asc' ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}
      </button>
    </th>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Outcomes by</h2>
        {groups.map((g) => (
          <button key={g.key} type="button" aria-pressed={groupBy === g.key} onClick={() => pickGroup(g.key)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${groupBy === g.key ? 'border-gray-900 bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <span className="text-xs text-gray-500">{rows.length.toLocaleString('en-IN')} row(s) · rates over resolved orders (delivered + returned + RTO)</span>
          <button type="button" onClick={downloadCsv} disabled={rows.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                {sortHead('key', label)}
                {COLUMNS.map((c) => sortHead(c.key, c.label, true))}
              </tr>
            </thead>
            <tbody className={`divide-y ${loading ? 'opacity-60' : ''}`}>
              {loading && !data && <tr><td colSpan={COLUMNS.length + 1} className="p-6 text-center text-gray-500">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={COLUMNS.length + 1} className="p-6 text-center text-gray-500">No orders in this range.</td></tr>}
              {rows.map((r) => (
                <tr key={r.key ?? ''}>
                  <td className="max-w-[22rem] truncate px-3 py-1.5" title={r.key}>{word(groupBy, r.key)}</td>
                  {COLUMNS.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{cell(c, r)}</td>)}
                </tr>
              ))}
            </tbody>
            {data?.totals && rows.length > 0 && (
              <tfoot className="border-t-2 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  {COLUMNS.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right font-mono">{cell(c, data.totals)}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
};

export default DeliveryOutcomes;
