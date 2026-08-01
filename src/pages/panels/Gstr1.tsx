import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { fmtRupees } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import { Page, PageHeader, Btn, TextInput, ExportMenu } from '../../components/erp';
import type { CsvColumn } from '../../components/erp';
import { useGstRegistrations, RegistrationSelect } from './gstinFilter';

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

/** One flat CSV row spanning both the B2B (invoice-wise) and B2CS sections. */
interface Gstr1CsvRow {
  section: 'B2B' | 'B2CS';
  gstin: string;
  order: string;
  date: string;
  pos: string;
  ratePct: number | string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  invoiceValue: number | '';
}

// GSTR-1 amounts are already in RUPEE units (fmtRupees, no /100), so raw numbers
// go into the CSV — NOT `money: true` (that would treat them as minor units).
const CSV_COLS: CsvColumn<Gstr1CsvRow>[] = [
  { key: 'section', label: 'Section' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'order', label: 'Order' },
  { key: 'date', label: 'Date' },
  { key: 'pos', label: 'Place of supply' },
  { key: 'ratePct', label: 'Rate %' },
  { key: 'taxable', label: 'Taxable value' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
  { key: 'invoiceValue', label: 'Invoice value' },
];

function buildCsvRows(draft: any): Gstr1CsvRow[] {
  if (!draft) return [];
  const b2b: Gstr1CsvRow[] = (draft.b2b ?? []).flatMap((row: any) =>
    (row.lines ?? []).map((l: any) => ({
      section: 'B2B' as const,
      gstin: row.customerGstin ?? '',
      order: row.orderId ?? '',
      date: row.documentDate ?? '',
      pos: row.placeOfSupply ?? '',
      ratePct: l.ratePct,
      taxable: l.taxableValue, cgst: l.cgst, sgst: l.sgst, igst: l.igst,
      invoiceValue: row.invoiceValue,
    })));
  const b2cs: Gstr1CsvRow[] = (draft.b2cs ?? []).map((r: any) => ({
    section: 'B2CS' as const,
    gstin: '', order: '', date: '',
    pos: r.placeOfSupply ?? '',
    ratePct: r.ratePct,
    taxable: r.taxableValue, cgst: r.cgst, sgst: r.sgst, igst: r.igst,
    invoiceValue: '' as const,
  }));
  return [...b2b, ...b2cs];
}

const Gstr1: React.FC = () => {
  const { hasPerm } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gstin, setGstin] = useState('');
  const regs = useGstRegistrations();

  const load = async (ym: string, g: string = gstin) => {
    setLoading(true); setError('');
    try {
      const { from, to } = monthRange(ym);
      const res = await api.get('/accounting/gst/gstr1-draft', { params: { from, to, ...(g ? { gstin: g } : {}) } });
      setDraft(payload(res));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not build the GSTR-1 draft.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(month); }, []);

  return (
    <Page>
      <PageHeader
        title="GSTR-1 Draft"
        description="Outward supplies from order GST snapshots. DRAFT for review — filing goes through your CA/GSP."
        actions={
          <div className="flex items-end gap-2">
            <RegistrationSelect regs={regs} value={gstin} onChange={(g) => { setGstin(g); load(month, g); }} />
            <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Btn onClick={() => load(month)}>Build draft</Btn>
            <ExportMenu
              filename={`gstr1-${month}${gstin ? `-${gstin}` : ''}`}
              columns={CSV_COLS}
              rows={buildCsvRows(draft)}
              canExport={hasPerm('gst.read')}
              disabled={!draft}
            />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading && <div className="text-sm text-gray-500">Building…</div>}

      {draft && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-sm">
            {[
              ['Documents', draft.summary.documentCount],
              ['Taxable value', fmtRupees(draft.summary.totalTaxableValue)],
              ['CGST', fmtRupees(draft.summary.totalCgst)],
              ['SGST', fmtRupees(draft.summary.totalSgst)],
              ['IGST', fmtRupees(draft.summary.totalIgst)],
              ['Excluded (no GST snapshot)', draft.summary.excludedNoGstSnapshot],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="text-xs text-gray-500">{k}</div>
                <div className="font-semibold tabular-nums text-gray-900">{v}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">B2B (invoice-wise, registered recipients)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">GSTIN</th><th className="px-4 py-2">Order</th>
                    <th className="px-4 py-2">Date</th><th className="px-4 py-2">PoS</th>
                    <th className="px-4 py-2 text-right">Rate %</th><th className="px-4 py-2 text-right">Taxable</th>
                    <th className="px-4 py-2 text-right">CGST</th><th className="px-4 py-2 text-right">SGST</th>
                    <th className="px-4 py-2 text-right">IGST</th><th className="px-4 py-2 text-right">Invoice value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {draft.b2b.length === 0 && <tr><td colSpan={10} className="px-4 py-4 text-center text-gray-500">No B2B supplies in this period.</td></tr>}
                  {draft.b2b.flatMap((row: any) => row.lines.map((l: any, i: number) => (
                    <tr key={`${row.orderId}-${l.ratePct}`}>
                      <td className="px-4 py-1.5 font-mono">{i === 0 ? row.customerGstin : ''}</td>
                      <td className="px-4 py-1.5">{i === 0 ? row.orderId : ''}</td>
                      <td className="px-4 py-1.5">{i === 0 ? row.documentDate : ''}</td>
                      <td className="px-4 py-1.5">{i === 0 ? row.placeOfSupply : ''}</td>
                      <td className="px-4 py-1.5 text-right">{l.ratePct}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(l.taxableValue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(l.cgst)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(l.sgst)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(l.igst)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{i === 0 ? fmtRupees(row.invoiceValue) : ''}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">B2CS (unregistered, aggregated by place of supply × rate)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Place of supply</th><th className="px-4 py-2 text-right">Rate %</th>
                    <th className="px-4 py-2 text-right">Taxable</th><th className="px-4 py-2 text-right">CGST</th>
                    <th className="px-4 py-2 text-right">SGST</th><th className="px-4 py-2 text-right">IGST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {draft.b2cs.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-gray-500">No B2C supplies in this period.</td></tr>}
                  {draft.b2cs.map((r: any) => (
                    <tr key={`${r.placeOfSupply}-${r.ratePct}`}>
                      <td className="px-4 py-1.5">{r.placeOfSupply}</td>
                      <td className="px-4 py-1.5 text-right">{r.ratePct}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(r.taxableValue)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(r.cgst)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(r.sgst)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmtRupees(r.igst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Page>
  );
};

export default Gstr1;
