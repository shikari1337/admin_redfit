import { walletAPI } from '../services/api';
import { isoDate } from '../utils/date';
import type { GsWalletLeg } from './v2/growship';

/**
 * Growcord Ship's money in the store wallet, read together: a booking takes freight as a debit in category
 * `shipping` (its reference is the order number), and when nothing ships the same money comes back as a credit in
 * category `refund` (domain/booking.rs): at once when no courier takes the parcel ("reservation released", no
 * reference), or on a cancel (the Growcord Ship number as reference, less any cancellation fee). Live, 26 Nov 2026:
 * SM-13386 Rs 286.74 and SM-13402 Rs 73.10 were each debited and refunded in the same second. Read apart, the
 * shipping list showed the charge without its refund; these helpers put each refund beside its debit.
 */

/** One wallet movement (`GET /wallet/transactions`, platform WalletMovementView). Money in rupees. */
export interface WalletMove {
  id: string;
  direction: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  category: string | null;
  reference?: string | null;
  note?: string | null;
  created_at: string;
}


/** A shipping debit: freight taken for a parcel (any carrier). */
export const isShipDebit = (t: WalletMove) => t.direction === 'debit' && t.category === 'shipping';

/** A refund of Growcord Ship freight: a credit in category refund that names Growcord Ship or a shipping debit. */
export function isShipRefund(t: WalletMove, debitRefs?: Set<string>): boolean {
  if (t.direction !== 'credit' || t.category !== 'refund') return false;
  if (/growcord ship/i.test(String(t.note ?? ''))) return true;
  return !!t.reference && !!debitRefs?.has(String(t.reference));
}

/** How the wallet's movements link to Growcord Ship's parcels and orders. */
export interface WalletLinks {
  /** The order (or reference) each movement belongs to, the same on screen and in the CSV. */
  orderOf: Map<string, string>;
  /** The AWB each movement belongs to, where Growcord Ship recorded it. */
  awbOf: Map<string, string>;
  /** A Growcord Ship debit's linked refunds. */
  refundsOf: Map<string, WalletMove[]>;
  /** A linked refund's debit. */
  debitOf: Map<string, WalletMove>;
  /** A refund that could not be linked, and why in words. */
  unlinked: Map<string, string>;
  /** Per order with a linked refund: every Growcord Ship debit less every refund linked to it (all attempts). */
  netOf: Map<string, number>;
  /** The one movement of each such order that shows the net (the newest). */
  netShownOn: Set<string>;
}

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const isGsDebit = (t: WalletMove, leg: GsWalletLeg | undefined) =>
  isShipDebit(t) && (!!leg || /growcord ship/i.test(String(t.note ?? '')));

/**
 * Links the movements on screen to Growcord Ship's parcels, by exact links only: Ship's own record of each movement
 * (`legs`: the wallet transaction id, the parcel and its AWB), or an identical reference. A refund is never matched by
 * amount or time. Only Growcord Ship debits take part (a Shiprocket debit through Growcord's account is left alone).
 * A cancel refund names the Growcord Ship number while its debit names the order, so the two meet through the parcel,
 * which needs Ship's records: `legsReadable` false (no shipments.read) or a movement older than those records leaves the
 * refund unlinked, with the reason.
 */
