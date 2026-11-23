import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, Loader2, CheckCircle2, X, RefreshCw, Trash2, Upload, LineChart, Truck } from 'lucide-react';
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
  toCodLine, type CodLine, type CodPayer, type CodSummary, type LoadFailure,
} from '../payments/data';
import { DEFAULT_FROM, DEFAULT_TO, FailureNotice, RangeFields, useUrlFilters } from '../payments/common';
import CodPayoutRecorder, { payerName } from './CodPayoutRecorder';

/**
 * COD remittance reconciliation (migration 064; PAY-0 §3 / §5 deductions, import and summary, lane
 * ADMIN-PAY-1). Plain-language screen:
 * "The courier collected cash at the customer's door and later paid us a lump
 * sum. Did they pay us the right amount for every parcel, and what did they keep?"
 * What each courier still owes (delivered COD parcels no payout names) opens the page; recording a payout
 * picks that courier's parcels with their COD amount and shipping charge (SHIP-CHARGE-1, owner 23 Nov 2026),
 * or the courier's remittance file is imported. The server matches each parcel to its delivered COD order and
 * flags anything short, over, listed twice or with no matching order; the courier's deductions (COD charge,
 * freight, other) are shown beside the match, never hidden in it. Mark it reconciled only when every line
 * ties out. `?record=1` opens the recorder (`&order=<id>` ticks that order's parcel, `&payer=<key>` picks a courier).
 */

interface Remittance {
  id: string; courier: string | null; reference: string | null;
  remitted_on: string | null; status: string; note: string | null; created_at: string;
  line_count?: number; matched_count?: number; unmatched_count?: number; lines?: any[];
  [k: string]: any;
}

const STATUS_TONE: Record<string, any> = { open: 'amber', reconciled: 'green', cancelled: 'red' };
const STATUS_LABEL: Record<string, string> = { open: 'Open', reconciled: 'Reconciled', cancelled: 'Cancelled' };

