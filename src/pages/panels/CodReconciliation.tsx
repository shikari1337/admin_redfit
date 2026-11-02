import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, Loader2, CheckCircle2, X, RefreshCw, Trash2, Upload, LineChart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput, StatCard, StatGrid, DrillLink, ExportMenu,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip, type CsvColumn,
} from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';
import { formatDay } from '../../utils/date';
import { majorToMinor } from '@/lib/v2/money';
import {
  COD_MATCH_LABEL, COD_MATCH_TONE, LINK, codPayoutsAPI, codReason, failureOf, importProblems, isGap, minorOf, money, plainMajor,
  toCodLine, type CodLine, type CodSummary, type LoadFailure,
} from '../payments/data';
import { DEFAULT_FROM, DEFAULT_TO, FailureNotice, RangeFields, useUrlFilters } from '../payments/common';

/**
 * COD remittance reconciliation (migration 064; PAY-0 §3 / §5 deductions, import and summary — lane
 * ADMIN-PAY-1). Plain-language screen:
 * "The courier collected cash at the customer's door and later paid us a lump
 * sum. Did they pay us the right amount for every parcel, and what did they keep?"
 * Enter the payout by hand or import the courier's remittance CSV → we match each parcel to its delivered
 * COD order and flag anything short, over, listed twice or with no matching order; the courier's
 * deductions (COD charge, freight, other) are shown beside the match, never hidden in it. Mark it
 * reconciled only when every line ties out.
 */

interface Remittance {
  id: string; courier: string | null; reference: string | null;
  remitted_on: string | null; status: string; note: string | null; created_at: string;
  line_count?: number; matched_count?: number; unmatched_count?: number; lines?: any[];
  [k: string]: any;
}

const STATUS_TONE: Record<string, any> = { open: 'amber', reconciled: 'green', cancelled: 'red' };
const STATUS_LABEL: Record<string, string> = { open: 'Open', reconciled: 'Reconciled', cancelled: 'Cancelled' };

// A blank payout line in the create form (amounts are entered in rupees).
type Draft = { awb: string; orderNumber: string; amount: string };
const blankLine = (): Draft => ({ awb: '', orderNumber: '', amount: '' });

/* ── CSV import: courier + column mapping ─────────────────────────────────── */

const COURIERS = ['Shiprocket', 'Delhivery', 'Blue Dart', 'Xpressbees', 'Ecom Express', 'DTDC', 'Shadowfax', 'Ekart', 'Other'];

/** The remittance fields a courier's CSV can fill (PAY-0 §3), and the header words that usually name them. */
const IMPORT_FIELDS: Array<{ key: string; label: string; required?: boolean; guess: RegExp }> = [
  { key: 'awb', label: 'Tracking / AWB', guess: /\b(awb|tracking|waybill)\b/i },
  { key: 'order_number', label: 'Order number', guess: /\border\b.*\b(id|no|number|ref)\b|^order$/i },
  { key: 'collected', label: 'Cash collected', required: true, guess: /\b(cod|collect)/i },
  { key: 'courier_cod_charge', label: 'Courier COD charge', guess: /\bcod\b.*\b(charge|fee)|\bcollection\b.*\b(charge|fee)/i },
  { key: 'freight_deducted', label: 'Freight deducted', guess: /\b(freight|shipping)\b/i },
  { key: 'other_deductions', label: 'Other deductions', guess: /\b(other|deduction|adjust)/i },
  { key: 'net_remitted', label: 'Net remitted', guess: /\b(remit|net|paid)\b/i },
  { key: 'remitted_on', label: 'Remitted on', guess: /\b(remittance|remitted|payment)\b.*\bdate\b|\bdate\b/i },
  { key: 'reference', label: 'Bank reference / UTR', guess: /\b(utr|crf|reference|txn)\b/i },
];

/** The first line of a CSV → its column names (quotes handled). Display only; the server parses the file. */
function csvHeader(text: string): string[] {
  const line = text.replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out.filter((h) => h !== '');
}

