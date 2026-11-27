import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, Loader2, FileDown } from 'lucide-react';
import { walletAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { formatDate, isoDate, todayIso } from '../../utils/date';
import { addDays } from '../../components/dashboard/periods';
import {
  Page, PageHeader, SectionCard, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, FilterBar, Field, SelectInput, Chip,
} from '../../components/erp';
import { DEFAULT_FROM, DEFAULT_TO, RangeFields } from '../payments/common';
import { WalletCard, useStoreWallet } from '../../components/growship/WalletCard';
import {
  growshipAPI, parcelOfOrder, readConsignments, type GsConsignment, type GsWalletLeg,
} from '@/lib/v2/growship';
import {
  isShipDebit, isShipRefund, linkMoves, netFor, plainNote, type WalletLinks, type WalletMove,
} from '@/lib/growshipWallet';
import { readCorrectionsSince, readMovesSince } from '@/lib/growshipWalletRead';

type Movement = WalletMove;

const PAGE_SIZE = 25;
/** The statement reads at most this many movements of each kind. */
const STATEMENT_CAP = 5000;
/** The parcels read for the rows on screen start this many days before the oldest row (a refund or a correction of an
 * older parcel can sit on the page). */
const PARCEL_DAYS_BEFORE = 3;

const categoryText = (c: string | null | undefined) => String(c ?? '').replace(/_/g, ' ') || 'Other';
const at = (t: Movement) => Date.parse(t.created_at) || 0;
const newestFirst = (a: Movement, b: Movement) => at(b) - at(a);
/** The store day of the oldest row (rows come newest first), today when there is none. */
const sinceOf = (rows: Movement[]) => (rows.length ? isoDate(rows[rows.length - 1].created_at) : isoDate(new Date()));

/**
 * The order and the AWB of a wallet line, one reading for the screen and the CSV: the order from the links (a refund
 * names the order of the charge it returns), else the order of the parcel its reference names (a cancel refund names
 * the Growcord Ship number), else its own reference. The AWB from Growcord Ship's record of the movement, else from
 * the order's parcel: a wallet debit is written before the courier gives the AWB, so the debit itself never has one.
 */
function namesFor(l: WalletLinks, parcels: GsConsignment[]) {
  const byNumber = new Map(parcels.filter((c) => c.consignment_number).map((c) => [String(c.consignment_number), c]));
  const order = (t: Movement) => l.orderOf.get(t.id)
    ?? (t.reference ? byNumber.get(String(t.reference))?.shipper_reference ?? undefined : undefined)
    ?? t.reference ?? '';
  const awb = (t: Movement) => l.awbOf.get(t.id)
    ?? parcelOfOrder(parcels, order(t))?.awb
    ?? (t.reference ? byNumber.get(String(t.reference))?.awb : null)
    ?? '';
  return { order, awb };
}

/**
 * The wallet Growcord Ship freight comes off: the balance, Add money, and the history with the parcel's AWB. "Shipping
 * only" is the freight taken AND the refunds of it (category refund: a booking no courier took is refunded in the same
 * second, a cancel less its fee) AND a person's correction of a Growcord Ship order (an adjustment or a manual credit
 * naming the order), each debit tagged Refunded with the net for its order (owner 26 Nov 2026, SM-13386 and SM-13402
 * showed a charge without its refund). Every refund names the order it belongs to (lib/growshipWallet.ts linkMoves);
 * the notes read in plain words (plainNote), the stored notes unchanged. A statement for any dates downloads as CSV.
 * The whole wallet, with message charges and service prices, stays in Settings, Wallet.
 */
const GrowshipWallet: React.FC = () => {
  const { hasPerm } = useAuth();
  // The AWB comes from Growcord Ship's own records, which need shipments.read.
  const canAwb = hasPerm('shipments.read');
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(true);
  const [category, setCategory] = useState<'shipping' | ''>('shipping');
  const [direction, setDirection] = useState<'' | 'credit' | 'debit'>('');
  const [page, setPage] = useState(1);
  /** The page as the server answered it. */
  const [pageRows, setPageRows] = useState<Movement[] | null>(null);
  /** Shipping only: the Growcord Ship refunds and the corrections from the oldest row of the page on (their own categories). */
  const [extras, setExtras] = useState<Movement[]>([]);
  /** Shipping only, money in: the charges since the oldest refund, read only to name each refund's order (not shown). */
  const [context, setContext] = useState<Movement[]>([]);
  /** Growcord Ship's parcels of the days on screen (one read): the AWB and order of each line. */
  const [parcels, setParcels] = useState<GsConsignment[]>([]);
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
        // Money in, shipping only: the refunds of Growcord Ship freight (category refund) and the credit corrections;
        // the charges from a day before the oldest refund are read only to name each refund's order.
        const list: any = await walletAPI.getTransactions({ page, limit: PAGE_SIZE, category: 'refund', direction: 'credit' });
        const arr: Movement[] = Array.isArray(list) ? list : [];
        const since = sinceOf(arr);
        const [debits, fixes] = await Promise.all([
          readMovesSince('shipping', addDays(since, -1), { direction: 'debit', cap: 1000 }),
          readCorrectionsSince(since, { direction: 'credit', cap: 1000 }),
        ]);
        setExtras(fixes.rows);
        setContext(debits.rows);
        setPageRows(arr.filter((t) => isShipRefund(t)));
        setTotal(typeof list?.total === 'number' ? list.total : arr.length);
        return;
      }
      const list: any = await walletAPI.getTransactions({ page, limit: PAGE_SIZE, ...(category ? { category } : {}), ...(direction ? { direction } : {}) });
      const arr: Movement[] = Array.isArray(list) ? list : [];
      setTotal(typeof list?.total === 'number' ? list.total : arr.length);
      if (shippingOnly) {
        // The refunds of these debits sit in category refund, a person's corrections in theirs: read back to the
        // oldest debit on the page.
        const since = sinceOf(arr);
        const [{ rows: back }, fixes] = await Promise.all([
          readMovesSince('refund', since, { direction: 'credit', cap: 1000 }),
          readCorrectionsSince(since, { ...(direction ? { direction } : {}), cap: 1000 }),
        ]);
        const refs = new Set(arr.map((d) => String(d.reference ?? '')).filter(Boolean));
        setExtras([...back.filter((r) => isShipRefund(r, refs)), ...fixes.rows]);
      } else {
        setExtras([]);
      }
      setContext([]);
      setPageRows(arr);
    })().catch((e) => { setPageRows([]); setExtras([]); setContext([]); setError(errorText(e, 'The wallet history could not be read.')); });
  };
  useEffect(load, [page, category, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ship's own record of the movements (newest 200): the AWB behind each wallet transaction, and which refund is
  // for which parcel.
  useEffect(() => {
    if (!canAwb) return;
    growshipAPI.walletLegs(200).then(setLegs).catch((e) => { setLegs([]); setLegsError(errorText(e, 'Growcord Ship could not be read.')); });
  }, [canAwb]);

  // One read for the rows on screen: Growcord Ship's parcels booked from a few days before the oldest row to the
  // newest (today on the first page), for each line's AWB and order.
  useEffect(() => {
    const base = pageRows ?? [];
    if (!canAwb || !base.length) { setParcels([]); return undefined; }
    let live = true;
    const from = addDays(isoDate(base[base.length - 1].created_at), -PARCEL_DAYS_BEFORE);
    const to = page === 1 ? todayIso() : isoDate(base[0].created_at);
    growshipAPI.consignments({ from, to, limit: 200 })
      .then((p) => { if (live) setParcels(p.items); })
      .catch(() => { if (live) setParcels([]); });
    return () => { live = false; };
  }, [pageRows, canAwb, page]);

  /**
   * Where each order's net shows (its newest line), only for an order whose every line is shown and none sits at an
   * open edge of what was read: no partial nets.
   */
  const netsOf = (links: WalletLinks, shown: Movement[], edge: Parameters<typeof netFor>[3]) => {
    const out = new Map<string, number>();
    for (const [order, lines] of links.linesOf) {
      const net = netFor(links, order, shown, edge);
      if (net === null) continue;
      out.set(lines.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).id, net);
    }
    return out;
  };
  const ordersOf = (ps: GsConsignment[]) => ps.map((c) => String(c.shipper_reference ?? '').trim()).filter(Boolean);

  /** How the rows link to Growcord Ship's parcels and orders, and the rows shown. */
  const { links, nets, rows } = useMemo(() => {
    const base = pageRows ?? [];
    const onPage = new Set(base.map((x) => x.id));
    const more = extras.filter((r) => !onPage.has(r.id));
    const l = linkMoves([...base, ...more, ...context.filter((c) => !onPage.has(c.id))], legs, ordersOf(parcels));
    // Shown: the page, the refunds linked to its charges, the corrections of its orders, and other Growcord Ship
    // refunds and corrections between its newest and oldest rows (each as its own line when it is not linked).
    let shown = base;
    if (shippingOnly && more.length) {
      const lo = base.length ? at(base[base.length - 1]) : 0;
      const hi = page === 1 || !base.length ? Infinity : at(base[0]);
      const pageOrders = new Set(base.map((x) => l.orderOf.get(x.id) ?? '').filter(Boolean));
      const extra = more.filter((r) => {
        const fix = l.corrections.has(r.id);
        // A correction read that names no Growcord Ship order is not shipping; refunds are money in only.
        if (!fix && r.category !== 'refund') return false;
        if (direction && r.direction !== direction) return false;
        const d = l.debitOf.get(r.id);
        const beside = fix ? pageOrders.has(l.orderOf.get(r.id) ?? '') : !!d && onPage.has(d.id);
        return beside || (at(r) >= lo && at(r) <= hi);
      });
      shown = [...base, ...extra].sort(newestFirst);
    }
    // The page's edges: older rows are on the next pages, newer ones on the previous pages.
    const edge = {
      lo: base.length ? at(base[base.length - 1]) : 0,
      hi: base.length ? at(base[0]) : Infinity,
      olderOpen: page * PAGE_SIZE < total,
      newerOpen: page > 1,
    };
    return { links: l, nets: netsOf(l, shown, edge), rows: pageRows === null ? null : shown };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, extras, context, parcels, legs, shippingOnly, direction, page, total]);

  const names = useMemo(() => namesFor(links, parcels), [links, parcels]);
  /** What a line is to its order, in words (the CSV's Refund column and the chips on screen). */
  const linkText = (l: WalletLinks, n: ReturnType<typeof namesFor>, t: Movement) => (l.refundsOf.has(t.id) ? 'Refunded'
    : l.debitOf.has(t.id) ? `Refund of the charge for ${n.order(l.debitOf.get(t.id)!) || 'this parcel'}`
      : l.corrections.has(t.id) ? `Correction for ${n.order(t)}`
        : l.unlinked.has(t.id) ? 'Refund' : '');

  const columnsFor = (l: WalletLinks, netAt: Map<string, number>, n: ReturnType<typeof namesFor>): CsvColumn<Movement>[] => [
    { key: 'created_at', label: 'Date', format: (t) => formatDate(t.created_at, 'yyyy-MM-dd HH:mm', '') },
    { key: 'direction', label: 'In or out', format: (t) => (t.direction === 'credit' ? 'Money in' : 'Money out') },
    { key: 'category', label: 'Category', format: (t) => categoryText(t.category) },
    { key: 'reference', label: 'Order or reference', format: (t) => n.order(t) },
    ...(canAwb ? [{ key: 'awb', label: 'AWB', format: (t: Movement) => n.awb(t) }] : []),
    { key: 'note', label: 'Note', format: (t) => plainNote(t.note) },
    { key: 'amount', label: 'Amount', format: (t) => (t.direction === 'debit' ? -Number(t.amount ?? 0) : Number(t.amount ?? 0)).toFixed(2) },
    { key: 'balance_after', label: 'Balance after', format: (t) => Number(t.balance_after ?? 0).toFixed(2) },
    { key: 'refunded', label: 'Refund', format: (t) => linkText(l, n, t) },
    { key: 'net', label: 'Net for the order', format: (t) => (netAt.has(t.id) ? (netAt.get(t.id) ?? 0).toFixed(2) : '') },
  ];

  /**
   * Every movement in the dates, newest first. Shipping only: the freight debits, the Growcord Ship refunds and the
   * corrections of Growcord Ship orders (their own categories), read apart and put together, each refund beside its
   * debit. The AWB and order come from the parcels booked from a week before the dates to their end.
   */
  const downloadStatement = async () => {
    if (!range.from || !range.to) return;
    setStatementBusy(true); setStatementError(null); setStatement(null);
    try {
      const inRange = (t: Movement) => { const day = isoDate(t.created_at); return day >= range.from && day <= range.to; };
      // A week before the range is read too, only to link pairs that cross its start; nothing before that is known,
      // so an order with a line that far back gets no net. Everything newer than the range is read (to today).
      const fromWide = addDays(range.from, -7);
      const edge = { lo: Date.parse(`${fromWide}T00:00:00Z`), hi: Infinity, olderOpen: true, newerOpen: false };
      const ps = canAwb ? (await readConsignments({ from: fromWide, to: range.to }).catch(() => ({ items: [] as GsConsignment[] }))).items : [];
      let out: Movement[];
      let capped = false;
      let l: WalletLinks;
      if (shippingOnly) {
        const [debits, back, fixes] = await Promise.all([
          readMovesSince('shipping', fromWide, { cap: STATEMENT_CAP }),
          readMovesSince('refund', fromWide, { direction: 'credit', cap: STATEMENT_CAP }),
          readCorrectionsSince(fromWide, { ...(direction ? { direction } : {}), cap: STATEMENT_CAP }),
        ]);
        const ds = debits.rows.filter(isShipDebit);
        const refs = new Set(ds.map((d) => String(d.reference ?? '')).filter(Boolean));
        const rs = back.rows.filter((r) => isShipRefund(r, refs));
        l = linkMoves([...ds, ...rs, ...fixes.rows], legs, ordersOf(ps));
        const fixesOfOrders = fixes.rows.filter((t) => l.corrections.has(t.id));
        out = [
          ...(direction === 'credit' ? [] : ds.filter(inRange)),
          ...(direction === 'debit' ? [] : rs.filter(inRange)),
          ...fixesOfOrders.filter(inRange),
        ].sort(newestFirst);
        capped = debits.capped || back.capped || fixes.capped;
      } else {
        const all = await readMovesSince('', fromWide, { ...(direction ? { direction } : {}), cap: STATEMENT_CAP });
        out = all.rows.filter(inRange);
        capped = all.capped;
        l = linkMoves(all.rows, legs, ordersOf(ps));
      }
      downloadCsv(`growcord-ship-wallet-${range.from}-to-${range.to}`, columnsFor(l, netsOf(l, out, edge), namesFor(l, ps)), out);
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
          ? (legsError ? `Newest first. The AWB could not be read: ${legsError}` : "Newest first. The AWB is the courier's number of the order's parcel.")
          : 'Newest first. The AWB column is not shown: it needs the shipments.read permission.'}
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
                const fix = links.corrections.has(t.id);
                const unlinked = links.unlinked.has(t.id);
                const order = names.order(t);
                const note = plainNote(t.note);
                return (
                <Tr key={t.id} className={forDebit ? 'bg-emerald-50/40' : fix ? 'bg-blue-50/40' : undefined}>
                  <Td muted className="whitespace-nowrap">{formatDate(t.created_at, 'dd MMM yyyy, HH:mm', '')}</Td>
                  <Td className="capitalize">{categoryText(t.category)}</Td>
                  <Td>{order}</Td>
                  {canAwb && <Td className="font-mono text-xs">{names.awb(t)}</Td>}
                  <Td className="max-w-xs text-xs text-gray-500">
                    {(refunded || nets.has(t.id)) && (
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        {refunded && <Chip tone="green">Refunded</Chip>}
                        {nets.has(t.id) && <span className="font-medium text-gray-700">Net for the order {fmtRupees(nets.get(t.id) ?? 0)}</span>}
                      </div>
                    )}
                    {forDebit && (
                      <div className="mb-0.5"><Chip tone="green">Refund</Chip> <span className="text-gray-700">of the charge for {names.order(forDebit) || 'this parcel'}</span></div>
                    )}
                    {fix && (
                      <div className="mb-0.5"><Chip tone="blue">Correction</Chip> <span className="text-gray-700">for {order}</span></div>
                    )}
                    {unlinked && (
                      <div className="mb-0.5"><Chip tone="neutral">Refund</Chip></div>
                    )}
                    <div className="truncate" title={note || undefined}>{note}</div>
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
