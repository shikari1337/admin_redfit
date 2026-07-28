import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * Performance (CMO view) — the economics of marketing on one screen:
 * MER, CAC, LTV:CAC, ROAS, attributed revenue share, AOV, repeat rate,
 * month-to-date budget pacing and RFM segment health with one-click actions.
 */
const fmt = (n: any, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
const pct = (n: any) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`);

const MarketingPerformance: React.FC = () => {
  const [k, setK] = useState<any>(null);
  const [rfm, setRfm] = useState<any[]>([]);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    api.get('/marketing-hub/analytics/kpis', { params: { days } })
      .then((r) => setK(payload(r)))
      .catch((e) => setError(e?.response?.data?.message ?? e.message));
    api.get('/marketing-hub/audiences/system')
      .then((r) => setRfm((payload(r) ?? []).filter((a: any) => a.key.startsWith('rfm_'))))
      .catch(() => {});
  }, [days]);

  const tile = (label: string, value: React.ReactNode, sub?: string, warn = false) => (
    <div className={`rounded-lg border p-4 shadow-sm ${warn ? 'border-red-200 bg-red-50' : 'bg-white'}`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );

  const pace = k?.budget?.pace;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-gray-400"><Link to="/panel/marketing" className="hover:underline">Marketing</Link> / Performance</div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Performance (CMO view)</h1>
          <p className="text-sm text-gray-500">Marketing economics: efficiency, unit costs, attribution share and budget pace.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border px-2 py-1.5 text-sm">
          {[7, 30, 60, 90, 180].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}

      {k && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tile('Revenue', `₹${fmt(k.revenue)}`, `${fmt(k.orders)} orders · AOV ₹${fmt(k.aov)}`)}
            {tile('Marketing spend', `₹${fmt(k.spend.total)}`, `campaigns ₹${fmt(k.spend.campaigns)} · ads ₹${fmt(k.spend.ads)}`)}
            {tile('MER (revenue ÷ spend)', k.mer != null ? `${Number(k.mer).toFixed(1)}×` : '—',
              k.mer != null && k.mer < 3 ? 'Below the 3× healthy floor' : 'blended efficiency', k.mer != null && k.mer < 3)}
            {tile('Paid ROAS', k.paid_roas != null ? `${Number(k.paid_roas).toFixed(1)}×` : '—', 'attributed paid revenue ÷ ad spend')}
            {tile('CAC', k.cac ? `₹${fmt(k.cac)}` : '—', `${fmt(k.new_customers)} new customers`)}
            {tile('LTV', `₹${fmt(k.ltv)}`, 'avg lifetime spend (buyers)')}
            {tile('LTV : CAC', k.ltv_to_cac != null ? `${Number(k.ltv_to_cac).toFixed(1)}×` : '—',
              k.ltv_to_cac != null && k.ltv_to_cac < 3 ? 'Target ≥ 3×' : 'unit economics', k.ltv_to_cac != null && k.ltv_to_cac < 3)}
            {tile('Repeat rate', pct(k.repeat_rate), `attributed share ${pct(k.attributed_share)}`)}
          </div>

          {/* Budget pacing */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">Budget pacing (month-to-date)</div>
              <Link to="/panel/marketing/settings" className="text-sm text-primary hover:underline">Set budgets →</Link>
            </div>
            {k.budget.monthly_total > 0 ? (
              <div>
                <div className="flex justify-between text-sm">
                  <span>₹{fmt(k.budget.mtd_spend)} spent of ₹{fmt(k.budget.monthly_total)}</span>
                  <span className={pace > 1.15 ? 'font-medium text-red-600' : pace < 0.85 ? 'text-amber-600' : 'text-green-700'}>
                    pace {pace != null ? `${(pace * 100).toFixed(0)}%` : '—'}
                    {pace > 1.15 ? ' — overspending' : pace < 0.85 ? ' — underspending' : ' — on track'}
                  </span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-3 ${pace > 1.15 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min((k.budget.mtd_spend / k.budget.monthly_total) * 100, 100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-400">Month progress: {(k.budget.month_progress * 100).toFixed(0)}%</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No monthly budget set — add one in Settings to get pacing & overspend alerts.</div>
            )}
          </div>

          {/* Channel revenue table */}
          <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
            <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">Revenue by acquisition channel (last-touch)</div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr><th className="px-4 py-2">Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue ₹</th><th className="text-right">Share</th></tr>
              </thead>
              <tbody className="divide-y">
                {k.channels.map((c: any) => (
                  <tr key={c.channel}>
                    <td className="px-4 py-1.5 capitalize">{String(c.channel).replace(/_/g, ' ')}</td>
                    <td className="text-right">{c.orders}</td>
                    <td className="text-right font-mono">{fmt(c.revenue)}</td>
                    <td className="text-right">{k.revenue > 0 ? pct(Number(c.revenue) / k.revenue) : '—'}</td>
                  </tr>
                ))}
                {k.channels.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-500">No orders in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* RFM segment health */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">Customer segments (RFM) <span className="text-xs font-normal text-gray-400">— live; one click to act</span></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {rfm.map((a) => (
            <div key={a.key} className="rounded border p-3" title={a.description}>
              <div className="text-xs text-gray-500">{a.label}</div>
              <div className="text-xl font-bold">{a.count}</div>
              <div className="mt-1 flex gap-2 text-xs">
                <Link to="/panel/marketing/campaigns" className="text-primary hover:underline">campaign →</Link>
                <button onClick={async () => {
                  try {
                    const r = await api.post('/marketing-hub/audiences/lists/from-system', { system: a.key });
                    setInfo(`List "${payload(r).list.name}" created (${payload(r).inserted} members).`);
                  } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
                }} className="text-primary hover:underline">make list</button>
              </div>
            </div>
          ))}
          {rfm.length === 0 && <div className="col-span-5 text-sm text-gray-400">Loading…</div>}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Playbook: protect <b>Champions</b> (early access, no discounts) · cross-sell <b>Loyal</b> · win back <b>At-risk</b> with an
          offer ladder · last-chance <b>Hibernating</b> before suppression · white-glove <b>Whales</b>.
        </p>
      </div>
    </div>
  );
};

export default MarketingPerformance;