function guessMapping(headers: string[]): Record<string, string> {
  const used = new Set<string>(); const m: Record<string, string> = {};
  // Specific fields first, so "COD Charges" is not taken as "Cash collected".
  const order = ['courier_cod_charge', 'awb', 'order_number', 'freight_deducted', 'other_deductions', 'net_remitted', 'remitted_on', 'reference', 'collected'];
  for (const key of order) {
    const f = IMPORT_FIELDS.find((x) => x.key === key)!;
    const hit = headers.find((h) => !used.has(h) && f.guess.test(h));
    if (hit) { m[key] = hit; used.add(hit); }
  }
  return m;
}

const LINE_CSV: CsvColumn<CodLine>[] = [
  { key: 'awb', label: 'AWB', format: (l) => l.awb ?? '' },
  { key: 'order_number', label: 'Order', format: (l) => l.order_number ?? '' },
  { key: 'expected_minor', label: 'COD due', format: (l) => plainMajor(l.expected_minor, l.currency) },
  { key: 'collected_minor', label: 'Collected', format: (l) => plainMajor(l.collected_minor, l.currency) },
  { key: 'courier_cod_charge_minor', label: 'Courier COD charge', format: (l) => plainMajor(l.courier_cod_charge_minor, l.currency) },
  { key: 'freight_deducted_minor', label: 'Freight deducted', format: (l) => plainMajor(l.freight_deducted_minor, l.currency) },
  { key: 'other_deductions_minor', label: 'Other deductions', format: (l) => plainMajor(l.other_deductions_minor, l.currency) },
  { key: 'net_remitted_minor', label: 'Net remitted', format: (l) => plainMajor(l.net_remitted_minor, l.currency) },
  { key: 'match_status', label: 'Result', format: (l) => COD_MATCH_LABEL[l.match_status] ?? l.match_status },
  { key: 'match_note', label: 'Reason', format: (l) => codReason(l) },
];

const LIST_CSV: CsvColumn<Remittance>[] = [
  { key: 'courier', label: 'Courier', format: (r) => r.courier ?? '' },
  { key: 'reference', label: 'Reference / UTR', format: (r) => r.reference ?? '' },
  { key: 'remitted_on', label: 'Paid on', format: (r) => r.remitted_on ?? '' },
  { key: 'remitted', label: 'Paid', format: (r) => plainMajor(minorOf(r, 'remitted_amount') ?? minorOf(r, 'net_remitted'), r.currency) },
  { key: 'matched', label: 'Matched', format: (r) => plainMajor(minorOf(r, 'matched_amount'), r.currency) },
  { key: 'line_count', label: 'Parcels', format: (r) => r.line_count ?? '' },
  { key: 'unmatched_count', label: 'Unmatched', format: (r) => r.unmatched_count ?? 0 },
  { key: 'status', label: 'Status' },
];

