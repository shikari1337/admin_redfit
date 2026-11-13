/**
 * "How sales are going": the comparison that matters, in plain sentences, between what needs you
 * (the attention board) and the details (the tabs). Owner, 13 Nov 2026: a dashboard opens with what
 * to act on, then the comparison that matters, then details.
 *
 * The comparison is like for like: this month so far against the same days of last month. Today is
 * said on its own, never against the whole of yesterday, because a day still running always reads
 * as a fall. Both reads are the commerce panel the Overview tab asks for with the same range, so the
 * shared panel cache answers them once (`usePanelStats`).
 */
import React, { useMemo } from 'react';
import { usePanelStats } from '../panelAnalytics/usePanelStats';
import { InsightCard, type Insight } from '../panelAnalytics/Kit';
import { fmtRupees } from '@/lib/money';
import { useAuth } from '@/contexts/AuthContext';
import { todayIso } from '@/utils/date';
import { periodByKey, rangeLabel } from './periods';
import { fmtInt, fmtPct, pctChange } from './shared';

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const orders = (v: number) => `${fmtInt(v)} order${v === 1 ? '' : 's'}`;

/** Within half a percent either way reads as "about the same". */
const FLAT_PCT = 0.5;

function monthInsight(cur: any, prev: any, curLabel: string, prevLabel: string, canDigIn: boolean): Insight {
  const gross = n(cur?.gross_sales);
  const before = n(prev?.gross_sales);
  const title = `This month so far: ${fmtRupees(gross)} in sales`;
  const lead = `From ${orders(n(cur?.orders))}, ${curLabel}.`;
  const then = `${prevLabel}: ${fmtRupees(before)} from ${orders(n(prev?.orders))}`;
  if (!prev) return { tone: 'info', title, body: lead };
  if (before <= 0) {
    return { tone: 'info', title, body: gross > 0 ? `${lead} The same days last month (${prevLabel}) had no sales.` : `${lead} The same days last month had none either.` };
  }
  const pct = pctChange(gross, before) ?? 0;
  if (Math.abs(pct) < FLAT_PCT) return { tone: 'info', title, body: `${lead} About the same as the same days last month (${then}).` };
  const up = pct > 0;
  return {
    tone: up ? 'good' : 'bad',
    title,
    body: `${lead} That is ${fmtPct(Math.abs(pct))} ${up ? 'more' : 'less'} than the same days last month (${then}).`,
    // A fall says where to look: Sales Insights names the brands and items that moved.
    action: up || !canDigIn ? undefined : { label: 'See what moved', to: '/analytics/insights' },
  };
}

export const Headline: React.FC = () => {
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const enabled = hasPerm('orders.read') && modulesLoaded && canAccess('analytics');

  const today = todayIso();
  const month = useMemo(() => periodByKey('month').range(), [today]);
  const before = useMemo(() => periodByKey('month').compare(month), [month]);
  const todayRange = useMemo(() => ({ from: today, to: today }), [today]);
  const firstDay = month.from === today;

  const cur = usePanelStats<any>('commerce', month, enabled);
  const prev = usePanelStats<any>('commerce', before ?? {}, enabled && !!before);
  const day = usePanelStats<any>('commerce', todayRange, enabled && !firstDay);

  // Not this viewer's (no permission, or no Analytics module): the tabs below say why.
  if (!enabled) return null;

  const s = cur.data?.summary;
  const p = before ? prev.data?.summary : null;
  const waiting = (cur.loading && !s) || (!!before && prev.loading && !p);

  const cards: Insight[] = [];
  // The Sales Insights page is `reports.read` + `analytics` (menu.ts); the module is already known on here.
  const canDigIn = hasPerm('reports.read');
  if (s && !waiting) cards.push(monthInsight(s, p, rangeLabel(month), before ? rangeLabel(before) : '', canDigIn));
  const t = day.data?.summary;
  if (!firstDay && t) {
    cards.push({
      tone: 'info',
      title: `Today so far: ${fmtRupees(n(t.gross_sales))} in sales`,
      body: `From ${orders(n(t.orders))}. A day still running is not compared with a whole one.`,
    });
  }

  return (
    <section aria-label="How sales are going" data-dashboard-headline>
      <h2 className="mb-2 text-base font-semibold text-gray-900">How sales are going</h2>
      {cur.error ? (
        <p className="text-sm text-gray-500">Could not read this month&apos;s sales just now. The Overview below tries again.</p>
      ) : waiting ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true">
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
          {!firstDay && <div className="h-24 animate-pulse rounded-lg bg-gray-100" />}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((c) => <InsightCard key={c.title} insight={c} />)}
        </div>
      )}
    </section>
  );
};

export default Headline;
