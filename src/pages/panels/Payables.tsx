import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Field, TextInput, SelectInput, SearchInput, Chip, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, inr, ExportMenu, Pagination, type CsvColumn,
} from '../../components/erp';

/**
 * Payables (AP) — "Money you owe your vendors", with the MSME 43B(h) warning
 * front and centre.
 *
 * Three things on one page:
 *  1. A red MSME banner (only when exposure exists) — plain-English, the amount
 *     at tax risk + which vendors, because paying a Micro/Small vendor beyond
 *     45 days costs the store its deduction this year (Section 43B(h)).
 *  2. The per-vendor ageing table (0-30 / 31-45 / 46-90 / 90+ buckets; the 45-day
 *     line is a bucket edge) with an MSME badge and breach countdown.
 *  3. A vendor MSME-details editor (search vendor → set Udyam number +
 *     classification) so the report above is accurate.
 * All figures are computed from vendor bills; the 45-day limit comes from the
 * statutory registry, not a hardcoded number.
 */

const today = () => new Date().toISOString().slice(0, 10);

async function download(url: string, params: any, filename: string) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  const href = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(href);
}

interface Ageing { d0_30: number; d31_45: number; d46_90: number; d90_plus: number; }
interface Vendor {
  vendor_id: string; vendor_name: string | null; udyam_number: string | null;
  msme_classification: 'micro' | 'small' | 'medium' | null; payment_terms_days: number | null;
  is_msme: boolean; bill_count: number; open_count: number;
  total_billed: number; total_paid: number; total_outstanding: number; ageing: Ageing;
  oldest_open_date: string | null; oldest_open_age_days: number | null;
  days_to_45_breach: number | null; breached_amount: number; at_risk_7d_amount: number;
}
interface ExposureVendor {
  vendor_id: string; vendor_name: string | null; msme_classification: string | null;
  udyam_number: string | null; breached_amount: number; at_risk_7d_amount: number;
  oldest_open_age_days: number | null; days_to_45_breach: number | null; message: string;
}
interface Exposure {
  as_of: string; statutory_max_days: number; breached_amount: number; at_risk_7d_amount: number;
  breached_vendor_count: number; at_risk_vendor_count: number; headline: string; explanation: string;
  vendors: ExposureVendor[];
}

// Client CSV of the on-screen ageing rows. Amounts here are in RUPEES (the AP
// ageing query returns rupees, rendered with `inr`, not minor units) — so we
// format numerically rather than using the `money` (minor-unit) flag.
const rup = (n: unknown) => Number(n ?? 0).toFixed(2);
const AGEING_CSV_COLUMNS: CsvColumn<Vendor>[] = [
  { key: 'vendor_name', label: 'Vendor', format: (v) => v.vendor_name ?? '' },
  { key: 'msme_classification', label: 'MSME class' },
  { key: 'udyam_number', label: 'Udyam' },
  { key: 'bill_count', label: 'Bills' },
  { key: 'open_count', label: 'Open' },
  { key: 'total_outstanding', label: 'Outstanding', format: (v) => rup(v.total_outstanding) },
  { key: 'oldest_open_date', label: 'Oldest open' },
  { key: 'oldest_open_age_days', label: 'Oldest age (days)' },
  { key: 'breached_amount', label: 'Breached amount', format: (v) => rup(v.breached_amount) },
  { key: 'at_risk_7d_amount', label: 'At-risk (7d)', format: (v) => rup(v.at_risk_7d_amount) },
  { key: 'd0_30', label: '0-30', format: (v) => rup(v.ageing?.d0_30) },
  { key: 'd31_45', label: '31-45', format: (v) => rup(v.ageing?.d31_45) },
  { key: 'd46_90', label: '46-90', format: (v) => rup(v.ageing?.d46_90) },
  { key: 'd90_plus', label: '90+', format: (v) => rup(v.ageing?.d90_plus) },
];

const AgeChips: React.FC<{ a: Ageing }> = ({ a }) => {
  const chips: Array<[string, number, 'green' | 'amber' | 'red']> = [
    ['0-30', a.d0_30, 'green'],
    ['31-45', a.d31_45, 'amber'],
    ['46-90', a.d46_90, 'amber'],
    ['90+', a.d90_plus, 'red'],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {chips.filter(([, v]) => v > 0.005).map(([label, v, tone]) => (
        <Chip key={label} tone={tone}>{label}: {inr(v)}</Chip>
      ))}
    </div>
  );
};

