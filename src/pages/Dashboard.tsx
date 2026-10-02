import React, { Suspense, lazy, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHomeFeed } from '../components/home/useHomeFeed';
import { AttentionBoard } from '../components/home/AttentionBoard';
import { TabBar } from '../components/erp/Tabs';
import { OverviewTab } from '../components/dashboard/OverviewTab';
import { useAllTimeMonthly } from '../components/dashboard/shared';

// The two horizons a store owner reads less often load only when opened.
const MonthYearTab = lazy(() => import('../components/dashboard/MonthYearTab'));
const MoneyTab = lazy(() => import('../components/dashboard/MoneyTab'));

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'months', label: 'Month & year' },
  { key: 'money', label: 'Money' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const TAB_KEY = 'admin_dashboard_tab';
const isTab = (v: unknown): v is TabKey => TABS.some((t) => t.key === v);

function rememberedTab(): TabKey | null {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return isTab(v) ? v : null;
  } catch { return null; }
}

/**
 * The store's home (owner, 2026-10-02: "beautiful charts and analytics …
 * monthly, yearly, pendencies, and other important data as a business owner").
 *
 * What needs you first — the attention board, above every tab, grouped by area
 * with the money at stake — then three horizons, each with its own single
 * filter row:
 *   Overview      the period you pick, against the period before it
 *   Month & year  the financial year month by month, against last year, and
 *                 every financial year since the first order
 *   Money         what customers owe, what you owe, refunds, COD, GST, invoices
 *
 * Every source is fetched only when the viewer's role and the store's modules
 * allow it, so a role without access never fires a doomed request. The tab is
 * in `?tab=` (shareable) and remembered on this browser.
 */
const Dashboard: React.FC = () => {
  const { hasPerm, canAccess, modulesLoaded } = useAuth();
  const feed = useHomeFeed({ hasPerm, canAccess, modulesLoaded });
  const [params, setParams] = useSearchParams();

  const fromUrl = params.get('tab');
  const tab: TabKey = isTab(fromUrl) ? fromUrl : (rememberedTab() ?? 'overview');
  const setTab = useCallback((key: string) => {
    if (!isTab(key)) return;
    try { localStorage.setItem(TAB_KEY, key); } catch { /* private mode: the URL still carries it */ }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === 'overview') next.delete('tab'); else next.set('tab', key);
      return next;
    }, { replace: true });
  }, [setParams]);

  // The board's money-held figure (paid, cancelled, not refunded) is a pendency
  // of the whole history, never of the period picked below — so it reads the
  // all-time feed, which Month & year and Money share.
  const allTime = useAllTimeMonthly(hasPerm('orders.read'));

  return (
    <div className="space-y-6" data-dashboard>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">What needs you first, then how the business is doing.</p>
      </div>

      <AttentionBoard feed={feed} commerce={allTime.data?.summary ?? null} />

      <div className="space-y-5">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
        <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
          {tab === 'overview' && <OverviewTab />}
          <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-gray-100" />}>
            {tab === 'months' && <MonthYearTab />}
            {tab === 'money' && <MoneyTab feed={feed} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
