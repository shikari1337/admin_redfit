import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Users, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { Page, PageHeader, SectionCard, StatCard, StatGrid, Btn, CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { ChannelCard, type ChannelStatus } from './campaigns/ChannelReadiness';
import { CHANNEL_LIST } from './campaigns/channelMeta';

/** Marketing panel home — hub KPIs, per-channel readiness, and quick links. */
const MarketingDashboard: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const [data, setData] = useState<any>(null);
  const [doctor, setDoctor] = useState<any>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/marketing-hub/overview')
      .then((r) => setData(payload(r)))
      .catch((e) => setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message));
    api.get('/marketing-hub/doctor').then((r) => setDoctor(payload(r))).catch(() => {});
    api.get('/marketing-hub/channels').then((r) => setChannels(payload(r)?.channels ?? [])).catch(() => {});
  }, []);

  const tiles: Array<{ label: string; value: any; sub?: string }> = data ? [
    { label: 'Campaigns (30d)', value: data.campaigns_30d, sub: `${data.campaigns_total} all-time · ${data.campaigns_active} active` },
    { label: 'Messages sent (30d)', value: data.messages_30d, sub: `₹${Number(data.spend_30d ?? 0).toFixed(2)} spend` },
    { label: 'Approved templates', value: data.templates_approved, sub: `${data.templates_pending} pending approval` },
    { label: 'Audience lists', value: data.lists_total, sub: `${data.consented_contacts} consented contacts` },
    { label: 'Active automations', value: data.automations_active, sub: `${data.automations_30d} runs (30d)` },
    { label: 'Push subscribers', value: data.push_subscribers },
    { label: 'Ad campaigns active', value: data.ads_active, sub: `${data.ad_accounts} connected accounts` },
    { label: 'Ad spend (tracked)', value: `₹${Number(data.ads_spend ?? 0).toFixed(0)}` },
  ] : [];

  const failing = (doctor?.checks ?? []).filter((c: any) => !c.ok);

  return (
    <Page>
      <PageHeader
        title="Marketing"
        icon={Megaphone}
        description="Campaigns, templates, audiences, automation, ads and analytics — consent-first (GDPR/DPDP)."
        actions={
          <>
            {hasPerm('marketing.manage') && (
              <Btn size="sm" asChild><Link to="/panel/marketing/campaigns">New campaign</Link></Btn>
            )}
            <Btn variant="outline" size="sm" asChild><Link to="/panel/marketing/analytics">Analytics</Link></Btn>
          </>
        }
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <div className="mt-1 text-xs">
            If this says a table is missing or the module is disabled: restart the backend (migrations
            auto-apply at boot) and check Settings → Modules, then reload.
          </div>
        </div>
      )}

      {/* Setup checklist — only the checks that are actually failing. Channel
          credentials are resolved by the same code a real send uses, so a
          store with working credentials is never told they are missing. */}
      {doctor && (
        failing.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={2.25} />
              Setup checklist — fix these to get everything working
            </div>
            <ul className="space-y-1 text-sm text-amber-800">
              {failing.map((c: any) => (
                <li key={c.key}>· <b>{c.message}</b>{c.fix ? <> — {c.fix}</> : null}</li>
              ))}
            </ul>
            <div className="mt-1 text-xs text-amber-700">
              {doctor.checks.length - failing.length} of {doctor.checks.length} checks passing.
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.25} />
            All {doctor.checks.length} setup checks passing — modules, wallet, templates, channels and ads are configured.
          </div>
        )
      )}

      {/* Per-channel panels — the entry point into each campaign type. */}
      <SectionCard
        title="Campaign channels"
        description="Each channel is its own panel, with its own readiness, limits and history."
        action={<Btn variant="ghost" size="sm" asChild><Link to="/panel/marketing/campaigns">Open campaigns</Link></Btn>}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {channels.length === 0 && CHANNEL_LIST.map((c) => (
            <div key={c.key} className="h-44 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
          ))}
          {channels
            .slice()
            .sort((a, b) => CHANNEL_LIST.findIndex((c) => c.key === a.channel) - CHANNEL_LIST.findIndex((c) => c.key === b.channel))
            .map((s) => <ChannelCard key={s.channel} status={s} />)}
        </div>
      </SectionCard>

      <StatGrid cols={4}>
        {tiles.map((t) => (
          <StatCard key={t.label} label={t.label} value={t.value ?? '—'} sub={t.sub} />
        ))}
        {!data && !error && CHANNEL_LIST.map((c) => (
          <div key={c.key} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-3">
        {hasPerm('marketing.manage') && (
          <Link to="/panel/marketing/campaigns" className={cn(CARD, 'p-4 transition-colors hover:border-gray-300 hover:bg-gray-50/60')}>
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <Megaphone className="h-4 w-4 text-gray-500" strokeWidth={2.25} /> New campaign
            </div>
            <div className="mt-1 text-sm text-gray-500">SMS · WhatsApp · Email · Push, sent with approved templates only.</div>
          </Link>
        )}
        {hasPerm('marketing.manage') && (
          <Link to="/panel/marketing/audiences" className={cn(CARD, 'p-4 transition-colors hover:border-gray-300 hover:bg-gray-50/60')}>
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <Users className="h-4 w-4 text-gray-500" strokeWidth={2.25} /> Build an audience
            </div>
            <div className="mt-1 text-sm text-gray-500">CRM leads, contacts, B2B/B2C customers, or CSV import.</div>
          </Link>
        )}
        {canAccess('ads_management') && hasPerm('ads.read') && (
          <Link to="/panel/marketing/ads" className={cn(CARD, 'p-4 transition-colors hover:border-gray-300 hover:bg-gray-50/60')}>
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <BarChart3 className="h-4 w-4 text-gray-500" strokeWidth={2.25} /> Ads manager
            </div>
            <div className="mt-1 text-sm text-gray-500">Google, Meta, Snapchat, Shopping & remarketing.</div>
          </Link>
        )}
      </div>

      {data?.templates_pending > 0 && hasPerm('marketing.approve') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          {data.templates_pending} template{data.templates_pending > 1 ? 's' : ''} waiting for your approval —{' '}
          <Link to="/panel/marketing/templates" className="font-medium underline">review now</Link>.
        </div>
      )}
    </Page>
  );
};

export default MarketingDashboard;
