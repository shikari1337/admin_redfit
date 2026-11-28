import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, Loader2, FileDown, Info } from 'lucide-react';
import { errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  isShipRefund, linkMoves, walletForParcels, walletGap, type ParcelWallet, type WalletMove,
} from '@/lib/growshipWallet';
import { readMovesSince } from '@/lib/growshipWalletRead';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, type CsvColumn } from '@/lib/csv';
import { formatDate } from '../../utils/date';
import { addDays } from '../../components/dashboard/periods';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, FilterBar, Chip,
} from '../../components/erp';
import { DEFAULT_FROM, DEFAULT_TO, RangeFields } from '../payments/common';
import {
  chargeSplit, finalAmount, growshipAPI, gsStatusText, gramsText, isCancelled, neverCharged, readConsignments, readWalletLegs,
  type GsChargeSplit, type GsConsignment, type GsWalletLeg,
} from '@/lib/v2/growship';

const PAGE_SIZE = 25;
/** Parcels are read 200 at a time (the door's most) up to this many for the totals and the file. */
const READ_CAP = 2000;
/** "CSV with charge lines" reads the lines of at most this many parcels (the newest of the period). */
const LINES_CAP = 200;
/** The wallet is read from this many days before the period, only to link a refund to a charge across its start. */
const PAIR_DAYS = 7;
/** The wallet check reads at most this many movements (every category, newest first). */
const MOVES_CAP = 5000;

const money = (n: number | null | undefined) => (n == null ? '' : fmtRupees(n));
const sum = (rows: GsConsignment[], f: (c: GsConsignment) => number | null | undefined) =>
  Math.round(rows.reduce((s, c) => s + (Number(f(c)) || 0), 0) * 100) / 100;


/**
 * What Growcord Ship charged, parcel by parcel, for a period (owner 26 Nov 2026: "billing details charges and
 * other details"): freight, the COD fee, return charges and other lines from each parcel's own charge lines,
 * GST, the amount at booking and the final amount, with totals and a CSV. Read from Growcord Ship's own parcel
 * list (`GET /api/v2/ship/consignments`); the charge lines of the parcels on screen are read as they show.
 * Each parcel is checked against the wallet (owner 27 Nov 2026: "data in wallet and billing isn't matching"): what
 * the wallet took and gave back for its order number (lib/growshipWallet.ts walletForParcels) against its Final; a
 * parcel that differs says so in its row and the page says how many. Amounts are shown as recorded, never changed.
 */
