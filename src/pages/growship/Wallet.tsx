import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, Loader2, FileDown } from 'lucide-react';
import { walletAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { formatDate, isoDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, FilterBar, Field, SelectInput, Chip,
} from '../../components/erp';
import { DEFAULT_FROM, DEFAULT_TO, RangeFields } from '../payments/common';
import { WalletCard, useStoreWallet } from '../../components/growship/WalletCard';
import { growshipAPI, type GsWalletLeg } from '@/lib/v2/growship';
import {
  isShipDebit, isShipRefund, linkMoves, readMovesSince, type WalletLinks, type WalletMove,
} from '@/lib/growshipWallet';

type Movement = WalletMove;

const PAGE_SIZE = 25;
/** The statement reads at most this many movements of each kind. */
const STATEMENT_CAP = 5000;

const categoryText = (c: string | null | undefined) => String(c ?? '').replace(/_/g, ' ') || 'Other';
const at = (t: Movement) => Date.parse(t.created_at) || 0;
const newestFirst = (a: Movement, b: Movement) => at(b) - at(a);

/**
 * The wallet Growcord Ship freight comes off: the balance, Add money, and the history with the parcel's AWB where
 * Growcord Ship recorded one. "Shipping only" is the freight taken AND the refunds of it (category refund: a booking
 * no courier took is refunded in the same second, a cancel less its fee), each debit tagged Refunded with the net for
 * its order (owner 26 Nov 2026, SM-13386 and SM-13402 showed a charge without its refund). A statement for any
 * dates downloads as CSV. The whole wallet, with message charges and service prices, stays in Settings, Wallet.
 */
const GrowshipWallet: React.FC = () => {
  const { hasPerm } = useAuth();
  // The AWB comes from Growcord Ship's own record, which needs shipments.read.
  const canAwb = hasPerm('shipments.read');
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(true);
  const [category, setCategory] = useState<'shipping' | ''>('shipping');
  const [direction, setDirection] = useState<'' | 'credit' | 'debit'>('');
  const [page, setPage] = useState(1);
  /** The page as the server answered it. */
  const [pageRows, setPageRows] = useState<Movement[] | null>(null);
  /** Shipping only: the Growcord Ship refunds from the oldest row of the page on (their own category). */
  const [refunds, setRefunds] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [legs, setLegs] = useState<GsWalletLeg[]>([]);
  const [legsError, setLegsError] = useState<string | null>(null);
  const [range, setRange] = useState({ from: DEFAULT_FROM(), to: DEFAULT_TO() });
  const [statementBusy, setStatementBusy] = useState(false);
  const [statement, setStatement] = useState<{ rows: number; credit: number; debit: number; capped: boolean } | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  const shippingOnly = category === 'shipping';

  const load = () => {
    setError(null);
    (async () => {
      if (shippingOnly && direction === 'credit') {
        // Money in, shipping only: the refunds of Growcord Ship freight (category refund).
        const list: any = await walletAPI.getTransactions({ page, limit: PAGE_SIZE, category: 'refund', direction: 'credit' });
        const arr: Movement[] = Array.isArray(list) ? list : [];
        setPageRows(arr.filter((t) => isShipRefund(t)));
        setRefunds([]);
        setTotal(typeof list?.total === 'number' ? list.total : arr.length);
        return;
      }
      const list: any = await walletAPI.getTransactions({ page, limit: PAGE_SIZE, ...(category ? { category } : {}), ...(direction ? { direction } : {}) });
      const arr: Movement[] = Array.isArray(list) ? list : [];
      setTotal(typeof list?.total === 'number' ? list.total : arr.length);
      if (shippingOnly) {
        // The refunds of these debits sit in category refund: read back to the oldest debit on the page.
        const since = arr.length ? isoDate(arr[arr.length - 1].created_at) : isoDate(new Date());
        const { rows: back } = await readMovesSince('refund', since, { direction: 'credit', cap: 1000 });
        const refs = new Set(arr.map((d) => String(d.reference ?? '')).filter(Boolean));
        setRefunds(back.filter((r) => isShipRefund(r, refs)));
      } else {
        setRefunds([]);
      }
      setPageRows(arr);
    })().catch((e) => { setPageRows([]); setRefunds([]); setError(errorText(e, 'The wallet history could not be read.')); });
  };
  useEffect(load, [page, category, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ship's own record of the movements (newest 200): the AWB behind each wallet transaction, and which refund is
  // for which parcel.
  useEffect(() => {
    if (!canAwb) return;
    growshipAPI.walletLegs(200).then(setLegs).catch((e) => { setLegs([]); setLegsError(errorText(e, 'Growcord Ship could not be read.')); });
  }, [canAwb]);
  /** The newest shown row of each order whose net is known: the net shows there once. */
  const anchorsOf = (links: WalletLinks, shown: Movement[]) => {
    const out = new Set<string>();
    for (const order of links.netOf.keys()) {
      const mine = shown.filter((t) => links.orderOf.get(t.id) === order);
      if (mine.length) out.add(mine.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).id);
    }
    return out;
  };

  /** How the rows link to Growcord Ship's parcels (exact links only), and the rows shown. */
  const { links, anchors, rows } = useMemo(() => {
    const base = pageRows ?? [];
    const extraRefunds = refunds.filter((r) => !base.some((x) => x.id === r.id));
    const l = linkMoves([...base, ...extraRefunds], legs, canAwb);
    // Shown: the page, the refunds linked to its charges, and other Growcord Ship refunds between its newest and
    // oldest rows (each as its own line when it is not linked).
    let shown = base;
    if (shippingOnly && direction !== 'debit' && extraRefunds.length) {
      const lo = base.length ? at(base[base.length - 1]) : 0;
      const hi = page === 1 || !base.length ? Infinity : at(base[0]);
      const extra = extraRefunds.filter((r) => {
        const d = l.debitOf.get(r.id);
        return (d && base.some((x) => x.id === d.id)) || (at(r) >= lo && at(r) <= hi);
      });
      shown = [...base, ...extra].sort(newestFirst);
    }
    return { links: l, anchors: anchorsOf(l, shown), rows: pageRows === null ? null : shown };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, refunds, legs, canAwb, shippingOnly, direction, page]);

  /** The order and AWB of a row: one reading for the screen and the CSV. */
  const orderText = (l: WalletLinks, t: Movement) => l.orderOf.get(t.id) ?? t.reference ?? '';
  const awbText = (l: WalletLinks, t: Movement) => l.awbOf.get(t.id) ?? '';
  const linkText = (l: WalletLinks, t: Movement) => (l.refundsOf.has(t.id) ? 'Refunded'
    : l.debitOf.has(t.id) ? `Refund of the charge for ${orderText(l, l.debitOf.get(t.id)!) || 'this parcel'}`
      : l.unlinked.has(t.id) ? `Refund (not linked): ${l.unlinked.get(t.id)}` : '');

  const columnsFor = (l: WalletLinks, anchor: Set<string>): CsvColumn<Movement>[] => [
    { key: 'created_at', label: 'Date', format: (t) => formatDate(t.created_at, 'yyyy-MM-dd HH:mm', '') },
    { key: 'direction', label: 'In or out', format: (t) => (t.direction === 'credit' ? 'Money in' : 'Money out') },
    { key: 'category', label: 'Category', format: (t) => categoryText(t.category) },
    { key: 'reference', label: 'Order or reference', format: (t) => orderText(l, t) },
    ...(canAwb ? [{ key: 'awb', label: 'AWB', format: (t: Movement) => awbText(l, t) }] : []),
    { key: 'note', label: 'Note', format: (t) => t.note ?? '' },
    { key: 'amount', label: 'Amount', format: (t) => (t.direction === 'debit' ? -Number(t.amount ?? 0) : Number(t.amount ?? 0)).toFixed(2) },
    { key: 'balance_after', label: 'Balance after', format: (t) => Number(t.balance_after ?? 0).toFixed(2) },
    { key: 'refunded', label: 'Refund', format: (t) => linkText(l, t) },
    { key: 'net', label: 'Net for the order', format: (t) => (anchor.has(t.id) ? (l.netOf.get(orderText(l, t)) ?? 0).toFixed(2) : '') },
  ];

  /**
   * Every movement in the dates, newest first. Shipping only: the freight debits and the Growcord Ship refunds (their
   * own category), read apart and put together, each refund beside its debit.
   */
  const downloadStatement = async () => {
    if (!range.from || !range.to) return;
    setStatementBusy(true); setStatementError(null); setStatement(null);
    try {
      const inRange = (t: Movement) => { const day = isoDate(t.created_at); return day >= range.from && day <= range.to; };
      let out: Movement[];
      let capped = false;
      if (shippingOnly) {
        const debits = direction === 'credit' ? { rows: [] as Movement[], capped: false } : await readMovesSince('shipping', range.from, { cap: STATEMENT_CAP });
        const back = direction === 'debit' && !debits.rows.length ? { rows: [] as Movement[], capped: false } : await readMovesSince('refund', range.from, { direction: 'credit', cap: STATEMENT_CAP });
        const ds = debits.rows.filter((t) => isShipDebit(t) && inRange(t));
        const refs = new Set(ds.map((d) => String(d.reference ?? '')).filter(Boolean));
        const rs = back.rows.filter((r) => isShipRefund(r, refs) && inRange(r));
        out = [...ds, ...(direction === 'debit' ? [] : rs)].sort(newestFirst);
        capped = debits.capped || back.capped;
        const l = linkMoves([...ds, ...rs], legs, canAwb);
        downloadCsv(`growcord-ship-wallet-${range.from}-to-${range.to}`, columnsFor(l, anchorsOf(l, out)), out);
      } else {
        const all = await readMovesSince('', range.from, { ...(direction ? { direction } : {}), cap: STATEMENT_CAP });
        out = all.rows.filter(inRange);
        capped = all.capped;
        const l = linkMoves(out, legs, canAwb);
        downloadCsv(`growcord-ship-wallet-${range.from}-to-${range.to}`, columnsFor(l, anchorsOf(l, out)), out);
      }
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

      <WalletCard wallet={wallet} error={walletError} onChanged={() => { reloadWallet(); if (page === 1) load(); else setPage(1); }} />

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
        description={canAwb
          ? (legsError ? `Newest first. The AWB could not be read: ${legsError}` : 'Newest first. The AWB shows where Growcord Ship recorded which parcel the money was for.')
          : 'Newest first. The AWB column is not shown and refunds are not linked to their charges: both need the shipments.read permission, so a refund shows as its own line.'}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Show">
              <SelectInput value={category} onChange={(e) => { setCategory(e.target.value as 'shipping' | ''); setPage(1); }} aria-label="Which movements">
                <option value="shipping">Shipping and its refunds</option>
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
              <Th>Date</Th><Th>Category</Th><Th>Order or reference</Th>{canAwb && <Th>AWB</Th>}<Th>Note</Th><Th num>Amount</Th><Th num>Balance after</Th>
            </THead>
            <TBody>
              {rows === null && <EmptyRow colSpan={canAwb ? 7 : 6}>Reading...</EmptyRow>}
              {rows && rows.length === 0 && <EmptyRow colSpan={canAwb ? 7 : 6}>{category === 'shipping' ? 'No shipping charge has been taken from the wallet yet.' : 'No movement yet.'}</EmptyRow>}
              {(rows ?? []).map((t) => {
                const refunded = links.refundsOf.has(t.id);
                const forDebit = links.debitOf.get(t.id);
                const unlinked = links.unlinked.get(t.id);
                const order = orderText(links, t);
                return (
                <Tr key={t.id} className={forDebit ? 'bg-emerald-50/40' : undefined}>
                  <Td muted className="whitespace-nowrap">{formatDate(t.created_at, 'dd MMM yyyy, HH:mm', '')}</Td>
                  <Td className="capitalize">{categoryText(t.category)}</Td>
                  <Td>{order}</Td>
                  {canAwb && <Td className="font-mono text-xs">{awbText(links, t)}</Td>}
                  <Td className="max-w-xs text-xs text-gray-500">
                    {(refunded || anchors.has(t.id)) && (
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        {refunded && <Chip tone="green">Refunded</Chip>}
                        {anchors.has(t.id) && <span className="font-medium text-gray-700">Net for the order {fmtRupees(links.netOf.get(order) ?? 0)}</span>}
                      </div>
                    )}
                    {forDebit && (
                      <div className="mb-0.5"><Chip tone="green">Refund</Chip> <span className="text-gray-700">of the charge for {orderText(links, forDebit) || 'this parcel'}</span></div>
                    )}
                    {unlinked && (
                      <div className="mb-0.5"><Chip tone="amber">Refund (not linked)</Chip> <span className="text-gray-700">{unlinked}</span></div>
                    )}
                    <div className="truncate" title={t.note ?? undefined}>{t.note || ''}</div>
                  </Td>
                  <Td num className={t.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'}>
                    {t.direction === 'credit' ? '+' : '-'}{fmtRupees(t.amount)}
                  </Td>
                  <Td num muted>{fmtRupees(t.balance_after)}</Td>
                </Tr>
                );
              })}
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