export function linkMoves(moves: WalletMove[], legs: GsWalletLeg[], legsReadable: boolean): WalletLinks {
  const legOf = new Map<string, GsWalletLeg>();
  for (const l of legs) if (l.platform_ref) legOf.set(String(l.platform_ref), l);
  const oldestLeg = legs.reduce((m, l) => Math.min(m, Date.parse(String(l.created_at ?? '')) || Infinity), Infinity);
  const parcelByNumber = new Map<string, string>();
  for (const l of legs) if (l.reference && l.consignment_id) parcelByNumber.set(String(l.reference), String(l.consignment_id));

  const debits = moves.filter((t) => isGsDebit(t, legOf.get(t.id)));
  const orderOfParcel = new Map<string, string>();
  const debitsOfParcel = new Map<string, WalletMove[]>();
  for (const d of debits) {
    const parcel = legOf.get(d.id)?.consignment_id;
    if (!parcel) continue;
    if (d.reference) orderOfParcel.set(String(parcel), String(d.reference));
    debitsOfParcel.set(String(parcel), [...(debitsOfParcel.get(String(parcel)) ?? []), d]);
  }

  const out: WalletLinks = {
    orderOf: new Map(), awbOf: new Map(), refundsOf: new Map(), debitOf: new Map(), unlinked: new Map(),
    netOf: new Map(), netShownOn: new Set(),
  };
  for (const t of moves) {
    const leg = legOf.get(t.id);
    if (leg?.awb) out.awbOf.set(t.id, String(leg.awb));
    if (isGsDebit(t, leg) && t.reference) out.orderOf.set(t.id, String(t.reference));
  }

  const refs = new Set(debits.map((d) => String(d.reference ?? '')).filter(Boolean));
  for (const r of moves.filter((t) => isShipRefund(t, refs))) {
    const leg = legOf.get(r.id);
    const parcel = leg?.consignment_id ? String(leg.consignment_id) : (r.reference ? parcelByNumber.get(String(r.reference)) : undefined);
    let debit: WalletMove | undefined;
    let order: string | undefined;
    if (parcel) {
      debit = (debitsOfParcel.get(parcel) ?? []).filter((d) => d.created_at <= r.created_at).pop() ?? debitsOfParcel.get(parcel)?.[0];
      order = orderOfParcel.get(parcel);
    }
    if (!debit && r.reference && refs.has(String(r.reference))) {
      // The same reference: the latest Growcord Ship debit of that order at or before the refund.
      debit = debits.filter((d) => d.reference === r.reference && d.created_at <= r.created_at).pop()
        ?? debits.find((d) => d.reference === r.reference);
      order = String(r.reference);
    }
    if (debit) {
      out.debitOf.set(r.id, debit);
      out.refundsOf.set(debit.id, [...(out.refundsOf.get(debit.id) ?? []), r]);
      if (order) out.orderOf.set(r.id, order);
      const awb = out.awbOf.get(debit.id);
      if (awb && !out.awbOf.has(r.id)) out.awbOf.set(r.id, awb);
      continue;
    }
    if (r.reference) out.orderOf.set(r.id, String(r.reference));
    out.unlinked.set(r.id, !legsReadable
      ? 'Linking a refund to its charge needs the shipments.read permission.'
      : legs.length > 0 && Date.parse(r.created_at) < oldestLeg
        ? 'Older than Growcord Ship\'s latest 200 money records, so it cannot be linked here.'
        : 'Growcord Ship has no record linking it to a charge.');
  }

  // The net per order: every Growcord Ship debit of the order less every refund linked to it, shown once.
  const ordersWithRefund = new Set([...out.debitOf.keys()].map((id) => out.orderOf.get(id)).filter(Boolean) as string[]);
  for (const order of ordersWithRefund) {
    const rows = moves.filter((t) => out.orderOf.get(t.id) === order && (debits.includes(t) || out.debitOf.has(t.id)));
    const net = rows.reduce((s, t) => s + (t.direction === 'debit' ? cents(t.amount) : -cents(t.amount)), 0) / 100;
    out.netOf.set(order, net);
    const newest = rows.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
    out.netShownOn.add(newest.id);
  }
  return out;
}

/**
 * Every movement of one category from today back to `from` (YYYY-MM-DD, the store's day), newest first, read 200 at
 * a time up to `cap` rows. `capped` says the cap was reached before `from`.
 */
export async function readMovesSince(
  category: string, from: string, opts: { direction?: 'credit' | 'debit'; cap?: number } = {},
): Promise<{ rows: WalletMove[]; capped: boolean }> {
  const cap = opts.cap ?? 1000;
  const rows: WalletMove[] = [];
  for (let page = 1; ; page += 1) {
    const list: any = await walletAPI.getTransactions({ page, limit: 200, category, ...(opts.direction ? { direction: opts.direction } : {}) });
    const batch: WalletMove[] = Array.isArray(list) ? list : [];
    rows.push(...batch);
    const oldest = batch.length ? isoDate(batch[batch.length - 1].created_at) : '';
    if (batch.length < 200 || (oldest && oldest < from)) return { rows, capped: false };
    if (rows.length >= cap) return { rows, capped: true };
  }
}