const GrowshipBilling: React.FC = () => {
  const { hasPerm } = useAuth();
  // The parcels are Growcord Ship's own record (shipments.read); the refunds are the wallet's (billing.read, the page gate).
  const canShip = hasPerm('shipments.read');
  const canBilling = hasPerm('billing.read');
  const [range, setRange] = useState({ from: DEFAULT_FROM(), to: DEFAULT_TO() });
  /** Parcel id to what the wallet got back for it, in rupees (a refunded booking is not paid). */
  const [refundOf, setRefundOf] = useState<Map<string, number>>(new Map());
  const [rows, setRows] = useState<GsConsignment[] | null>(null);
  /** The wallet's movements from a week before the period to today, and Ship's own record of them; null when not read. */
  const [wallet, setWallet] = useState<{ moves: WalletMove[]; legs: GsWalletLeg[]; capped: boolean } | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [capped, setCapped] = useState(false);
  /** Not every one of Growcord Ship's own wallet records for these days was read (readWalletLegs). */
  const [legsCapped, setLegsCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<Record<string, GsConsignment>>({});
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const asked = useRef(new Set<string>());
  /** Every parcel read whole so far (the state above draws the table; this is what a file is built from). */
  const known = useRef<Record<string, GsConsignment>>({});

  useEffect(() => {
    let live = true;
    setRows(null); setError(null); setPage(1); setCapped(false); setLegsCapped(false); setWallet(null); setWalletError(false);
    if (!canShip) { setRows([]); setError('The parcels need the shipments.read permission, the same as the shipments board.'); return () => { live = false; }; }
    (async () => {
      const { items: out, capped: cut } = await readConsignments({ from: range.from, to: range.to }, READ_CAP);
      if (live && cut) setCapped(true);
      // The wallet, every category (a correction is an adjustment or a manual credit), from a week before the period
      // (to link a refund to a charge across its start) to today (a refund or a correction can come later). Ship's own
      // record of the movements is read for the period with the same week each side (a refund pairs with its charge
      // within it), at the wallet's own cap, not only its newest 200 (GS-AUDIT-P).
      const [shipLegs, back] = await Promise.all([
        readWalletLegs({ from: addDays(range.from, -PAIR_DAYS), to: addDays(range.to, PAIR_DAYS) }, MOVES_CAP)
          .catch(() => ({ legs: [] as GsWalletLeg[], capped: false })),
        canBilling
          ? readMovesSince('', addDays(range.from, -PAIR_DAYS), { cap: MOVES_CAP }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const legs = shipLegs.legs;
      // What came back to the wallet for each parcel itself (its Final is the booking less it): Ship's own refund
      // records by parcel, else the wallet's Growcord Ship refunds by the parcel's number (a cancel names it).
      const refunds = new Map<string, number>();
      for (const l of legs) {
        if (l.leg === 'refund' && l.consignment_id && Number(l.amount) > 0) {
          refunds.set(String(l.consignment_id), (refunds.get(String(l.consignment_id)) ?? 0) + Number(l.amount));
        }
      }
      const byNumber = new Map(out.map((c) => [String(c.consignment_number ?? ''), c.id]));
      for (const r of back?.rows ?? []) {
        const id = r.reference ? byNumber.get(String(r.reference)) : undefined;
        if (id && isShipRefund(r) && !legs.some((l) => l.leg === 'refund' && String(l.consignment_id) === id)) {
          refunds.set(id, (refunds.get(id) ?? 0) + Number(r.amount));
        }
      }
      if (live) {
        setRefundOf(refunds);
        // A partial record would warn wrongly: the wallet check waits, and the page says why.
        setWallet(back ? { moves: back.rows, legs, capped: back.capped || shipLegs.capped } : null);
        setLegsCapped(shipLegs.capped);
        setWalletError(canBilling && !back);
        setRows(out);
      }
    })().catch((e) => { if (live) { setRows([]); setError(errorText(e, 'Growcord Ship could not be read.')); } });
    return () => { live = false; };
  }, [range.from, range.to, canShip]);

  const refunded = (c: GsConsignment) => Math.round((refundOf.get(c.id) ?? 0) * 100) / 100;
  /** A parcel that was not paid for in the end: cancelled (its fee only), no courier took it, or refunded. */
  const notCharged = (c: GsConsignment) => isCancelled(c) || neverCharged(c) || refunded(c) > 0;
  /** Why a parcel's booking amount is not what it cost, in words (also the CSV's note). */
  const noteOf = (c: GsConsignment): string => (neverCharged(c)
    ? 'No courier took it: nothing was charged, the money went back to the wallet.'
    : isCancelled(c) ? 'Cancelled: the freight went back to the wallet less the cancellation fee.'
      : refunded(c) > 0 ? `Refunded ${fmtRupees(refunded(c))} to the wallet.` : '');

  const all = rows ?? [];
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

  /** The charge lines of the given parcels, three at a time, each read once. */
  const readDetails = async (ids: string[]) => {
    const todo = ids.filter((id) => !asked.current.has(id));
    todo.forEach((id) => asked.current.add(id));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, todo.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= todo.length) return;
        try {
          const d = await growshipAPI.consignment(todo[i]);
          known.current = { ...known.current, [todo[i]]: d };
          setDetails(known.current);
        } catch {
          asked.current.delete(todo[i]);
        }
      }
    }));
  };
  // Only the parcels on screen are read whole.
  useEffect(() => { void readDetails(shown.map((c) => c.id)); }, [rows, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const splitIn = (m: Record<string, GsConsignment>, c: GsConsignment): GsChargeSplit | null => (m[c.id] ? chargeSplit(m[c.id].charges) : null);
  /**
   * What the parcel finally cost (lib/v2/growship.ts finalAmount): a cancelled parcel only its cancellation fee
   * (null until its lines are read), one no courier took nothing, otherwise the final or the booking plus changes.
   */
  const finalIn = (m: Record<string, GsConsignment>, c: GsConsignment): number | null => {
    const back = refunded(c);
    const own = finalAmount(c, m[c.id]);
    if (back > 0 && !neverCharged(c) && (own == null || !isCancelled(c)) && c.sell_with_gst != null) {
      return Math.max(0, Math.round((c.sell_with_gst - back) * 100) / 100);
    }
    return own;
  };

  /**
   * Each parcel against the wallet, with the Finals known in `m`: what the wallet took and gave back for its order
   * (parcels of one order together), the warning when that differs from the Final, and the totals of the check. Null
   * when the wallet was not read, or had more movements than were read (a partial wallet would warn wrongly). A
   * parcel paid at the counter does not go through the wallet and is not checked.
   */
  const walletCheckIn = (m: Record<string, GsConsignment>) => {
    if (!wallet || wallet.capped || !rows) return null;
    const links = linkMoves(wallet.moves, wallet.legs, rows.map((c) => String(c.shipper_reference ?? '').trim()).filter(Boolean));
    const of = walletForParcels(rows, wallet.moves, wallet.legs, links, range);
    const byId = new Map(rows.map((c) => [c.id, c]));
    const gaps = new Map<string, ReturnType<typeof walletGap>>();
    const seen = new Set<ParcelWallet>();
    let differ = 0; let unknown = 0; let backC = 0; let netC = 0; let finalC = 0;
    for (const w of of.values()) {
      if (seen.has(w)) continue;
      seen.add(w);
      backC += Math.round(w.back * 100);
      const parcels = w.parcels.map((id) => byId.get(id)).filter(Boolean) as GsConsignment[];
      if (parcels.some((c) => c.payment_mode === 'counter_paid')) continue;
      const gap = walletGap(w, parcels.map((c) => finalIn(m, c)));
      for (const id of w.parcels) gaps.set(id, gap);
      if (gap.final == null) { unknown += parcels.length; continue; }
      if (gap.differs) differ += parcels.length;
      netC += Math.round(w.net * 100);
      finalC += Math.round(gap.final * 100);
    }
    return { of, gaps, differ, unknown, back: backC / 100, net: netC / 100, finals: finalC / 100 };
  };
  const check = useMemo(() => walletCheckIn(details), [wallet, rows, details, refundOf, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The totals agree with the Final column: what was paid is each parcel's final (a kept cancellation fee counts, a
   * refunded booking counts only what was kept, a booking no courier took counts nothing), split into before GST and
   * GST in that parcel's own share. A final not known yet (a cancel whose fee is not read) is counted apart.
   */
  const totals = useMemo(() => {
    let paid = 0; let before = 0; let unknown = 0;
    const counted = all.filter((c) => !neverCharged(c));
    for (const c of counted) {
      const f = finalIn(details, c);
      if (f == null) { unknown += 1; continue; }
      const whole = Number(c.sell_with_gst) || 0;
      const net = c.sell_price != null ? Number(c.sell_price) : whole - (Number(c.gst) || 0);
      paid += f;
      before += whole > 0 ? f * (net / whole) : f;
    }
    const kept = counted.filter((c) => !notCharged(c));
    return {
      parcels: all.length,
      cancelled: all.filter(isCancelled).length,
      uncharged: all.filter(neverCharged).length,
      refundedOnly: all.filter((c) => !isCancelled(c) && !neverCharged(c) && refunded(c) > 0).length,
      booked: sum(counted, (c) => c.sell_with_gst),
      paid: Math.round(paid * 100) / 100,
      before: Math.round(before * 100) / 100,
      gst: Math.round((paid - before) * 100) / 100,
      unknown,
      cod: sum(kept.filter((c) => c.payment_mode === 'cod'), (c) => c.cod_amount),
    };
  }, [all, refundOf, details]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnsFor = (m: Record<string, GsConsignment>, w: ReturnType<typeof walletCheckIn>): CsvColumn<GsConsignment>[] => [
    { key: 'created_at', label: 'Booked', format: (c) => formatDate(c.created_at, 'yyyy-MM-dd HH:mm', '') },
    { key: 'consignment_number', label: 'Growcord Ship number', format: (c) => c.consignment_number ?? '' },
    { key: 'awb', label: 'AWB', format: (c) => c.awb ?? '' },
    { key: 'shipper_reference', label: 'Order or reference', format: (c) => c.shipper_reference ?? '' },
    { key: 'destination_pincode', label: 'To pincode', format: (c) => c.destination_pincode ?? '' },
    { key: 'zone_code', label: 'Zone', format: (c) => c.zone_code ?? '' },
    { key: 'chargeable_weight_g', label: 'Charged weight (g)', format: (c) => c.chargeable_weight_g ?? '' },
    { key: 'payment_mode', label: 'Payment', format: (c) => (c.payment_mode === 'cod' ? 'COD' : 'Prepaid') },
    { key: 'cod_amount', label: 'COD to collect', format: (c) => (c.payment_mode === 'cod' && c.cod_amount != null ? c.cod_amount.toFixed(2) : '') },
    { key: 'status', label: 'Status', format: (c) => gsStatusText(c.board_status || c.status) },
    { key: 'freight', label: 'Freight', format: (c) => (notCharged(c) ? '' : splitIn(m, c)?.freight?.toFixed(2) ?? '') },
    { key: 'cod_fee', label: 'COD fee', format: (c) => (notCharged(c) ? '' : splitIn(m, c)?.cod?.toFixed(2) ?? '') },
    { key: 'rto', label: 'Return (RTO)', format: (c) => (notCharged(c) ? '' : splitIn(m, c)?.rto?.toFixed(2) ?? '') },
    { key: 'other', label: 'Other', format: (c) => (notCharged(c) ? '' : splitIn(m, c)?.other?.toFixed(2) ?? '') },
    { key: 'sell_price', label: 'Before GST', format: (c) => c.sell_price?.toFixed(2) ?? '' },
    { key: 'gst', label: 'GST', format: (c) => c.gst?.toFixed(2) ?? '' },
    { key: 'sell_with_gst', label: 'At booking with GST', format: (c) => c.sell_with_gst?.toFixed(2) ?? '' },
    { key: 'final', label: 'Final (what it cost)', format: (c) => { const f = finalIn(m, c); return f == null ? (isCancelled(c) ? 'fee not read' : '') : f.toFixed(2); } },
    { key: 'note', label: 'Note', format: noteOf },
    { key: 'wallet_net', label: 'Wallet net for the order', format: (c) => (w?.of.get(c.id) ? w.of.get(c.id)!.net.toFixed(2) : '') },
    {
      key: 'wallet_check', label: 'Wallet check', format: (c) => {
        const g = w?.gaps.get(c.id);
        if (!w) return '';
        if (!g) return c.payment_mode === 'counter_paid' ? 'Paid at the counter' : '';
        return g.final == null ? 'Final not known yet' : g.differs ? g.text : 'Matches';
      },
    },
  ];

  /** The period as a file; with the charge lines, the newest LINES_CAP parcels are read whole first. */
  const download = async (withLines: boolean) => {
    if (!all.length) return;
    setFileNote(null);
    if (withLines) {
      setFileBusy('lines');
      try { await readDetails(all.slice(0, LINES_CAP).map((c) => c.id)); } finally { setFileBusy(null); }
      if (all.length > LINES_CAP) {
        setFileNote(`Charge lines are in the file for the newest ${LINES_CAP} parcels only; the other ${all.length - LINES_CAP} have their booking figures without the split. Choose fewer days for the rest.`);
      }
    }
    downloadCsv(`growcord-ship-charges-${range.from}-to-${range.to}`, columnsFor(known.current, walletCheckIn(known.current)), all);
  };

  return (
    <Page>
      <PageHeader
        icon={Receipt}
        title="Billing and charges"
        description="What Growcord Ship charged for each parcel: freight, COD fee, return charges, GST and the final amount."
      />

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Growcord Ship does not issue tax invoices for freight yet. These figures come from each parcel's booking and any
          later change (weight, return or cancellation), and the money itself moves through your wallet.
        </span>
      </div>

      <SectionCard title="Period" description="Parcels booked between these dates.">
        <FilterBar>
          <RangeFields from={range.from} to={range.to} onChange={setRange} />
          <div className="flex flex-wrap items-end gap-2">
            <Btn variant="outline" disabled={!all.length || !!fileBusy} onClick={() => download(false)}><FileDown /> CSV</Btn>
            <Btn variant="outline" disabled={!all.length || !!fileBusy} onClick={() => download(true)} title={`Reads the charge lines of the newest ${LINES_CAP} parcels first, so it takes longer`}>
              {fileBusy === 'lines' ? <Loader2 className="animate-spin" /> : <FileDown />} CSV with charge lines
            </Btn>
          </div>
        </FilterBar>
        {capped && <p className="mt-2 text-sm text-amber-800">Only the newest {READ_CAP} parcels of this period are counted. Choose fewer days for the rest.</p>}
        {legsCapped && <p className="mt-2 text-sm text-amber-800">Growcord Ship's own record of the wallet holds more movements for these dates than are read, so a refund may not be matched to its parcel. Choose fewer days for the rest.</p>}
        {fileNote && <p className="mt-2 text-sm text-amber-800">{fileNote}</p>}
      </SectionCard>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <StatGrid cols={4}>
        <StatCard
          label="Parcels"
          value={rows ? totals.parcels.toLocaleString('en-IN') : '...'}
          sub={rows && (totals.cancelled || totals.uncharged || totals.refundedOnly)
            ? [
              totals.cancelled ? `${totals.cancelled} cancelled (only the cancellation fee is kept)` : '',
              totals.refundedOnly ? `${totals.refundedOnly} refunded` : '',
              totals.uncharged ? `${totals.uncharged} not booked by the courier, refunded` : '',
            ].filter(Boolean).join('; ') + '.'
            : undefined}
        />
        <StatCard
          label="Taken at booking"
          value={rows ? fmtRupees(totals.booked) : '...'}
          sub={rows ? (!canBilling ? 'Refunds are not checked: they need the billing.read permission.'
            : check ? `${fmtRupees(check.back)} went back to the wallet for these parcels, cancelled ones included.`
              : walletError ? 'The wallet could not be read, so what went back is not shown.'
                : wallet?.capped ? 'The wallet has more movements than are read for these dates. Choose fewer days.' : '...') : undefined}
        />
        <StatCard
          label="Paid, final"
          value={rows ? fmtRupees(totals.paid) : '...'}
          sub={rows ? `The Final column added up; kept cancellation fees count.${totals.unknown ? ` ${totals.unknown} cancel${totals.unknown === 1 ? '' : 's'} whose fee is not known yet left out.` : ''} COD to collect: ${fmtRupees(totals.cod)}.` : undefined}
        />
        <StatCard
          label="Of which GST"
          value={rows ? fmtRupees(totals.gst) : '...'}
          sub={rows ? `Before GST ${fmtRupees(totals.before)}, in each parcel's own GST share.` : undefined}
        />
      </StatGrid>

      {check && check.differ > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {check.differ} parcel{check.differ === 1 ? '' : 's'} of this period {check.differ === 1 ? 'does' : 'do'} not match the wallet:
          for the parcels checked, the wallet took {fmtRupees(check.net)} after what it gave back, and their Finals add to {fmtRupees(check.finals)}.
          Each one says what differs in its row.{check.unknown ? ` ${check.unknown} parcel${check.unknown === 1 ? ' whose Final is' : 's whose Finals are'} not known yet (a cancellation fee not read) ${check.unknown === 1 ? 'is' : 'are'} checked once it shows.` : ''}
        </div>
      )}

      <SectionCard flush title="Parcels" description="Freight, COD fee, return and other come from each parcel's charge lines, read for the parcels on this page.">
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead>
              <Th>Booked</Th><Th>Parcel</Th><Th>Order</Th><Th>To</Th><Th>Status</Th>
              <Th num>Freight</Th><Th num>COD fee</Th><Th num>Return</Th><Th num>Other</Th><Th num>GST</Th><Th num>At booking</Th><Th num>Final</Th>
            </THead>
            <TBody>
              {rows === null && <EmptyRow colSpan={12}>Reading...</EmptyRow>}
              {rows && rows.length === 0 && <EmptyRow colSpan={12}>No Growcord Ship parcel was booked in these dates.</EmptyRow>}
              {shown.map((c) => {
                const s = splitIn(details, c);
                const fin = finalIn(details, c);
                const cancelled = isCancelled(c);
                const off = notCharged(c);
                const changed = !off && fin != null && c.sell_with_gst != null && Math.abs(fin - c.sell_with_gst) >= 0.01;
                const gap = check?.gaps.get(c.id);
                return (
                  <React.Fragment key={c.id}>
                  <Tr className={[cancelled ? 'opacity-70' : '', gap?.differs ? 'bg-amber-50' : ''].filter(Boolean).join(' ') || undefined}>
                    <Td muted className="whitespace-nowrap">{formatDate(c.created_at, 'dd MMM yyyy', '')}</Td>
                    <Td>
                      <div className="font-mono text-xs">{c.consignment_number || ''}</div>
                      <div className="font-mono text-xs text-gray-500">{c.awb || 'No AWB yet'}</div>
                    </Td>
                    <Td>{c.shipper_reference || ''}</Td>
                    <Td className="text-xs">
                      {[c.destination_pincode, c.zone_code ? `zone ${c.zone_code}` : null].filter(Boolean).join(', ')}
                      <div className="text-gray-500">{gramsText(c.chargeable_weight_g)}{c.payment_mode === 'cod' ? `, COD ${money(c.cod_amount)}` : ''}</div>
                    </Td>
                    <Td>
                      {cancelled ? <Chip tone="red">Cancelled</Chip>
                        : neverCharged(c) ? <Chip tone="neutral">Not booked by the courier, refunded</Chip>
                          : refunded(c) > 0 ? <Chip tone="green">Refunded</Chip>
                            : <span className="text-xs">{gsStatusText(c.board_status || c.status)}</span>}
                    </Td>
                    <Td num>{off ? '' : s ? money(s.freight) : '...'}</Td>
                    <Td num>{off ? '' : s ? money(s.cod) : '...'}</Td>
                    <Td num>{off ? '' : s ? money(s.rto) : '...'}</Td>
                    <Td num>{off ? '' : s ? money(s.other) : '...'}</Td>
                    <Td num className={off ? 'text-gray-400' : undefined}>{money(c.gst)}</Td>
                    <Td num className={off ? 'text-gray-400 line-through' : undefined} title={off ? noteOf(c) : undefined}>{money(c.sell_with_gst)}</Td>
                    <Td num className={changed ? 'font-semibold text-amber-800' : 'font-semibold'}>
                      {fin == null ? (cancelled ? '...' : '') : money(fin)}
                      {cancelled && <div className="text-[11px] font-normal text-gray-500">cancellation fee</div>}
                      {neverCharged(c) && <div className="text-[11px] font-normal text-gray-500">not charged</div>}
                      {!cancelled && !neverCharged(c) && refunded(c) > 0 && <div className="text-[11px] font-normal text-gray-500">after the refund</div>}
                    </Td>
                  </Tr>
                  {gap?.differs && (
                    <tr className="bg-amber-50">
                      <td colSpan={12} className="px-4 pb-2 pt-0 text-xs text-amber-900">{gap.text}</td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </TBody>
          </table>
        </TableShell>
        {all.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm">
            <span className="text-gray-500">Page {page} of {pages}, {all.length} parcels</span>
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

export default GrowshipBilling;
