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

const time = (t: WalletMove) => Date.parse(t.created_at) || 0;
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** A shipping debit: freight taken for a parcel. */
export const isShipDebit = (t: WalletMove) => t.direction === 'debit' && t.category === 'shipping';

/** A refund of Growcord Ship freight: a credit in category refund that names Growcord Ship or a shipping debit. */
export function isShipRefund(t: WalletMove, debitRefs?: Set<string>): boolean {
  if (t.direction !== 'credit' || t.category !== 'refund') return false;
  if (/growcord ship/i.test(String(t.note ?? ''))) return true;
  return !!t.reference && !!debitRefs?.has(String(t.reference));
}

/**
 * Each shipping debit's refunds: by Ship's own record of the two movements (the same parcel), else by the same
 * reference, else (a released reservation carries no reference) the same amount within fifteen minutes after it.
 * Answers debit id to its refunds.
 */
export function matchRefunds(moves: WalletMove[], legs: GsWalletLeg[] = []): Map<string, WalletMove[]> {
  const parcelOfTx = new Map<string, string>();
  for (const l of legs) if (l.platform_ref && l.consignment_id) parcelOfTx.set(String(l.platform_ref), String(l.consignment_id));
  const debits = moves.filter(isShipDebit).sort((a, b) => time(a) - time(b));
  const refs = new Set(debits.map((d) => String(d.reference ?? '')).filter(Boolean));
  const refunds = moves.filter((t) => isShipRefund(t, refs)).sort((a, b) => time(a) - time(b));
  const out = new Map<string, WalletMove[]>();
  const left = new Map(debits.map((d) => [d.id, cents(d.amount)]));
  const take = (d: WalletMove, r: WalletMove) => {
    out.set(d.id, [...(out.get(d.id) ?? []), r]);
    left.set(d.id, (left.get(d.id) ?? 0) - cents(r.amount));
  };
  for (const r of refunds) {
    const before = debits.filter((d) => time(d) <= time(r) + 5_000 && (left.get(d.id) ?? 0) > 0);
    const parcel = parcelOfTx.get(r.id);
    const byParcel = parcel ? before.filter((d) => parcelOfTx.get(d.id) === parcel).pop() : undefined;
    const byRef = !byParcel && r.reference ? before.filter((d) => d.reference && d.reference === r.reference).pop() : undefined;
    const byAmount = !byParcel && !byRef && !r.reference
      ? before.filter((d) => cents(d.amount) === cents(r.amount) && time(r) - time(d) <= 15 * 60_000).pop()
      : undefined;
    const d = byParcel ?? byRef ?? byAmount;
    if (d) take(d, r);
  }
  return out;
}

/** What a debit cost once its refunds are counted, in rupees. */
export const netOf = (d: WalletMove, refunds: WalletMove[] | undefined) =>
  Math.round(cents(d.amount) - (refunds ?? []).reduce((s, r) => s + cents(r.amount), 0)) / 100;

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
