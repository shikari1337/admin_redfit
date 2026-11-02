/**
 * SETTLEMENTS — each payout the gateway made into the store's bank (one settlement = one bank credit with a
 * UTR), with the payments it carried; the totals reconcile to the bank credit (PAY-0 §2 routes 5–6, §5).
 * `/panel/orders/payments/settlements` lists them; `/:settlementId` opens one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CreditCard, Landmark, TriangleAlert } from 'lucide-react';
import {
  Page, PageHeader, FilterBar, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState,
  ExportMenu, TableSkeleton, DrillLink, type CsvColumn,
} from '@/components/erp';
import { formatDay } from '@/utils/date';
import {
  LINK, failureOf, feePct, money, plainMajor, storePaymentsAPI,
  type LoadFailure, type Settlement, type SettlementDetail as Detail,
} from './data';
import {
  DEFAULT_FROM, DEFAULT_TO, FailureNotice, Hint, RangeFields, TIPS, TXN_CSV, TxnDrawer, TxnTable,
  useDrawerParam, useUrlFilters,
} from './common';

const CSV: CsvColumn<Settlement>[] = [
  { key: 'settled_at', label: 'Settled on', format: (s) => s.settled_at ?? '' },
  { key: 'settlement_id', label: 'Settlement' },
  { key: 'utr', label: 'UTR', format: (s) => s.utr ?? '' },
  { key: 'count', label: 'Payments' },
  { key: 'currency', label: 'Currency' },
  { key: 'gross_minor', label: 'Paid by customers', format: (s) => plainMajor(s.gross_minor, s.currency) },
  { key: 'fee_minor', label: 'Fee (incl. GST)', format: (s) => plainMajor(s.fee_minor, s.currency) },
  { key: 'tax_minor', label: 'GST on fee', format: (s) => plainMajor(s.tax_minor, s.currency) },
  { key: 'net_minor', label: 'Bank credit (net)', format: (s) => plainMajor(s.net_minor, s.currency) },
];

const linkBtn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50';

/** gross − fee must equal the bank credit; a difference is shown, never hidden. */
function tiesOut(s: Settlement): number | null {
  if (s.gross_minor === null || s.fee_minor === null || s.net_minor === null) return null;
  return s.gross_minor - s.fee_minor - s.net_minor;
}

