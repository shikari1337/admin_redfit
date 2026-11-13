import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellOff, CheckCircle2 } from 'lucide-react';
import { cartsAPI, type CartRecoverySummary } from '@/services/api';
import { StatCard, StatGrid, BlockSkeleton, inr, num } from '@/components/erp';
import { FilterChip } from '@/components/sales/ListChrome';
import { ErrorNotice, GapNotice, failureOf, type LoadFailure } from '@/components/messaging/common';
import { cn } from '@/lib/utils';

/**
 * The cart-recovery desk at a glance (lane MENU-1 cart-recovery), on Orders, Abandoned Carts and
 * Messaging, Cart recovery. What to act on first (reminders switched off while carts wait, sends
 * that failed), then the numbers: carts left, carts a reminder can reach, carts reminded, links
 * opened and orders placed after a reminder. One read, `GET /api/v2/commerce/carts/summary`
 * (Commerce `carts_admin::summary`); nothing here changes a setting.
 */

/** The windows offered; the server bounds any value to 1..365 days and echoes the one it used. */
const WINDOWS = [7, 30, 90] as const;

interface Props {
  /** Where the arm switch lives (a "Switch on" link when reminders are off). */
  switchHref?: string;
  /** The page shows the arm switch itself: say nothing more about on or off here. */
  armStateShown?: boolean;
  /** Where every cart-recovery send is listed. */
  logHref?: string;
  /** Bump to read again (after a send or a settings change). */
  refreshKey?: number;
}

type Action = { tone: 'warn' | 'bad'; text: string; to?: string; cta?: string };

const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

const RecoverySummary: React.FC<Props> = ({ switchHref, armStateShown = false, logHref = '/messaging/cart-recovery?tab=log', refreshKey = 0 }) => {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CartRecoverySummary | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  // The read needs orders.read; a person without it simply does not get the numbers.
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      setData(await cartsAPI.getRecoverySummary(days));
    } catch (e: any) {
      if (e?.response?.status === 403) { setForbidden(true); return; }
      setFailure(failureOf(e, 'Could not read the cart recovery summary.'));
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (forbidden) return null;
  if (failure?.gap) {
    return <GapNotice what="The cart recovery summary (GET /commerce/carts/summary) is not on this server yet. The carts below are still listed." />;
  }
  if (failure) return <ErrorNotice message={failure.message} onRetry={load} />;
  if (!data) return <BlockSkeleton lines={3} className="rounded-lg border border-line p-4" />;

  const span = `last ${data.days} day${data.days === 1 ? '' : 's'}`;
  const actions: Action[] = [];
  if (!data.automation_enabled && !armStateShown) {
    actions.push({
      tone: 'warn',
      text: data.chaseable > 0
        ? `Automatic reminders are off. ${plural(data.chaseable, 'cart', 'carts')} could get one now, and ${num(data.never_messaged)} never had one.`
        : 'Automatic reminders are off. No cart is waiting for one right now.',
      to: switchHref,
      cta: 'Switch on',
    });
  }
  if (data.failed > 0) {
    actions.push({
      tone: 'bad',
      text: `${plural(data.failed, 'reminder', 'reminders')} failed in the ${span}.`,
      to: logHref,
      cta: 'See why',
    });
  }

  return (
    <section aria-label="Cart recovery at a glance" className={cn('space-y-3', loading && 'opacity-70')} data-testid="cart-recovery-summary">
      {actions.length > 0 ? (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.text}
              className={cn('flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                a.tone === 'bad' ? 'border-bad bg-bad-bg text-bad-ink' : 'border-warn bg-warn-bg text-warn-ink')}>
              {a.tone === 'bad' ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <BellOff className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1">{a.text}</span>
              {a.to && a.cta && (
                <Link to={a.to} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">{a.cta}</Link>
              )}
            </li>
          ))}
        </ul>
      ) : data.automation_enabled && !armStateShown ? (
        <p className="flex items-center gap-2 text-sm text-good-ink">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Reminders go out automatically, and none failed in the {span}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-soft">Counted over the</span>
        {WINDOWS.map((d) => (
          <FilterChip key={d} on={days === d} onClick={() => setDays(d)}>{d} days</FilterChip>
        ))}
      </div>

      <StatGrid cols={5}>
        <StatCard label="Abandoned" value={num(data.abandoned)}
          sub={data.abandoned_value != null ? `${inr(data.abandoned_value)} in these carts` : 'Carts of known shoppers'} />
        <StatCard label="Can be reminded" value={num(data.chaseable)} tone={!data.automation_enabled && data.chaseable > 0 ? 'warn' : 'default'}
          sub={`${num(data.never_messaged)} never messaged`} />
        <StatCard label="Reminded" value={num(data.carts_messaged)} tone={data.failed > 0 ? 'bad' : 'default'}
          sub={`${num(data.sent)} sent, ${num(data.failed)} failed`} />
        <StatCard label="Links opened" value={num(data.links_opened)} sub={`In the ${span}`} />
        <StatCard label="Recovered" value={num(data.recovered)} tone={data.recovered > 0 ? 'good' : 'default'}
          sub={data.recovered_value != null ? `${inr(data.recovered_value)} ordered after a reminder` : 'Orders after a reminder'} />
      </StatGrid>
    </section>
  );
};

export default RecoverySummary;
