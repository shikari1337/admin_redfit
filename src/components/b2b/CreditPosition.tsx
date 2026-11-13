import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { creditControlAPI } from '../../services/api';
import { inr } from '@/components/erp';

/** A customer's credit as Credit Control (Books) holds it: what the order desk enforces. */
export interface CreditStatus {
  customer_id: string; configured: boolean; on_hold: boolean; hold_reason: string | null;
  terms_days: number | null; note: string | null;
  limit: number | null; outstanding: number; available: number | null; updated_at: string | null;
}

/** Where Credit Control opens this customer. */
export const creditControlLink = (customerId: string, name?: string | null) =>
  `/panel/customers/credit?customer=${encodeURIComponent(customerId)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;

/**
 * Hand the credit terms typed on a B2B screen to Credit Control, the one record the order desk
 * guard and the invoice due date read (the wholesale profile keeps its own copy only as the
 * onboarding mirror). Only a positive limit or number of days is passed: 0 on the B2B forms has
 * always meant "not set", while a 0 limit in Credit Control would mean "no credit at all", and
 * clearing a limit or a hold stays a Credit Control decision. A value equal to what Credit
 * Control already holds is not written again. Answers null when done, else a sentence for staff.
 */
export async function pushCreditTerms(
  customerId: string,
  limitRupees: number,
  days: number,
  current?: Pick<CreditStatus, 'limit' | 'terms_days'> | null,
): Promise<string | null> {
  const body: { creditLimit?: number; paymentTermsDays?: number } = {};
  if (Number.isFinite(limitRupees) && limitRupees > 0 && Number(current?.limit) !== limitRupees) body.creditLimit = limitRupees;
  if (Number.isInteger(days) && days > 0 && Number(current?.terms_days) !== days) body.paymentTermsDays = days;
  if (!Object.keys(body).length) return null;
  try {
    await creditControlAPI.saveSettings(customerId, body);
    return null;
  } catch (e: any) {
    const why = e?.response?.status === 403
      ? 'it needs the Manage customers permission'
      : (e?.response?.data?.message ?? 'Credit Control did not answer');
    return `The credit terms were not set in Credit Control (${why}), so the order desk does not enforce them yet.`;
  }
}

/**
 * The card on a B2B account: what the customer owes, their limit and headroom, their payment
 * days and any hold, as Credit Control holds them, with a link to change them there.
 */
export function CreditPosition({ customerId, name, refreshKey, onLoaded }: {
  customerId: string;
  name?: string | null;
  /** Change it to read the position again (after a save). */
  refreshKey?: number;
  onLoaded?: (s: CreditStatus | null) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; data: CreditStatus | null; error: string | null }>({ loading: true, data: null, error: null });

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    creditControlAPI.status(customerId)
      .then((d: any) => {
        if (!live) return;
        setState({ loading: false, data: (d ?? null) as CreditStatus | null, error: null });
        onLoaded?.((d ?? null) as CreditStatus | null);
      })
      .catch((e: any) => {
        if (!live) return;
        setState({ loading: false, data: null, error: e?.response?.status === 403 ? 'Needs the Customers permission' : 'Could not load the credit position' });
        onLoaded?.(null);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, refreshKey]);

  const s = state.data;
  const over = s?.available != null && s.available < 0;
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" />Credit position</h3>
        <Link to={creditControlLink(customerId, name)} className="text-sm text-primary hover:underline">Manage in Credit Control</Link>
      </div>
      {state.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading</div>
      ) : state.error ? (
        <p className="text-sm text-muted-foreground">{state.error}</p>
      ) : s ? (
        <>
          {s.on_hold && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              On credit hold{s.hold_reason ? `: ${s.hold_reason}` : ''}. The order desk takes no new credit orders from them.
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">They owe</dt><dd className="font-semibold tabular-nums">{inr(s.outstanding)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Credit limit</dt><dd className="font-semibold tabular-nums">{s.limit == null ? 'No limit' : inr(s.limit)}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">{over ? 'Over by' : 'Headroom left'}</dt>
              <dd className={`font-semibold tabular-nums ${over ? 'text-red-700' : ''}`}>{s.available == null ? 'Not limited' : inr(Math.abs(s.available))}</dd>
            </div>
            <div><dt className="text-xs text-muted-foreground">Pays within</dt><dd className="font-semibold">{s.terms_days == null ? 'On receipt' : `${s.terms_days} days`}</dd></div>
          </dl>
        </>
      ) : null}
    </div>
  );
}
