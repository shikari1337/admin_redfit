import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { fmtRupees } from '../../lib/money';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, TextInput, StatusChip, Chip, TabBar, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, ExportMenu,
} from '../../components/erp';
import type { Tone, CsvColumn } from '../../components/erp';
import { useGstRegistrations, RegistrationSelect } from './gstinFilter';

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
}

type Decision = 'accept' | 'reject' | 'pending';
const DECISION_STYLE: Record<Decision, { on: string; off: string; label: string }> = {
  accept: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50', label: 'Accept' },
  pending: { on: 'bg-amber-500 text-white border-amber-500', off: 'border-amber-300 text-amber-700 hover:bg-amber-50', label: 'Pending' },
  reject: { on: 'bg-red-600 text-white border-red-600', off: 'border-red-300 text-red-700 hover:bg-red-50', label: 'Reject' },
};

interface WorklistRow {
  subjectType: 'supplier_invoice' | 'vendor_bill';
  matchKey: string; bucket: string; gstin: string | null; vendorName: string | null;
  docNumber: string; billNumber: string | null; docDate: string | null;
  taxable: number; twoBItc: number | null; booksItc: number | null; itcAtRisk: number;
  recommendation: Decision; reason: string;
  decision: Decision | null; portalDone: boolean;
}

const BUCKETS: Array<{ key: string; title: string; blurb: string; tone: string }> = [
  { key: 'matched', title: 'Matched — accept on the portal', blurb: 'These supplier invoices match your bills. Accept them in IMS to claim the ITC.', tone: 'emerald' },
  { key: 'amount_mismatch', title: 'Mismatch — check with the supplier', blurb: 'The invoice is in both places but the tax amount differs. Sort it out before accepting.', tone: 'amber' },
  { key: 'missing_in_books', title: 'In GSTR-2B but not in your books', blurb: 'The supplier reported an invoice you have not entered. Enter the purchase bill first.', tone: 'blue' },
  { key: 'missing_in_2b', title: 'In your books but not in 2B — ITC at risk', blurb: 'Your bill is not in GSTR-2B — the supplier has not filed it. You cannot claim this ITC until it appears.', tone: 'red' },
];
const TONE_HEAD: Record<string, string> = {
  emerald: 'text-emerald-800', amber: 'text-amber-800', blue: 'text-blue-800', red: 'text-red-800',
};
// Bucket's semantic colour → the canonical kit Chip tone.
const BUCKET_TONE: Record<string, Tone> = {
  emerald: 'green', amber: 'amber', blue: 'blue', red: 'red',
};

