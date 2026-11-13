/**
 * Shared pieces of the Facebook and Instagram page (lane META-5): the load hook, the section card, state
 * chips and the money and number formats. Built on the admin's own kit: shadcn Card and Badge (what
 * Channels.tsx uses), the payments screens' "not on this server yet" and error notices, `lib/money` and
 * `utils/date`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { badgeVariants } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { fmtCurrencyMinor, fmtNumber } from '@/lib/money';
import { majorToMinor } from '@/lib/v2/money';
import { daysUntil, plural } from '@/lib/v2/erp';
import { GapNotice, ErrorNotice } from '@/pages/payments/common';
import { errText, isGap } from '@/pages/payments/data';
import type { ApplyOutcome } from '@/lib/v2/areas/meta';

export interface Failure { gap: boolean; forbidden: boolean; message: string }
const failureOf = (e: any): Failure => ({ gap: isGap(e), forbidden: e?.response?.status === 403, message: errText(e, 'Something went wrong.') });

/** Load once and on `deps`; `reload` keeps the old data visible while it runs. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const d = await fn();
      if (mine === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError(failureOf(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** A failed read in plain words: not on this server yet, not allowed, or the server's own reason. */
export const LoadFailure: React.FC<{ failure: Failure; what: string; onRetry?: () => void }> = ({ failure, what, onRetry }) => {
  if (failure.gap) return <GapNotice what={what} />;
  if (failure.forbidden) return <ErrorNotice message="You do not have access to this. Ask the store owner for the permission." />;
  return <ErrorNotice message={`Could not load this: ${failure.message}`} onRetry={onRetry} />;
};

/** The server's words for a refused write. */
export const writeError = (e: any, fallback: string) => errText(e, fallback);

/** A pixel's role and how its events travel, in the words a store owner uses (META-SETS). */
export const PIXEL_ROLE: Record<string, string> = { store: 'Your own pixel', connected: 'Added through the Meta connection' };
export const PIXEL_SERVER: Record<string, string> = {
  connection: 'Browser and server events, through the Meta connection.',
  pasted_token: 'Browser and server events, with the token you pasted.',
  browser_only: 'Browser events only.',
};

/** One titled section of a tab. */
export const Section: React.FC<{
  title: React.ReactNode;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}> = ({ title, hint, actions, children, className, id }) => (
  <Card className={cn('overflow-hidden', className)} id={id}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-gray-600">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <CardContent className="p-4 sm:p-5">{children}</CardContent>
  </Card>
);

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

/** The admin Badge's state colours, as an inline element so it may sit inside a sentence. */
export const StateChip: React.FC<{ tone: Tone; children: React.ReactNode; className?: string }> = ({ tone, children, className }) => (
  <span className={cn(badgeVariants({ variant: tone }), 'whitespace-nowrap font-medium', className)}>{children}</span>
);

/** The "act on this" box every tab opens with. */
export const Lead: React.FC<{ tone: Tone; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }> = ({ tone, title, children, actions }) => {
  const box: Record<Tone, string> = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    neutral: 'border-gray-200 bg-gray-50 text-gray-900',
  };
  return (
    <div role="status" className={cn('rounded-lg border px-4 py-3', box[tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(100%,16rem)] flex-1">
          <p className="text-base font-semibold">{title}</p>
          {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
};

/** A small figure with its label (tab summaries). Clickable when `onClick` is given. */
export const Figure: React.FC<{ label: string; value: React.ReactNode; tone?: Tone; onClick?: () => void; active?: boolean; sub?: React.ReactNode }> = ({ label, value, tone, onClick, active, sub }) => {
  const ink: Record<Tone, string> = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', info: 'text-blue-700', neutral: 'text-gray-900' };
  const body = (
    <>
      <span className="block text-xs font-medium text-gray-500">{label}</span>
      <span className={cn('mt-0.5 block text-lg font-semibold tabular-nums', ink[tone ?? 'neutral'])}>{value}</span>
      {sub && <span className="block text-xs text-gray-500">{sub}</span>}
    </>
  );
  const cls = cn('min-w-0 rounded-lg border bg-white px-3 py-2 text-left', active && 'border-gray-900 ring-1 ring-gray-900');
  return onClick
    ? <button type="button" onClick={onClick} className={cn(cls, 'hover:border-gray-400')}>{body}</button>
    : <div className={cls}>{body}</div>;
};

/** Integer minor units in the given currency, Indian grouping. */
export const money = (minor: number | null | undefined, currency = 'INR'): string =>
  minor === null || minor === undefined ? 'Not set' : fmtCurrencyMinor(minor, currency, 'en-IN');

/** A major-unit amount (after the v2 boundary) in the given currency. */
export const moneyMajor = (major: number | null | undefined, currency = 'INR'): string => {
  if (major === null || major === undefined) return 'Not set';
  return money(majorToMinor(major, currency), currency);
};

export const num = (n: number | null | undefined): string => (n === null || n === undefined ? '0' : fmtNumber(n));

/** Counts and day maths come from the shared helpers (`lib/v2/erp`): "3 days", whole store days until a date. */
export { plural, daysUntil };

/** "4 minutes ago", "3 hours ago", "2 days ago". */
export const ago = (iso: string | null | undefined): string => {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

export const linkCls = 'font-medium text-primary underline-offset-2 hover:underline';

/**
 * An ad apply that did not end with everything made (`applyOutcomeOf`): the step Meta refused in Meta's words and what
 * exists now, paused; or a mock run's note. Nothing for `created`.
 */
export const ApplyNotDone: React.FC<{ outcome: ApplyOutcome; again?: string }> = ({ outcome, again }) => {
  if (outcome.kind === 'created') return null;
  if (outcome.kind === 'mock') {
    return <Lead tone="info" title="Nothing was created">{outcome.words ?? 'This was a trial run: nothing was sent to Meta.'}</Lead>;
  }
  if (outcome.kind === 'unknown') {
    return <Lead tone="warn" title="Meta's answer is not clear">The server did not say the campaign was created. Check the Ads Manager before you try again.</Lead>;
  }
  return (
    <Lead tone="bad" title={outcome.step ? `Meta refused the ${outcome.step.toLowerCase()}` : 'Meta refused it'}>
      <p>{outcome.words ? `Meta says: ${outcome.words}` : 'Meta gave no reason.'}</p>
      {outcome.made.length > 0 && (
        <p className="mt-1">Already on Meta, paused: {outcome.made.map((m) => `${m.label} ${m.id}`).join(', ')}. They spend nothing.</p>
      )}
      {again && <p className="mt-1">{again}</p>}
    </Lead>
  );
};
