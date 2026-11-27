import { isoDate } from '../utils/date';
import { fmtRupees } from './money';
import type { GsConsignment, GsWalletLeg } from './v2/growship';

/**
 * Growcord Ship's money in the store wallet, read together: a booking takes freight as a debit in category
 * `shipping` (its reference is the order number), and when nothing ships the same money comes back as a credit in
 * category `refund` (domain/booking.rs): at once when no courier takes the parcel or the booking stops (since XB-FIX
 * the order number as reference and a note "Refund: ..."; before it no reference and "Growcord Ship, reservation
 * released"), or on a cancel (the Growcord Ship number as reference, less any cancellation fee). Live, 26 Nov 2026:
 * SM-13386 Rs 286.74 and SM-13402 Rs 73.10 were each debited and refunded in the same second. Read apart, the
 * shipping list showed the charge without its refund; these helpers put each refund beside its debit. A person's
 * correction (the console's store wallet Debit or Credit: category `adjustment` or `manual_credit`, the order number
 * as reference) counts for that order too. Pure: the reads are in growshipWalletRead.ts.
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

/** The categories a person's correction is written in: the console's store wallet Debit and Credit. */
export const CORRECTION_CATEGORIES = ['adjustment', 'manual_credit'] as const;

/**
 * Growcord Ship's own notes. The old ones name it ("Growcord Ship freight ...", "Growcord Ship, reservation
 * released ..."); since its plain notes (booking.rs charge_note, REFUND_NOTE_*, cancel_note) a charge reads
 * "Shipping charge: ..." and a refund "Refund: ...". Only Growcord Ship writes category refund (booking.rs
 * credit_refund), and no other carrier's charge reads "Shipping charge:" (provider.rs writes "Shipment ... via ...").
 */
const OLD_NOTE = /growcord ship/i;
const CHARGE_NOTE = /^shipping charge:/i;
const REFUND_NOTE = /^refund:/i;

/** A shipping debit: freight taken for a parcel (any carrier). */
export const isShipDebit = (t: WalletMove) => t.direction === 'debit' && t.category === 'shipping';

/** A refund of Growcord Ship freight: a credit in category refund in Growcord Ship's words or naming a shipping debit. */
export function isShipRefund(t: WalletMove, debitRefs?: Set<string>): boolean {
  if (t.direction !== 'credit' || t.category !== 'refund') return false;
  const note = String(t.note ?? '');
  if (OLD_NOTE.test(note) || REFUND_NOTE.test(note)) return true;
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
  /** A Growcord Ship refund with no link: a plain refund line. */
  unlinked: Set<string>;
  /** A movement of another category (a person's correction) whose reference is a Growcord Ship order. */
  corrections: Set<string>;
  /** Per order with a linked refund or a correction: its Growcord Ship debits, their refunds and its corrections. */
  linesOf: Map<string, WalletMove[]>;
}

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const at = (t: WalletMove) => Date.parse(t.created_at) || 0;
const oldestFirst = (a: WalletMove, b: WalletMove) => at(a) - at(b);
const isGsDebit = (t: WalletMove, leg: GsWalletLeg | undefined) => {
  const note = String(t.note ?? '');
  return isShipDebit(t) && (!!leg || OLD_NOTE.test(note) || CHARGE_NOTE.test(note));
};
/** How long after its charge a refund with no reference may come (the old release ran in the booking's own request). */
const RELEASE_WINDOW_MS = 15 * 60_000;

/**
 * Links the movements on screen to Growcord Ship's parcels, by these links only, in this order:
 * 1. Ship's own record of the movement (`legs`: the wallet transaction id, the parcel and its AWB). A cancel refund
 *    names the Growcord Ship number while its debit names the order, so the two meet through the parcel.
 * 2. The same reference: the latest Growcord Ship debit of that order at or before the refund.
 * 3. An old refund with no reference and no Ship record (the release before XB-FIX) and the charge it gave back, by
 *    the wallet's own running balance: the refund is the very next movement after that charge (its balance before
 *    the refund is the charge's balance after it), of the same amount, within 15 minutes, and the charge has no
 *    other refund. Nothing moved in between, so it is that charge's money coming back.
 * A refund is never matched by amount or time alone. Only Growcord Ship debits take part (a Shiprocket debit through
 * Growcord's account is left alone). Anything without a link stays a plain refund line. A movement of any other
 * category whose reference is the order of a Growcord Ship debit read here, or one of `knownOrders` (the orders of
 * Growcord Ship parcels), is a correction of that order.
 */