const SettlementList: React.FC = () => {
  const defaults = useMemo(() => ({ from: DEFAULT_FROM(), to: DEFAULT_TO() }), []);
  const [f, setF] = useUrlFilters(['from', 'to'] as const, defaults);
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setRows(null); setFail(null);
    storePaymentsAPI.settlements({ from: f.from, to: f.to })
      .then(setRows)
      .catch((e) => { setRows([]); setFail(failureOf(e, 'the settlements could not be read')); });
  }, [f.from, f.to]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const by = new Map<string, { n: number; count: number; gross: number; fee: number; tax: number; net: number }>();
    for (const s of rows ?? []) {
      const t = by.get(s.currency) ?? { n: 0, count: 0, gross: 0, fee: 0, tax: 0, net: 0 };
      t.n += 1; t.count += s.count; t.gross += s.gross_minor ?? 0; t.fee += s.fee_minor ?? 0; t.tax += s.tax_minor ?? 0; t.net += s.net_minor ?? 0;
      by.set(s.currency, t);
    }
    return [...by.entries()];
  }, [rows]);

  return (
    <Page>
      <PageHeader
        title="Settlements"
        icon={Landmark}
        description="Each payout your payment gateway made into your bank. One settlement is one bank credit, with its bank reference (UTR) and the payments it carried."
        actions={(
          <>
            <Link to={LINK.transactions} className={linkBtn}><CreditCard className="h-4 w-4" />Payments</Link>
            <ExportMenu filename={`settlements-${f.from}-to-${f.to}`} columns={CSV} rows={rows ?? []} disabled={!rows?.length} />
          </>
        )}
      />
      <FilterBar><RangeFields from={f.from} to={f.to} onChange={(r) => setF(r)} /></FilterBar>

      {fail && <FailureNotice failure={fail} what="This server does not read the gateway’s settlement reports yet." onRetry={load} />}

      {totals.map(([cur, t]) => (
        <StatGrid key={cur} cols={4}>
          <StatCard label="Paid out to your bank" value={money(t.net, cur)} sub={`${t.n} settlement${t.n === 1 ? '' : 's'} · ${t.count} payments`} tone="good" />
          <StatCard label="Customers paid" value={money(t.gross, cur)} />
          <StatCard label={<Hint tip={TIPS.fee}>Fees (incl. GST)</Hint>} value={money(t.fee, cur)} sub={`${feePct(t.fee, t.gross)} of what customers paid`} />
          <StatCard label={<Hint tip={TIPS.tax}>GST on fees</Hint>} value={money(t.tax, cur)} />
        </StatGrid>
      ))}

      <TableShell maxHeight="70vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Settled on</Th><Th>Settlement / UTR</Th><Th num>Payments</Th>
            <Th num><Hint tip={TIPS.amount}>Customers paid</Hint></Th>
            <Th num><Hint tip={TIPS.fee}>Fee (incl. GST)</Hint></Th>
            <Th num><Hint tip={TIPS.tax}>GST on fee</Hint></Th>
            <Th num><Hint tip="Net = paid − fee. This is the amount you should see credited in your bank statement.">Bank credit</Hint></Th>
            <Th>Check</Th>
          </THead>
          {rows === null ? <TableSkeleton cols={8} rows={6} /> : (
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>{fail ? 'Nothing to show.' : <EmptyState title="No settlements in this period" description="The gateway pays captured payments into your bank in batches, usually 2–3 working days later. They appear here once its settlement report is read." />}</EmptyRow>
              ) : rows.map((s) => {
                const diff = tiesOut(s);
                return (
                  <Tr key={s.settlement_id} className="cursor-pointer" tabIndex={0}
                    onClick={() => navigate(LINK.settlement(s.settlement_id))}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(LINK.settlement(s.settlement_id)); }}>
                    <Td className="whitespace-nowrap">{formatDay(s.settled_at)}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <DrillLink to={LINK.settlement(s.settlement_id)}>{s.utr ?? 'No UTR yet'}</DrillLink>
                      <span className="block font-mono text-[11px] text-gray-400">{s.settlement_id}</span>
                    </Td>
                    <Td num>{s.count}</Td>
                    <Td num>{money(s.gross_minor, s.currency)}</Td>
                    <Td num>{money(s.fee_minor, s.currency)}</Td>
                    <Td num muted>{money(s.tax_minor, s.currency)}</Td>
                    <Td num className="font-semibold">{money(s.net_minor, s.currency)}</Td>
                    <Td>
                      {diff === null ? <span className="text-xs text-gray-400">—</span>
                        : diff === 0 ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Adds up</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-red-700" title="Paid − fee does not equal the bank credit"><TriangleAlert className="h-3.5 w-3.5" />Off by {money(Math.abs(diff), s.currency)}</span>}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          )}
        </table>
      </TableShell>
    </Page>
  );
};

const SettlementView: React.FC<{ id: string }> = ({ id }) => {
  const [s, setS] = useState<Detail | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [drawer, setDrawer] = useDrawerParam();

  const load = useCallback(() => {
    setS(null); setFail(null);
    storePaymentsAPI.settlement(id).then(setS).catch((e) => setFail(failureOf(e, 'the settlement could not be read')));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // The payments' own sums, so the page shows whether they add up to the bank credit.
  const sum = useMemo(() => {
    if (!s) return null;
    let gross = 0; let fee = 0; let net = 0;
    for (const t of s.transactions) { gross += t.amount_minor ?? 0; fee += t.fee_minor ?? 0; net += t.net_minor ?? 0; }
    return { gross, fee, net };
  }, [s]);
  const diff = s ? tiesOut(s) : null;

  return (
    <Page>
      <PageHeader
        title={s?.utr ? `Settlement · UTR ${s.utr}` : 'Settlement'}
        icon={Landmark}
        description={s ? `Paid into your bank on ${formatDay(s.settled_at)} · ${s.count} payments · ${s.settlement_id}` : 'One payout from your gateway into your bank.'}
        actions={(
          <>
            <Link to={LINK.settlements} className={linkBtn}><ArrowLeft className="h-4 w-4" />All settlements</Link>
            {s && <ExportMenu filename={`settlement-${s.settlement_id}`} columns={TXN_CSV} rows={s.transactions} disabled={!s.transactions.length} />}
          </>
        )}
      />

      {fail && <FailureNotice failure={fail} what="This server does not read the gateway’s settlement reports yet." onRetry={load} />}

      {s && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Bank credit" value={money(s.net_minor, s.currency)} sub="What should appear on your bank statement" tone="good" />
            <StatCard label="Customers paid" value={money(s.gross_minor, s.currency)} />
            <StatCard label={<Hint tip={TIPS.fee}>Fee (incl. GST)</Hint>} value={money(s.fee_minor, s.currency)} sub={`${feePct(s.fee_minor, s.gross_minor)} of what customers paid`} />
            <StatCard label={<Hint tip={TIPS.tax}>GST on fee</Hint>} value={money(s.tax_minor, s.currency)} />
          </StatGrid>

          <div className={diff === null || diff === 0 ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800' : 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'} role="status">
            {diff === null ? 'Some figures are not known yet, so the check waits.'
              : diff === 0 ? `Adds up: ${money(s.gross_minor, s.currency)} paid − ${money(s.fee_minor, s.currency)} fee = ${money(s.net_minor, s.currency)} credited.`
                : `Does not add up: paid − fee differs from the bank credit by ${money(Math.abs(diff), s.currency)}. Check the gateway’s settlement report.`}
            {sum && s.transactions.length > 0 && (sum.gross !== s.gross_minor || sum.net !== s.net_minor) && (
              <span className="block text-amber-800">The {s.transactions.length} payments listed below sum to {money(sum.gross, s.currency)} paid and {money(sum.net, s.currency)} net — some payments of this settlement may not be in your ledger yet (run reconciliation on Payment analytics).</span>
            )}
          </div>

          <h2 className="text-sm font-semibold text-gray-800">Payments in this settlement</h2>
          <TxnTable rows={s.transactions} hideSettlement onOpen={(tid) => setDrawer(tid)} empty="This settlement lists no payments of yours." />
        </>
      )}
      {!s && !fail && <TxnTable rows={null} hideSettlement onOpen={() => undefined} />}
      <TxnDrawer id={drawer} onClose={() => setDrawer(null)} />
    </Page>
  );
};

const Settlements: React.FC = () => {
  const { settlementId } = useParams<{ settlementId?: string }>();
  return settlementId ? <SettlementView id={settlementId} /> : <SettlementList />;
};

export default Settlements;
