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
 * TCS — Tax Collected at Source (s.206C) — the SELLER side, plain language:
 * "On some kinds of sale (scrap, a > ₹10-lakh vehicle …) you must collect a
 * small extra tax FROM the buyer and pay it to the government." It is the mirror
 * of TDS. This panel keeps the collection register (Form 27EQ source) and a
 * "how much TCS?" calculator. The monthly deposit challan (ITNS-281) and the
 * quarterly certificate are on the TDS panel's challan tab (challan 281 and the
 * return machinery are shared between TDS and TCS).
 *
 * s.206C(1H) "sale of goods" was WITHDRAWN from 01-04-2025 — the calculator
 * shows no TCS for a sale-of-goods dated on/after that, automatically.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentFy = () => {
  const d = new Date();
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
};

interface NatureOpt { key: string; label: string; section: string; }

const UnverifiedBanner: React.FC = () => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    <strong>Provisional rates.</strong> The TCS rates shown come from the statutory registry but are
    <em> not yet verified</em> against the official CBDT tables. Confirm with your CA before you rely on them.
    Nothing here is ready to file — depositing the tax and filing Form 27EQ need your TAN-linked portal login.
  </div>
);

const TcsRegisterPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const [tab, setTab] = useState<'register' | 'calc'>('register');
  const [error, setError] = useState('');

  return (
    <Page>
      <PageHeader
        title="TCS — Tax Collected at Source (s.206C)"
        description="Collect tax from the buyer on certain sales (scrap and other notified goods, motor vehicles over ₹10 lakh) and keep the register your CA files Form 27EQ from. The deposit challan (ITNS-281) is generated on the TDS panel — challan 281 covers both."
      />
      <TabBar
        tabs={[{ key: 'register', label: 'Collection register (27EQ)' }, { key: 'calc', label: 'TCS calculator' }]}
        active={tab}
        onChange={(k) => { setError(''); setTab(k as any); }}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {tab === 'register' ? <RegisterTab canPost={canPost} onError={setError} /> : <CalcTab onError={setError} />}
    </Page>
  );
};

// ── Collection register ───────────────────────────────────────────────────────
const REG_PAGE_SIZE = 50;
const TCS_CSV_COLS: CsvColumn<any>[] = [
  { key: 'collected_on', label: 'Date' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'section_code', label: 'Section' },
  { key: 'nature_label', label: 'Nature' },
  { key: 'collectee_name', label: 'Buyer' },
  { key: 'collectee_pan', label: 'PAN' },
  { key: 'invoice_ref', label: 'Reference' },
  { key: 'base_minor', label: 'Sale value', money: true },
  { key: 'rate', label: 'Rate %', format: (r) => (Number(r.tcs_rate_milli_pct) / 1000).toFixed(2) },
  { key: 'tcs_minor', label: 'TCS', money: true },
  { key: 'deposited', label: 'Deposited', format: (r) => (r.challan_id ? 'on challan' : 'pending') },
];