export function linkMoves(moves: WalletMove[], legs: GsWalletLeg[], knownOrders: Iterable<string> = []): WalletLinks {
  const legOf = new Map<string, GsWalletLeg>();
  for (const l of legs) if (l.platform_ref) legOf.set(String(l.platform_ref), l);
  const parcelByNumber = new Map<string, string>();
  for (const l of legs) if (l.reference && l.consignment_id) parcelByNumber.set(String(l.reference), String(l.consignment_id));

  // Oldest first, so "the latest at or before" is the last one that passes.
  const debits = moves.filter((t) => isGsDebit(t, legOf.get(t.id))).sort(oldestFirst);
  const debitIds = new Set(debits.map((d) => d.id));
  const orderOfParcel = new Map<string, string>();
  const debitsOfParcel = new Map<string, WalletMove[]>();
  for (const d of debits) {
    const parcel = legOf.get(d.id)?.consignment_id;
    if (!parcel) continue;
    if (d.reference) orderOfParcel.set(String(parcel), String(d.reference));
    debitsOfParcel.set(String(parcel), [...(debitsOfParcel.get(String(parcel)) ?? []), d]);
  }

  const out: WalletLinks = {
    orderOf: new Map(), awbOf: new Map(), refundsOf: new Map(), debitOf: new Map(), unlinked: new Set(),
    corrections: new Set(), linesOf: new Map(),
  };
  for (const t of moves) {
    const leg = legOf.get(t.id);
    if (leg?.awb) out.awbOf.set(t.id, String(leg.awb));
    if (debitIds.has(t.id) && t.reference) out.orderOf.set(t.id, String(t.reference));
  }
  const link = (r: WalletMove, debit: WalletMove, order: string | undefined) => {
    out.debitOf.set(r.id, debit);
    out.refundsOf.set(debit.id, [...(out.refundsOf.get(debit.id) ?? []), r]);
    if (order) out.orderOf.set(r.id, order);
    const awb = out.awbOf.get(debit.id);
    if (awb && !out.awbOf.has(r.id)) out.awbOf.set(r.id, awb);
  };

  const refs = new Set(debits.map((d) => String(d.reference ?? '')).filter(Boolean));
  const waiting: WalletMove[] = [];
  for (const r of moves.filter((t) => isShipRefund(t, refs)).sort(oldestFirst)) {
    const leg = legOf.get(r.id);
    const parcel = leg?.consignment_id ? String(leg.consignment_id) : (r.reference ? parcelByNumber.get(String(r.reference)) : undefined);
    let debit: WalletMove | undefined;
    let order: string | undefined;
    if (parcel) {
      debit = (debitsOfParcel.get(parcel) ?? []).filter((d) => at(d) <= at(r)).pop() ?? debitsOfParcel.get(parcel)?.[0];
      order = orderOfParcel.get(parcel);
    }
    if (!debit && r.reference && refs.has(String(r.reference))) {
      debit = debits.filter((d) => d.reference === r.reference && at(d) <= at(r)).pop()
        ?? debits.find((d) => d.reference === r.reference);
      order = String(r.reference);
    }
    if (debit) { link(r, debit, order); continue; }
    waiting.push(r);
  }

  // Link 3, after every exact link: an old release and the charge it directly follows in the wallet's balance.
  for (const r of waiting) {
    if (!r.reference && !legOf.get(r.id)) {
      const before = cents(r.balance_after) - cents(r.amount);
      const debit = debits.filter((d) => !out.refundsOf.has(d.id)
        && cents(d.amount) === cents(r.amount)
        && cents(d.balance_after) === before
        && at(d) <= at(r) && at(r) - at(d) <= RELEASE_WINDOW_MS).pop();
      if (debit) { link(r, debit, debit.reference ? String(debit.reference) : undefined); continue; }
    }
    if (r.reference) out.orderOf.set(r.id, String(r.reference));
    out.unlinked.add(r.id);
  }

  // A person's correction of a Growcord Ship order (any category but freight and its refunds).
  const orders = new Set([...refs, ...Array.from(knownOrders, String)].filter(Boolean));
  for (const t of moves) {
    if (t.category === 'shipping' || t.category === 'refund' || !t.reference || !orders.has(String(t.reference))) continue;
    out.orderOf.set(t.id, String(t.reference));
    out.corrections.add(t.id);
  }

  // Each order with a linked refund or a correction: its Growcord Ship debits, their refunds and its corrections.
  const withLines = new Set([...out.debitOf.keys(), ...out.corrections].map((id) => out.orderOf.get(id)).filter(Boolean) as string[]);
  for (const order of withLines) {
    out.linesOf.set(order, moves.filter((t) => out.orderOf.get(t.id) === order
      && (debitIds.has(t.id) || out.debitOf.has(t.id) || out.corrections.has(t.id))));
  }
  return out;
}

