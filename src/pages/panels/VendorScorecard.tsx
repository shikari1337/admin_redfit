import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Field, TextInput, StatCard, StatGrid, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, SectionCard,
} from '../../components/erp';
import type { Tone } from '../../components/erp';

/**
 * Vendor Scorecard — "who should I reorder from, and who's a problem?"
 *
 * A purchasing manager's ranked list of suppliers with a plain letter grade
 * (A–D), the numbers behind it (on-time, fill, quality rejects, price accuracy,
 * lead time), and a one-line verdict. Click a vendor to see the exact POs, GRNs
 * and bills that drove the score. Everything is computed live from purchasing
 * data over a date range (blank = all time).
 */

const fmtDays = (n: number | null) => (n === null || n === undefined ? '—' : `${n}d`);
const inr = (n: any) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GRADE_TONE: Record<string, Tone> = { A: 'green', B: 'blue', C: 'amber', D: 'red', NR: 'neutral' };

interface Vendor {
  vendor_id: string; vendor_name: string | null; gst_number: string | null;
  po_count: number; grn_count: number; bill_count: number;
  ordered_qty: number; received_qty: number; purchase_value: number;
  on_time_pct: number | null; on_time_grns: number; on_time_eligible_grns: number;
  fill_rate_pct: number | null; reject_rate_pct: number | null; rejected_qty: number;
  price_accuracy_pct: number | null; price_lines: number; price_lines_ok: number;
  price_variance_exposure: number; avg_lead_time_days: number | null;
  avg_days_to_pay: number | null; outstanding: number; msme_breached_amount: number; is_msme: boolean;
  score: number | null; grade: string; verdict: string;
}
interface Summary {
  vendor_count: number; graded_count: number; grade_counts: Record<string, number>;
  avg_score: number | null; total_purchase_value: number; total_price_variance_exposure: number;
}
interface Weights {
  w_on_time: number; w_fill: number; w_quality: number; w_price: number;
  price_tolerance_pct: number; grade_a: number; grade_b: number; grade_c: number;
}

async function download(url: string, params: any, filename: string) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  const href = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(href);
}

const GradeChip: React.FC<{ grade: string; score: number | null }> = ({ grade, score }) => (
  <span className="inline-flex items-center gap-1.5">
    <StatusChip status={grade} tone={GRADE_TONE[grade] ?? 'neutral'} label={grade} className="min-w-[1.75rem] justify-center text-sm font-bold" />
    <span className="text-xs tabular-nums text-gray-500">{score === null ? '—' : score}</span>
  </span>
);

/** A small coloured cell for a percentage where higher (or lower) is better. */
const MetricCell: React.FC<{ value: number | null; goodAbove?: number; badBelow?: number; invert?: boolean; suffix?: string }> = ({
  value, goodAbove, badBelow, invert, suffix = '%',
}) => {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  let cls = 'text-gray-700';
  if (invert) {
    // lower is better (reject rate)
    if (badBelow !== undefined && value > badBelow) cls = 'text-red-700 font-semibold';
    else if (value <= (goodAbove ?? 0)) cls = 'text-emerald-700';
  } else {
    if (goodAbove !== undefined && value >= goodAbove) cls = 'text-emerald-700 font-medium';
    else if (badBelow !== undefined && value < badBelow) cls = 'text-red-700 font-semibold';
  }
  return <span className={`tabular-nums ${cls}`}>{value}{suffix}</span>;
};

