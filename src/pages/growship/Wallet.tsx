import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, Loader2, FileDown } from 'lucide-react';
import { walletAPI, errorText } from '../../services/api';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { formatDate, isoDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, FilterBar, Field, SelectInput,
} from '../../components/erp';
import { DEFAULT_FROM, DEFAULT_TO, RangeFields } from '../payments/common';
import { WalletCard, useStoreWallet } from '../../components/growship/WalletCard';
import { growshipAPI, type GsWalletLeg } from '@/lib/v2/growship';

/** One wallet movement (`GET /wallet/transactions`, platform WalletMovementView). Money in rupees. */
interface Movement {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  category: string | null;
  reference?: string | null;
  note?: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;
/** The statement reads the ledger this many rows at a time (the route's most), and stops after this many rows. */
const STATEMENT_PAGE = 200;
const STATEMENT_CAP = 5000;

const categoryText = (c: string | null | undefined) => String(c ?? '').replace(/_/g, ' ') || 'Other';

/**
 * The wallet Growcord Ship freight comes off (category `shipping`): the balance, Add money, and every movement
 * with the parcel's AWB where Growcord Ship recorded one (Ship's own copy of each movement names the wallet
 * transaction it went through). A statement for any dates downloads as CSV. The full wallet, with message
 * charges and service prices, stays in Settings, Wallet.
 */
const GrowshipWallet: React.FC = () => {
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(true);
  const [category, setCategory] = useState<'shipping' | ''>('shipping');
  const [direction, setDirection] = useState<'' | 'credit' | 'debit'>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [legs, setLegs] = useState<GsWalletLeg[]>([]);
  const [range, setRange] = useState({ from: DEFAULT_FROM(), to: DEFAULT_TO() });
  const [statementBusy, setStatementBusy] = useState(false);
  const [statement, setStatement] = useState<{ rows: number; credit: number; debit: number; capped: boolean } | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    walletAPI.getTransactions({ page, limit: PAGE_SIZE, ...(category ? { category } : {}), ...(direction ? { direction } : {}) })
      .then((list: any) => {
        setRows(Array.isArray(list) ? list : []);
        setTotal(typeof list?.total === 'number' ? list.total : Array.isArray(list) ? list.length : 0);
      })
      .catch((e) => { setRows([]); setError(errorText(e, 'The wallet history could not be read.')); });
  };
  useEffect(load, [page, category, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ship's own record of the movements (newest 200): the AWB behind each wallet transaction.
  useEffect(() => { growshipAPI.walletLegs(200).then(setLegs).catch(() => setLegs([])); }, []);
  const byTx = useMemo(() => {
    const m = new Map<string, GsWalletLeg>();
    for (const l of legs) if (l.platform_ref) m.set(String(l.platform_ref), l);
    return m;
  }, [legs]);
  const awbOf = (t: Movement) => byTx.get(t.id)?.awb ?? '';

  const columns: CsvColumn<Movement>[] = [
    { key: 'created_at', label: 'Date', format: (t) => formatDate(t.created_at, 'yyyy-MM-dd HH:mm', '') },
    { key: 'direction', label: 'In or out', format: (t) => (t.direction === 'credit' ? 'Money in' : 'Money out') },
    { key: 'category', label: 'Category', format: (t) => categoryText(t.category) },
    { key: 'reference', label: 'Order or reference', format: (t) => t.reference ?? '' },
    { key: 'awb', label: 'AWB', format: (t) => awbOf(t) },
    { key: 'note', label: 'Note', format: (t) => t.note ?? '' },
    { key: 'amount', label: 'Amount', format: (t) => (t.direction === 'debit' ? -Number(t.amount ?? 0) : Number(t.amount ?? 0)).toFixed(2) },
    { key: 'balance_after', label: 'Balance after', format: (t) => Number(t.balance_after ?? 0).toFixed(2) },
  ];

  /** Every movement in the dates, newest first, read page by page until the rows are older than the start. */
  const downloadStatement = async () => {
    if (!range.from || !range.to) return;
    setStatementBusy(true); setStatementError(null); setStatement(null);
    try {
      const out: Movement[] = [];
      let capped = false;
      for (let p = 1; ; p += 1) {
        const list: any = await walletAPI.getTransactions({ page: p, limit: STATEMENT_PAGE, ...(category ? { category } : {}), ...(direction ? { direction } : {}) });
        const batch: Movement[] = Array.isArray(list) ? list : [];
        for (const t of batch) {
          const day = isoDate(t.created_at);
          if (day >= range.from && day <= range.to) out.push(t);
        }
        const oldest = batch.length ? isoDate(batch[batch.length - 1].created_at) : '';
        if (batch.length < STATEMENT_PAGE || (oldest && oldest < range.from)) break;
        if (p * STATEMENT_PAGE >= STATEMENT_CAP) { capped = true; break; }
      }
      downloadCsv(`growcord-ship-wallet-${range.from}-to-${range.to}`, columns, out);
      setStatement({
        rows: out.length,
        credit: out.filter((t) => t.direction === 'credit').reduce((s, t) => s + Number(t.amount || 0), 0),
        debit: out.filter((t) => t.direction === 'debit').reduce((s, t) => s + Number(t.amount || 0), 0),
        capped,
      });
    } catch (e) {
      setStatementError(errorText(e, 'The statement could not be made.'));
    } finally {
      setStatementBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page>
      <PageHeader
        icon={WalletIcon}
        title="Wallet"
        description="Growcord Ship freight is taken from this wallet when a parcel is booked."
        actions={<Link to="/settings/wallet" className="text-sm text-blue-700 hover:underline">Whole wallet and service prices</Link>}
      />

      <WalletCard wallet={wallet} error={walletError} onChanged={() => { reloadWallet(); setPage(1); load(); }} />

      <SectionCard title="Statement" description="Every movement between two dates, as a CSV file. It uses the filters below.">
        <FilterBar>
          <RangeFields from={range.from} to={range.to} onChange={setRange} />
          <div className="flex items-end">
            <Btn onClick={downloadStatement} disabled={statementBusy || !range.from || !range.to}>
              {statementBusy ? <Loader2 className="animate-spin" /> : <FileDown />} Download statement
            </Btn>
          </div>
        </FilterBar>
        {statementError && <p className="mt-2 text-sm text-red-600">{statementError}</p>}
        {statement && (
          <p className="mt-2 text-sm text-gray-600">
            {statement.rows} movement{statement.rows === 1 ? '' : 's'}: {fmtRupees(statement.credit)} in, {fmtRupees(statement.debit)} out.
            {statement.capped ? ` Only the newest ${STATEMENT_CAP} movements were read; choose fewer days for the rest.` : ''}
          </p>
        )}
      </SectionCard>

      <SectionCard
        flush
        title="History"
        description="Newest first. The AWB shows where Growcord Ship recorded which parcel the money was for."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Show">
              <SelectInput value={category} onChange={(e) => { setCategory(e.target.value as 'shipping' | ''); setPage(1); }} aria-label="Which movements">
                <option value="shipping">Shipping only</option>
                <option value="">Everything</option>
              </SelectInput>
            </Field>
            <Field label="In or out">
              <SelectInput value={direction} onChange={(e) => { setDirection(e.target.value as '' | 'credit' | 'debit'); setPage(1); }} aria-label="Money in or out">
                <option value="">Both</option>
                <option value="credit">Money in</option>
                <option value="debit">Money out</option>
              </SelectInput>
            </Field>
          </div>
        }
      >
        {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th>Date</Th><Th>Category</Th><Th>Order or reference</Th><Th>AWB</Th><Th>Note</Th><Th num>Amount</Th><Th num>Balance after</Th>
            </THead>
            <TBody>
              {rows === null && <EmptyRow colSpan={7}>Reading...</EmptyRow>}
              {rows && rows.length === 0 && <EmptyRow colSpan={7}>{category === 'shipping' ? 'No shipping charge has been taken from the wallet yet.' : 'No movement yet.'}</EmptyRow>}
              {(rows ?? []).map((t) => (
                <Tr key={t.id}>
                  <Td muted className="whitespace-nowrap">{formatDate(t.created_at, 'dd MMM yyyy, HH:mm', '')}</Td>
                  <Td className="capitalize">{categoryText(t.category)}</Td>
                  <Td>{t.reference || ''}</Td>
                  <Td className="font-mono text-xs">{awbOf(t)}</Td>
                  <Td className="max-w-xs truncate text-xs text-gray-500" title={t.note ?? undefined}>{t.note || ''}</Td>
                  <Td num className={t.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'}>
                    {t.direction === 'credit' ? '+' : '-'}{fmtRupees(t.amount)}
                  </Td>
                  <Td num muted>{fmtRupees(t.balance_after)}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm">
            <span className="text-gray-500">Page {page} of {pages}, {total} in all</span>
            <div className="flex gap-2">
              <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </SectionCard>
    </Page>
  );
};

export default GrowshipWallet;
