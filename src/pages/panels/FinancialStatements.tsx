import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatCard, StatGrid, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, TextInput, SelectInput, Field, inrMinor,
  ExportMenu, DrillLink, type CsvColumn,
} from '../../components/erp';

/**
 * Financial Statements + books-close — the Reports Center for the owner's CA.
 * Balance Sheet (with prior-year comparative), Profit & Loss (Schedule III,
 * comparative), Cash Flow (direct OR indirect), Statement of Changes in Equity,
 * business-performance Ratios, and a Close-books card. Everything reads straight
 * from the general ledger via /accounting/reports/*; nothing is estimated.
 */

const todayStr = () => new Date().toISOString().slice(0, 10);
/** Indian FY start (1 Apr) for the FY containing `d`. */
const fyStart = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};
const fyEndDefault = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-03-31`;
};

const errMsg = (e: any) => e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message ?? 'Something went wrong';

/** Drill from a statement line's account code into that account's ledger over the same window. */
const glDrill = (code: string, opts: { from?: string; to?: string }) => {
  const q = new URLSearchParams({ account: code });
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  return `/panel/accounting/general-ledger?${q.toString()}`;
};
const AccountDrill: React.FC<{ code: string; from?: string; to?: string }> = ({ code, from, to }) =>
  code ? <DrillLink to={glDrill(code, { from, to })} title="View this account's ledger">{code}</DrillLink> : <>{code}</>;

/** A "compare prior year" checkbox styled like the rest of the toolbar. */
const CompareToggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="flex items-center gap-2 pb-1.5 text-sm text-gray-700">
    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    Compare prior year
  </label>
);

const FinancialStatements: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const [tab, setTab] = useState<'balance-sheet' | 'profit-loss' | 'cash-flow' | 'equity' | 'ratios' | 'close-books'>('balance-sheet');

  return (
    <Page>
      <PageHeader
        title="Financial Statements"
        description="Profit & Loss, Balance Sheet, Cash Flow, changes in equity and the ratios your CA looks at — read straight from your accounts, with prior-year comparatives."
      />
      <TabBar
        tabs={[
          { key: 'balance-sheet', label: 'Balance Sheet' },
          { key: 'profit-loss', label: 'Profit & Loss' },
          { key: 'cash-flow', label: 'Cash Flow' },
          { key: 'equity', label: 'Equity' },
          { key: 'ratios', label: 'Ratios' },
          { key: 'close-books', label: 'Close books' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as any)}
      />
      {tab === 'balance-sheet' && <BalanceSheetTab />}
      {tab === 'profit-loss' && <ProfitLossTab />}
      {tab === 'cash-flow' && <CashFlowTab />}
      {tab === 'equity' && <EquityTab />}
      {tab === 'ratios' && <RatiosTab />}
      {tab === 'close-books' && <CloseBooksTab canPost={canPost} />}
    </Page>
  );
};

// ── Balance Sheet ──────────────────────────────────────────────────────────

const BsSectionTable: React.FC<{ label: string; accounts: any[]; subtotalMinor: string; priorSubtotalMinor?: string; comparePrior: boolean; asOf: string }> = ({ label, accounts, subtotalMinor, priorSubtotalMinor, comparePrior, asOf }) => (
  <SectionCard title={label}>
    <TableShell>
      <table className="w-full text-sm">
        <THead><Th>Code</Th><Th>Account</Th><Th num>Amount</Th>{comparePrior && <Th num>Prior year</Th>}</THead>
        <TBody>
          {accounts.length === 0 && <EmptyRow colSpan={comparePrior ? 4 : 3}>Nothing here for this date.</EmptyRow>}
          {accounts.map((a: any, i: number) => (
            <Tr key={`${a.code}-${i}`}>
              <Td muted><AccountDrill code={a.code} to={asOf} /></Td>
              <Td>{a.name}</Td>
              <Td num>{inrMinor(a.balanceMinor)}</Td>
              {comparePrior && <Td num className="text-gray-500">{inrMinor(a.priorBalanceMinor ?? '0')}</Td>}
            </Tr>
          ))}
          {accounts.length > 0 && (
            <Tr className="bg-gray-50 font-semibold">
              <Td /><Td>Subtotal</Td><Td num>{inrMinor(subtotalMinor)}</Td>
              {comparePrior && <Td num>{inrMinor(priorSubtotalMinor ?? '0')}</Td>}
            </Tr>
          )}
        </TBody>
      </table>
    </TableShell>
  </SectionCard>
);

const BalanceSheetTab: React.FC = () => {
  const [asOf, setAsOf] = useState(todayStr());
  const [comparePrior, setComparePrior] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(payload<any>(await api.get('/accounting/reports/balance-sheet', { params: { asOf, comparePrior: comparePrior ? 1 : undefined } }))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const csvRows = data ? [data.assets, data.liabilities, data.equity].flatMap((s: any) =>
    s.accounts.map((a: any) => ({ section: s.label, code: a.code, name: a.name, amt: a.balanceMinor }))) : [];
  const csvCols: CsvColumn<any>[] = [
    { key: 'section', label: 'Section' }, { key: 'code', label: 'Code' },
    { key: 'name', label: 'Account' }, { key: 'amt', label: 'Amount', money: true },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="As of date"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <CompareToggle checked={comparePrior} onChange={setComparePrior} />
        <Btn onClick={load}>Show</Btn>
        <ExportMenu
          filename={`balance-sheet-${asOf}`}
          columns={csvCols}
          rows={csvRows}
          disabled={!data}
          serverExports={[{
            label: 'Full CSV (server)',
            path: '/accounting/reports/balance-sheet',
            params: { asOf, comparePrior: comparePrior ? 1 : undefined, format: 'csv' },
            filename: `balance-sheet-${asOf}.csv`,
          }]}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={3}>
            <StatCard label="Total assets (what you own)" value={inrMinor(data.totalAssetsMinor)} tone="info"
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.totalAssetsMinor)}` : undefined} />
            <StatCard label="Total liabilities (what you owe)" value={inrMinor(data.totalLiabilitiesMinor)} tone="warn"
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.totalLiabilitiesMinor)}` : undefined} />
            <StatCard label="Total equity (net worth)" value={inrMinor(data.totalEquityMinor)} tone="good"
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.totalEquityMinor)}` : undefined} />
          </StatGrid>

          <SectionCard title="The balance check">
            <div className={`rounded-md px-4 py-4 ${data.balanced ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold tabular-nums">
                <span>Assets {inrMinor(data.totalAssetsMinor)}</span>
                <span className="text-gray-400">=</span>
                <span>Liabilities {inrMinor(data.totalLiabilitiesMinor)}</span>
                <span className="text-gray-400">+</span>
                <span>Equity {inrMinor(data.totalEquityMinor)}</span>
              </div>
              <div className={`mt-2 text-sm font-medium ${data.balanced ? 'text-emerald-700' : 'text-red-700'}`}>
                {data.balanced
                  ? '✓ Balanced — the books tie exactly.'
                  : `⚠ Off by ${inrMinor(data.imbalanceMinor)} — investigate the general ledger; do not adjust the statement.`}
              </div>
            </div>
          </SectionCard>

          <BsSectionTable label={data.assets.label} accounts={data.assets.accounts} subtotalMinor={data.assets.subtotalMinor} priorSubtotalMinor={data.assets.priorSubtotalMinor} comparePrior={!!data.comparePrior} asOf={asOf} />
          <BsSectionTable label={data.liabilities.label} accounts={data.liabilities.accounts} subtotalMinor={data.liabilities.subtotalMinor} priorSubtotalMinor={data.liabilities.priorSubtotalMinor} comparePrior={!!data.comparePrior} asOf={asOf} />
          <BsSectionTable label={data.equity.label} accounts={data.equity.accounts} subtotalMinor={data.equity.subtotalMinor} priorSubtotalMinor={data.equity.priorSubtotalMinor} comparePrior={!!data.comparePrior} asOf={asOf} />

          <SectionCard title="What this means" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </>
  );
};

// ── Profit & Loss ────────────────────────────────────────────────────────────

const ProfitLossTab: React.FC = () => {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [comparePrior, setComparePrior] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(payload<any>(await api.get('/accounting/reports/p-and-l', { params: { from, to, comparePrior: comparePrior ? 1 : undefined } }))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const pnlCsvRows = data ? [data.revenueFromOperations, data.otherIncome, data.costOfGoodsSold, data.otherExpenses]
    .flatMap((s: any) => s.lines.map((l: any) => ({ section: s.label, code: l.code, name: l.name, amt: l.amountMinor }))) : [];
  const pnlCsvCols: CsvColumn<any>[] = [
    { key: 'section', label: 'Section' }, { key: 'code', label: 'Code' },
    { key: 'name', label: 'Line' }, { key: 'amt', label: 'Amount', money: true },
  ];

  const cp = !!data?.comparePrior;
  const cols = cp ? 4 : 3;
  const sectionRows = (section: any) => (
    <>
      <Tr className="bg-gray-50/70"><Td className="font-semibold text-gray-700" colSpan={cols}>{section.label}</Td></Tr>
      {section.lines.length === 0 && <EmptyRow colSpan={cols}>None in this period.</EmptyRow>}
      {section.lines.map((l: any, i: number) => (
        <Tr key={`${section.key}-${l.code}-${i}`}>
          <Td muted><AccountDrill code={l.code} from={from} to={to} /></Td>
          <Td>{l.name}</Td>
          <Td num>{inrMinor(l.amountMinor)}</Td>
          {cp && <Td num className="text-gray-500">{inrMinor(l.priorAmountMinor ?? '0')}</Td>}
        </Tr>
      ))}
      <Tr className="font-medium">
        <Td /><Td className="text-gray-500">Subtotal — {section.label}</Td>
        <Td num>{inrMinor(section.subtotalMinor)}</Td>
        {cp && <Td num className="text-gray-500">{inrMinor(section.priorSubtotalMinor ?? '0')}</Td>}
      </Tr>
    </>
  );
  const totalRow = (label: string, cur: string, prior?: string, tone?: string) => (
    <Tr className={`font-semibold ${tone ?? 'bg-blue-50/50'}`}>
      <Td /><Td>{label}</Td>
      <Td num>{inrMinor(cur)}</Td>
      {cp && <Td num>{inrMinor(prior ?? '0')}</Td>}
    </Tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <CompareToggle checked={comparePrior} onChange={setComparePrior} />
        <Btn onClick={load}>Show</Btn>
        <ExportMenu
          filename={`profit-and-loss-${from}-to-${to}`}
          columns={pnlCsvCols}
          rows={pnlCsvRows}
          disabled={!data}
          serverExports={[{
            label: 'Full CSV (server)',
            path: '/accounting/reports/p-and-l',
            params: { from, to, comparePrior: comparePrior ? 1 : undefined, format: 'csv' },
            filename: `profit-and-loss-${from}-to-${to}.csv`,
          }]}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={3}>
            <StatCard label="Total income" value={inrMinor(data.totalIncomeMinor)} tone="info"
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.totalIncomeMinor)}` : undefined} />
            <StatCard label="Gross profit" value={inrMinor(data.grossProfitMinor)}
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.grossProfitMinor)}` : undefined} />
            <StatCard label="Net profit" value={inrMinor(data.netProfitMinor)}
              tone={Number(data.netProfitMinor) < 0 ? 'bad' : 'good'}
              sub={data.comparative ? `Prior: ${inrMinor(data.comparative.netProfitMinor)}` : undefined} />
          </StatGrid>

          <SectionCard title={`Statement of Profit & Loss — ${data.from} to ${data.to}`}>
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Code</Th><Th>Line</Th><Th num>Amount</Th>{cp && <Th num>Prior year</Th>}</THead>
                <TBody>
                  {sectionRows(data.revenueFromOperations)}
                  {sectionRows(data.otherIncome)}
                  {totalRow('Total income', data.totalIncomeMinor, data.comparative?.totalIncomeMinor)}
                  {sectionRows(data.costOfGoodsSold)}
                  {totalRow('Gross profit', data.grossProfitMinor, data.comparative?.grossProfitMinor, 'bg-emerald-50/50')}
                  {sectionRows(data.otherExpenses)}
                  {totalRow('Total expenses', data.totalExpenseMinor, data.comparative?.totalExpenseMinor, 'bg-amber-50/50')}
                  {totalRow('Net profit for the period', data.netProfitMinor, data.comparative?.netProfitMinor, Number(data.netProfitMinor) < 0 ? 'bg-red-50' : 'bg-emerald-50')}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>

          <SectionCard title="How this is built" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </>
  );
};

// ── Cash Flow ──────────────────────────────────────────────────────────────

const CashBucket: React.FC<{ bucket: any; from: string; to: string }> = ({ bucket, from, to }) => (
  <SectionCard title={bucket.label}>
    <TableShell>
      <table className="w-full text-sm">
        <THead><Th>Code</Th><Th>Account</Th><Th num>Cash in / (out)</Th></THead>
        <TBody>
          {bucket.lines.length === 0 && <EmptyRow colSpan={3}>No cash movements in this bucket.</EmptyRow>}
          {bucket.lines.map((l: any, i: number) => (
            <Tr key={`${l.code}-${i}`}>
              <Td muted><AccountDrill code={l.code} from={from} to={to} /></Td>
              <Td>{l.name}</Td>
              <Td num className={Number(l.amountMinor) < 0 ? 'text-red-600' : ''}>{inrMinor(l.amountMinor)}</Td>
            </Tr>
          ))}
          <Tr className="bg-gray-50 font-semibold">
            <Td /><Td>Net</Td>
            <Td num className={Number(bucket.netMinor) < 0 ? 'text-red-600' : ''}>{inrMinor(bucket.netMinor)}</Td>
          </Tr>
        </TBody>
      </table>
    </TableShell>
  </SectionCard>
);

const CashFlowTab: React.FC = () => {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [method, setMethod] = useState<'direct' | 'indirect'>('direct');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(payload<any>(await api.get('/accounting/reports/cash-flow', { params: { from, to, method } }))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const cfCsvRows = data ? [data.operating, data.investing, data.financing]
    .flatMap((b: any) => b.lines.map((l: any) => ({ section: b.label, code: l.code, name: l.name, amt: l.amountMinor }))) : [];
  const cfCsvCols: CsvColumn<any>[] = [
    { key: 'section', label: 'Section' }, { key: 'code', label: 'Code' },
    { key: 'name', label: 'Account' }, { key: 'amt', label: 'Cash', money: true },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Method">
          <SelectInput value={method} onChange={(e) => setMethod(e.target.value as any)}>
            <option value="direct">Direct</option>
            <option value="indirect">Indirect (from net profit)</option>
          </SelectInput>
        </Field>
        <Btn onClick={load}>Show</Btn>
        <ExportMenu
          filename={`cash-flow-${method}-${from}-to-${to}`}
          columns={cfCsvCols}
          rows={cfCsvRows}
          disabled={!data}
          serverExports={[{
            label: 'Full CSV (server)',
            path: '/accounting/reports/cash-flow',
            params: { from, to, method, format: 'csv' },
            filename: `cash-flow-${method}-${from}-to-${to}.csv`,
          }]}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={3}>
            <StatCard label="Opening cash & bank" value={inrMinor(data.openingCashMinor)} />
            <StatCard label="Net change in cash" value={inrMinor(data.netChangeMinor)}
              tone={Number(data.netChangeMinor) < 0 ? 'bad' : 'good'} />
            <StatCard label="Closing cash & bank" value={inrMinor(data.closingCashMinor)} tone="info" />
          </StatGrid>

          <CashBucket bucket={data.operating} from={from} to={to} />
          <CashBucket bucket={data.investing} from={from} to={to} />
          <CashBucket bucket={data.financing} from={from} to={to} />

          <SectionCard title="How this is built" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </>
  );
};

// ── Statement of Changes in Equity ─────────────────────────────────────────────

const EquityTab: React.FC = () => {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(payload<any>(await api.get('/accounting/reports/equity-statement', { params: { from, to } }))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const eqCsvRows = data ? [
    { movement: `Opening balance (${data.from})`, ...data.opening },
    ...data.movements.map((m: any) => ({ movement: m.label, ...m })),
    { movement: `Closing balance (${data.to})`, ...data.closing },
  ] : [];
  const eqCsvCols: CsvColumn<any>[] = [
    { key: 'movement', label: 'Movement' },
    { key: 'capitalMinor', label: 'Capital & reserves', money: true },
    { key: 'retainedEarningsMinor', label: 'Retained earnings', money: true },
    { key: 'currentEarningsMinor', label: 'Current earnings', money: true },
    { key: 'totalMinor', label: 'Total', money: true },
  ];

  const cols4 = (c: any) => (
    <>
      <Td num>{inrMinor(c.capitalMinor)}</Td>
      <Td num>{inrMinor(c.retainedEarningsMinor)}</Td>
      <Td num>{inrMinor(c.currentEarningsMinor)}</Td>
      <Td num className="font-semibold">{inrMinor(c.totalMinor)}</Td>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Btn onClick={load}>Show</Btn>
        <ExportMenu
          filename={`equity-statement-${from}-to-${to}`}
          columns={eqCsvCols}
          rows={eqCsvRows}
          disabled={!data}
          serverExports={[{
            label: 'Full CSV (server)',
            path: '/accounting/reports/equity-statement',
            params: { from, to, format: 'csv' },
            filename: `equity-statement-${from}-to-${to}.csv`,
          }]}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={3}>
            <StatCard label="Opening equity" value={inrMinor(data.opening.totalMinor)} />
            <StatCard label="Profit for the period" value={inrMinor(data.profitForPeriodMinor)}
              tone={Number(data.profitForPeriodMinor) < 0 ? 'bad' : 'good'} />
            <StatCard label="Closing equity" value={inrMinor(data.closing.totalMinor)} tone="info" />
          </StatGrid>

          <SectionCard title={`Statement of Changes in Equity — ${data.from} to ${data.to}`}>
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Movement</Th><Th num>Capital &amp; reserves</Th><Th num>Retained earnings</Th><Th num>Current earnings</Th><Th num>Total</Th></THead>
                <TBody>
                  <Tr className="bg-gray-50 font-semibold"><Td>Opening balance ({data.from})</Td>{cols4(data.opening)}</Tr>
                  {data.movements.map((m: any, i: number) => (
                    <Tr key={i}><Td>{m.label}</Td>{cols4(m)}</Tr>
                  ))}
                  <Tr className="bg-emerald-50 font-semibold"><Td>Closing balance ({data.to})</Td>{cols4(data.closing)}</Tr>
                </TBody>
              </table>
            </TableShell>
          </SectionCard>

          <SectionCard title="What this means" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </>
  );
};

// ── Business Performance Ratios ────────────────────────────────────────────────

const fmtRatio = (r: any): string => {
  if (r.value === null || r.value === undefined) return '—';
  if (r.unit === '%') return `${r.value}%`;
  if (r.unit === 'days') return `${r.value} days`;
  return `${r.value}×`;
};

const RatiosTab: React.FC = () => {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(payload<any>(await api.get('/accounting/reports/ratios', { params: { from, to } }))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const ratioCsvCols: CsvColumn<any>[] = [
    { key: 'label', label: 'Ratio' },
    { key: 'value', label: 'Value', format: (r) => fmtRatio(r) },
    { key: 'unit', label: 'Unit' },
    { key: 'formula', label: 'Formula' },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Btn onClick={load}>Show</Btn>
        <ExportMenu
          filename={`ratios-${from}-to-${to}`}
          columns={ratioCsvCols}
          rows={data?.ratios ?? []}
          disabled={!data}
          serverExports={[{
            label: 'Full CSV (server)',
            path: '/accounting/reports/ratios',
            params: { from, to, format: 'csv' },
            filename: `ratios-${from}-to-${to}.csv`,
          }]}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {data && !loading && (
        <>
          <StatGrid cols={4}>
            {data.ratios.map((r: any) => (
              <StatCard key={r.key} label={r.label} value={fmtRatio(r)} sub={r.formula} />
            ))}
          </StatGrid>

          <SectionCard title="The numbers behind the ratios">
            <TableShell>
              <table className="w-full text-sm">
                <THead><Th>Input</Th><Th num>Amount</Th></THead>
                <TBody>
                  <Tr><Td>Current assets</Td><Td num>{inrMinor(data.inputs.currentAssetsMinor)}</Td></Tr>
                  <Tr><Td>Inventory</Td><Td num>{inrMinor(data.inputs.inventoryMinor)}</Td></Tr>
                  <Tr><Td>Quick assets (current − inventory)</Td><Td num>{inrMinor(data.inputs.quickAssetsMinor)}</Td></Tr>
                  <Tr><Td>Current liabilities</Td><Td num>{inrMinor(data.inputs.currentLiabilitiesMinor)}</Td></Tr>
                  <Tr><Td>Total liabilities</Td><Td num>{inrMinor(data.inputs.totalLiabilitiesMinor)}</Td></Tr>
                  <Tr><Td>Total equity</Td><Td num>{inrMinor(data.inputs.totalEquityMinor)}</Td></Tr>
                  <Tr><Td>Revenue from operations</Td><Td num>{inrMinor(data.inputs.revenueMinor)}</Td></Tr>
                  <Tr><Td>Gross profit</Td><Td num>{inrMinor(data.inputs.grossProfitMinor)}</Td></Tr>
                  <Tr><Td>Net profit</Td><Td num>{inrMinor(data.inputs.netProfitMinor)}</Td></Tr>
                  <Tr><Td>Cost of goods sold</Td><Td num>{inrMinor(data.inputs.cogsMinor)}</Td></Tr>
                  <Tr><Td>Average receivables</Td><Td num>{inrMinor(data.inputs.avgReceivablesMinor)}</Td></Tr>
                  <Tr><Td>Average payables</Td><Td num>{inrMinor(data.inputs.avgPayablesMinor)}</Td></Tr>
                  <Tr><Td>Average inventory</Td><Td num>{inrMinor(data.inputs.avgInventoryMinor)}</Td></Tr>
                  <Tr><Td>Days in period</Td><Td num>{data.inputs.daysInPeriod}</Td></Tr>
                </TBody>
              </table>
            </TableShell>
          </SectionCard>

          <SectionCard title="How to read these" flush>
            <ul className="list-disc space-y-1 px-8 py-4 text-sm text-gray-600">
              {(data.notes ?? []).map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      )}
    </>
  );
};

// ── Close books ──────────────────────────────────────────────────────────────

const CloseBooksTab: React.FC<{ canPost: boolean }> = ({ canPost }) => {
  const [lock, setLock] = useState<any>(null);
  const [lockLoaded, setLockLoaded] = useState(false);
  const [lockDate, setLockDate] = useState(fyEndDefault());
  const [fyEnd, setFyEnd] = useState(fyEndDefault());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadLock = async () => {
    try { setLock(payload<any>(await api.get('/accounting/period-lock'))); }
    catch (e: any) { setError(errMsg(e)); }
    finally { setLockLoaded(true); }
  };
  useEffect(() => { loadLock(); }, []);

  const doLock = async () => {
    if (!window.confirm(`Lock the books up to ${lockDate}?\n\nThis stops anyone editing entries on or before this date. Only lock once your CA has signed off the period.`)) return;
    setBusy(true); setError(''); setOk('');
    try {
      await api.post('/accounting/period-lock', { date: lockDate });
      setOk(`Books locked up to ${lockDate}.`);
      await loadLock();
    } catch (e: any) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const doClose = async () => {
    if (!window.confirm(`Run the year-end close for the financial year ending ${fyEnd}?\n\nThis moves the year's profit or loss into Retained Earnings in one balanced journal. It runs once per year; a second run does nothing.`)) return;
    setBusy(true); setError(''); setOk('');
    try {
      const r = payload<any>(await api.post('/accounting/year-end-close', { fyEnd }));
      setOk(r.message);
    } catch (e: any) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      <SectionCard title="Books lock status">
        {!lockLoaded ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : lock ? (
          <div className="text-sm">
            <div className="text-base font-semibold text-gray-900">🔒 Locked up to {lock.lockedUpTo}</div>
            <div className="mt-1 text-gray-600">No entries can be posted on or before this date.{lock.note ? ` Note: ${lock.note}` : ''}</div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">The books are open — no lock is in place.</div>
        )}
      </SectionCard>

      {!canPost && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have read-only access to accounting. Locking the books and year-end close need posting rights.
        </div>
      )}

      <SectionCard title="Lock the books to a date"
        description="A safety catch for after your CA signs off: nothing can be added, edited or reversed on or before the lock date.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <div className="mb-1 text-xs font-medium text-gray-500">Lock entries up to and including</div>
            <TextInput type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
          </label>
          <Btn variant="danger" onClick={doLock} disabled={!canPost || busy}>Lock books</Btn>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Warning: this stops anyone editing entries on or before this date. You can move the lock later.
        </p>
      </SectionCard>

      <SectionCard title="Year-end close"
        description="Zeroes the income and expense accounts for the year and moves the net profit (or loss) into Retained Earnings — one balanced journal. Do this before you lock the year.">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <div className="mb-1 text-xs font-medium text-gray-500">Financial year ending</div>
            <TextInput type="date" value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} />
          </label>
          <Btn onClick={doClose} disabled={!canPost || busy}>Run year-end close</Btn>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Safe to run: it posts once per financial year. Running it again just tells you it is already done.
        </p>
      </SectionCard>
    </>
  );
};

export default FinancialStatements;
