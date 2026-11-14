import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { Chip } from '../../components/erp';
import { formatDay } from '../../utils/date';

/**
 * WHAT EACH ITEM OF AN ORDER MAY STILL COME BACK FOR (owner decision DEC-086).
 *
 * Return policies are enforced by the server: a request an item's policy refuses is refused, and
 * the desk can raise it only as a recorded exception with a reason. Every screen reads the same
 * answer, `GET /returns/eligibility/:order` (commerce `ReturnEligibilityView`): each line carries
 * its policy, whether it was fixed when the order was delivered, until when it can be returned,
 * replaced or refunded, and the server's reason when it cannot. Nothing here works a window out.
 */

/** One outcome on one line, as the server judged it. */
export interface ReturnOutcome {
  code: string;
  open: boolean;
  until?: string | null;
  reason?: string | null;
}

/** One line of the eligibility answer (the fields these screens read). */
export interface EligibleLine {
  order_item_id: string;
  variation_id?: string | null;
  product_id?: string | null;
  sku?: string | null;
  name?: string | null;
  qty_ordered: number;
  qty_already_returned: number;
  qty_returnable: number;
  eligible_amount_minor?: number | null;
  can_request?: boolean;
  reason?: string | null;
  policy_name?: string | null;
  policy_source?: string | null;
  terms_fixed_at_delivery?: boolean;
  returnable?: boolean;
  replaceable?: boolean;
  refundable?: boolean;
  return_until?: string | null;
  replacement_until?: string | null;
  refund_until?: string | null;
  outcomes?: ReturnOutcome[];
}

/** The server's verdict on `code` for `line` (none from a server that does not judge outcomes). */
export const outcomeOf = (line: EligibleLine | null | undefined, code: string): ReturnOutcome | null =>
  (line?.outcomes ?? []).find((o) => o.code === code) ?? null;

/**
 * The order's eligibility, read once per order. `orderRef` is the order's id or number; nothing is
 * read while it is empty or `enabled` is false. A refusal (an order that cannot be found, the
 * returns module off) is kept as `error` for the screen to say, never thrown.
 */
export function useReturnEligibility(orderRef: string | null | undefined, enabled = true) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = (orderRef ?? '').trim();
    if (!enabled || !ref) { setData(null); setError(''); setLoading(false); return; }
    let alive = true;
    setLoading(true); setError('');
    api.get(`/returns/eligibility/${encodeURIComponent(ref)}`)
      .then((r) => { if (alive) setData(payload<any>(r)); })
      .catch((e: any) => {
        if (alive) { setData(null); setError(e?.response?.data?.message || e?.message || 'Could not read what this order may return.'); }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderRef, enabled]);

  return { data, loading, error };
}

const SOURCE_WORDS: Record<string, string> = {
  product_return_policy: "the product's policy",
  store_default_return_policy: 'the store default policy',
  no_policy: 'no policy (the platform window)',
};

/** "Policy Standard, fixed at delivery" / "No policy (the platform window), as it stands now". */
export const policyWords = (line: EligibleLine): string => {
  const source = SOURCE_WORDS[line.policy_source ?? ''] ?? line.policy_source ?? 'the policy';
  const which = line.policy_name ? `${line.policy_name} (${source})` : source;
  return line.terms_fixed_at_delivery
    ? `${which}, fixed when the order was delivered`
    : `${which}, as it stands now`;
};

/** One switch: open until a day, closed, or not allowed by the policy. */
const Switch: React.FC<{ label: string; allowed?: boolean; until?: string | null; open: boolean }> = ({
  label, allowed, until, open,
}) => {
  if (allowed === false) return <Chip tone="neutral">No {label.toLowerCase()}</Chip>;
  if (!until) return <Chip tone={open ? 'green' : 'neutral'}>{label}{open ? '' : ' closed'}</Chip>;
  return (
    <Chip tone={open ? 'green' : 'neutral'}>
      {label} {open ? 'until' : 'closed'} {formatDay(until)}
    </Chip>
  );
};

/**
 * One line's return terms: return, replacement and refund, each open until a day or closed, the
 * policy they come from, and the server's reason when nothing can be asked.
 */
export const ReturnTermsLine: React.FC<{ line: EligibleLine; showPolicy?: boolean }> = ({ line, showPolicy = true }) => {
  // A server that does not judge outcomes yet says nothing here rather than something wrong.
  if (!Array.isArray(line.outcomes)) return null;
  const open = (code: string) => outcomeOf(line, code)?.open ?? false;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {line.returnable === false ? (
          <Chip tone="neutral">Not returnable</Chip>
        ) : (
          <>
            <Switch label="Return" allowed until={line.return_until} open={open('undecided')} />
            <Switch label="Replacement" allowed={line.replaceable} until={line.replacement_until} open={open('replacement')} />
            <Switch label="Refund" allowed={line.refundable} until={line.refund_until} open={open('refund')} />
          </>
        )}
      </div>
      {line.reason && <p className="text-xs text-amber-700 dark:text-amber-300">{line.reason}</p>}
      {showPolicy && <p className="text-[11px] text-muted-foreground">Under {policyWords(line)}.</p>}
    </div>
  );
};

/**
 * The order page's card: what each item of a delivered order may still come back for, and why not
 * when not. Read only once the order carries a delivery date (the windows count from it).
 */
export const OrderReturnTermsCard: React.FC<{ orderRef?: string | null; deliveredAt?: string | null }> = ({
  orderRef, deliveredAt,
}) => {
  const { data, loading, error } = useReturnEligibility(orderRef, !!deliveredAt);
  if (!deliveredAt || !orderRef) return null;
  const lines: EligibleLine[] = data?.lines ?? [];
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Returns</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          What each item can still come back for under its return policy. The store enforces these; a request outside
          them is refused unless the desk raises it as an exception with a reason.
        </p>
      </div>
      {loading ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">Reading each item&apos;s return terms.</p>
      ) : error ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">Return terms could not be read: {error}</p>
      ) : lines.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">This order has no items to return.</p>
      ) : (
        <>
          {data?.eligible === false && data?.reason && (
            <p className="px-4 pt-3 text-xs text-amber-700 dark:text-amber-300">{data.reason}</p>
          )}
          <div className="divide-y divide-border">
            {lines.map((l) => (
              <div key={l.order_item_id} className="px-4 py-3 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{l.name ?? l.sku ?? 'Item'}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.qty_returnable} of {l.qty_ordered} not yet in a return
                  </p>
                </div>
                <div className="sm:max-w-[60%]">
                  <ReturnTermsLine line={l} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