const VendorScorecard: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/vendor-scorecard', { params: { from: from || undefined, to: to || undefined } });
      const data = payload<any>(res);
      setVendors(data.vendors ?? []);
      setSummary(data.summary ?? null);
      setWeights(data.weights ?? null);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const gc = summary?.grade_counts ?? { A: 0, B: 0, C: 0, D: 0, NR: 0 };

  return (
    <Page>
      <PageHeader
        title="Vendor Scorecard"
        description="Supplier performance at a glance — a plain A–D grade per vendor from on-time delivery, fill rate, quality rejects and price accuracy. Green = reorder freely; red = a problem to watch. Leave dates blank for all time."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            {(from || to) && <Btn variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>All time</Btn>}
            <Btn variant="outline" onClick={() => download('/vendor-scorecard', { from: from || undefined, to: to || undefined, format: 'csv' }, `vendor-scorecard-${to || 'all'}.csv`)}>Export CSV</Btn>
          </div>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {summary && (
        <StatGrid cols={4}>
          <StatCard label="Vendors" value={String(summary.vendor_count)} sub={`${summary.graded_count} graded`} />
          <StatCard label="Average score" value={summary.avg_score === null ? '—' : String(summary.avg_score)}
            tone={summary.avg_score === null ? 'default' : summary.avg_score >= 85 ? 'good' : summary.avg_score >= 70 ? 'info' : summary.avg_score >= 55 ? 'warn' : 'bad'}
            sub="over graded vendors" />
          <StatCard label="Grade mix" value={
            <span className="flex flex-wrap items-center gap-1">
              {(['A', 'B', 'C', 'D'] as const).map((g) => (
                <StatusChip key={g} status={g} tone={GRADE_TONE[g]} label={`${g} ${gc[g] ?? 0}`} className="text-xs" />
              ))}
              {(gc.NR ?? 0) > 0 && <StatusChip status="NR" tone="neutral" label={`NR ${gc.NR}`} className="text-xs" />}
            </span>
          } />
          <StatCard label="Purchase value" value={inr(summary.total_purchase_value)}
            sub={`${inr(summary.total_price_variance_exposure)} price variance`}
            tone={summary.total_price_variance_exposure > 0.005 ? 'warn' : 'default'} />
        </StatGrid>
      )}

      <TableShell>
        <table className="w-full text-sm">
        <THead>
            <Th className="w-10 text-right">#</Th>
            <Th>Vendor</Th>
            <Th>Grade</Th>
            <Th className="text-right" title="Received on/before the promised date">On-time</Th>
            <Th className="text-right" title="Units received vs ordered">Fill</Th>
            <Th className="text-right" title="Units failed QC vs received">Reject</Th>
            <Th className="text-right" title="Bill lines matching the PO price">Price acc.</Th>
            <Th className="text-right" title="Avg days from order to receipt">Lead time</Th>
            <Th className="text-right">Purchases</Th>
            <Th></Th>
        </THead>
        <TBody>
          {loading && <EmptyRow colSpan={10}>Loading…</EmptyRow>}
          {!loading && vendors.length === 0 && (
            <EmptyRow colSpan={10}>No vendors with purchasing activity in this period.</EmptyRow>
          )}
          {vendors.map((v, i) => (
            <React.Fragment key={v.vendor_id}>
              <Tr className={`cursor-pointer ${v.grade === 'D' ? 'bg-red-50/40' : ''}`}
                onClick={() => setSelected(selected === v.vendor_id ? null : v.vendor_id)}>
                <Td className="text-right tabular-nums text-gray-400">{i + 1}</Td>
                <Td>
                  <div className="font-medium text-gray-900">{v.vendor_name ?? 'Vendor'}
                    {v.is_msme && <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-700" title="Micro/Small vendor — Section 43B(h)">MSME</span>}
                  </div>
                  {v.gst_number && <div className="font-mono text-xs text-gray-400">{v.gst_number}</div>}
                </Td>
                <Td><GradeChip grade={v.grade} score={v.score} /></Td>
                <Td className="text-right"><MetricCell value={v.on_time_pct} goodAbove={90} badBelow={80} /></Td>
                <Td className="text-right"><MetricCell value={v.fill_rate_pct} goodAbove={99} badBelow={95} /></Td>
                <Td className="text-right"><MetricCell value={v.reject_rate_pct} goodAbove={0} badBelow={2} invert /></Td>
                <Td className="text-right"><MetricCell value={v.price_accuracy_pct} goodAbove={99} badBelow={90} /></Td>
                <Td className="text-right tabular-nums text-gray-600">{fmtDays(v.avg_lead_time_days)}</Td>
                <Td className="text-right tabular-nums text-gray-700">{inr(v.purchase_value)}</Td>
                <Td className="text-right text-xs text-gray-400">{selected === v.vendor_id ? '▲' : '▼'}</Td>
              </Tr>
              <Tr className="!border-0">
                <Td colSpan={10} className="!py-0">
                  <div className={`text-xs italic ${v.grade === 'D' ? 'text-red-700' : v.grade === 'A' ? 'text-emerald-700' : 'text-gray-500'}`}>
                    {v.verdict}
                  </div>
                </Td>
              </Tr>
              {selected === v.vendor_id && (
                <Tr className="!border-0">
                  <Td colSpan={10} className="bg-gray-50/60">
                    <VendorDetail vendorId={v.vendor_id} from={from} to={to} />
                  </Td>
                </Tr>
              )}
            </React.Fragment>
          ))}
        </TBody>
        </table>
      </TableShell>

      {weights && (
        <p className="text-xs text-gray-400">
          Scoring weights — On-time {weights.w_on_time} · Fill {weights.w_fill} · Quality {weights.w_quality} ·
          Price {weights.w_price} (price match within {weights.price_tolerance_pct}%). Grades: A ≥ {weights.grade_a},
          B ≥ {weights.grade_b}, C ≥ {weights.grade_c}, else D.
        </p>
      )}
    </Page>
  );
};

