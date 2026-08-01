import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, TextInput, inr, ExportMenu,
} from '../../components/erp';
import type { CsvColumn } from '../../components/erp';
import { useGstRegistrations, RegistrationSelect } from './gstinFilter';

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

interface Gstr3bCsvRow {
  table: string;
  taxableValue: number | '';
  igst: number; cgst: number; sgst: number; total: number;
}
// 3B figures are already in RUPEE units → raw numbers in the CSV (not minor units).
const CSV_COLS: CsvColumn<Gstr3bCsvRow>[] = [
  { key: 'table', label: 'Table' },
  { key: 'taxableValue', label: 'Taxable value' },
  { key: 'igst', label: 'IGST' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'total', label: 'Total tax' },
];

const Gstr3b: React.FC = () => {
  const { hasPerm } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gstin, setGstin] = useState('');
  const regs = useGstRegistrations();

  const load = async (ym: string, g: string = gstin) => {
    setLoading(true); setError('');
    try {
      const { from, to } = monthRange(ym);
      setData(payload(await api.get('/accounting/gst/gstr3b-summary', { params: { from, to, ...(g ? { gstin: g } : {}) } })));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not build the GSTR-3B summary.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(month); }, []);

  const rows: Array<[string, any]> = data ? [
    ['3.1(a) Outward taxable supplies', data.outwardTaxable],
    ['3.1(b) Zero-rated supplies (exports/SEZ)', data.outwardZeroRated],
    ['3.1(c) Nil-rated / exempt supplies', data.outwardNilExempt],
    ['3.1(d) Inward supplies (reverse charge)', data.inwardRcm],
    ['4 Input tax credit available', data.itcAvailable],
    ['6.1 Net tax payable (estimate)', data.netTaxPayable],
  ] : [];

  const csvRows: Gstr3bCsvRow[] = rows.map(([label, l]) => ({
    table: label,
    taxableValue: (label.startsWith('4') || label.startsWith('6.1')) ? '' : (l?.taxableValue ?? 0),
    igst: l?.igst ?? 0, cgst: l?.cgst ?? 0, sgst: l?.sgst ?? 0, total: l?.total ?? 0,
  }));

  const { from, to } = monthRange(month);

  return (
    <Page>
      <PageHeader
        title="GSTR-3B Summary"
        description="A read-only monthly check of tax collected vs input credit — for reconciling against your books before you file on the GST portal. This is not a filing."
        actions={
          <div className="flex items-end gap-2">
            <RegistrationSelect regs={regs} value={gstin} onChange={(g) => { setGstin(g); load(month, g); }} />
            <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Btn onClick={() => load(month)}>Build summary</Btn>
            <ExportMenu
              filename={`gstr3b-${from}-to-${to}`}
              columns={CSV_COLS}
              rows={csvRows}
              canExport={hasPerm('gst.read')}
              disabled={!data}
              serverExports={[{
                label: 'Server CSV (portal layout)',
                path: '/accounting/gst/gstr3b-summary',
                params: { from, to, format: 'csv', ...(gstin ? { gstin } : {}) },
                filename: `gstr3b-${from}-to-${to}.csv`,
              }]}
            />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading && <div className="text-sm text-gray-500">Building…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Output tax (3.1a)" value={inr(data.summary.outwardTaxTotal)} tone="info" />
            <StatCard label="Input tax credit (4)" value={inr(data.summary.itcTotal)} tone="good" />
            <StatCard label="Net tax payable (est.)" value={inr(data.summary.netCashEstimate)}
              tone={data.summary.netCashEstimate > 0 ? 'warn' : 'good'} />
            <StatCard label="Sales documents" value={data.summary.documentCount}
              sub={data.summary.excludedNoGstSnapshot ? `${data.summary.excludedNoGstSnapshot} excluded (no GST snapshot)` : undefined} />
          </StatGrid>

          <SectionCard title="Summary tables (3.1 · 4 · 6.1)"
            description="Figures come from the same order records as your GSTR-1 draft, so the two agree.">
            <TableShell>
              <table className="w-full text-sm">
              <THead>
                <Th>Table</Th><Th num>Taxable value</Th>
                <Th num>IGST</Th><Th num>CGST</Th><Th num>SGST</Th><Th num>Total tax</Th>
              </THead>
              <TBody>
                {rows.map(([label, l]) => {
                  const emphasise = label.startsWith('6.1');
                  return (
                    <Tr key={label} className={emphasise ? 'bg-amber-50/60' : ''}>
                      <Td className={emphasise ? 'font-semibold' : ''}>{label}</Td>
                      <Td num muted={label.startsWith('4') || label.startsWith('6.1')}>
                        {(label.startsWith('4') || label.startsWith('6.1')) ? '—' : inr(l.taxableValue)}
                      </Td>
                      <Td num>{inr(l.igst)}</Td>
                      <Td num>{inr(l.cgst)}</Td>
                      <Td num>{inr(l.sgst)}</Td>
                      <Td num className={emphasise ? 'font-semibold' : ''}>{inr(l.total)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
              </table>
            </TableShell>
          </SectionCard>

          <SectionCard title="What this means" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((note: string, i: number) => <li key={i}>{note}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default Gstr3b;
