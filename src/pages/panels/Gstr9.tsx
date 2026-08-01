import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, TextInput, TabBar, inr, ExportMenu,
} from '../../components/erp';
import type { CsvColumn } from '../../components/erp';
import { useGstRegistrations, RegistrationSelect } from './gstinFilter';

interface RateWiseCsvRow { ratePct: number | string; taxableValue: number; igst: number; cgst: number; sgst: number; }
// Annual-return figures are in RUPEE units → raw numbers in the CSV.
const RATEWISE_CSV_COLS: CsvColumn<RateWiseCsvRow>[] = [
  { key: 'ratePct', label: 'Rate %' },
  { key: 'taxableValue', label: 'Taxable value' },
  { key: 'igst', label: 'IGST' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
];

/** Current Indian financial year label from today (Apr–Mar). */
function currentFy(): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Apr = month 3
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

interface Line {
  code: string; label: string; taxableValue: number;
  cgst: number; sgst: number; igst: number; cess: number; auto: boolean; note?: string;
}

const ManualBadge: React.FC = () => (
  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">manual</span>
);

/** A GSTR-9 amount table (Table 4 / 5 / 6 / 7). Manual rows are muted. */
const LineTable: React.FC<{ lines: Line[]; total?: Line }> = ({ lines, total }) => (
  <TableShell>
    <table className="w-full text-sm">
      <THead>
        <Th>Cell</Th><Th>Description</Th>
        <Th num>Taxable value</Th><Th num>IGST</Th><Th num>CGST</Th><Th num>SGST</Th>
      </THead>
      <TBody>
        {lines.map((l) => (
          <Tr key={l.code} className={l.auto ? '' : 'text-gray-400'}>
            <Td className="font-mono">{l.code}</Td>
            <Td>{l.label}{!l.auto && <ManualBadge />}{l.note && <div className="text-[11px] text-gray-400">{l.note}</div>}</Td>
            <Td num>{l.taxableValue ? inr(l.taxableValue) : '—'}</Td>
            <Td num>{l.igst ? inr(l.igst) : '—'}</Td>
            <Td num>{l.cgst ? inr(l.cgst) : '—'}</Td>
            <Td num>{l.sgst ? inr(l.sgst) : '—'}</Td>
          </Tr>
        ))}
        {total && (
          <Tr className="bg-gray-50 font-semibold">
            <Td className="font-mono">{total.code}</Td>
            <Td>{total.label}</Td>
            <Td num>{inr(total.taxableValue)}</Td>
            <Td num>{inr(total.igst)}</Td>
            <Td num>{inr(total.cgst)}</Td>
            <Td num>{inr(total.sgst)}</Td>
          </Tr>
        )}
      </TBody>
    </table>
  </TableShell>
);

/** Collapsible Part wrapper. */
const Part: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen, children }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-gray-900">
        <span>{title}</span>
        <span className="text-gray-400">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="space-y-3 border-t border-gray-100 p-4">{children}</div>}
    </div>
  );
};