/* ── CSV import: courier + column mapping ─────────────────────────────────── */

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
  { key: 'ship_charge_minor', label: 'Shipping charge', format: (l) => plainMajor(l.ship_charge_minor, l.currency) },
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
  // `?remittance=<id>` opens that payout (the order page links here); `?record=1` opens the recorder.
  const [range, setRange] = useUrlFilters(['from', 'to', 'remittance', 'record', 'order', 'payer'] as const, defaults);
  const days = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
  const [summary, setSummary] = useState<CodSummary | null>(null);
  const [summaryFail, setSummaryFail] = useState<LoadFailure | null>(null);

  // Who still owes COD cash: delivered COD parcels no payout names yet, by courier (SHIP-CHARGE-1).
  const [payers, setPayers] = useState<CodPayer[] | null>(null);
  const [payersFail, setPayersFail] = useState<LoadFailure | null>(null);
  const creating = range.record === '1';
  const setCreating = (on: boolean, payer?: string) => setRange({ record: on ? '1' : '', order: '', payer: on ? (payer ?? '') : '' });

  // import form
  const [importing, setImporting] = useState(false);
  const [impCourier, setImpCourier] = useState('');
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

  const loadPayers = useCallback(() => {
    setPayersFail(null);
    codPayoutsAPI.awaiting()
      .then((a) => setPayers(a.couriers))
      .catch((e) => { setPayers([]); setPayersFail(failureOf(e, 'what the couriers still owe could not be read')); });
  }, []);
  useEffect(() => { loadPayers(); }, [loadPayers]);

  const loadSummary = useCallback(() => {
    setSummary(null); setSummaryFail(null);
    if (!(days > 0 && days <= 366)) { setSummaryFail({ gap: false, forbidden: false, message: 'The COD summary covers 1 to 366 days: pick a shorter range.' }); return; }
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
      setDetail(r); setImporting(false);
      if (range.record) setCreating(false);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const recorded = (id: string | null) => {
    setOk('Payout recorded and matched against your delivered COD orders. Lines in red need a look before it can be reconciled.');
    setCreating(false);
    loadList(); loadSummary(); loadPayers();
    if (id) openDetail(id);
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
    if (!impCourier.trim()) { setMsg('Name the courier whose report this is.'); return; }
    const amountMinor = impAmount.trim() ? majorToMinor(impAmount, 'INR') : null;
    if (impAmount.trim() && amountMinor === null) { setMsg('The amount paid must be a number, e.g. 12450.50.'); return; }
    if (impHeaders.length && !impMap.collected) { setMsg('Pick the column that holds the cash collected.'); return; }
    if (impHeaders.length && !impMap.awb && !impMap.order_number) { setMsg('Pick the tracking (AWB) or order number column, so each parcel can be matched.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const form = new FormData();
      form.append('file', impFile);
      form.append('courier', impCourier.trim());
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
      loadList(); loadSummary(); loadPayers();
      if (r?.id) { if (Array.isArray(r.lines)) setDetail(r); else openDetail(r.id); }
    } catch (e: any) {
      const st = e?.response?.status;
      if (isGap(e)) setMsg('Importing a courier file is not available on this server yet. Enter the payout by hand for now.');
      else if (st === 409) setMsg('This file was already imported: open it from the payouts list below instead of importing it again.');
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
    try { await api.post(`/logistics/cod-remittances/${detail.id}/reconcile`); setOk('Reconciled: this payout ties out to the paisa.'); await openDetail(detail.id); loadList(); loadSummary(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/cancel`); setOk('Payout cancelled. Its parcels are waiting for a payout again.'); await openDetail(detail.id); loadList(); loadSummary(); loadPayers(); }
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

  const showShip = detailLines.some((l) => l.ship_charge_minor !== null);
  const colCount = (showDeductions ? 9 : 5) + (showShip ? 1 : 0);
  const s = summary;
  const sc = s?.currency ?? 'INR';

  return (
    <Page>
      <PageHeader
        title="COD payouts"
        icon={Banknote}
        description="The courier collects cash at the door and later pays you a lump sum, minus its charges. Record or import each payout, and every parcel is matched to its delivered order, flagging anything paid short, over, or with no matching order."
        actions={(
          <>
            <Link to={LINK.settlements} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50">Settlements</Link>
            <Link to={LINK.analytics} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><LineChart className="h-4 w-4" />Payment analytics</Link>
            <Btn variant="outline" onClick={() => { setImporting((v) => !v); setCreating(false); setDetail(null); setMsg(''); setOk(''); }}><Upload className="h-4 w-4" />{importing ? 'Close import' : 'Import courier file'}</Btn>
            <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating(!creating); setImporting(false); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Close' : 'Record COD payout'}</Btn>
          </>
        )}
      />

      {/* WHO STILL OWES: delivered COD parcels no payout names yet, by courier (the answer to "where do I enter it"). */}
      {payersFail ? (
        <FailureNotice failure={payersFail} what="The list of delivered COD parcels waiting for a payout is not on this server yet. Payouts can still be imported or recorded by hand." onRetry={loadPayers} />
      ) : payers && payers.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900"><Truck className="h-4 w-4" aria-hidden />Waiting for a courier payout</p>
          <TableShell>
            <table className="w-full text-sm">
              <THead><Th>Paid out by</Th><Th num>Delivered COD parcels</Th><Th num>Cash the courier holds</Th><Th num>Their shipping charges</Th><Th> </Th></THead>
              <TBody>
                {payers.map((p) => (
                  <Tr key={p.key}>
                    <Td className="font-medium">{payerName(p)}{p.provider === 'manual' && <span className="block text-[11px] font-normal text-gray-500">your own carrier</span>}</Td>
                    <Td num>{p.parcels}</Td>
                    <Td num className="font-semibold">{money(p.cod_minor, 'INR')}</Td>
                    <Td num muted>{money(p.ship_charges_minor, 'INR')}{p.unpriced > 0 && <span className="block text-[11px] text-amber-700">{p.unpriced} with no charge recorded</span>}</Td>
                    <Td><Btn size="sm" variant="outline" onClick={() => { setImporting(false); setDetail(null); setMsg(''); setOk(''); setCreating(true, p.key); }}>Record payout</Btn></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      ) : payers ? (
        <p className="text-sm text-gray-500">No delivered COD parcel is waiting for a courier payout.</p>
      ) : null}

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
            sub={s && (s.freight_deducted_minor || s.other_deductions_minor) ? `+ ${money(s.freight_deducted_minor ?? 0, sc)} freight, ${money(s.other_deductions_minor ?? 0, sc)} other deducted` : undefined} />
          <StatCard label={<span className="inline-flex items-center gap-1">COD fee collected <InfoTip text="The COD fee your shoppers paid at checkout, without its GST." /></span>} value={s ? money(s.cod_fee_from_shoppers_minor, sc) : '…'} sub="excl. GST" />
          <StatCard label={<span className="inline-flex items-center gap-1">COD margin <InfoTip text="COD margin = COD fee from shoppers (without GST) − courier COD charges. Negative means COD costs you more than you charge for it." /></span>}
            value={s ? money(s.cod_margin_minor, sc) : '…'} sub="fee excl. GST − courier charges" tone={(s?.cod_margin_minor ?? 0) < 0 ? 'bad' : 'default'} />
          <StatCard label={<span className="inline-flex items-center gap-1">Shipping charges <InfoTip text="What the parcels of these delivered COD orders cost to ship: each parcel's courier quote at booking, or the amount entered for your own carrier." /></span>}
            value={s ? money(s.ship_charges_minor, sc) : '…'}
            sub={s && s.ship_charges_unpriced > 0 ? `${s.ship_charges_unpriced} parcel${s.ship_charges_unpriced === 1 ? '' : 's'} with no charge recorded` : 'of the delivered COD orders'} />
        </StatGrid>
      )}

      {msg && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* IMPORT */}
      {importing && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800">Import a courier’s COD remittance report</h3>
          <p className="text-xs text-gray-500">Download the COD remittance report from your courier's panel (CSV or Excel). Name the courier, choose the file, and check which column holds what; for a CSV the columns are guessed from their names.</p>
          <FilterBar>
            <Field label="Courier *">
              <TextInput value={impCourier} onChange={(e) => setImpCourier(e.target.value)} list="cod-import-couriers" placeholder="e.g. Shiprocket" aria-label="Courier" />
              <datalist id="cod-import-couriers">
                {(payers ?? []).map((p) => <option key={p.key} value={payerName(p)} />)}
              </datalist>
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
                    <option value="">Not in this file</option>
                    {impHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </SelectInput>
                </Field>
              ))}
            </div>
          )}
          {impFile && impHeaders.length === 0 && (
            <>
              <p className="text-xs text-amber-700">{isExcel ? `An Excel file: type the column names as they appear in its header row (leave blank to use the ${impCourier || 'Shiprocket'} layout).` : `No column names found on the first line: type them, or leave blank to use the ${impCourier || 'Shiprocket'} layout.`}</p>
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
            <summary className="cursor-pointer text-xs font-medium text-gray-600">Payout details (optional; the file may already carry them)</summary>
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
                    <Tr key={i}><Td className="tabular-nums">{p.row || 'Not given'}</Td><Td>{p.field || 'Not given'}</Td><Td className="text-red-700">{p.problem}</Td></Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          )}
          <Btn variant="success" disabled={busy || !impFile} onClick={runImport}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Import & match</Btn>
        </div>
      )}

      {/* RECORD: a payout against the courier's delivered COD parcels, with their shipping charges */}
      {creating && (
        <CodPayoutRecorder
          key={`${range.payer}|${range.order}`}
          payers={payers ?? []}
          initialPayer={range.payer || null}
          initialOrderId={range.order || null}
          onCreated={recorded}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* DETAIL */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                Payout {detail.reference ? `${detail.reference}` : ''}
                <Chip tone={STATUS_TONE[detail.status] ?? 'neutral'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.courier ? `${detail.courier}, ` : ''}{detail.remitted_on ? `paid ${formatDay(detail.remitted_on)}, ` : ''}
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
                <span className="text-xs text-gray-500"> (COD charge {money(sumOf('courier_cod_charge_minor'), cur)}, freight {money(sumOf('freight_deducted_minor'), cur)}, other {money(sumOf('other_deductions_minor'), cur)})</span>
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
            <p className="text-xs text-gray-500">Reconciled{detail.reconciled_at ? ` on ${formatDay(detail.reconciled_at)}` : ''}: this payout is locked, so its matches can no longer be re-checked.</p>
          )}
          {detail.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" disabled={busy} onClick={rematch}><RefreshCw className="h-4 w-4" />Re-check matches</Btn>
              <Btn variant="success" disabled={busy || !ties} onClick={reconcile}><CheckCircle2 className="h-4 w-4" />Mark reconciled</Btn>
              <Btn variant="danger" disabled={busy} onClick={cancel}><Trash2 className="h-4 w-4" />Cancel payout</Btn>
              {!ties && <span className="self-center text-xs text-amber-700">Not ready to reconcile: every parcel must match its order to the paisa.</span>}
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
                {showShip && <Th num><span className="inline-flex items-center gap-1">Shipping charge <InfoTip text="What the order's parcels cost to ship (their courier quotes, or the amount entered for your own carrier), beside what the courier kept." /></span></Th>}
                <Th>Result</Th><Th>Why</Th>
              </THead>
              <TBody>
                {detailLines.length === 0 ? (
                  <EmptyRow colSpan={colCount}>No lines.</EmptyRow>
                ) : detailLines.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      {l.order_id ? <DrillLink to={LINK.order(l.order_id)}>{l.order_number ?? 'Open order'}</DrillLink> : <span>{l.order_number ?? l.listed_order_number ?? 'No order'}</span>}
                      {l.listed_order_number && l.order_id && l.listed_order_number !== l.order_number && <span className="block text-[11px] text-gray-400">file said {l.listed_order_number}</span>}
                      {l.awb && <span className="block font-mono text-[11px] text-gray-400">{l.awb}</span>}
                    </Td>
                    <Td num muted>{money(l.expected_minor, l.currency)}</Td>
                    <Td num>{money(l.collected_minor, l.currency)}</Td>
                    {showDeductions && <Td num muted>{money(l.courier_cod_charge_minor, l.currency)}</Td>}
                    {showDeductions && <Td num muted>{money(l.freight_deducted_minor, l.currency)}</Td>}
                    {showDeductions && <Td num muted>{money(l.other_deductions_minor, l.currency)}</Td>}
                    {showDeductions && <Td num className="font-medium">{money(l.net_remitted_minor, l.currency)}</Td>}
                    {showShip && <Td num muted>{money(l.ship_charge_minor, l.currency)}</Td>}
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
              <EmptyRow colSpan={7}><EmptyState title="No COD payouts yet" description="When a courier pays out the cash it collected, press Record COD payout (or import its report) to check it against your delivered COD orders." /></EmptyRow>
            ) : list.map((r) => {
              const paid = minorOf(r, 'remitted_amount') ?? minorOf(r, 'net_remitted');
              const matched = minorOf(r, 'matched_amount');
              return (
                <Tr key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => openDetail(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') openDetail(r.id); }}>
                  <Td>{r.courier || 'Courier not named'}<span className="block font-mono text-xs text-gray-400">{r.reference || ''}</span></Td>
                  <Td className="whitespace-nowrap">{r.remitted_on ? formatDay(r.remitted_on) : 'Not dated'}</Td>
                  <Td num>{money(paid, r.currency)}</Td>
                  <Td num className={matched !== null && matched === paid ? 'text-emerald-700' : ''}>{money(matched, r.currency)}</Td>
                  <Td num>{r.line_count ?? 0}</Td>
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