/**
 * The net for an order (its Growcord Ship debits and debit corrections less the refunds and credit corrections), only
 * when every one of its lines is in `shown` and none sits at an open edge of what was read (`olderOpen`: rows older
 * than `lo` were not read; `newerOpen`: rows newer than `hi` were not read), so a pair split across pages or the
 * export range never gives a partial net. Null otherwise.
 */
export function netFor(
  links: WalletLinks, order: string, shown: WalletMove[],
  edge: { lo: number; hi: number; olderOpen: boolean; newerOpen: boolean },
): number | null {
  const lines = links.linesOf.get(order);
  if (!lines?.length) return null;
  const ids = new Set(shown.map((t) => t.id));
  for (const t of lines) {
    const when = at(t);
    if (!ids.has(t.id)) return null;
    if (edge.olderOpen && when <= edge.lo) return null;
    if (edge.newerOpen && when >= edge.hi) return null;
  }
  return lines.reduce((s, t) => s + (t.direction === 'debit' ? cents(t.amount) : -cents(t.amount)), 0) / 100;
}

/* ── a parcel against the wallet ─────────────────────────────────────────── */

/** What the wallet took and gave back for a period's parcels of one order (or one parcel with no order). Rupees. */
export interface ParcelWallet {
  /** The order number the parcels share; null for a parcel with none (matched by its own records only). */
  order: string | null;
  /** The period's parcels counted together. */
  parcels: string[];
  took: number;
  back: number;
  /** What it took less what it gave back. */
  net: number;
  /** The wallet movements counted. */
  moves: string[];
}

/**
 * For each parcel of a period (`from`, `to`: its booking days), what the wallet took and gave back for it: every
 * movement of any category whose reference is the parcel's order number (shipping debits, refunds, a person's
 * adjustment or manual credit), every refund linked to such a debit (`links`, so an old refund with no reference
 * counts for its order), and every movement Growcord Ship recorded for the parcel (`legs`) or that names its Growcord
 * Ship number. Parcels sharing an order number are counted together. By the order number, a shipping debit counts
 * only when it was taken in the period (a later one is a later booking of the same order), a refund linked to a debit
 * only when that debit counts, and anything else from the period's first day on (a correction can come later).
 * Answers each parcel id's group (the same object for the parcels of one order).
 */
export function walletForParcels(
  parcels: Array<Pick<GsConsignment, 'id' | 'consignment_number' | 'shipper_reference'>>,
  moves: WalletMove[], legs: GsWalletLeg[], links: WalletLinks, period: { from: string; to: string },
): Map<string, ParcelWallet> {
  const groups = new Map<string, ParcelWallet & { tookC: number; backC: number }>();
  const byParcel = new Map<string, string>();
  const byNumber = new Map<string, string>();
  for (const c of parcels) {
    const order = String(c.shipper_reference ?? '').trim();
    const key = order || `#${c.id}`;
    const g = groups.get(key) ?? { order: order || null, parcels: [], took: 0, back: 0, net: 0, moves: [], tookC: 0, backC: 0 };
    g.parcels.push(c.id);
    groups.set(key, g);
    byParcel.set(c.id, key);
    if (c.consignment_number) byNumber.set(String(c.consignment_number), key);
  }
  const parcelOf = new Map<string, string>();
  for (const l of legs) if (l.platform_ref && l.consignment_id) parcelOf.set(String(l.platform_ref), String(l.consignment_id));

  /** The group a movement belongs to, and whether that is by the parcel's own record (always counted). */
  const placeOf = (t: WalletMove): { key: string; exact: boolean } | null => {
    const parcel = parcelOf.get(t.id);
    if (parcel && byParcel.has(parcel)) return { key: byParcel.get(parcel)!, exact: true };
    if (t.reference && byNumber.has(String(t.reference))) return { key: byNumber.get(String(t.reference))!, exact: true };
    const order = links.orderOf.get(t.id) ?? String(t.reference ?? '').trim();
    return order && groups.has(order) ? { key: order, exact: false } : null;
  };
  const day = (t: WalletMove) => isoDate(t.created_at);
  const counts = (t: WalletMove, place: { exact: boolean }): boolean => {
    if (place.exact) return true;
    const debit = links.debitOf.get(t.id);
    if (debit) { const p = placeOf(debit); return !!p && counts(debit, p); }
    if (t.direction === 'debit' && t.category === 'shipping') return day(t) >= period.from && day(t) <= period.to;
    return day(t) >= period.from;
  };

  for (const t of moves) {
    const place = placeOf(t);
    if (!place || !counts(t, place)) continue;
    const g = groups.get(place.key)!;
    if (g.moves.includes(t.id)) continue;
    g.moves.push(t.id);
    if (t.direction === 'debit') g.tookC += cents(t.amount); else g.backC += cents(t.amount);
  }
  const out = new Map<string, ParcelWallet>();
  for (const g of groups.values()) {
    const { tookC, backC, ...rest } = g;
    const done: ParcelWallet = { ...rest, took: tookC / 100, back: backC / 100, net: (tookC - backC) / 100 };
    for (const id of g.parcels) out.set(id, done);
  }
  return out;
}

