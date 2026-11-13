import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { linkCls, moneyMajor, num, plural } from '../meta/common';

/**
 * What a send will do before it runs, from the campaign estimate (`POST /api/v2/marketing/campaigns/{id}/estimate`,
 * CampaignEstimateView): who it reaches after consent, what it costs against the wallet, and the plan's monthly
 * allowance. One block shared by the Campaigns card and Quick send (MENU-1 mkt-messaging), so both say the same
 * thing and both stop a send the server would refuse.
 */
export interface CampaignEstimate {
  audience_size: number;
  blocked_by_consent: number;
  estimated_cost: number;
  wallet_balance: number;
  affordable: boolean;
  within_plan_quota: boolean;
  plan_quota: { limit: number | null; used: number; remaining: number | null; exceeded: boolean } | null;
  unit_price?: { amount: string; currency: string; per: string } | null;
}

/** The estimate reply as numbers (Money already arrives in major units through the v2 boundary). */
export function estimateOf(d: any): CampaignEstimate | null {
  if (!d || typeof d !== 'object') return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const q = d.plan_quota && typeof d.plan_quota === 'object' ? d.plan_quota : null;
  return {
    audience_size: n(d.audience_size),
    blocked_by_consent: n(d.blocked_by_consent),
    estimated_cost: n(d.estimated_cost),
    wallet_balance: n(d.wallet_balance),
    affordable: d.affordable !== false,
    within_plan_quota: d.within_plan_quota !== false,
    plan_quota: q ? {
      limit: q.limit === null || q.limit === undefined ? null : n(q.limit),
      used: n(q.used),
      remaining: q.remaining === null || q.remaining === undefined ? null : n(q.remaining),
      exceeded: !!q.exceeded,
    } : null,
    unit_price: d.unit_price && typeof d.unit_price === 'object' ? d.unit_price : null,
  };
}

/** Why the server would refuse this send, in words; empty when it can go. */
export function sendBlockers(e: CampaignEstimate): string[] {
  const out: string[] = [];
  const cur = e.unit_price?.currency || 'INR';
  if (e.audience_size <= 0) {
    out.push(e.blocked_by_consent > 0
      ? `Nobody in this audience can receive it: all ${num(e.blocked_by_consent)} have not agreed to marketing messages.`
      : 'Nobody in this audience can receive it on this channel.');
  }
  if (!e.affordable) out.push(`The wallet holds ${moneyMajor(e.wallet_balance, cur)} and this send costs ${moneyMajor(e.estimated_cost, cur)}.`);
  if (!e.within_plan_quota && e.plan_quota) {
    out.push(`This would go past the plan's monthly allowance (${num(e.plan_quota.used)} of ${e.plan_quota.limit === null ? 'no limit' : num(e.plan_quota.limit)} used).`);
  }
  return out;
}

export const SendCheck: React.FC<{ estimate: CampaignEstimate | null; loading?: boolean; error?: string | null }> = ({ estimate, loading, error }) => {
  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking who this reaches and what it costs...</p>;
  }
  if (error) return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">The check did not run: {error}</p>;
  if (!estimate) return null;
  const cur = estimate.unit_price?.currency || 'INR';
  const blockers = sendBlockers(estimate);
  const q = estimate.plan_quota;
  return (
    <div className={`space-y-1 rounded-md border px-3 py-2 text-sm ${blockers.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50/60 text-emerald-900'}`}>
      <p>
        Reaches <b>{plural(estimate.audience_size, 'person', 'people')}</b>
        {estimate.blocked_by_consent > 0 && (
          <>, leaving out {num(estimate.blocked_by_consent)} who have not agreed to marketing messages
            {' '}(<Link className={linkCls} to="/panel/marketing/compliance">consent</Link>)</>
        )}.
      </p>
      <p>
        Costs about <b>{moneyMajor(estimate.estimated_cost, cur)}</b> from the wallet, which holds {moneyMajor(estimate.wallet_balance, cur)}.
        {!estimate.affordable && <> <Link className={linkCls} to="/settings/wallet">Top up the wallet</Link>.</>}
      </p>
      {q && q.limit !== null && (
        <p>Plan allowance this month: {num(q.used)} of {num(q.limit)} used{q.remaining !== null ? `, ${num(q.remaining)} left` : ''}.</p>
      )}
      {blockers.length > 0 && (
        <ul className="list-disc pl-5 font-medium">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
    </div>
  );
};