// IMS ITC amounts are in RUPEE units → raw numbers in the CSV (not minor units).
const WORKLIST_CSV_COLS: CsvColumn<any>[] = [
  { key: 'bucket', label: 'Bucket' },
  { key: 'vendorName', label: 'Supplier / vendor' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'docNumber', label: 'Invoice / bill #' },
  { key: 'docDate', label: 'Date' },
  { key: 'twoBItc', label: '2B ITC' },
  { key: 'booksItc', label: 'Books ITC' },
  { key: 'itcAtRisk', label: 'ITC at risk' },
  { key: 'reason', label: 'What to do' },
  { key: 'decision', label: 'Decision' },
  { key: 'portalDone', label: 'Done on portal' },
];
const REGISTER_CSV_COLS: CsvColumn<any>[] = [
  { key: 'billNumber', label: 'Bill #' },
  { key: 'vendorName', label: 'Vendor' },
  { key: 'vendorGstin', label: 'GSTIN' },
  { key: 'billDate', label: 'Date' },
  { key: 'taxableValue', label: 'Taxable' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
  { key: 'status', label: 'Status' },
];

/** Flatten the four IMS buckets into one CSV-friendly list. */
function flattenWorklist(worklist: any): any[] {
  if (!worklist?.buckets) return [];
  return BUCKETS.flatMap((b) => (worklist.buckets[b.key] ?? []).map((r: any) => ({
    ...r, bucket: b.key, decision: r.decision ?? r.recommendation, portalDone: r.portalDone ? 'yes' : 'no',
  })));
}

/** Inward GST: IMS workbench + purchase register + report-only 2B recon. */
const Itc2b: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const canRead = hasPerm('gst.read');
  const [tab, setTab] = useState<'ims' | 'register'>('ims');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gstin, setGstin] = useState('');
  const regs = useGstRegistrations();

  // IMS worklist
  const [worklist, setWorklist] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [importJson, setImportJson] = useState('');

  // Register + legacy recon (second tab)
  const [register, setRegister] = useState<any>(null);
  const [twoBJson, setTwoBJson] = useState('');
  const [recon, setRecon] = useState<any>(null);

  const loadWorklist = async (ym: string) => {
    setError('');
    try {
      const { from, to } = monthRange(ym);
      const [wl, rk] = await Promise.all([
        api.get('/accounting/gst/ims/worklist', { params: { from, to } }),
        api.get('/accounting/gst/ims/itc-at-risk', { params: { from, to } }),
      ]);
      setWorklist(payload(wl)); setRisk(payload(rk));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  const loadRegister = async (ym: string, g: string = gstin) => {
    setError('');
    try {
      const { from, to } = monthRange(ym);
      setRegister(payload(await api.get('/accounting/gst/itc-register', { params: { from, to, ...(g ? { gstin: g } : {}) } })));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  useEffect(() => { loadWorklist(month); }, []);
  useEffect(() => { if (tab === 'register' && !register) loadRegister(month); }, [tab]);

  const doImport = async () => {
    setError(''); setBusy(true);
    try {
      const { from, to } = monthRange(month);
      let parsed: any;
      try { parsed = JSON.parse(importJson); } catch { throw new Error('Paste valid GSTR-2B JSON (portal download or a simplified array)'); }
      await api.post('/accounting/gst/ims/import', { from, to, portalJson: parsed });
      setImportJson('');
      await loadWorklist(month);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const reMatch = async () => {
    setError(''); setBusy(true);
    try {
      const { from, to } = monthRange(month);
      await api.post('/accounting/gst/ims/auto-match', { from, to });
      await loadWorklist(month);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const saveDecision = async (row: WorklistRow, patch: { decision?: Decision; portalDone?: boolean }) => {
    setError('');
    try {
      const { from, to } = monthRange(month);
      await api.post('/accounting/gst/ims/decision', {
        from, to, subjectType: row.subjectType, matchKey: row.matchKey,
        gstin: row.gstin, docNumber: row.docNumber, bucket: row.bucket,
        decision: patch.decision ?? row.decision ?? row.recommendation,
        portalDone: patch.portalDone ?? row.portalDone,
      });
      await loadWorklist(month);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  // Legacy report-only reconcile (kept in the second tab).
  const reconcile = async () => {
    setError(''); setRecon(null);
    try {
      const { from, to } = monthRange(month);
      let parsed: any;
      try { parsed = JSON.parse(twoBJson); } catch { throw new Error('Paste valid GSTR-2B JSON'); }
      setRecon(payload(await api.post('/accounting/gst/gstr2b-reconcile', { from, to, portalJson: parsed, ...(gstin ? { gstin } : {}) })));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <Page>
      <PageHeader
        title="ITC / GSTR-2B — IMS workbench"
        description="GSTR-3B is locked, so your inward GST work happens in the portal's Invoice Management System. Import your GSTR-2B, match it to your bills, and this tells you exactly what to Accept, Reject or keep Pending — plus the ITC that's at risk because a supplier hasn't filed."
        actions={
          <div className="flex items-end gap-2">
            <RegistrationSelect regs={regs} value={gstin}
              onChange={(g) => { setGstin(g); if (tab === 'register') loadRegister(month, g); }} />
            <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Btn onClick={() => (tab === 'ims' ? loadWorklist(month) : loadRegister(month))}>Load</Btn>
          </div>
        }
      />

      <TabBar
        tabs={[{ key: 'ims', label: 'IMS worklist' }, { key: 'register', label: 'Register & 2B recon' }]}
        active={tab}
        onChange={(k) => setTab(k as any)}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === 'ims' && (
        <>
          {/* Import */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-gray-900">Import GSTR-2B for this month</div>
              {worklist?.hasImport && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Imported {worklist.importedAt?.slice(0, 10)}</span>
                  {/* Re-match mutates the worklist → accounting.post only. */}
                  {canPost && <Btn variant="outline" onClick={reMatch} disabled={busy}>Re-match</Btn>}
                  <ExportMenu
                    filename={`ims-worklist-${month}`}
                    columns={WORKLIST_CSV_COLS}
                    rows={flattenWorklist(worklist)}
                    canExport={canRead}
                    serverExports={[{
                      label: 'Server CSV (full worklist)',
                      path: '/accounting/gst/ims/worklist',
                      params: { ...monthRange(month), format: 'csv' },
                      filename: `ims-worklist-${month}.csv`,
                    }]}
                  />
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Download GSTR-2B from the GST portal (JSON), or paste a simplified array of{' '}
              <code>{'{gstin, docNumber, cgst, sgst, igst}'}</code>. Re-importing replaces the month; your Accept/Reject/Pending decisions are kept.
            </p>
            {canPost ? (
              <>
                <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={4}
                  placeholder='{"data":{"docdata":{"b2b":[{"ctin":"29ABC…","inv":[{"inum":"INV-1","itms":[…]}]}]}}}'
                  className="w-full rounded border px-3 py-2 font-mono text-xs" />
                <Btn onClick={doImport} disabled={!importJson.trim() || busy}>Import &amp; match</Btn>
              </>
            ) : (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Importing GSTR-2B and matching it needs the <strong>accounting.post</strong> permission. You can view the
                worklist and export it, but not change it.
              </p>
            )}
          </div>

          {/* ITC at risk banner */}
          {risk && risk.totalAtRisk > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-base font-semibold text-red-800">
                ITC at risk: {fmtRupees(risk.totalAtRisk)} from {risk.supplierCount} supplier{risk.supplierCount === 1 ? '' : 's'} who haven&apos;t filed
              </div>
              <p className="mt-0.5 text-sm text-red-700">
                You cannot claim this input tax credit until these suppliers report the invoice in their GSTR-1 (it then shows in your GSTR-2B). Chase them.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {risk.suppliers.map((s: any, i: number) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{s.vendorName ?? 'Unknown supplier'}</span>
                    <span className="font-mono text-xs">{s.gstin ?? 'no GSTIN'}</span>
                    <span>— {fmtRupees(s.itcAtRisk)} across {s.billCount} bill{s.billCount === 1 ? '' : 's'}</span>
                    <span className="text-red-500">({s.bills.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Buckets */}
          {worklist && !worklist.hasImport && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              No GSTR-2B imported for {month} yet. Paste it above to build your worklist.
              {worklist.summary.missingIn2b > 0 && (
                <div className="mt-2 text-red-600">
                  {worklist.summary.missingIn2b} of your bills carry ITC — once you import 2B you&apos;ll see which are confirmed and which are at risk.
                </div>
              )}
            </div>
          )}

          {worklist && (worklist.hasImport || worklist.summary.missingIn2b > 0) && BUCKETS.map((b) => {
            const rows: WorklistRow[] = worklist.buckets[b.key] ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={b.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                  <span className={`text-sm font-semibold ${TONE_HEAD[b.tone]}`}>{b.title}</span>
                  <Chip tone={BUCKET_TONE[b.tone]}>{rows.length}</Chip>
                  <span className="text-xs text-gray-400">{b.blurb}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <THead>
                      <Th>Supplier / vendor</Th>
                      <Th>Invoice / bill #</Th>
                      <Th num>2B ITC</Th>
                      <Th num>Books ITC</Th>
                      <Th>What to do</Th>
                      <Th>Decision (IMS)</Th>
                      <Th className="text-center">Done on portal</Th>
                    </THead>
                    <TBody>
                      {rows.map((r, i) => {
                        const current = r.decision ?? r.recommendation;
                        return (
                          <Tr key={`${r.matchKey}-${i}`}>
                            <Td className="align-top">
                              <div className="font-medium text-gray-800">{r.vendorName ?? '—'}</div>
                              <div className="font-mono text-xs text-gray-400">{r.gstin ?? 'no GSTIN'}</div>
                            </Td>
                            <Td className="align-top">
                              <div className="font-mono">{r.docNumber}</div>
                              {r.docDate && <div className="text-xs text-gray-400">{r.docDate}</div>}
                            </Td>
                            <Td num className="align-top font-mono">{r.twoBItc === null ? '—' : fmtRupees(r.twoBItc)}</Td>
                            <Td num className="align-top font-mono">{r.booksItc === null ? '—' : fmtRupees(r.booksItc)}</Td>
                            <Td className="align-top text-xs text-gray-600 max-w-sm">{r.reason}</Td>
                            <Td className="align-top">
                              {canPost ? (
                                <>
                                  <div className="flex gap-1">
                                    {(['accept', 'pending', 'reject'] as Decision[]).map((d) => {
                                      const active = current === d;
                                      const st = DECISION_STYLE[d];
                                      return (
                                        <button key={d} onClick={() => saveDecision(r, { decision: d })}
                                          title={!r.decision && r.recommendation === d ? 'Recommended' : ''}
                                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${active ? st.on : st.off}`}>
                                          {st.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {!r.decision && <div className="mt-1 text-[10px] text-gray-400">Suggested: {DECISION_STYLE[r.recommendation].label}</div>}
                                </>
                              ) : (
                                <Chip tone={BUCKET_TONE[current === 'accept' ? 'emerald' : current === 'reject' ? 'red' : 'amber']}>
                                  {DECISION_STYLE[current].label}{!r.decision ? ' (suggested)' : ''}
                                </Chip>
                              )}
                            </Td>
                            <Td className="text-center align-top">
                              {canPost ? (
                                <input type="checkbox" checked={r.portalDone}
                                  onChange={(e) => saveDecision(r, { portalDone: e.target.checked })}
                                  className="h-4 w-4" />
                              ) : (
                                <span className="text-xs text-gray-500">{r.portalDone ? 'Yes' : '—'}</span>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </TBody>
                  </table>
                </div>
              </div>
            );
          })}

          {worklist?.hasImport && (
            <StatGrid cols={5}>
              {[
                ['2B invoices', worklist.summary.twoBLines],
                ['Matched', worklist.summary.matched],
                ['Mismatch', worklist.summary.amountMismatch],
                ['Not in books', worklist.summary.missingInBooks],
                ['Decided', `${worklist.summary.decided} · ${worklist.summary.portalDone} on portal`],
              ].map(([k, v]) => (
                <StatCard key={String(k)} label={k} value={v} />
              ))}
            </StatGrid>
          )}
        </>
      )}

      {tab === 'register' && (
        <>
          {gstin && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Purchase bills are not tagged to a GST registration, so input tax credit cannot be split per branch. The
              whole register belongs to the <strong>default registration</strong>; other registrations show an empty
              register. (To split ITC per branch, add a recipient-GSTIN/warehouse dimension to vendor bills.)
            </div>
          )}
          {register && (
            <>
              <StatGrid cols={5}>
                {[
                  ['Bills', register.summary.bills],
                  ['Taxable', fmtRupees(register.summary.taxableValue)],
                  ['CGST', fmtRupees(register.summary.cgst)],
                  ['SGST', fmtRupees(register.summary.sgst)],
                  ['Total ITC', fmtRupees(register.summary.totalItc)],
                ].map(([k, v]) => (
                  <StatCard key={String(k)} label={k} value={v} />
                ))}
              </StatGrid>
              <div className="flex justify-end">
                <ExportMenu
                  filename={`itc-register-${month}`}
                  columns={REGISTER_CSV_COLS}
                  rows={register.rows ?? []}
                  canExport={canRead}
                  disabled={!register.rows?.length}
                />
              </div>
              <TableShell>
                <table className="w-full text-sm">
                  <THead>
                    <Th>Bill #</Th><Th>Vendor</Th><Th>GSTIN</Th><Th>Date</Th>
                    <Th num>Taxable</Th><Th num>CGST</Th><Th num>SGST</Th><Th num>IGST</Th><Th>Status</Th>
                  </THead>
                  <TBody>
                    {register.rows.length === 0 && <tr><td colSpan={9} className="px-4 py-5 text-center text-gray-500">No vendor bills in this period.</td></tr>}
                    {register.rows.map((r: any) => (
                      <Tr key={r.billId}>
                        <Td className="font-mono">{r.billNumber}</Td>
                        <Td>{r.vendorName}</Td>
                        <Td className="font-mono text-xs">{r.vendorGstin ?? '—'}</Td>
                        <Td>{r.billDate}</Td>
                        <Td num className="font-mono">{fmtRupees(r.taxableValue)}</Td>
                        <Td num className="font-mono">{fmtRupees(r.cgst)}</Td>
                        <Td num className="font-mono">{fmtRupees(r.sgst)}</Td>
                        <Td num className="font-mono">{fmtRupees(r.igst)}</Td>
                        <Td><StatusChip status={r.status} /></Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableShell>
            </>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <div className="font-semibold text-gray-900">Quick 2B reconciliation (report only)</div>
            <p className="text-sm text-gray-500">
              A one-off check that never persists — for the persistent worklist with Accept/Reject/Pending, use the IMS tab.
            </p>
            <textarea value={twoBJson} onChange={(e) => setTwoBJson(e.target.value)} rows={4}
              placeholder='{"data":{"docdata":{"b2b":[…]}}}'
              className="w-full rounded border px-3 py-2 font-mono text-xs" />
            <Btn onClick={reconcile} disabled={!twoBJson.trim()}>Reconcile</Btn>
            {recon && (
              <div className="grid gap-3 sm:grid-cols-5 text-sm">
                {[
                  ['Parsed', recon.entriesParsed, ''],
                  ['Matched', recon.summary.matched, 'text-emerald-700'],
                  ['Amount mismatch', recon.summary.amountMismatch, 'text-amber-700'],
                  ['Missing in 2B', `${recon.summary.missingIn2b} · ${fmtRupees(recon.summary.itcAtRisk)}`, 'text-red-700'],
                  ['In 2B, not in books', recon.summary.missingInBooks, 'text-amber-700'],
                ].map(([k, v, cls]) => (
                  <div key={String(k)} className="rounded-xl border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">{k}</div>
                    <div className={`font-semibold tabular-nums ${cls}`}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Page>
  );
};

export default Itc2b;