/**
 * A group's wallet net against the Finals of its parcels: `final` their sum (null while one is not known), `differs`
 * when both are known and they are a paisa or more apart, and the warning in words. Amounts are never changed.
 */
export function walletGap(w: ParcelWallet, finals: Array<number | null>): { final: number | null; differs: boolean; text: string } {
  if (!finals.length || finals.some((f) => f == null)) return { final: null, differs: false, text: '' };
  const finalC = finals.reduce((s: number, f) => s + cents(f), 0);
  const final = finalC / 100;
  if (cents(w.net) === finalC) return { final, differs: false, text: '' };
  const one = w.parcels.length === 1;
  const what = one ? 'this parcel' : `order ${w.order}`;
  const took = w.net >= 0 ? `Wallet took ${fmtRupees(w.net)} for ${what}` : `Wallet gave back ${fmtRupees(-w.net)} more than it took for ${what}`;
  const fin = one ? `Final is ${fmtRupees(final)}` : `the Finals of its ${w.parcels.length} parcels add to ${fmtRupees(final)}`;
  const detail = w.back > 0 ? ` It took ${fmtRupees(w.took)} and gave back ${fmtRupees(w.back)}.` : '';
  return { final, differs: true, text: `${took}; ${fin}.${detail}` };
}

/* ── notes in plain words ───────────────────────────────────────────────── */

/** A courier's words written twice ("Delhivery Surface Delhivery Surface", "Delhivery Delhivery Surface") once. */
function onceEach(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x.toLowerCase() === b[i].toLowerCase());
  for (let k = 1; k < w.length; k += 1) {
    const head = w.slice(0, k);
    const tail = w.slice(k);
    if (same(head, tail)) return head.join(' ');
    if (tail.length > k && same(head, tail.slice(0, k))) return tail.join(' ');
  }
  return w.join(' ');
}

/** Dashes, arrows, middle dots and curly quotes as plain punctuation. */
const plainText = (s: string) => s
  .replace(/\s*(?:[—–]|--+)\s*/g, ': ')
  .replace(/\s*(?:→|->)\s*/g, ' to ')
  .replace(/\s*·\s*/g, ', ')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s{2,}/g, ' ').trim();

/**
 * A wallet note as the store reads it. The stored note never changes; old Growcord Ship notes are shown in its present
 * words (booking.rs charge_note, REFUND_NOTE_*, cancel_note), never an internal error text or a courier's words
 * twice: "Growcord Ship freight, Delhivery Surface Delhivery Surface" reads "Shipping charge: Delhivery Surface", a
 * reservation released "Refund: the booking could not be completed" (or "the courier did not take the parcel" when
 * the note says no courier took it), an old cancel "Refund: shipment <number> cancelled". Anything else keeps its
 * words with plain punctuation.
 */
export function plainNote(note: string | null | undefined): string {
  const s = String(note ?? '').trim();
  if (!s) return '';
  if (/reservation released/i.test(s)) {
    return /no courier took/i.test(s) ? 'Refund: the courier did not take the parcel' : 'Refund: the booking could not be completed';
  }
  const freight = /^growcord ship freight\s*(?:[—–:]|-+)?\s*(.*)$/i.exec(s);
  if (freight) {
    const what = onceEach(plainText(freight[1]));
    return what ? `Shipping charge: ${what}` : 'Shipping charge';
  }
  const cancel = /^growcord ship\s*(?:[—–:,]|-+)\s*(\S+)\s+cancelled\.?$/i.exec(s);
  if (cancel) return `Refund: shipment ${cancel[1]} cancelled`;
  return plainText(s);
}