const Gstr9: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const canRead = hasPerm('accounting.read');
  const [fy, setFy] = useState(currentFy());
  const [tab, setTab] = useState<'return' | '9c'>('return');
  const [g9, setG9] = useState<any>(null);
  const [g9c, setG9c] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [gstin, setGstin] = useState('');
  const regs = useGstRegistrations();

  const load = async (year: string, g: string = gstin) => {
    setLoading(true); setSaveMsg(null); setError('');
    try {
      const [a, b] = await Promise.all([
        // Annual return scopes to the chosen registration…
        api.get(`/accounting/gstr9/${year}`, { params: g ? { gstin: g } : {} }),
        // …but GSTR-9C reconciles against the general ledger, which is not split
        // by registration — so it is always built org-wide.
        api.get(`/accounting/gstr9/${year}/9c`),
      ]);
      setG9(payload(a)); setG9c(payload(b));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not build the annual return.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(fy); }, []);

  const saveSnapshot = async () => {
    setSaveMsg(null);
    try {
      const res = await api.post(`/accounting/gstr9/${g9.fy}/save`);
      const d = payload(res);
      setSaveMsg(d.created ? `Filed snapshot frozen for FY ${d.fy}.` : `Snapshot for FY ${d.fy} refreshed (already existed).`);
    } catch (e: any) {
      setSaveMsg(e?.response?.status === 403 ? 'You need accounting.post permission to freeze a filed snapshot.' : 'Could not save snapshot.');
    }
  };

  const tabs = [
    { key: 'return', label: 'Annual Return (GSTR-9)' },
    { key: '9c', label: 'Reconciliation (GSTR-9C)' },
  ] as const;

  return (
    <Page>
      <PageHeader
        title="GSTR-9 (Annual Return) & GSTR-9C"
        description="Your once-a-year GST summary — total sales, tax paid and input credit for the whole financial year — plus a reconciliation against your books. This is a DRAFT to review with your CA, not a filing."
        actions={
          <div className="flex items-end gap-2">
            <RegistrationSelect regs={regs} value={gstin} onChange={(g) => { setGstin(g); load(fy, g); }} />
            <TextInput value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2025-26" className="w-28" />
            <Btn onClick={() => load(fy)}>Build return</Btn>
            <ExportMenu
              filename={g9 ? `gstr9-${g9.fy}` : `gstr9-${fy}`}
              columns={RATEWISE_CSV_COLS}
              rows={g9?.partII?.rateWise ?? []}
              canExport={canRead}
              disabled={!g9}
              serverExports={g9 ? [{
                label: 'Annual return CSV (full)',
                path: `/accounting/gstr9/${g9.fy}/csv`,
                params: gstin ? { gstin } : {},
                filename: `gstr9-${g9.fy}.csv`,
              }] : []}
            />
            {/* Freezing a filed snapshot needs accounting.post — hide it otherwise
                rather than render a button that only 403s. */}
            {canPost && <Btn variant="outline" onClick={saveSnapshot} disabled={!g9}>Save filed snapshot</Btn>}
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* Inherited pending-owner caveat — surfaced, never fixed. */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Before you rely on these figures:</strong> GST rates come from the same order records as your GSTR-1
        draft. If this store's pending 5%-vs-18% medicine-rate question is unresolved, it flows into this annual return
        too. Resolve it with your CA — and get GSTR-9C certified — before anything is filed on the portal.
      </div>

      {saveMsg && <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">{saveMsg}</div>}
      {loading && <div className="text-sm text-gray-500">Building the annual return (12 months)…</div>}

      {g9 && !loading && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Outward taxable value" value={inr(g9.summary.totalOutwardTaxableValue)} tone="info" />
            <StatCard label="Output tax (Part II)" value={inr(g9.summary.totalOutwardTax)} tone="warn" />
            <StatCard label="Input tax credit (Part III)" value={inr(g9.summary.totalItc)} tone="good" />
            <StatCard label="Sales documents" value={g9.summary.documentCount}
              sub={g9.summary.excludedNoGstSnapshot ? `${g9.summary.excludedNoGstSnapshot} excluded (no GST snapshot)` : `${g9.summary.months} months · ${g9.summary.vendorBills} vendor bills`} />
          </StatGrid>

          <TabBar tabs={tabs} active={tab} onChange={(k) => setTab(k as 'return' | '9c')} />

          {tab === 'return' && (
            <>
              <Part title={g9.partII.title} defaultOpen>
                <div className="text-sm font-medium text-gray-700">{g9.partII.table4.title}</div>
                <LineTable lines={g9.partII.table4.lines} total={g9.partII.table4.total} />
                <div className="text-sm font-medium text-gray-700">{g9.partII.table5.title}</div>
                <LineTable lines={g9.partII.table5.lines} total={g9.partII.table5.total} />
                <div className="text-sm font-medium text-gray-700">Outward supplies by tax rate</div>
                <TableShell>
                  <table className="w-full text-sm">
                    <THead><Th num>Rate %</Th><Th num>Taxable value</Th><Th num>IGST</Th><Th num>CGST</Th><Th num>SGST</Th></THead>
                    <TBody>
                      {g9.partII.rateWise.map((r: any) => (
                        <Tr key={r.ratePct}>
                          <Td num>{r.ratePct}</Td><Td num>{inr(r.taxableValue)}</Td>
                          <Td num>{inr(r.igst)}</Td><Td num>{inr(r.cgst)}</Td><Td num>{inr(r.sgst)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
              </Part>

              <Part title={g9.partIII.title}>
                <div className="text-sm font-medium text-gray-700">{g9.partIII.table6.title}</div>
                <LineTable lines={g9.partIII.table6.lines} total={g9.partIII.table6.total} />
                <div className="text-sm font-medium text-gray-700">{g9.partIII.table7.title}</div>
                <LineTable lines={g9.partIII.table7.lines} />
                <div className="text-sm font-medium text-gray-700">{g9.partIII.table8.title}</div>
                <LineTable lines={g9.partIII.table8.lines} />
              </Part>

              <Part title={g9.partIV.title}>
                <p className="text-sm text-gray-500">{g9.partIV.table9.note}</p>
                <TableShell>
                  <table className="w-full text-sm">
                    <THead><Th>Head</Th><Th num>Tax payable</Th><Th>Source</Th></THead>
                    <TBody>
                      {g9.partIV.table9.heads.map((h: any) => (
                        <Tr key={h.head} className={h.auto ? '' : 'text-gray-400'}>
                          <Td>{h.head}</Td><Td num>{inr(h.payable)}</Td>
                          <Td>{h.auto ? 'auto' : <>manual{h.note && <span className="text-[11px] text-gray-400"> — {h.note}</span>}</>}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
              </Part>

              <Part title={g9.partV.title}>
                <p className="text-sm text-gray-500">{g9.partV.note}</p>
              </Part>

              <Part title={g9.partVI.title}>
                <p className="text-sm text-gray-500"><strong>{g9.partVI.table15.title}:</strong> {g9.partVI.table15.note}</p>
                <p className="text-sm text-gray-500"><strong>{g9.partVI.table16.title}:</strong> {g9.partVI.table16.note}</p>
                <p className="text-sm text-gray-500"><strong>{g9.partVI.table18.title}:</strong> {g9.partVI.table18.note}</p>
                <div className="text-sm font-medium text-gray-700">Table 17 — HSN-wise summary of outward supplies</div>
                <TableShell>
                  <table className="w-full text-sm">
                    <THead>
                      <Th>HSN</Th><Th num>Rate %</Th><Th num>Qty</Th><Th num>Taxable</Th>
                      <Th num>IGST</Th><Th num>CGST</Th><Th num>SGST</Th>
                    </THead>
                    <TBody>
                      {(g9.partVI.table17.rows ?? []).slice(0, 100).map((r: any, i: number) => (
                        <Tr key={`${r.hsn}-${r.ratePct}-${i}`}>
                          <Td className="font-mono">{r.hsn ?? '(missing)'}</Td>
                          <Td num>{r.ratePct}</Td><Td num>{r.totalQuantity}</Td><Td num>{inr(r.taxableValue)}</Td>
                          <Td num>{inr(r.igst)}</Td><Td num>{inr(r.cgst)}</Td><Td num>{inr(r.sgst)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </table>
                </TableShell>
              </Part>

              <SectionCard title="What this means" flush>
                <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
                  {(g9.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              </SectionCard>
            </>
          )}

          {tab === '9c' && g9c && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <strong>How to read this:</strong> each row compares a number from the annual return against the same
                number in your books. Rows that differ are highlighted in amber with a plain "where to look" note. The
                point of GSTR-9C is to explain every difference — differences are never forced to zero.
              </div>
              {gstin && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  A registration is selected, but this reconciliation is shown <strong>org-wide</strong> — the general
                  ledger is not split by GST registration. The annual-return tab above is scoped to {gstin}.
                </div>
              )}

              {/* Table 5 — turnover */}
              <SectionCard title={g9c.table5.title} description={g9c.table5.note}>
                <TableShell>
                  <table className="w-full text-sm">
                    <THead><Th>Figure</Th><Th num>Amount</Th></THead>
                    <TBody>
                      <Tr><Td>Turnover as per annual return (GSTR-9, Part II)</Td><Td num>{inr(g9c.table5.turnoverPerReturn)}</Td></Tr>
                      <Tr><Td>Turnover as per books (Sales ledger 4000)</Td><Td num>{inr(g9c.table5.turnoverPerBooks)}</Td></Tr>
                      <Tr className={g9c.table5.reconciled ? '' : 'bg-amber-50 font-semibold text-amber-900'}>
                        <Td>Unreconciled difference (5R)</Td><Td num>{inr(g9c.table5.unreconciled)}</Td>
                      </Tr>
                    </TBody>
                  </table>
                </TableShell>
                {!g9c.table5.reconciled && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {g9c.table5.drill}
                  </div>
                )}
              </SectionCard>

              {/* Table 9 — tax paid */}
              <RecoTable title={g9c.table9.title} note={g9c.table9.note} rows={g9c.table9.rows}
                footer={['Total', g9c.table9.totalPerReturn, g9c.table9.totalPerBooks, g9c.table9.difference, g9c.table9.reconciled]} />

              {/* Table 12 — ITC */}
              <RecoTable title={g9c.table12.title} note={g9c.table12.note} rows={g9c.table12.rows}
                footer={['Total', g9c.table12.itcPerReturn, g9c.table12.itcPerBooks, g9c.table12.difference, g9c.table12.reconciled]} />

              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>Auditor sign-off required.</strong> {g9c.auditorSignOff.note}
              </div>

              <SectionCard title="What this means" flush>
                <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
                  {(g9c.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
                </ul>
              </SectionCard>
            </>
          )}
        </>
      )}
    </Page>
  );
};

/** A per-head reconciliation table (Table 9 / 12), highlighting non-zero gaps. */
const RecoTable: React.FC<{
  title: string; note: string;
  rows: Array<{ head: string; perReturn: number; perBooks: number; difference: number; reconciled: boolean; drill?: string }>;
  footer: [string, number, number, number, boolean];
}> = ({ title, note, rows, footer }) => (
  <SectionCard title={title} description={note}>
    <TableShell>
      <table className="w-full text-sm">
        <THead><Th>Head</Th><Th num>Per return</Th><Th num>Per books</Th><Th num>Difference</Th></THead>
        <TBody>
          {rows.map((r) => (
            <Tr key={r.head} className={r.reconciled ? '' : 'bg-amber-50 text-amber-900'}>
              <Td>{r.head}</Td><Td num>{inr(r.perReturn)}</Td><Td num>{inr(r.perBooks)}</Td>
              <Td num className={r.reconciled ? '' : 'font-semibold'}>{inr(r.difference)}</Td>
            </Tr>
          ))}
          <Tr className={footer[4] ? 'bg-gray-50 font-semibold' : 'bg-amber-100 font-semibold text-amber-900'}>
            <Td>{footer[0]}</Td><Td num>{inr(footer[1])}</Td><Td num>{inr(footer[2])}</Td><Td num>{inr(footer[3])}</Td>
          </Tr>
        </TBody>
      </table>
    </TableShell>
    {rows.filter((r) => !r.reconciled && r.drill).map((r) => (
      <div key={r.head} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{r.drill}</div>
    ))}
  </SectionCard>
);

export default Gstr9;
