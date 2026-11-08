/**
 * What every Ads screen shares (lane META-15A): the options call (loaded once per visit), status words and colours
 * (moved here from the wave 1 CampaignsTable, removed in META-15B), budget and money sentences, metric formats, the column list of the Ads Manager and
 * the "pick an ad account first" notice. Money is integer minor units of the ad account currency throughout.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { metaAdsApi, type AdBudget, type AdLevel, type AdMetrics, type AdRow, type AdsOptions, type MetaAlert } from '@/lib/v2/areas/meta';
import type { ColumnDef } from '@/components/erp';
import { Lead, money, num, useLoad, type Tone } from '../common';
import { ADS_ROUTES, META_ROUTES, metaHref } from '../routes';
import type { MetaCtx } from '../useMetaCtx';

/* Options: one load per visit, shared by every screen that asks. */
let optionsOnce: Promise<AdsOptions> | null = null;
export function useAdsOptions() {
  return useLoad(() => {
    if (!optionsOnce) optionsOnce = metaAdsApi.options().catch((e) => { optionsOnce = null; throw e; });
    return optionsOnce;
  }, []);
}

/* Words */
export const LEVEL_WORD: Record<AdLevel, [string, string]> = { campaign: ['campaign', 'campaigns'], adset: ['ad set', 'ad sets'], ad: ['ad', 'ads'] };
export const levelCount = (level: AdLevel, n: number) => `${num(n)} ${LEVEL_WORD[level][n === 1 ? 0 : 1]}`;
export const LEVEL_TITLE: Record<AdLevel, string> = { campaign: 'Campaigns', adset: 'Ad sets', ad: 'Ads' };