const RegisterTab: React.FC<{ canPost: boolean; onError: (m: string) => void }> = ({ canPost, onError }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');
  const [fy, setFy] = useState(currentFy());
  const [quarter, setQuarter] = useState('');
  const [reg, setReg] = useState<any>(null);
  const [page, setPage] = useState(1);

  const periodParams = () => (quarter ? { quarter: `${fy}-${quarter}` } : { fy });

  const load = async () => {
    try { setReg(payload<any>(await api.get('/direct-taxes/tcs/register', { params: periodParams() }))); }
    catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { setReg(null); setPage(1); load(); }, [fy, quarter]);

  const s = reg?.summary;
  const bySection: Array<[string, any]> = Object.entries(s?.by_section ?? {});
  const allRows: any[] = reg?.rows ?? [];
  const pagedRows = allRows.slice((page - 1) * REG_PAGE_SIZE, page * REG_PAGE_SIZE);
  return (
    <>
      <UnverifiedBanner />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Financial year"><TextInput value={fy} onChange={(e) => setFy(e.target.value)} placeholder="26-27" className="w-28" /></Field>
        <Field label="Quarter">
          <SelectInput value={quarter} onChange={(e) => setQuarter(e.target.value)} className="w-44">
            <option value="">Whole year</option>
            <option value="Q1">Q1 (Apr–Jun)</option><option value="Q2">Q2 (Jul–Sep)</option>
            <option value="Q3">Q3 (Oct–Dec)</option><option value="Q4">Q4 (Jan–Mar)</option>
          </SelectInput>
        </Field>
        <Btn variant="outline" onClick={load}>Apply</Btn>
        <ExportMenu
          filename={`tcs-register-${quarter ? `${fy}-${quarter}` : fy}`}
          columns={TCS_CSV_COLS}
          rows={allRows}
          canExport={canRead}
          disabled={!allRows.length}
          serverExports={[{
            label: 'Server CSV (27EQ layout)',
            path: '/direct-taxes/tcs/register',
            params: { ...periodParams(), format: 'csv' },
            filename: `tcs-register-${quarter ? `${fy}-${quarter}` : fy}.csv`,
          }]}
        />
      </div>

      {s && (
        <StatGrid cols={4}>
          <StatCard label="Collections" value={s.count} sub="entries in this period" />
          <StatCard label="Total sale value" value={inrMinor(s.total_base_minor)} sub="TCS was computed on" />
          <StatCard label="Total TCS collected" value={inrMinor(s.total_tcs_minor)} sub="owed to the government" tone="good" />
          <StatCard
            label="Missing PAN" value={s.collectees_without_pan ?? 0}
            sub={(s.collectees_without_pan ?? 0) > 0 ? 'higher rate applied — fix before filing' : 'all buyers have a PAN'}
            tone={(s.collectees_without_pan ?? 0) > 0 ? 'bad' : 'good'}
          />
        </StatGrid>
      )}

      {bySection.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <p className="mb-2 font-medium text-gray-800">By section</p>
          <div className="flex flex-wrap gap-2">
            {bySection.map(([sec, v]) => (
              <span key={sec} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
                {sec} · {v.count} · {inrMinor(v.tcs_minor)} TCS
              </span>
            ))}
          </div>
        </div>
      )}

      <TableShell maxHeight="58vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Date</Th><Th>Quarter</Th><Th>Section</Th><Th>Nature</Th><Th>Buyer</Th><Th>PAN</Th><Th>Reference</Th>
            <Th num>Sale value</Th><Th num>Rate</Th><Th num>TCS</Th><Th>Deposited</Th>
          </THead>
          <TBody>
            {reg && allRows.length === 0 && <EmptyRow colSpan={11}>No TCS collected in this period.</EmptyRow>}
            {pagedRows.map((r: any) => (
              <Tr key={r.id}>
                <Td>{r.collected_on}</Td>
                <Td className="font-mono text-xs">{r.quarter}</Td>
                <Td>{r.section_code}</Td>
                <Td className="max-w-xs truncate" title={r.nature_label}>{r.nature_label}</Td>
                <Td>{r.collectee_name ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.collectee_pan ?? <span className="text-red-600">missing</span>}</Td>
                <Td className="font-mono text-xs">{r.invoice_ref ?? '—'}</Td>
                <Td num>{inrMinor(r.base_minor)}</Td>
                <Td num>{(Number(r.tcs_rate_milli_pct) / 1000).toFixed(2)}%</Td>
                <Td num className="font-medium">{inrMinor(r.tcs_minor)}</Td>
                <Td>{r.challan_id ? <StatusChip status="deposited" tone="green" label="on challan" /> : <StatusChip status="pending" label="pending" />}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
      <Pagination page={page} pageSize={REG_PAGE_SIZE} total={allRows.length} onPage={setPage} />
      <p className="text-xs text-gray-400">
        {canPost
          ? 'TCS is collected automatically on eligible sales. Use the calculator tab to check a figure before invoicing.'
          : 'This is a read-only view of TCS collected on sales.'}
      </p>
    </>
  );
};

// ── TCS calculator ────────────────────────────────────────────────────────────
const CalcTab: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [natures, setNatures] = useState<NatureOpt[]>([]);
  const [nature, setNature] = useState('scrap');
  const [amount, setAmount] = useState('');
  const [pan, setPan] = useState('');
  const [date, setDate] = useState(todayStr());
  const [result, setResult] = useState<any>(null);

  useEffect(() => { api.get('/direct-taxes/tcs/natures').then((r) => setNatures(payload<NatureOpt[]>(r) ?? [])).catch(() => {}); }, []);

  const run = async () => {
    onError(''); setResult(null);
    try {
      const res = await api.get('/direct-taxes/tcs/preview', {
        params: { nature, amount: Number(amount) || 0, asOfDate: date, pan: pan || undefined },
      });
      setResult(payload<any>(res));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <>
      <UnverifiedBanner />
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nature of sale">
            <SelectInput value={nature} onChange={(e) => setNature(e.target.value)} className="w-64">
              {natures.map((n) => <option key={n.key} value={n.key}>{n.label} ({n.section})</option>)}
            </SelectInput>
          </Field>
          <Field label="Sale value (₹)"><TextInput type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40 text-right" /></Field>
          <Field label="Buyer PAN (optional)"><TextInput value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="AAAAA9999A" className="w-40 font-mono uppercase" /></Field>
          <Field label="Sale date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Btn variant="primary" onClick={run}>Calculate</Btn>
        </div>
        {result && (
          <div className={`rounded-lg border px-3 py-2 ${Number(result.tcsMinor) > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
            <p className="font-medium">{result.reason}</p>
            {Number(result.tcsMinor) > 0 && (
              <p className="mt-1 text-xs">Collect <strong>{inrMinor(result.tcsMinor)}</strong> from the buyer on top of the sale price (rate {result.ratePct}%). This goes to the government.</p>
            )}
            {result.noPanApplied && <p className="mt-1 text-xs text-amber-700">Higher no-PAN rate applied (buyer has no PAN).</p>}
            {result.verificationState === 'UNVERIFIED' && <p className="mt-1 text-xs text-amber-700">Provisional rate — confirm with your CA.</p>}
          </div>
        )}
      </div>
    </>
  );
};

export default TcsRegisterPage;
