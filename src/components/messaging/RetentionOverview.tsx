import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BlockSkeleton, StatCard, StatGrid, inr } from '@/components/erp';
import { retentionAPI, type NpsSummary, type RetentionOverview as Overview } from '@/lib/v2/messaging';
import { ErrorNotice, failureOf, type LoadFailure } from './common';

/**
 * MESSAGING, RETENTION, the numbers above the journeys (lane MENU-1): what keeps a switched-on
 * journey from running comes first, then repeat buyers, who is drifting away, what the journeys'
 * buyers spent against those kept back, and the NPS. Reads Retain's `GET /retain/overview` and
 * `GET /retain/feedback?kind=nps`; an older server without them shows nothing here (the journeys
 * below still work).
 */
const pct = (bp: number) => `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
const fmt = (v: number) => v.toLocaleString('en-IN');

const RetentionOverview: React.FC = () => {
  const [ov, setOv] = useState<Overview | null>(null);
  const [nps, setNps] = useState<NpsSummary | null>(null);
  const [scoringOn, setScoringOn] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    const [o, f, s] = await Promise.allSettled([retentionAPI.overview(), retentionAPI.nps(), retentionAPI.settings()]);
    if (o.status === 'fulfilled') setOv(o.value);
    else setFailure(failureOf(o.reason, 'Could not load the retention numbers.'));
    setNps(f.status === 'fulfilled' ? f.value : null);
    setScoringOn(s.status === 'fulfilled' ? s.value.scoring_on : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failure?.gap) return null;
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (!ov) return <div aria-busy="true"><BlockSkeleton lines={2} /></div>;

  const perReached = ov.reached > 0 && ov.revenue_reached !== null ? ov.revenue_reached / ov.reached : null;
  const perKept = ov.kept_back > 0 && ov.revenue_kept_back !== null ? ov.revenue_kept_back / ov.kept_back : null;

  return (
    <div className="space-y-3" data-testid="retention-overview">
      {ov.blocked.length > 0 && (
        <div role="alert" className="rounded-lg border border-bad bg-bad-bg px-4 py-3 text-sm text-bad-ink">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {ov.blocked.length === 1 ? 'A journey that is on is not running' : `${ov.blocked.length} journeys that are on are not running`}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {ov.blocked.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}
      <StatGrid cols={4}>
        <StatCard label="Repeat buyers"
          value={ov.buyers > 0 ? pct(ov.repeat_rate_bp) : 'n/a'}
          sub={ov.buyers > 0 ? `${fmt(ov.repeat_buyers)} of ${fmt(ov.buyers)} buyers ordered again` : 'No orders seen yet'} />
        <StatCard label="Drifting away" tone={ov.drifting > 0 ? 'warn' : 'default'}
          value={scoringOn === false && ov.drifting === 0 ? 'n/a' : fmt(ov.drifting)}
          sub={scoringOn === false && ov.drifting === 0 ? 'Not scored: the daily drifting score is off for this store'
            : ov.drifting > 0 ? 'Buyers past their usual gap between orders' : 'Nobody past their usual gap'} />
        <StatCard label="Journey sales, 30 days"
          value={ov.revenue_reached !== null ? inr(ov.revenue_reached) : 'n/a'}
          sub={perReached !== null && perKept !== null
            ? `${inr(perReached)} a person reached, ${inr(perKept)} a person kept back`
            : ov.reached > 0 ? `${fmt(ov.reached)} people reached` : 'Nobody reached yet'} />
        <StatCard label="NPS, 90 days"
          tone={nps?.score !== null && nps?.score !== undefined && nps.score < 0 ? 'bad' : 'default'}
          value={nps?.score !== null && nps?.score !== undefined ? String(nps.score) : 'n/a'}
          sub={nps ? (nps.answers > 0 ? `${fmt(nps.answers)} answer${nps.answers === 1 ? '' : 's'}` : 'No answers yet') : 'Not reported by this server'} />
      </StatGrid>
    </div>
  );
};

export default RetentionOverview;