/** Underscored keys from Meta, in plain words, when the options data has no label for them. */
export const humanize = (s: string | null | undefined): string => {
  if (!s) return '';
  const t = s.replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The objective's own label from the options data (Meta sends `OUTCOME_SALES`, the options key is `sales`). */
export const objectiveLabel = (key: string | null | undefined, opts: AdsOptions | null): string => {
  if (!key) return '';
  const k = key.replace(/^OUTCOME_/, '').toLowerCase();
  return opts?.objectives.find((o) => o.key.toLowerCase() === k)?.label ?? humanize(key);
};
export const labelFrom = (list: Array<{ key: string; label: string }> | undefined, key: string | null | undefined): string =>
  (key ? list?.find((x) => x.key === key)?.label ?? humanize(key) : '');

/* Status */
export const roasText = (r: number | null) => (r === null || r === undefined ? 'n/a' : `${r.toFixed(2)}x`);
/** Meta's delivery words, in plain words. */
export const STATUS_TEXT: Record<string, string> = {
  ACTIVE: 'Running', PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ADSET_PAUSED: 'Ad sets paused', IN_PROCESS: 'Starting', WITH_ISSUES: 'Has issues',
  DELETED: 'Deleted', ARCHIVED: 'Archived', PENDING_REVIEW: 'In review', DISAPPROVED: 'Rejected',
};
export const toneOf = (s: string) => (s === 'ACTIVE' ? 'good' : s === 'WITH_ISSUES' || s === 'DISAPPROVED' ? 'bad' : s === 'PENDING_REVIEW' || s === 'IN_PROCESS' ? 'info' : 'neutral') as 'good' | 'bad' | 'info' | 'neutral';
export const effective = (r: Pick<AdRow, 'status' | 'effective_status'>) => r.effective_status ?? r.status;
export const isRunning = (r: AdRow) => effective(r) === 'ACTIVE';
/** Paused by its own switch (a paused parent is resumed on the parent). */
export const isPausedSelf = (r: AdRow) => r.status === 'PAUSED';
export const statusText = (r: AdRow) => STATUS_TEXT[effective(r)] ?? humanize(effective(r));
export const statusTone = (r: AdRow) => toneOf(effective(r));
export const hasProblem = (r: AdRow) => effective(r) === 'DISAPPROVED' || effective(r) === 'WITH_ISSUES' || r.delivery.issues.length > 0 || r.review.reasons.length > 0;
export const isLosing = (r: AdRow) => r.metrics.spend_minor > 0 && r.metrics.roas !== null && r.metrics.roas < 1;

/* Budget and money sentences */
export function budgetText(b: AdBudget, cur: string, level: AdLevel): string {
  if (b.kind === 'daily' && b.amount_minor !== null) return `${money(b.amount_minor, cur)} a day${b.at === 'campaign' && level !== 'campaign' ? ' (campaign)' : ''}`;
  if (b.kind === 'lifetime' && b.amount_minor !== null) return `${money(b.amount_minor, cur)} in total${b.at === 'campaign' && level !== 'campaign' ? ' (campaign)' : ''}`;
  if (level === 'campaign') return 'Set on ad sets';
  if (level === 'ad') return 'Set on the ad set';
  return 'Not set';
}

/** Can this row's own budget be changed here (the budget lives on this row)? */
export const ownsBudget = (r: AdRow) => r.level !== 'ad' && r.budget.amount_minor !== null && (r.budget.at === r.level || (r.level === 'campaign' && r.budget.at !== 'adset'));

/**
 * The most these rows can spend once running: daily caps add up per budget owner (two ad sets under one campaign
 * budget count once), lifetime budgets are listed apart. Returns one plain sentence.
 */
export function spendCapLine(rows: AdRow[], cur: string): string {
  const owners = new Map<string, AdBudget>();
  let unknown = 0;
  for (const r of rows) {
    const b = r.budget;
    if (b.amount_minor === null || b.kind === 'none') { unknown += 1; continue; }
    const owner = b.at === 'campaign' && r.level !== 'campaign' ? `c:${r.parent_id ?? r.id}` : `${r.level}:${r.id}`;
    owners.set(owner, b);
  }
  let daily = 0; let lifetime = 0;
  for (const b of owners.values()) {
    if (b.kind === 'daily') daily += b.amount_minor ?? 0; else lifetime += b.amount_minor ?? 0;
  }
  const parts: string[] = [];
  if (daily) parts.push(`up to ${money(daily, cur)} a day, about ${money(daily * 30, cur)} over 30 days`);
  if (lifetime) parts.push(`up to ${money(lifetime, cur)} in total from lifetime budgets`);
  const head = rows.length === 1 ? 'It can spend' : 'Together they can spend';
  if (!parts.length) return unknown ? 'Their budgets sit on the level above; check them before you resume.' : 'No budget is set.';
  return `${head} ${parts.join(', and ')}, from the moment you resume.${unknown ? ` ${unknown === 1 ? 'One more takes its' : `${num(unknown)} more take their`} budget from the level above.` : ''}`;
}

/* Metrics */
export type MetricKind = 'money' | 'count' | 'percent' | 'ratio';
export interface MetricCol { key: keyof AdMetrics; label: string; kind: MetricKind; help?: string }
export const METRICS: MetricCol[] = [
  { key: 'spend_minor', label: 'Spend', kind: 'money' },
  { key: 'results', label: 'Results', kind: 'count', help: 'What the ad set is optimised for: purchases, page views, likes.' },
  { key: 'cost_per_result_minor', label: 'Cost per result', kind: 'money' },
  { key: 'purchase_value_minor', label: 'Sales (Meta)', kind: 'money', help: 'Purchase value Meta attributes to the ads.' },
  { key: 'roas', label: 'Return', kind: 'ratio', help: 'Sales divided by spend.' },
  { key: 'purchases', label: 'Purchases', kind: 'count' },
  { key: 'impressions', label: 'Impressions', kind: 'count' },
  { key: 'reach', label: 'Reach', kind: 'count' },
  { key: 'frequency', label: 'Frequency', kind: 'ratio', help: 'Times each person saw it, on average.' },
  { key: 'clicks', label: 'Clicks', kind: 'count' },
  { key: 'ctr', label: 'CTR', kind: 'percent', help: 'Clicks as a share of impressions.' },
  { key: 'cpc_minor', label: 'Cost per click', kind: 'money' },
  { key: 'cpm_minor', label: 'Cost per 1,000', kind: 'money', help: 'Cost per thousand impressions.' },
];

export function fmtMetric(kind: MetricKind | string, v: number | null | undefined, cur: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  if (kind === 'money') return money(v, cur);
  if (kind === 'percent') return `${v.toFixed(2)}%`;
  if (kind === 'ratio') return `${v.toFixed(2)}x`;
  return num(v);
}
/** One metric of a row: Return reads as "3.80x", frequency as "2.40". */
export const metricText = (m: AdMetrics, c: MetricCol, cur: string): string =>
  (c.key === 'frequency' ? (m.frequency === null ? 'n/a' : m.frequency.toFixed(2)) : c.key === 'roas' ? roasText(m.roas) : fmtMetric(c.kind, m[c.key] as number | null, cur));

/** The Ads Manager's columns: settings first, then every metric; the person's choice is kept per level. */
export function columnsFor(level: AdLevel): ColumnDef[] {
  const base: ColumnDef[] = [
    { key: 'name', label: 'Name', always: true },
    { key: 'delivery', label: 'Delivery' },
    ...(level !== 'ad' ? [{ key: 'budget', label: 'Budget' }] : []),
    ...(level === 'campaign' ? [{ key: 'objective', label: 'Objective', defaultHidden: true }, { key: 'bid', label: 'Bid strategy', defaultHidden: true }] : []),
    ...(level === 'adset' ? [{ key: 'goal', label: 'Optimised for', defaultHidden: true }] : []),
    { key: 'ends', label: 'Ends', defaultHidden: true },
  ];
  const shownByDefault = new Set(['spend_minor', 'results', 'cost_per_result_minor', 'purchase_value_minor', 'roas', 'ctr']);
  return [...base, ...METRICS.map((m) => ({ key: m.key, label: m.label, defaultHidden: !shownByDefault.has(m.key) }))];
}

/* Notices */

/** Shown in place of an Ads screen when no ad account is picked in Setup. */
export const NeedsAdAccount: React.FC<{ ctx: MetaCtx }> = ({ ctx }) => (
  <Lead tone="warn" title="Pick an ad account first"
    actions={<Button size="sm" variant="outline" className="bg-white" asChild><Link to={metaHref(META_ROUTES.setup)}>Go to Facebook and Instagram setup</Link></Button>}>
    Ads, audiences and numbers come from the ad account picked in setup{ctx.setup?.connection ? '' : ', after you connect Meta'}.
  </Lead>
);

export const adAccountOf = (ctx: MetaCtx) => ctx.setup?.items.find((i) => i.key === 'ad_account')?.picked ?? null;

/** A small labelled row of facts (side panel, summaries). */
export const Facts: React.FC<{ rows: Array<[string, React.ReactNode]>; className?: string }> = ({ rows, className }) => (
  <dl className={className ?? 'grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2'}>
    {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
      <div key={k} className="min-w-0">
        <dt className="text-xs text-gray-500">{k}</dt>
        <dd className="break-words text-gray-900">{v}</dd>
      </div>
    ))}
  </dl>
);