const CodReconciliation: React.FC = () => {
  const [list, setList] = useState<Remittance[] | null>(null);
  const [detail, setDetail] = useState<Remittance | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // summary (date range kept in the URL)
  const defaults = useMemo(() => ({ from: DEFAULT_FROM(), to: DEFAULT_TO() }), []);
  // `?remittance=<id>` opens that payout (the order page links here).
  const [range, setRange] = useUrlFilters(['from', 'to', 'remittance'] as const, defaults);
  const days = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
  const [summary, setSummary] = useState<CodSummary | null>(null);
  const [summaryFail, setSummaryFail] = useState<LoadFailure | null>(null);

  // create form
  const [creating, setCreating] = useState(false);
  const [courier, setCourier] = useState(''); const [reference, setReference] = useState('');
  const [remittedOn, setRemittedOn] = useState('');
  const [lines, setLines] = useState<Draft[]>([blankLine()]);

  // import form
  const [importing, setImporting] = useState(false);
  const [impCourier, setImpCourier] = useState('Shiprocket');
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impHeaders, setImpHeaders] = useState<string[]>([]);
  const [impMap, setImpMap] = useState<Record<string, string>>({});
  const [impRef, setImpRef] = useState(''); const [impBatch, setImpBatch] = useState('');
  const [impOn, setImpOn] = useState(''); const [impAmount, setImpAmount] = useState(''); const [impNote, setImpNote] = useState('');
  const [impProblems, setImpProblems] = useState<Array<{ row: string; field: string; problem: string }>>([]);
  const isExcel = !!impFile && /\.(xlsx|xls)$/i.test(impFile.name);

  const loadList = () => api.get('/logistics/cod-remittances')
    .then((r) => setList(payload<Remittance[]>(r) ?? []))
    .catch((e) => { setList([]); setMsg(e?.response?.data?.message ?? e.message); });
  useEffect(() => { loadList(); }, []);

  const loadSummary = useCallback(() => {
    setSummary(null); setSummaryFail(null);
    if (!(days > 0 && days <= 366)) { setSummaryFail({ gap: false, forbidden: false, message: 'The COD summary covers 1 to 366 days — pick a shorter range.' }); return; }
    codPayoutsAPI.summary({ from: range.from, to: range.to })
      .then(setSummary)
      .catch((e) => setSummaryFail(failureOf(e, 'the COD summary could not be read')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (range.remittance && detail?.id !== range.remittance) openDetail(range.remittance);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.remittance]);

  const openDetail = async (id: string) => {
    setMsg(''); setOk('');
    try {
      // The §3 read (deductions + match reasons + order ids); an older server answers the original route.
      let r: Remittance;
      try { r = await codPayoutsAPI.remittance(id); }
      catch (e) { if (!isGap(e)) throw e; r = payload<Remittance>(await api.get(`/logistics/cod-remittances/${id}`)); }
      setDetail(r); setCreating(false); setImporting(false);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const setLine = (i: number, patch: Partial<Draft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const create = async () => {
    const payoutLines = lines
      .map((l) => ({
        awb: l.awb.trim() || null,
        orderNumber: l.orderNumber.trim() || null,
        // the v2 route takes `cod_amount` as Money (rupees here; the body shaper converts); the Node route reads the paise
        codAmount: l.amount.trim() || null,
        codAmountMinor: Math.round((Number(l.amount) || 0) * 100),
      }))
      .filter((l) => (l.awb || l.orderNumber) && l.codAmountMinor > 0);
    if (payoutLines.length === 0) { setMsg('Add at least one parcel: a tracking or order number and the cash collected.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = payload<Remittance>(await api.post('/logistics/cod-remittances', {
        courier: courier.trim() || null, reference: reference.trim() || null,
        remittedOn: remittedOn || null, lines: payoutLines,
      }));
      setOk('Payout entered and matched. Open it to see which parcels tie out.');
      setCreating(false); setCourier(''); setReference(''); setRemittedOn(''); setLines([blankLine()]);
      loadList(); loadSummary(); if (r?.id) openDetail(r.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const pickFile = async (file: File | null) => {
    setImpFile(file); setImpHeaders([]); setImpMap({}); setImpProblems([]);
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) return; // Excel: the server reads it; columns are typed below
    try {
      const head = csvHeader(await file.slice(0, 64 * 1024).text());
      setImpHeaders(head); setImpMap(guessMapping(head));
    } catch { setMsg('That file could not be read. Save the courier’s report as CSV and try again.'); }
  };

  const runImport = async () => {
    if (!impFile) { setMsg('Choose the courier’s remittance file (CSV or Excel) first.'); return; }
    const amountMinor = impAmount.trim() ? majorToMinor(impAmount, 'INR') : null;
    if (impAmount.trim() && amountMinor === null) { setMsg('The amount paid must be a number, e.g. 12450.50.'); return; }
    if (impHeaders.length && !impMap.collected) { setMsg('Pick the column that holds the cash collected.'); return; }
    if (impHeaders.length && !impMap.awb && !impMap.order_number) { setMsg('Pick the tracking (AWB) or order number column, so each parcel can be matched.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const form = new FormData();
      form.append('file', impFile);
      form.append('courier', impCourier);
      form.append('mapping', JSON.stringify(impMap));
      if (impRef.trim()) form.append('reference', impRef.trim());
      if (impBatch.trim()) form.append('batch_ref', impBatch.trim());
      if (impOn) form.append('remitted_on', impOn);
      if (amountMinor !== null) { form.append('remitted_amount_minor', String(amountMinor)); form.append('currency', 'INR'); }
      if (impNote.trim()) form.append('note', impNote.trim());
      setImpProblems([]);
      const r: any = await codPayoutsAPI.importCsv(form);
      const n = Array.isArray(r?.lines) ? r.lines.length : r?.line_count;
      setOk(`Imported${n ? ` ${n} parcels` : ''} and matched them to your orders. Check the lines marked in red.`);
      setImporting(false); setImpFile(null); setImpHeaders([]); setImpMap({});
      setImpRef(''); setImpBatch(''); setImpOn(''); setImpAmount(''); setImpNote('');
      loadList(); loadSummary();
      if (r?.id) { if (Array.isArray(r.lines)) setDetail(r); else openDetail(r.id); }
    } catch (e: any) {
      const st = e?.response?.status;
      if (isGap(e)) setMsg('Importing a courier file is not available on this server yet. Enter the payout by hand for now.');
      else if (st === 409) setMsg('This file was already imported — open it from the payouts list below instead of importing it again.');
      else if (st === 422) {
        const probs = importProblems(e);
        setImpProblems(probs);
        setMsg(probs.length ? `Nothing was imported: ${probs.length} problem${probs.length === 1 ? '' : 's'} in the file, listed below. Fix them (or the column mapping) and import again.` : (e?.response?.data?.message ?? 'The file could not be imported.'));
      } else setMsg(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const rematch = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/match`); setOk('Re-checked against the latest delivered orders.'); await openDetail(detail.id); loadList(); loadSummary(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const reconcile = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/reconcile`); setOk('Reconciled — this payout ties out to the paisa.'); await openDetail(detail.id); loadList(); loadSummary(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/cancel`); setOk('Payout cancelled.'); await openDetail(detail.id); loadList(); loadSummary(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const cur = String(detail?.currency || 'INR');
  const detailLines: CodLine[] = useMemo(() => (detail?.lines ?? []).map((l: any) => toCodLine(l, detail?.currency)), [detail]);
  const totals = (detail?.totals ?? null) as Record<string, any> | null;
  const skipped: any[] = Array.isArray(detail?.skipped) ? detail!.skipped : [];
  const dm = totals?.deductions_mismatch;
  // A Money (how far off), a count or a flag — whichever the server sends; only a Money gives an amount.
  const deductionsBy = dm && typeof dm === 'object' ? minorOf(totals, 'deductions_mismatch', cur) : null;
  const deductionsOff = typeof dm === 'boolean' ? dm : typeof dm === 'number' ? dm !== 0 : (deductionsBy ?? 0) !== 0;
  const remitted = detail ? (minorOf(detail, 'remitted_amount') ?? minorOf(detail, 'net_remitted')) : null;
  const matchedAmt = detail ? minorOf(detail, 'matched_amount') : null;
  const showDeductions = detailLines.some((l) => l.courier_cod_charge_minor !== null || l.freight_deducted_minor !== null || l.other_deductions_minor !== null || l.net_remitted_minor !== null);
  const sumOf = (k: keyof CodLine) => detailLines.reduce((s, l) => s + (Number(l[k]) || 0), 0);

  // The server's own verdict (`totals.ties_out`) when it gives one; else the lines decide.
  const ties = detail && detail.status === 'open' && (typeof totals?.ties_out === 'boolean'
    ? totals.ties_out
    : detailLines.length > 0
      && detailLines.every((l) => l.match_status === 'matched')
      && matchedAmt !== null && matchedAmt === remitted);

  const colCount = showDeductions ? 9 : 5;
  const s = summary;
  const sc = s?.currency ?? 'INR';

  return (
    <Page>
      <PageHeader
        title="COD payouts — did the courier pay us right?"
        icon={Banknote}
        description="The courier collects cash at the door and later pays you a lump sum, minus its charges. Enter or import the payout, and we match every parcel to its delivered order — flagging anything paid short, over, or with no matching order."
        actions={(
          <>
            <Link to={LINK.analytics} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><LineChart className="h-4 w-4" />Payment analytics</Link>
            <Btn variant="outline" onClick={() => { setImporting((v) => !v); setCreating(false); setDetail(null); setMsg(''); setOk(''); }}><Upload className="h-4 w-4" />{importing ? 'Close import' : 'Import CSV'}</Btn>
            <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setImporting(false); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Cancel' : 'New payout'}</Btn>
          </>
        )}
      />

      {/* SUMMARY */}
      <FilterBar><RangeFields from={range.from} to={range.to} onChange={(r) => setRange(r)} /></FilterBar>
      {summaryFail ? (
        <FailureNotice failure={summaryFail} what="The COD summary (expected, collected, remitted, courier charges) is not on this server yet. The payouts below still work." onRetry={loadSummary} />
      ) : (
        <StatGrid cols={4}>
          <StatCard label={<span className="inline-flex items-center gap-1">Expected <InfoTip text="The COD amount due on orders delivered in this period (the order total for COD orders not paid online)." /></span>}
            value={s ? money(s.expected_minor, sc) : '…'} sub={s ? `${s.delivered_cod_count} delivered COD orders` : undefined} />
          <StatCard label={<span className="inline-flex items-center gap-1">Collected <InfoTip text="What the couriers say they collected at the door." /></span>} value={s ? money(s.collected_minor, sc) : '…'} />
          <StatCard label={<span className="inline-flex items-center gap-1">Remitted <InfoTip text="What the couriers actually paid into your bank, after their deductions." /></span>} value={s ? money(s.remitted_minor, sc) : '…'} tone="good" />
          <StatCard label={<span className="inline-flex items-center gap-1">Pending <InfoTip text="Collected or due but not paid to you yet." /></span>} value={s ? money(s.pending_minor, sc) : '…'} tone={(s?.pending_minor ?? 0) > 0 ? 'warn' : 'default'}
            sub={s && s.mismatched_count > 0 ? `${s.mismatched_count} line${s.mismatched_count === 1 ? '' : 's'} do not match` : undefined} />
          <StatCard label={<span className="inline-flex items-center gap-1">Courier charges <InfoTip text="The courier’s COD charges. Freight and other amounts it deducted from the payout are listed under it." /></span>}
            value={s ? money(s.courier_cod_charges_minor, sc) : '…'}
            sub={s && (s.freight_deducted_minor || s.other_deductions_minor) ? `+ ${money(s.freight_deducted_minor ?? 0, sc)} freight · ${money(s.other_deductions_minor ?? 0, sc)} other deducted` : undefined} />
          <StatCard label={<span className="inline-flex items-center gap-1">COD fee collected <InfoTip text="The COD fee your shoppers paid at checkout, without its GST." /></span>} value={s ? money(s.cod_fee_from_shoppers_minor, sc) : '…'} sub="excl. GST" />
          <StatCard label={<span className="inline-flex items-center gap-1">COD margin <InfoTip text="COD margin = COD fee from shoppers (without GST) − courier COD charges. Negative means COD costs you more than you charge for it." /></span>}
            value={s ? money(s.cod_margin_minor, sc) : '…'} sub="fee excl. GST − courier charges" tone={(s?.cod_margin_minor ?? 0) < 0 ? 'bad' : 'default'} />
        </StatGrid>
      )}

      {msg && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* IMPORT */}
      {importing && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800">Import a courier’s COD remittance report</h3>
          <p className="text-xs text-gray-500">Download the COD remittance report from your courier’s panel (CSV or Excel). Pick the courier, choose the file, and check which column holds what — for a CSV we guessed from the column names.</p>
          <FilterBar>
            <Field label="Courier">
              <SelectInput value={impCourier} onChange={(e) => setImpCourier(e.target.value)} aria-label="Courier">
                {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectInput>
            </Field>
            <Field label="Remittance file (CSV or Excel)">
              <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="block h-9 text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:text-sm file:text-gray-700" />
            </Field>
          </FilterBar>
          {impHeaders.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((fld) => (
                <Field key={fld.key} label={`${fld.label}${fld.required ? ' *' : ''}`}>
                  <SelectInput value={impMap[fld.key] ?? ''} onChange={(e) => setImpMap((m) => { const n = { ...m }; if (e.target.value) n[fld.key] = e.target.value; else delete n[fld.key]; return n; })}>
                    <option value="">— not in this file —</option>
                    {impHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </SelectInput>
                </Field>
              ))}
            </div>
          )}
          {impFile && impHeaders.length === 0 && (
            <>
              <p className="text-xs text-amber-700">{isExcel ? `An Excel file: type the column names as they appear in its header row (leave blank to use the ${impCourier} layout).` : `No column names found on the first line — type them, or leave blank to use the ${impCourier} layout.`}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((fld) => (
                  <Field key={fld.key} label={`${fld.label}${fld.required ? ' *' : ''}`}>
                    <TextInput value={impMap[fld.key] ?? ''} placeholder="column name" onChange={(e) => setImpMap((m) => { const n = { ...m }; if (e.target.value.trim()) n[fld.key] = e.target.value; else delete n[fld.key]; return n; })} />
                  </Field>
                ))}
              </div>
            </>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-gray-600">Payout details (optional — the file may already carry them)</summary>
            <FilterBar className="mt-2">
              <Field label="Bank reference / UTR"><TextInput value={impRef} onChange={(e) => setImpRef(e.target.value)} /></Field>
              <Field label="Courier batch / CRF id"><TextInput value={impBatch} onChange={(e) => setImpBatch(e.target.value)} /></Field>
              <Field label="Paid on"><TextInput type="date" value={impOn} onChange={(e) => setImpOn(e.target.value)} /></Field>
              <Field label="Amount paid (₹)"><TextInput inputMode="decimal" value={impAmount} onChange={(e) => setImpAmount(e.target.value)} placeholder="as on the bank credit" /></Field>
              <Field label="Note" className="min-w-[14rem] flex-1"><TextInput value={impNote} onChange={(e) => setImpNote(e.target.value)} /></Field>
            </FilterBar>
          </details>
          {impProblems.length > 0 && (
            <TableShell maxHeight="40vh">
              <table className="w-full text-sm">
                <THead><Th>Row</Th><Th>Column</Th><Th>Problem</Th></THead>
                <TBody>
                  {impProblems.map((p, i) => (
                    <Tr key={i}><Td className="tabular-nums">{p.row || '—'}</Td><Td>{p.field || '—'}</Td><Td className="text-red-700">{p.problem}</Td></Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          )}
          <Btn variant="success" disabled={busy || !impFile} onClick={runImport}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import & match</Btn>
        </div>
      )}

      {/* CREATE */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Enter a courier COD payout</h3>
          <p className="text-xs text-gray-500">One row per parcel. Put the tracking number (AWB) if you have it — it's the most accurate — otherwise the order number, then the cash the courier says they collected.</p>
          <FilterBar>
            <Field label="Courier"><TextInput value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. Delhivery" /></Field>
            <Field label="Bank reference / UTR (optional)"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR on the bank credit" /></Field>
            <Field label="Paid on (optional)"><TextInput type="date" value={remittedOn} onChange={(e) => setRemittedOn(e.target.value)} /></Field>
          </FilterBar>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Tracking / AWB</Th><Th>or Order number</Th><Th num>Cash collected (₹)</Th><Th> </Th>
              </THead>
              <TBody>
                {lines.map((l, i) => (
                  <Tr key={i}>
                    <Td><TextInput value={l.awb} onChange={(e) => setLine(i, { awb: e.target.value })} placeholder="courier AWB" aria-label={`Parcel ${i + 1} tracking number`} /></Td>
                    <Td><TextInput value={l.orderNumber} onChange={(e) => setLine(i, { orderNumber: e.target.value })} placeholder="e.g. ORD-00003" aria-label={`Parcel ${i + 1} order number`} /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-32 text-right" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="0.00" aria-label={`Parcel ${i + 1} cash collected`} /></Td>
                    <Td>{lines.length > 1 && <Btn variant="ghost" aria-label="Remove parcel" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Btn>}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Add parcel</Btn>
            <Btn variant="success" disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Enter payout & match</Btn>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                Payout {detail.reference ? `· ${detail.reference}` : ''}
                <Chip tone={STATUS_TONE[detail.status] ?? 'neutral'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.courier ? `${detail.courier} · ` : ''}{detail.remitted_on ? `paid ${formatDay(detail.remitted_on)} · ` : ''}
                {detail.line_count ?? detailLines.length} parcel(s)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ExportMenu filename={`cod-payout-${detail.reference || detail.id}`} columns={LINE_CSV} rows={detailLines} disabled={!detailLines.length} />
              <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div><span className="text-gray-500">Courier paid: </span><strong>{money(remitted, cur)}</strong></div>
            <div><span className="text-gray-500">Matched to orders: </span><strong className={matchedAmt === remitted ? 'text-emerald-700' : 'text-amber-700'}>{money(matchedAmt, cur)}</strong></div>
            {showDeductions && (
              <div><span className="text-gray-500">Courier kept: </span><strong>{money(sumOf('courier_cod_charge_minor') + sumOf('freight_deducted_minor') + sumOf('other_deductions_minor'), cur)}</strong>
                <span className="text-xs text-gray-500"> (COD charge {money(sumOf('courier_cod_charge_minor'), cur)} · freight {money(sumOf('freight_deducted_minor'), cur)} · other {money(sumOf('other_deductions_minor'), cur)})</span>
              </div>
            )}
          </div>

          {deductionsOff && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The courier’s figures do not add up: collected − its deductions differs from the net it paid{deductionsBy ? ` by ${money(Math.abs(deductionsBy), cur)}` : ''}. Ask the courier for the breakdown.
            </p>
          )}
          {skipped.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <summary className="cursor-pointer font-medium">{skipped.length} row{skipped.length === 1 ? '' : 's'} of the file were left out</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {skipped.map((k, i) => (
                  <li key={i}>{typeof k === 'string' ? k : `${k?.row ?? k?.line ?? k?.source_line ?? ''}${(k?.row ?? k?.line ?? k?.source_line) ? ': ' : ''}${k?.reason ?? k?.message ?? k?.problem ?? JSON.stringify(k)}`}</li>
                ))}
              </ul>
            </details>
          )}
          {detail.status === 'reconciled' && (
            <p className="text-xs text-gray-500">Reconciled{detail.reconciled_at ? ` on ${formatDay(detail.reconciled_at)}` : ''} — this payout is locked, so its matches can no longer be re-checked.</p>
          )}
          {detail.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" disabled={busy} onClick={rematch}><RefreshCw className="h-4 w-4" />Re-check matches</Btn>
              <Btn variant="success" disabled={busy || !ties} onClick={reconcile}><CheckCircle2 className="h-4 w-4" />Mark reconciled</Btn>
              <Btn variant="danger" disabled={busy} onClick={cancel}><Trash2 className="h-4 w-4" />Cancel payout</Btn>
              {!ties && <span className="self-center text-xs text-amber-700">Can't reconcile yet — every parcel must match its order to the paisa.</span>}
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Tracking / Order</Th>
                <Th num><span className="inline-flex items-center gap-1">COD due <InfoTip text="What the order says should have been collected at the door." /></span></Th>
                <Th num><span className="inline-flex items-center gap-1">Collected <InfoTip text="What the courier says it collected." /></span></Th>
                {showDeductions && <Th num>Courier COD charge</Th>}
                {showDeductions && <Th num>Freight deducted</Th>}
                {showDeductions && <Th num>Other deductions</Th>}
                {showDeductions && <Th num><span className="inline-flex items-center gap-1">Net remitted <InfoTip text="Collected − the courier’s deductions: what reached your bank for this parcel." /></span></Th>}
                <Th>Result</Th><Th>Why</Th>
              </THead>
              <TBody>
                {detailLines.length === 0 ? (
                  <EmptyRow colSpan={colCount}>No lines.</EmptyRow>
                ) : detailLines.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      {l.order_id ? <DrillLink to={LINK.order(l.order_id)}>{l.order_number ?? 'Open order'}</DrillLink> : <span>{l.order_number ?? l.listed_order_number ?? '—'}</span>}
                      {l.listed_order_number && l.order_id && l.listed_order_number !== l.order_number && <span className="block text-[11px] text-gray-400">file said {l.listed_order_number}</span>}
                      {l.awb && <span className="block font-mono text-[11px] text-gray-400">{l.awb}</span>}
                    </Td>
                    <Td num muted>{money(l.expected_minor, l.currency)}</Td>
                    <Td num>{money(l.collected_minor, l.currency)}</Td>
                    {showDeductions && <Td num muted>{money(l.courier_cod_charge_minor, l.currency)}</Td>}
                    {showDeductions && <Td num muted>{money(l.freight_deducted_minor, l.currency)}</Td>}
                    {showDeductions && <Td num muted>{money(l.other_deductions_minor, l.currency)}</Td>}
                    {showDeductions && <Td num className="font-medium">{money(l.net_remitted_minor, l.currency)}</Td>}
                    <Td><Chip tone={COD_MATCH_TONE[l.match_status] ?? 'neutral'}>{COD_MATCH_LABEL[l.match_status] ?? l.match_status}</Chip></Td>
                    <Td className="max-w-xs text-xs text-gray-600">{codReason(l)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}

      {/* LIST */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Payouts</h2>
        <ExportMenu filename="cod-payouts" columns={LIST_CSV} rows={list ?? []} disabled={!list?.length} />
      </div>
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Courier / reference</Th><Th>Paid on</Th><Th num>Paid</Th><Th num>Matched</Th><Th num>Parcels</Th><Th num>Unmatched</Th><Th>Status</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={7}>Loading payouts…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={7}><EmptyState title="No COD payouts yet" description="When a courier pays out the cash they collected, import its report or enter it here to check it against your delivered COD orders." /></EmptyRow>
            ) : list.map((r) => {
              const paid = minorOf(r, 'remitted_amount') ?? minorOf(r, 'net_remitted');
              const matched = minorOf(r, 'matched_amount');
              return (
                <Tr key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => openDetail(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') openDetail(r.id); }}>
                  <Td>{r.courier || '—'}<span className="block font-mono text-xs text-gray-400">{r.reference || ''}</span></Td>
                  <Td className="whitespace-nowrap">{r.remitted_on ? formatDay(r.remitted_on) : '—'}</Td>
                  <Td num>{money(paid, r.currency)}</Td>
                  <Td num className={matched !== null && matched === paid ? 'text-emerald-700' : ''}>{money(matched, r.currency)}</Td>
                  <Td num>{r.line_count ?? '—'}</Td>
                  <Td num className={(r.unmatched_count ?? 0) > 0 ? 'text-red-600 font-semibold' : ''}>{r.unmatched_count ?? 0}</Td>
                  <Td><Chip tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Chip></Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default CodReconciliation;
