/**
 * Pricing (PRICING-AUTO lane D, DEC-089): competitive repricing and Google automated discounts.
 *
 *   /pricing/discovery         Website settings: the discovery switches, Run now, and the whole
 *                              website's pricing policy (the settings registry's page for the key
 *                              `pricingDiscovery`, settings_registry.rs `page.path`)
 *   /pricing/changes           every price the daily run, an undo or a person wrote, with Undo
 *                              (`?run=<id>` one run's, `?variation=<id>` one item's)
 *   /pricing/recommendations   suggestions waiting for a person, adopt or dismiss
 *   /pricing/runs              each run: sources reached, suggested, changed, held back
 *
 * A brand's policy is on the brand editor (Catalog, Brands, Pricing tab); one item's on the product
 * form (a simple product's Pricing tab, each option's quick edit, the full option editor).
 * The page leads with what to act on: discovery off, suggestions waiting, the last run's outcome.
 */
import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IndianRupee } from 'lucide-react';
import { Btn, Page, PageHeader, SectionCard, StatCard, StatGrid, TabBar, num } from '@/components/erp';
import { ErrorNote, Loading, Notice, useLoad } from '@/pages/panels/erp/shared';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/date';
import PolicyForm from '@/components/pricing/PolicyForm';
import DiscoverySwitches from '@/components/pricing/DiscoverySwitches';
import PriceChanges from '@/components/pricing/PriceChanges';
import PriceRecommendations from '@/components/pricing/PriceRecommendations';
import DiscoveryRuns from '@/components/pricing/DiscoveryRuns';
import { PRICING_PERMS, RUN_STATUS_WORDS, discoveryStatus, wordsOf } from '@/lib/v2/pricing';

type TabKey = 'discovery' | 'changes' | 'recommendations' | 'runs';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'discovery', label: 'Website settings' },
  { key: 'changes', label: 'Changes' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'runs', label: 'Runs' },
];

const Pricing: React.FC = () => {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const canManage = hasPerm(PRICING_PERMS.manage);
  const canSwitch = hasPerm(PRICING_PERMS.switches);

  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'discovery';
  const go = (key: TabKey, query?: Record<string, string>) => {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    navigate(`/pricing/${key}${qs}`);
  };

  const status = useLoad(() => discoveryStatus(), []);
  const s = status.data;
  const last = s?.last_run ?? null;
  const runId = search.get('run');
  const variationId = search.get('variation');

  return (
    <Page>
      <PageHeader
        icon={IndianRupee}
        title="Pricing"
        description="Prices set against Google and other sellers, inside your limits. Every change is logged and can be undone."
      />

      {/* What to act on first. */}
      {status.error ? <ErrorNote error={status.error} what="Price discovery" onRetry={() => void status.reload()} /> : null}
      {s && (
        <div className="space-y-3">
          {!s.tables_present && (
            <Notice tone="warn" title="Not set up on this store yet">
              The pricing tables arrive with the next server update. Until then no run happens and nothing can be saved.
            </Notice>
          )}
          <StatGrid cols={3}>
            <StatCard
              label="Price discovery"
              value={s.enabled ? 'On' : 'Off'}
              tone={s.enabled ? 'good' : 'warn'}
              sub={s.enabled
                ? [s.merchant_center && "Google's prices", s.competitor_urls && 'competitor pages'].filter(Boolean).join(' and ') || 'No place to read prices from is on'
                : 'Nothing is read and no price changes until you switch it on.'}
            />
            <StatCard
              label="Waiting for you"
              value={num(s.open_recommendations)}
              tone={s.open_recommendations > 0 ? 'warn' : 'default'}
              sub={s.open_recommendations > 0
                ? <button type="button" className="font-medium text-gray-700 underline" onClick={() => go('recommendations')}>Review the suggested prices</button>
                : 'No suggestion waits.'}
            />
            <StatCard
              label="Last run"
              value={last ? `${num(last.applied)} changed` : 'None yet'}
              tone={!last ? 'default' : ['failed', 'unreachable'].includes(last.status) ? 'bad' : last.status === 'partial' ? 'warn' : 'default'}
              sub={last ? (
                <span>
                  {wordsOf(last.status, RUN_STATUS_WORDS)}, {formatDateTime(last.finished_at ?? last.started_at, 'still running')}.{' '}
                  {last.applied > 0 && (
                    <button type="button" className="font-medium text-gray-700 underline" onClick={() => go('changes', { run: last.id })}>See what changed</button>
                  )}
                </span>
              ) : 'Runs once a day when discovery is on.'}
            />
          </StatGrid>
        </div>
      )}

      <TabBar tabs={TABS} active={tab} onChange={(k) => go(k as TabKey)} />

      {tab === 'discovery' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SectionCard title="Price discovery" description="Whether prices are read every day, and from where.">
            {status.loading && !s ? <Loading label="Loading the switches" /> : s ? (
              <DiscoverySwitches
                status={s}
                canSwitch={canSwitch}
                canRun={canManage}
                onChanged={() => void status.reload()}
                onRunStarted={() => setTimeout(() => void status.reload(), 4000)}
              />
            ) : null}
          </SectionCard>
          <SectionCard
            title="Pricing for the whole website"
            description="How prices are set and the limits they always keep. A brand or one item can set its own value for any of these; everything else inherits from here."
          >
            <PolicyForm scope="store" canManage={canManage} />
          </SectionCard>
        </div>
      )}

      {tab === 'changes' && (
        <PriceChanges
          canManage={canManage}
          runId={runId}
          variationId={variationId}
          onClearFilter={() => { const next = new URLSearchParams(search); next.delete('run'); next.delete('variation'); setSearch(next); }}
        />
      )}

      {tab === 'recommendations' && (
        <PriceRecommendations canManage={canManage} onDecided={() => void status.reload()} />
      )}

      {tab === 'runs' && <DiscoveryRuns onShowChanges={(id) => go('changes', { run: id })} />}

      {tab !== 'discovery' && s && !s.enabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          Price discovery is off.
          <Btn type="button" size="sm" variant="outline" onClick={() => go('discovery')}>Open Website settings</Btn>
        </div>
      )}
    </Page>
  );
};

export default Pricing;