/** Where a Meta alert is fixed: setup for token and account problems, the object in the Ads Manager, else analytics. */
export const alertLink = (a: MetaAlert): { to: string; label: string } => {
  if (a.kind === 'token' || a.kind === 'account_issue') return { to: metaHref(META_ROUTES.setup), label: 'Open setup' };
  if (a.id && (a.level === 'campaign' || a.level === 'adset' || a.level === 'ad')) {
    return { to: metaHref(ADS_ROUTES.manager, { ...(a.level !== 'campaign' ? { level: a.level } : {}), focus: a.id }), label: 'Open' };
  }
  return { to: metaHref(ADS_ROUTES.analytics), label: 'See analytics' };
};

export const toneOfAlert = (kind: string): Tone => (kind === 'rejected' || kind === 'account_issue' || kind === 'token' || kind === 'spend_no_sales' ? 'bad' : 'warn');

/** "about 38,000 to 45,000 people" from Meta's size range. */
export const sizeText = (low: number | null | undefined, high: number | null | undefined): string => {
  if (low == null && high == null) return 'Size not known yet';
  if (low != null && high != null && low !== high) return `${num(low)} to ${num(high)} people`;
  return `about ${num((low ?? high) as number)} people`;
};

/** The store's calendar day `n` days from today, YYYY-MM-DD (the shared `utils/date` helper). */
export { isoDaysFromToday as dayIso } from '@/utils/date';
