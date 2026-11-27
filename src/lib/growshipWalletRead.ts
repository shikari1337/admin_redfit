import { walletAPI } from '../services/api';
import { isoDate } from '../utils/date';
import { CORRECTION_CATEGORIES, type WalletMove } from './growshipWallet';

/**
 * The wallet reads behind lib/growshipWallet.ts (which stays pure, so its linking is tested on its own): movements of
 * one category back to a day, and a person's corrections the same way.
 */

/**
 * Every movement of one category ('' for every category) from today back to `from` (YYYY-MM-DD, the store's day),
 * newest first, read 200 at a time up to `cap` rows. `capped` says the cap was reached before `from`.
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

/** A person's corrections (CORRECTION_CATEGORIES: the console's Debit and Credit) back to `from`, newest first. */
export async function readCorrectionsSince(
  from: string, opts: { direction?: 'credit' | 'debit'; cap?: number } = {},
): Promise<{ rows: WalletMove[]; capped: boolean }> {
  const parts = await Promise.all(CORRECTION_CATEGORIES.map((c) => readMovesSince(c, from, opts)));
  const rows = parts.flatMap((p) => p.rows).sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return { rows, capped: parts.some((p) => p.capped) };
}
