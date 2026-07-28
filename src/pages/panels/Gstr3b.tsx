import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, TextInput, inr,
} from '../../components/erp';
import { useGstRegistrations, RegistrationSelect } from './gstinFilter';

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

const Gstr3b: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [gstin, setGstin] = useState('');
  const regs = useGstRegistrations();

  const load = async (ym: string, g: string = gstin) => {
    setLoading(true);
    try {
      const { from, to } = monthRange(ym);
      setData(payload(await api.get('/accounting/gst/gstr3b-summary', { params: { from, to, ...(g ? { gstin: g } : {}) } })));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(month); }, []);

  const downloadCsv = async () => {
    const { from, to } = monthRange(month);
    const res = await api.get('/accounting/gst/gstr3b-summary',
      { params: { from, to, format: 'csv', ...(gstin ? { gstin } : {}) }, responseType: 'blob' });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data as any], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gstr3b-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const rows: Array<[string, any]> = data ? [
    ['3.1(a) Outward taxable supplies', data.outwardTaxable],
    ['3.1(b) Zero-rated supplies (exports/SEZ)', data.outwardZeroRated],
    ['3.1(c) Nil-rated / exempt supplies', data.outwardNilExempt],
    ['3.1(d) Inward supplies (reverse charge)', data.inwardRcm],
    ['4 Input tax credit available', data.itcAvailable],
    ['6.1 Net tax payable (estimate)', data.netTaxPayable],
  ] : [];

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
            <Btn variant="success" onClick={downloadCsv} disabled={!data}>Download CSV</Btn>
          </div>
        }
      />

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