// ── Drill-in: the documents behind a vendor's score ────────────────────────────

interface DriverPo { po_number: string | null; status: string; order_date: string | null; expected_date: string | null; ordered_qty: number; received_qty: number; }
interface DriverGrn { grn_number: string; po_number: string | null; received_date: string | null; expected_date: string | null; on_time: boolean | null; lead_time_days: number | null; received_qty: number; rejected_qty: number; }
interface DriverBill { bill_number: string; voucher_number: string | null; bill_date: string | null; status: string; match_status: string | null; subtotal: number; total: number; price_variance: number; }

const VendorDetail: React.FC<{ vendorId: string; from: string; to: string }> = ({ vendorId, from, to }) => {
  const [pos, setPos] = useState<DriverPo[]>([]);
  const [grns, setGrns] = useState<DriverGrn[]>([]);
  const [bills, setBills] = useState<DriverBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await api.get(`/vendor-scorecard/vendors/${vendorId}`, { params: { from: from || undefined, to: to || undefined } });
        const d = payload<any>(res);
        if (!live) return;
        setPos(d.pos ?? []); setGrns(d.grns ?? []); setBills(d.bills ?? []);
      } catch (e: any) { if (live) setError(e?.response?.data?.message ?? e.message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [vendorId, from, to]);

  if (loading) return <div className="py-3 text-sm text-gray-500">Loading documents…</div>;
  if (error) return <div className="py-3 text-sm text-red-600">{error}</div>;

  return (
    <div className="grid gap-3 py-2 lg:grid-cols-3">
      <SectionCard title={`Receipts (${grns.length})`}>
        {grns.length === 0 ? <div className="p-2 text-xs text-gray-400">No receipts in this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-gray-400">
                <tr><th className="p-1">GRN</th><th className="p-1">Received</th><th className="p-1">On-time</th><th className="p-1 text-right">Lead</th><th className="p-1 text-right">Qty</th><th className="p-1 text-right">Rej</th></tr>
              </thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.grn_number} className="border-t border-gray-100">
                    <td className="p-1 font-mono">{g.grn_number}</td>
                    <td className="p-1">{g.received_date}<div className="text-gray-400">exp {g.expected_date ?? '—'}</div></td>
                    <td className="p-1">{g.on_time === null ? <span className="text-gray-300">n/a</span> : g.on_time ? <span className="text-emerald-700">On time</span> : <span className="font-semibold text-red-700">Late</span>}</td>
                    <td className="p-1 text-right tabular-nums">{g.lead_time_days ?? '—'}d</td>
                    <td className="p-1 text-right tabular-nums">{g.received_qty}</td>
                    <td className={`p-1 text-right tabular-nums ${g.rejected_qty > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{g.rejected_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Purchase orders (${pos.length})`}>
        {pos.length === 0 ? <div className="p-2 text-xs text-gray-400">No orders in this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-gray-400">
                <tr><th className="p-1">PO</th><th className="p-1">Status</th><th className="p-1">Ordered</th><th className="p-1 text-right">Ord</th><th className="p-1 text-right">Recv</th></tr>
              </thead>
              <tbody>
                {pos.map((p, idx) => (
                  <tr key={(p.po_number ?? 'draft') + idx} className="border-t border-gray-100">
                    <td className="p-1 font-mono">{p.po_number ?? '(draft)'}</td>
                    <td className="p-1"><StatusChip status={p.status} className="text-[10px]" /></td>
                    <td className="p-1">{p.order_date}<div className="text-gray-400">exp {p.expected_date ?? '—'}</div></td>
                    <td className="p-1 text-right tabular-nums">{p.ordered_qty}</td>
                    <td className={`p-1 text-right tabular-nums ${p.received_qty < p.ordered_qty ? 'text-amber-700' : 'text-emerald-700'}`}>{p.received_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Bills (${bills.length})`}>
        {bills.length === 0 ? <div className="p-2 text-xs text-gray-400">No bills in this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-gray-400">
                <tr><th className="p-1">Bill</th><th className="p-1">Date</th><th className="p-1">Match</th><th className="p-1 text-right">Total</th><th className="p-1 text-right">Var</th></tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.bill_number} className="border-t border-gray-100">
                    <td className="p-1 font-mono">{b.bill_number}</td>
                    <td className="p-1">{b.bill_date}</td>
                    <td className="p-1"><StatusChip status={b.match_status ?? 'unmatched'} className="text-[10px]" /></td>
                    <td className="p-1 text-right tabular-nums">{inr(b.total)}</td>
                    <td className={`p-1 text-right tabular-nums ${b.price_variance > 0.005 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{inr(b.price_variance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default VendorScorecard;
