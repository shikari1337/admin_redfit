import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, StatCard, StatGrid, StatusChip, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, inrMinor,
  Field, TextInput, SelectInput, ExportMenu, Pagination,
} from '../../components/erp';
import type { CsvColumn } from '../../components/erp';

/**
 * TDS on vendor payments — plain language for a non-accountant owner:
 * "You must deduct ₹X tax before paying this vendor. It goes to the government,
 * not the vendor." Two jobs: (1) set up which vendors need TDS, (2) keep the
 * quarterly registers the CA files from. The deduction itself happens
 * automatically when you pay a vendor bill or an expense.
 *
 * TWO RETURNS, ONE REGISTER (migration 086): Form 26Q reports deductions on
 * payments to RESIDENTS, Form 27Q reports deductions on payments to
 * NON-RESIDENTS. Same machinery — the vendor's residency decides the form. The
 * 26Q/27Q toggle below just filters the same register.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentFy = () => {
  const d = new Date();
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
};

interface SectionOpt { key: string; label: string; nonResident?: boolean; }

type FormKey = '26Q' | '27Q';
const FORM_TABS: Array<{ key: FormKey; label: string; blurb: string }> = [
  { key: '26Q', label: 'Form 26Q — residents', blurb: 'Deductions on payments to vendors based in India.' },
  {
    key: '27Q', label: 'Form 27Q — non-residents',
    blurb: 'Deductions on payments to vendors outside India (section 195 and friends). '
      + 'The rate depends on the tax treaty with the vendor’s country, so it must be set on the vendor — '
      + 'the system will not guess it.',
  },
];

const UnverifiedBanner: React.FC = () => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    <strong>Provisional rates.</strong> The tax rates and limits shown are carried forward from the
    old Income-tax Act and are <em>not yet verified</em> against the new Income-tax Act 2025 tables.
    Confirm the exact rate for each vendor with your CA and set it as an override. Nothing here is
    ready to file until your CA signs off.
  </div>
);

const Tds: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const [tab, setTab] = useState<'register' | 'challans' | 'form16a' | 'setup'>('register');
  const [error, setError] = useState('');

  return (
    <Page>
      <PageHeader
        title="TDS on vendor payments"
        description="Deduct tax at source before paying certain vendors (contractors, professionals, rent, commission, purchase of goods over ₹50 lakh, and anyone outside India). The system deducts it automatically when you pay a bill or an expense, keeps the quarterly registers your CA files Form 26Q / 27Q from, builds the monthly deposit challan (ITNS-281), and generates the Form 16A certificate each deductee gets."
      />
      <TabBar
        tabs={[
          { key: 'register', label: 'Register (26Q / 27Q)' },
          { key: 'challans', label: 'Deposit challans (ITNS-281)' },
          { key: 'form16a', label: 'Form 16A certificates' },
          { key: 'setup', label: 'Vendor setup' },
        ]}
        active={tab}
        onChange={(k) => { setError(''); setTab(k as any); }}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {tab === 'register' && <RegisterTab onError={setError} />}
      {tab === 'challans' && <ChallanTab canPost={canPost} onError={setError} />}
      {tab === 'form16a' && <Form16ATab canPost={canPost} onError={setError} />}
      {tab === 'setup' && <SetupTab canPost={canPost} onError={setError} />}
    </Page>
  );
};

// ── Shared: download a PDF/CSV blob from an authenticated endpoint ─────────────
const downloadBlob = async (url: string, params: any, filename: string) => {
  const res = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename; a.click();
  URL.revokeObjectURL(href);
};

const OwnerQueueNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">{children}</div>
);

// ── Register tab — the SAME register, filtered to 26Q or 27Q ──────────────────
const REG_PAGE_SIZE = 50;
const RegisterTab: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');
  const [form, setForm] = useState<FormKey>('26Q');
  const [fy, setFy] = useState(currentFy());
  const [quarter, setQuarter] = useState('');   // '' = whole FY
  const [reg, setReg] = useState<any>(null);
  const [page, setPage] = useState(1);

  const periodParams = () => (quarter ? { quarter: `${fy}-${quarter}` } : { fy });

  const load = async () => {
    try {
      const res = await api.get('/tds/register', { params: { ...periodParams(), form } });
      setReg(payload<any>(res));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { setReg(null); setPage(1); load(); }, [fy, quarter, form]);

  const s = reg?.summary;
  const is27q = form === '27Q';
  const activeForm = FORM_TABS.find((t) => t.key === form)!;
  const byCountry: Array<[string, any]> = Object.entries(s?.by_country ?? {});

  const allRows: any[] = reg?.rows ?? [];
  const pagedRows = allRows.slice((page - 1) * REG_PAGE_SIZE, page * REG_PAGE_SIZE);

  // base_minor / tds_minor are MINOR units → money:true.
  const csvCols: CsvColumn<any>[] = [
    { key: 'deducted_on', label: 'Date' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'pan', label: 'PAN' },
    { key: 'section_label', label: 'Section' },
    { key: 'ref', label: 'Reference', format: (r) => r.bill_number ?? r.expense_number ?? '' },
    ...(is27q ? [{ key: 'country', label: 'Country' } as CsvColumn<any>] : []),
    { key: 'base_minor', label: 'Base', money: true },
    { key: 'rate', label: 'Rate %', format: (r) => (Number(r.rate_milli_pct) / 1000).toFixed(2) },
    { key: 'tds_minor', label: 'TDS', money: true },
  ];
  return (
    <>
      <UnverifiedBanner />

      {/* Which return? Same register, two statutory forms. */}
      <div className="space-y-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          {FORM_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setForm(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                form === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{activeForm.blurb}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">Financial year</span>
          <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="26-27"
            className="block w-28 rounded border px-2 py-1.5" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">Quarter</span>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="block rounded border px-2 py-1.5">
            <option value="">Whole year</option>
            <option value="Q1">Q1 (Apr–Jun)</option>
            <option value="Q2">Q2 (Jul–Sep)</option>
            <option value="Q3">Q3 (Oct–Dec)</option>
            <option value="Q4">Q4 (Jan–Mar)</option>
          </select>
        </label>
        <Btn variant="outline" onClick={load}>Apply</Btn>
        <ExportMenu
          filename={`tds-register-${form.toLowerCase()}-${quarter ? `${fy}-${quarter}` : fy}`}
          columns={csvCols}
          rows={allRows}
          canExport={canRead}
          disabled={!allRows.length}
          serverExports={[{
            label: `Server CSV (${form} layout)`,
            path: '/tds/register',
            params: { ...periodParams(), form, format: 'csv' },
            filename: `tds-register-${form.toLowerCase()}-${quarter ? `${fy}-${quarter}` : fy}.csv`,
          }]}
        />
      </div>

      {s && (
        <StatGrid cols={4}>
          <StatCard label="Deductions" value={s.count} sub={`${form} entries in this period`} />
          <StatCard label="Total base paid" value={inrMinor(s.total_base_minor)} sub="amount TDS was computed on" />
          <StatCard label="Total TDS deducted" value={inrMinor(s.total_tds_minor)} sub="owed to the government" tone="good" />
          <StatCard
            label="Missing PAN" value={s.deductees_without_pan ?? 0}
            sub={(s.deductees_without_pan ?? 0) > 0 ? 'fix before filing — the return needs it' : 'all deductees have a PAN'}
            tone={(s.deductees_without_pan ?? 0) > 0 ? 'bad' : 'good'}
          />
        </StatGrid>
      )}

      {is27q && byCountry.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <p className="mb-2 font-medium text-gray-800">By country of residence</p>
          <div className="flex flex-wrap gap-2">
            {byCountry.map(([country, v]) => (
              <span key={country} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
                {country} · {v.count} deduction(s) · {inrMinor(v.tds_minor)} TDS
              </span>
            ))}
          </div>
        </div>
      )}

      <TableShell maxHeight="60vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Date</Th><Th>Quarter</Th><Th>Vendor</Th><Th>PAN</Th><Th>Section</Th><Th>Reference</Th>
            {is27q && <Th>Country</Th>}
            <Th num>Base</Th><Th num>Rate</Th><Th num>TDS</Th>
          </THead>
          <TBody>
            {reg && allRows.length === 0 && (
              <EmptyRow colSpan={is27q ? 10 : 9}>
                {is27q
                  ? 'No TDS deducted on payments to non-residents in this period — nothing to file on 27Q.'
                  : 'No TDS deducted in this period.'}
              </EmptyRow>
            )}
            {pagedRows.map((r: any) => (
              <Tr key={r.id}>
                <Td>{r.deducted_on}</Td>
                <Td className="font-mono text-xs">{r.quarter}</Td>
                <Td>{r.vendor_name ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.pan ?? <span className="text-red-600">missing</span>}</Td>
                <Td className="max-w-xs truncate" title={r.section_label}>{r.section_label}</Td>
                <Td className="font-mono text-xs">{r.bill_number ?? r.expense_number ?? '—'}</Td>
                {is27q && <Td>{r.country ?? <span className="text-amber-600">not stated</span>}</Td>}
                <Td num>{inrMinor(r.base_minor)}</Td>
                <Td num>{(Number(r.rate_milli_pct) / 1000).toFixed(2)}%</Td>
                <Td num className="font-medium">{inrMinor(r.tds_minor)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
      <Pagination page={page} pageSize={REG_PAGE_SIZE} total={allRows.length} onPage={setPage} />
      <p className="text-xs text-gray-400">
        Rows show actual deductions. Payments below the annual threshold are tracked silently until
        the vendor's yearly total crosses the limit, then TDS starts (catching up on the earlier amount).
        {is27q && ' For a non-resident vendor, your CA also needs Form 15CA/15CB for the remittance itself — that is not produced here.'}
      </p>
    </>
  );
};

// ── Vendor setup tab (config + "will TDS apply?" preview) ───────────────────────
const SetupTab: React.FC<{ canPost: boolean; onError: (m: string) => void }> = ({ canPost, onError }) => {
  const [sections, setSections] = useState<SectionOpt[]>([]);
  const [search, setSearch] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewAmt, setPreviewAmt] = useState('');
  const [preview, setPreview] = useState<any>(null);

  const load = async () => {
    try {
      const res = await api.get('/tds/vendors', { params: search ? { search } : {} });
      setVendors(payload<any[]>(res) ?? []);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { api.get('/tds/sections').then((r) => setSections(payload<SectionOpt[]>(r) ?? [])).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]);

  const rowState = (v: any) => edit[v.id] ?? {
    section: v.tds_section ?? '',
    ratePct: v.tds_rate_milli_pct ? String(Number(v.tds_rate_milli_pct) / 1000) : '',
    pan: v.pan_number ?? '',
    cert: v.lower_deduction_cert ?? '',
    nonResident: !!v.is_non_resident,
    country: v.country ?? '',
  };
  const setRow = (id: string, patch: any) => setEdit((e) => ({ ...e, [id]: { ...rowState(vendors.find((v) => v.id === id)), ...e[id], ...patch } }));

  const save = async (v: any) => {
    onError('');
    const st = rowState(v);
    try {
      await api.put(`/tds/vendors/${v.id}`, {
        section: st.section || null,
        rateMilliPct: st.ratePct === '' ? null : Math.round(Number(st.ratePct) * 1000),
        pan: st.pan || null,
        lowerDeductionCert: st.cert || null,
        isNonResident: !!st.nonResident,
        country: st.country || null,
      });
      setEdit((e) => { const n = { ...e }; delete n[v.id]; return n; });
      await load();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  const runPreview = async (vendorId: string) => {
    onError(''); setPreview(null);
    try {
      const res = await api.get('/tds/preview', { params: { vendorId, amount: Number(previewAmt) || 0, asOfDate: todayStr() } });
      setPreview(payload<any>(res));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <>
      <UnverifiedBanner />
      <p className="text-sm text-gray-600">
        Mark which vendors you must deduct TDS from and their section. Ask your CA for the exact rate
        and enter it as an override — otherwise a provisional default is used. A vendor with no PAN is
        deducted at a higher rate automatically.
      </p>
      <p className="text-sm text-gray-600">
        Tick <strong>Outside India</strong> for a vendor based abroad: their deductions go on
        Form&nbsp;27Q instead of 26Q. For those vendors the rate <em>must</em> be entered here —
        it depends on the tax treaty with their country, so the system will not guess it.
      </p>
      <div className="flex items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-600">Find a vendor</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or PAN…"
            className="block w-64 rounded border px-2 py-1.5" />
        </label>
      </div>

      <TableShell maxHeight="60vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Vendor</Th><Th>TDS section</Th><Th>PAN</Th><Th num>Rate override %</Th><Th>Lower-deduction cert</Th>
            <Th>Status</Th>{canPost && <Th num>Action</Th>}
          </THead>
          <TBody>
            {vendors.length === 0 && <EmptyRow colSpan={canPost ? 7 : 6}>No vendors found.</EmptyRow>}
            {vendors.map((v: any) => {
              const st = rowState(v);
              return (
                <Tr key={v.id}>
                  <Td className="font-medium">{v.business_name}</Td>
                  <Td>
                    {canPost ? (
                      <select value={st.section} onChange={(e) => setRow(v.id, { section: e.target.value })}
                        className="rounded border px-2 py-1">
                        <option value="">— none —</option>
                        {sections.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    ) : (v.section_label ?? '—')}
                  </Td>
                  <Td>
                    {canPost ? (
                      <input value={st.pan} onChange={(e) => setRow(v.id, { pan: e.target.value })}
                        placeholder="AAAAA9999A" className="w-32 rounded border px-2 py-1 font-mono uppercase" />
                    ) : (v.pan_number ?? <span className="text-red-600">missing</span>)}
                  </Td>
                  <Td num>
                    {canPost ? (
                      <input type="number" min={0} step="0.01" value={st.ratePct}
                        onChange={(e) => setRow(v.id, { ratePct: e.target.value })}
                        placeholder="auto" className="w-20 rounded border px-2 py-1 text-right" />
                    ) : (v.tds_rate_milli_pct ? `${(Number(v.tds_rate_milli_pct) / 1000)}%` : 'auto')}
                  </Td>
                  <Td>
                    {canPost ? (
                      <input value={st.cert} onChange={(e) => setRow(v.id, { cert: e.target.value })}
                        placeholder="cert no. (optional)" className="w-36 rounded border px-2 py-1" />
                    ) : (v.lower_deduction_cert ?? '—')}
                  </Td>
                  <Td>{v.tds_section ? <StatusChip status="tds" tone="green" label="TDS on" /> : <StatusChip status="none" label="No TDS" />}</Td>
                  {canPost && (
                    <Td num className="whitespace-nowrap">
                      <button onClick={() => save(v)} className="font-medium text-gray-900 hover:underline">Save</button>
                      <span className="text-gray-300"> · </span>
                      <button onClick={() => { setPreviewFor(v.id); setPreview(null); setPreviewAmt(''); }}
                        className="font-medium text-gray-900 hover:underline">Check</button>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>

      {previewFor && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-800">Will TDS apply? — {vendors.find((v) => v.id === previewFor)?.business_name}</span>
            <button onClick={() => { setPreviewFor(null); setPreview(null); }} className="text-gray-400 hover:text-gray-600">Close</button>
          </div>
          <div className="flex items-end gap-3">
            <label className="space-y-1">
              <span className="text-gray-600">Payment amount (₹, before GST)</span>
              <input type="number" min={0} step="0.01" value={previewAmt}
                onChange={(e) => setPreviewAmt(e.target.value)} className="block w-40 rounded border px-2 py-1.5 text-right" />
            </label>
            <Btn variant="outline" onClick={() => runPreview(previewFor)}>Check</Btn>
          </div>
          {preview && (
            <div className={`rounded-lg border px-3 py-2 ${preview.tdsMinor !== '0' && Number(preview.tdsMinor) > 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
              <p className="font-medium">{preview.reason}</p>
              {Number(preview.tdsMinor) > 0 && (
                <p className="mt-1 text-xs">
                  Deduct <strong>{inrMinor(preview.tdsMinor)}</strong> from the payment and pay the vendor
                  the rest. This TDS goes to the government, not the vendor.
                </p>
              )}
              {preview.verificationState === 'UNVERIFIED' && (
                <p className="mt-1 text-xs text-amber-700">Provisional rate — confirm with your CA.</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

// ── Deposit challan tab (ITNS-281) — group a month's TDS/TCS into one challan ──
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const lastOfMonth = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`; };

const CHALLAN_CSV_COLS: CsvColumn<any>[] = [
  { key: 'challan_type', label: 'Type' },
  { key: 'form', label: 'Form' },
  { key: 'period', label: 'Period', format: (c) => `${c.period_from} → ${c.period_to}` },
  { key: 'quarter', label: 'Quarter' },
  { key: 'entry_count', label: 'Entries' },
  { key: 'total_base_minor', label: 'Base', money: true },
  { key: 'total_tax_minor', label: 'Tax', money: true },
  { key: 'status', label: 'Status' },
  { key: 'cin', label: 'CIN', format: (c) => (c.challan_serial ? `${c.bsr_code}/${c.challan_serial}` : 'not deposited') },
];

const ChallanTab: React.FC<{ canPost: boolean; onError: (m: string) => void }> = ({ canPost, onError }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');
  const [type, setType] = useState<'tds' | 'tcs'>('tds');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth());
  const [tan, setTan] = useState('');
  const [challans, setChallans] = useState<any[]>([]);
  const [depositFor, setDepositFor] = useState<any | null>(null);

  const load = async () => {
    try { setChallans(payload<any[]>(await api.get('/direct-taxes/challans')) ?? []); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    onError('');
    try {
      await api.post('/direct-taxes/challans/generate', { challanType: type, from, to, tan: tan || undefined });
      await load();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  const pdf = (id: string) => downloadBlob(`/direct-taxes/challans/${id}/pdf`, {}, `challan-${id.slice(0, 8)}.pdf`)
    .catch((e: any) => onError(e?.response?.data?.message ?? e.message));

  return (
    <>
      <OwnerQueueNote>
        This builds the <strong>deposit challan (ITNS-281)</strong> that groups a period's deducted TDS (or collected TCS)
        by section into one amount. <strong>Actual payment and the CIN</strong> (BSR code, challan serial, deposit date)
        happen on your bank / the income-tax portal — record them here afterwards. Filing the quarterly return still needs
        your TAN-linked TRACES / NSDL login, which is not part of this system.
      </OwnerQueueNote>

      {canPost && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-gray-800">Generate a challan for a period</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Type">
              <SelectInput value={type} onChange={(e) => setType(e.target.value as any)} className="w-40">
                <option value="tds">TDS (deducted)</option>
                <option value="tcs">TCS (collected)</option>
              </SelectInput>
            </Field>
            <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="TAN (optional)"><TextInput value={tan} onChange={(e) => setTan(e.target.value.toUpperCase())} placeholder="DELX99999X" className="w-40 font-mono uppercase" /></Field>
            <Btn variant="primary" onClick={generate}>Generate challan</Btn>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <ExportMenu
          filename="tds-deposit-challans"
          columns={CHALLAN_CSV_COLS}
          rows={challans}
          canExport={canRead}
          disabled={challans.length === 0}
        />
      </div>

      <TableShell maxHeight="55vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Type</Th><Th>Form</Th><Th>Period</Th><Th>Quarter</Th><Th num>Entries</Th>
            <Th num>Base</Th><Th num>Tax</Th><Th>Status</Th><Th>CIN</Th><Th num>Actions</Th>
          </THead>
          <TBody>
            {challans.length === 0 && <EmptyRow colSpan={10}>No deposit challans yet.</EmptyRow>}
            {challans.map((c) => (
              <Tr key={c.id}>
                <Td className="uppercase font-medium">{c.challan_type}</Td>
                <Td>{c.form ?? '—'}</Td>
                <Td className="whitespace-nowrap">{c.period_from} → {c.period_to}</Td>
                <Td className="font-mono text-xs">{c.quarter}</Td>
                <Td num>{c.entry_count}</Td>
                <Td num>{inrMinor(c.total_base_minor)}</Td>
                <Td num className="font-medium">{inrMinor(c.total_tax_minor)}</Td>
                <Td><StatusChip status={c.status} /></Td>
                <Td className="font-mono text-xs">{c.challan_serial ? `${c.bsr_code}/${c.challan_serial}` : <span className="text-amber-600">not deposited</span>}</Td>
                <Td num className="whitespace-nowrap">
                  <button onClick={() => pdf(c.id)} className="font-medium text-gray-900 hover:underline">PDF</button>
                  {canPost && <><span className="text-gray-300"> · </span>
                    <button onClick={() => setDepositFor(c)} className="font-medium text-gray-900 hover:underline">Record CIN</button></>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      {depositFor && <DepositModal challan={depositFor} onClose={() => setDepositFor(null)} onSaved={async () => { setDepositFor(null); await load(); }} onError={onError} />}
    </>
  );
};

const DepositModal: React.FC<{ challan: any; onClose: () => void; onSaved: () => void; onError: (m: string) => void }> = ({ challan, onClose, onSaved, onError }) => {
  const [bsr, setBsr] = useState(challan.bsr_code ?? '');
  const [serial, setSerial] = useState(challan.challan_serial ?? '');
  const [date, setDate] = useState(challan.deposited_on ?? todayStr());
  const save = async () => {
    onError('');
    try {
      await api.put(`/direct-taxes/challans/${challan.id}/deposit`, { bsrCode: bsr, challanSerial: serial, depositedOn: date, status: 'deposited' });
      onSaved();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-800">Record the challan identification number (CIN) — {challan.challan_type.toUpperCase()} {challan.quarter}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Close</button>
      </div>
      <p className="text-xs text-gray-500">Enter these from the bank / portal receipt after you deposit {inrMinor(challan.total_tax_minor)}.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="BSR code"><TextInput value={bsr} onChange={(e) => setBsr(e.target.value)} placeholder="0000000" className="w-32 font-mono" /></Field>
        <Field label="Challan serial no."><TextInput value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="00000" className="w-32 font-mono" /></Field>
        <Field label="Deposit date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Btn variant="primary" onClick={save}>Save CIN</Btn>
      </div>
    </div>
  );
};

// ── Form 16A tab — the quarterly TDS certificate per deductee ─────────────────
const FORM16A_CSV_COLS: CsvColumn<any>[] = [
  { key: 'vendor_name', label: 'Deductee' },
  { key: 'pan', label: 'PAN' },
  { key: 'return_form', label: 'Return' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'base_minor', label: 'Base', money: true },
  { key: 'tds_minor', label: 'TDS', money: true },
];

const Form16ATab: React.FC<{ canPost: boolean; onError: (m: string) => void }> = ({ canPost, onError }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');
  const [fy, setFy] = useState(currentFy());
  const [q, setQ] = useState('Q1');
  const [deductees, setDeductees] = useState<any[]>([]);
  const quarter = `${fy}-${q}`;

  const load = async () => {
    try { setDeductees(payload<any[]>(await api.get('/direct-taxes/form16a/deductees', { params: { quarter } })) ?? []); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { setDeductees([]); load(); }, [fy, q]);

  const pdf = (vendorId: string, name: string) =>
    downloadBlob(`/direct-taxes/form16a/${vendorId}/pdf`, { quarter }, `form16a-${name.replace(/[^\w.-]/g, '_')}-${quarter}.pdf`)
      .catch((e: any) => onError(e?.response?.data?.message ?? e.message));

  const issue = async (vendorId: string) => {
    onError('');
    try { await api.post(`/direct-taxes/form16a/${vendorId}/issue`, { quarter }); await load(); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <>
      <OwnerQueueNote>
        Form 16A is the certificate you give each deductee for the TDS you deducted from them. This generates a
        <strong> draft certificate PDF</strong> from the recorded deductions. The <strong>official, digitally-signed
        Form 16A</strong> is downloaded from the TRACES portal against your TAN after you file the quarterly return —
        that step needs your TRACES login.
      </OwnerQueueNote>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Financial year"><TextInput value={fy} onChange={(e) => setFy(e.target.value)} placeholder="26-27" className="w-28" /></Field>
        <Field label="Quarter">
          <SelectInput value={q} onChange={(e) => setQ(e.target.value)} className="w-44">
            <option value="Q1">Q1 (Apr–Jun)</option><option value="Q2">Q2 (Jul–Sep)</option>
            <option value="Q3">Q3 (Oct–Dec)</option><option value="Q4">Q4 (Jan–Mar)</option>
          </SelectInput>
        </Field>
        <Btn variant="outline" onClick={load}>Apply</Btn>
        <ExportMenu
          filename={`form16a-deductees-${quarter}`}
          columns={FORM16A_CSV_COLS}
          rows={deductees}
          canExport={canRead}
          disabled={deductees.length === 0}
        />
      </div>

      <TableShell maxHeight="55vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Deductee</Th><Th>PAN</Th><Th>Return</Th><Th num>Deductions</Th><Th num>Base</Th><Th num>TDS</Th><Th num>Actions</Th>
          </THead>
          <TBody>
            {deductees.length === 0 && <EmptyRow colSpan={7}>No TDS deducted from any deductee in {quarter}.</EmptyRow>}
            {deductees.map((d) => (
              <Tr key={d.vendor_id}>
                <Td className="font-medium">{d.vendor_name ?? '—'}</Td>
                <Td className="font-mono text-xs">{d.pan ?? <span className="text-red-600">missing</span>}</Td>
                <Td>{d.return_form}</Td>
                <Td num>{d.deductions}</Td>
                <Td num>{inrMinor(d.base_minor)}</Td>
                <Td num className="font-medium">{inrMinor(d.tds_minor)}</Td>
                <Td num className="whitespace-nowrap">
                  <button onClick={() => pdf(d.vendor_id, d.vendor_name ?? 'deductee')} className="font-medium text-gray-900 hover:underline">Form 16A PDF</button>
                  {canPost && <><span className="text-gray-300"> · </span>
                    <button onClick={() => issue(d.vendor_id)} className="font-medium text-gray-900 hover:underline">Mark issued</button></>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </>
  );
};

export default Tds;