const MsmeBadge: React.FC<{ v: Vendor }> = ({ v }) => {
  if (!v.msme_classification) return null;
  const isRisk = v.is_msme;
  const label = v.msme_classification[0].toUpperCase() + v.msme_classification.slice(1);
  return (
    <span className="ml-1" title={isRisk ? 'Micro/Small — Section 43B(h) applies' : 'Medium — 43B(h) does not apply'}>
      <Chip tone={isRisk ? 'red' : 'neutral'}>{label}</Chip>
    </span>
  );
};

const Payables: React.FC = () => {
  const [asOf, setAsOf] = useState(today());
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [maxDays, setMaxDays] = useState(45);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  // Client-side filter + pagination over the (single-payload) ageing rows.
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [ag, ex] = await Promise.all([
        api.get('/ap/ageing', { params: { asOf } }),
        api.get('/ap/msme-exposure', { params: { asOf } }),
      ]);
      const agData = payload<any>(ag);
      setVendors(agData.vendors ?? []);
      setSummary(agData.summary ?? null);
      setMaxDays(agData.statutory_max_days ?? 45);
      setExposure(payload<Exposure>(ex));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, [asOf]);
  useEffect(() => { load(); }, [load]);

  const hasExposure = !!exposure && (exposure.breached_amount > 0.005 || exposure.at_risk_7d_amount > 0.005);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((v) =>
      (v.vendor_name ?? '').toLowerCase().includes(term) ||
      (v.udyam_number ?? '').toLowerCase().includes(term));
  }, [vendors, q]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <Page>
      <PageHeader
        title="Payables (AP)"
        description="Money you owe your vendors — with the MSME 45-day (Section 43B(h)) warning. Older-than-45-day dues to Micro/Small vendors are not tax-deductible until you pay them."
        actions={
          <div className="flex items-end gap-2">
            <Field label="As of"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <Btn variant="outline" onClick={() => setShowEditor((s) => !s)}>{showEditor ? 'Hide' : 'Vendor MSME details'}</Btn>
            <ExportMenu
              filename={`payables-ageing-${asOf}`}
              columns={AGEING_CSV_COLUMNS}
              rows={filtered}
              serverExports={[
                { label: 'Full ageing (server CSV)', path: '/ap/ageing', params: { asOf, format: 'csv' }, filename: `payables-ageing-${asOf}.csv` },
                { label: 'MSME exposure (CSV)', path: '/ap/msme-exposure', params: { asOf, format: 'csv' }, filename: `msme-exposure-${asOf}.csv` },
              ]}
            />
          </div>
        }
      />

      {/* ── MSME 43B(h) banner — only when there's real exposure ── */}
      {hasExposure && exposure && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">⚠️</span>
            <div className="flex-1">
              <div className="text-sm font-bold text-red-800">MSME payment warning — Section 43B(h)</div>
              <p className="mt-0.5 text-sm text-red-700">{exposure.headline}</p>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-red-800">
                <span><span className="font-semibold">{inr(exposure.breached_amount)}</span> already past {exposure.statutory_max_days} days</span>
                <span><span className="font-semibold">{inr(exposure.at_risk_7d_amount)}</span> breaching within 7 days</span>
              </div>
              {exposure.vendors.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-red-200 pt-2 text-xs text-red-800">
                  {exposure.vendors.map((v) => (
                    <li key={v.vendor_id} className="leading-snug">
                      <span className="font-semibold">{v.vendor_name ?? 'Vendor'}</span>: {v.message}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] italic text-red-600">{exposure.explanation}</p>
              <div className="mt-2">
                <Btn variant="outline" onClick={() => download('/ap/msme-exposure', { asOf, format: 'csv' }, `msme-exposure-${asOf}.csv`)}>
                  Download MSME exposure (CSV)
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary tiles ── */}
      {summary && (
        <StatGrid cols={4}>
          <StatCard label="Total outstanding" value={inr(summary.total_outstanding)} />
          <StatCard label="Vendors" value={String(summary.vendor_count)} />
          <StatCard label="MSME breached (43B(h))" value={inr(summary.msme_breached_amount)}
            tone={summary.msme_breached_amount > 0.005 ? 'bad' : 'default'} />
          <StatCard label="MSME at-risk (7 days)" value={inr(summary.msme_at_risk_7d_amount)}
            tone={summary.msme_at_risk_7d_amount > 0.005 ? 'warn' : 'default'} />
        </StatGrid>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showEditor && <VendorMsmeEditor onSaved={load} maxDays={maxDays} />}

      {/* ── Ageing table ── */}
      <div className="max-w-sm">
        <SearchInput placeholder="Filter by vendor name / Udyam…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Vendor</Th>
            <Th num>Bills</Th>
            <Th>Oldest open</Th>
            <Th>MSME 45-day</Th>
            <Th>Ageing</Th>
            <Th num>Outstanding</Th>
          </THead>
          <TBody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">{vendors.length === 0 ? 'Nothing payable — no open vendor bills. 🎉' : 'No vendors match your filter.'}</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {paged.map((v) => (
              <Tr key={v.vendor_id} className={v.breached_amount > 0.005 ? 'bg-red-50/40' : ''}>
                <Td>
                  <div className="font-medium text-gray-900">{v.vendor_name ?? 'Vendor'}<MsmeBadge v={v} /></div>
                  {v.udyam_number && <div className="font-mono text-xs text-gray-400">{v.udyam_number}</div>}
                </Td>
                <Td num>
                  <span className="font-medium text-red-700">{v.open_count}</span>
                  <span className="text-gray-400"> / {v.bill_count}</span>
                </Td>
                <Td className="text-xs">
                  {v.oldest_open_date ?? '—'}
                  {v.oldest_open_age_days != null && (
                    <span className={`ml-1 ${v.oldest_open_age_days > 90 ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                      ({v.oldest_open_age_days}d)
                    </span>
                  )}
                </Td>
                <Td className="text-xs">
                  {!v.is_msme ? <span className="text-gray-400">—</span>
                    : v.days_to_45_breach == null ? <span className="text-gray-400">—</span>
                    : v.days_to_45_breach < 0
                      ? <span className="font-semibold text-red-700">Breached ({Math.abs(v.days_to_45_breach)}d over)</span>
                      : v.days_to_45_breach <= 7
                        ? <span className="font-semibold text-amber-800">{v.days_to_45_breach}d left</span>
                        : <span className="text-gray-600">{v.days_to_45_breach}d left</span>}
                </Td>
                <Td><AgeChips a={v.ageing} /></Td>
                <Td num className="font-mono font-semibold text-gray-900">{inr(v.total_outstanding)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </Page>
  );
};

// ── Vendor MSME-details editor ─────────────────────────────────────────────────
interface VendorRow {
  id: string; business_name: string; gst_number: string | null;
  udyam_number: string | null; msme_classification: 'micro' | 'small' | 'medium' | null;
  payment_terms_days: number | null;
}

const VendorMsmeEditor: React.FC<{ onSaved: () => void; maxDays: number }> = ({ onSaved, maxDays }) => {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');

  const search = useCallback(async (query: string) => {
    setError('');
    try {
      const res = await api.get('/ap/vendors', { params: { q: query } });
      setRows(payload<any>(res).vendors ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => search(q), 250); return () => clearTimeout(t); }, [q, search]);

  const patch = (id: string, p: Partial<VendorRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const save = async (r: VendorRow) => {
    setSavingId(r.id); setError('');
    try {
      await api.put(`/ap/vendors/${r.id}/msme`, {
        udyamNumber: r.udyam_number,
        msmeClassification: r.msme_classification,
        paymentTermsDays: r.payment_terms_days,
      });
      onSaved();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setSavingId(''); }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold text-gray-900">Vendor MSME details</div>
      <p className="mb-3 text-xs text-gray-500">
        Set each vendor's Udyam number and Micro/Small/Medium classification so the {maxDays}-day
        warning above is accurate. <span className="italic">Find this on their Udyam certificate.</span>
      </p>
      <div className="mb-3 max-w-sm">
        <SearchInput placeholder="Search vendor by name / GSTIN / Udyam" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Vendor</Th>
            <Th>Udyam number</Th>
            <Th>Classification</Th>
            <Th>Terms (days)</Th>
            <Th></Th>
          </THead>
          <TBody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-500">No vendors found.</td></tr>}
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <div className="font-medium text-gray-900">{r.business_name}</div>
                  {r.gst_number && <div className="font-mono text-xs text-gray-400">{r.gst_number}</div>}
                </Td>
                <Td>
                  <TextInput className="w-40" placeholder="UDYAM-XX-00-0000000" value={r.udyam_number ?? ''}
                    onChange={(e) => patch(r.id, { udyam_number: e.target.value })} />
                </Td>
                <Td>
                  <SelectInput value={r.msme_classification ?? ''}
                    onChange={(e) => patch(r.id, { msme_classification: (e.target.value || null) as any })}>
                    <option value="">Not MSME</option>
                    <option value="micro">Micro</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                  </SelectInput>
                </Td>
                <Td>
                  <TextInput className="w-20" type="number" min={0} value={r.payment_terms_days ?? ''}
                    onChange={(e) => patch(r.id, { payment_terms_days: e.target.value === '' ? null : Number(e.target.value) })} />
                </Td>
                <Td num>
                  <Btn onClick={() => save(r)} disabled={savingId === r.id}>{savingId === r.id ? 'Saving…' : 'Save'}</Btn>
                </Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </div>
  );
};

export default Payables;
