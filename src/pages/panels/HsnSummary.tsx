import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TextInput, inr, num,
  ExportMenu, Pagination,
} from '../../components/erp';
import type { CsvColumn } from '../../components/erp';

/**
 * HSN Summary (GSTR-1 Table 12). Plain-language answer to a filing shop owner:
 * "For each HSN code — how much did I sell and how much GST did I collect."
 * Date range optional; leave both blank (or tick All time) for the full history.
 * Reuses the same order records as the GSTR-1 draft, so the totals agree.
 */

interface HsnCsvRow {
  hsn: string; description: string; uqc: string;
  totalQuantity: number; ratePct: number | string;
  taxableValue: number; igst: number; cgst: number; sgst: number; cess: number; totalValue: number;
}
// Table-12 figures are in RUPEE units → raw numbers in the CSV (not minor units).
const CSV_COLS: CsvColumn<HsnCsvRow>[] = [
  { key: 'hsn', label: 'HSN' },
  { key: 'description', label: 'Description' },
  { key: 'uqc', label: 'UQC' },
  { key: 'totalQuantity', label: 'Qty' },
  { key: 'ratePct', label: 'Rate %' },
  { key: 'taxableValue', label: 'Taxable value' },
  { key: 'igst', label: 'IGST' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'cess', label: 'Cess' },
  { key: 'totalValue', label: 'Total value' },
];

const PAGE_SIZE = 50;

const HsnSummary: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allTime, setAllTime] = useState(true);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const rangeParams = () => (allTime || (!from && !to) ? {} : { from, to });

  const load = async () => {
    setLoading(true); setError(''); setPage(1);
    try {
      setData(payload(await api.get('/accounting/hsn-summary', { params: rangeParams() })));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not build the HSN summary.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tag = allTime || (!from && !to) ? 'all-time' : `${from}-to-${to}`;

  const gt = data?.grandTotal;
  const totalGst = gt ? (gt.cgst + gt.sgst + gt.igst + gt.cess) : 0;
  const allRows: any[] = data?.rows ?? [];
  const csvRows: HsnCsvRow[] = allRows.map((r) => ({
    hsn: r.hsn ?? '(missing)', description: r.description ?? '', uqc: r.uqc ?? '',
    totalQuantity: r.totalQuantity, ratePct: r.ratePct,
    taxableValue: r.taxableValue, igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess, totalValue: r.totalValue,
  }));
  const pagedRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Page>
      <PageHeader
        title="HSN Summary (GSTR-1 Table 12)"
        description="For each HSN code: how much you sold and how much GST you collected. This is a draft to check against your books before filing on the GST portal — not a filing."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
              All time
            </label>
            <TextInput type="date" value={from} disabled={allTime}
              onChange={(e) => setFrom(e.target.value)} />
            <TextInput type="date" value={to} disabled={allTime}
              onChange={(e) => setTo(e.target.value)} />
            <Btn onClick={load}>Build report</Btn>
            <ExportMenu
              filename={`hsn-summary-${tag}`}
              columns={CSV_COLS}
              rows={csvRows}
              canExport={canRead}
              disabled={!data}
              serverExports={[{
                label: 'Server CSV (Table-12 layout)',
                path: '/accounting/hsn-summary',
                params: { ...rangeParams(), format: 'csv' },
                filename: `hsn-summary-${tag}.csv`,
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
            <StatCard label="Taxable value" value={inr(gt.taxableValue)} tone="info" />
            <StatCard label="GST collected" value={inr(totalGst)} tone="good"
              sub="CGST + SGST + IGST + cess" />
            <StatCard label="HSN codes" value={num(data.summary.hsnCount)} />
            <StatCard label="Sales documents" value={num(data.summary.documentCount)}
              sub={data.summary.excludedNoGstSnapshot
                ? `${data.summary.excludedNoGstSnapshot} excluded (no GST snapshot)` : undefined} />
          </StatGrid>

          {data.summary.missingHsnProductCount > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>{data.summary.missingHsnProductCount} product(s) have no HSN code — fix before filing.</strong>{' '}
              GSTR-1 Table 12 cannot be filed without an HSN code on every item you sold. Set the HSN
              code on the products listed at the bottom of this page, then rebuild.
            </div>
          )}

          <SectionCard title="HSN-wise summary"
            description="Grouped by HSN code and tax rate — the layout the GST portal expects for Table 12.">
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>HSN</Th><Th>Description</Th><Th>UQC</Th>
                  <Th num>Qty</Th><Th num>Rate %</Th><Th num>Taxable value</Th>
                  <Th num>IGST</Th><Th num>CGST</Th><Th num>SGST</Th>
                  <Th num>Cess</Th><Th num>Total value</Th>
                </THead>
                <TBody>
                  {allRows.length === 0 && <EmptyRow colSpan={11}>No sales in this period.</EmptyRow>}
                  {pagedRows.map((r: any, i: number) => {
                    const isMissing = r.hsn == null;
                    return (
                      <Tr key={(page - 1) * PAGE_SIZE + i} className={isMissing ? 'bg-red-50/60' : ''}>
                        <Td className={isMissing ? 'font-semibold text-red-700' : 'font-medium'}>
                          {r.hsn ?? '(missing)'}
                        </Td>
                        <Td muted className="max-w-[22rem] truncate" title={r.description}>{r.description}</Td>
                        <Td>{r.uqc}</Td>
                        <Td num>{num(r.totalQuantity)}</Td>
                        <Td num>{r.ratePct}</Td>
                        <Td num>{inr(r.taxableValue)}</Td>
                        <Td num>{inr(r.igst)}</Td>
                        <Td num>{inr(r.cgst)}</Td>
                        <Td num>{inr(r.sgst)}</Td>
                        <Td num>{inr(r.cess)}</Td>
                        <Td num className="font-medium">{inr(r.totalValue)}</Td>
                      </Tr>
                    );
                  })}
                  {allRows.length > 0 && (
                    <Tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <Td>Grand total</Td><Td /><Td />
                      <Td num>{num(gt.totalQuantity)}</Td><Td />
                      <Td num>{inr(gt.taxableValue)}</Td>
                      <Td num>{inr(gt.igst)}</Td>
                      <Td num>{inr(gt.cgst)}</Td>
                      <Td num>{inr(gt.sgst)}</Td>
                      <Td num>{inr(gt.cess)}</Td>
                      <Td num>{inr(gt.totalValue)}</Td>
                    </Tr>
                  )}
                </TBody>
              </table>
            </TableShell>
            <Pagination page={page} pageSize={PAGE_SIZE} total={allRows.length} onPage={setPage} />
          </SectionCard>

          {data.missingHsn.length > 0 && (
            <SectionCard title="Products missing an HSN code"
              description="Set an HSN code on each of these before filing. Their sales are still counted above under a “(missing)” row so your totals stay complete.">
              <TableShell>
                <table className="w-full text-sm">
                  <THead>
                    <Th>Product</Th><Th>SKU</Th><Th num>Qty sold</Th><Th num>Taxable value</Th>
                  </THead>
                  <TBody>
                    {data.missingHsn.map((m: any, i: number) => (
                      <Tr key={i}>
                        <Td>{m.productName}</Td>
                        <Td muted>{m.sku}</Td>
                        <Td num>{num(m.totalQuantity)}</Td>
                        <Td num>{inr(m.taxableValue)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableShell>
            </SectionCard>
          )}

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

export default HsnSummary;
