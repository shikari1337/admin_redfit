/**
 * Marketing home (`/panel/marketing`, MENU-02, lane META-15B). Leads with what to act on today, across Meta, Google and
 * messages: rejected ads and the other Meta alerts (spend without sales, return below target, cost spikes, fatigue),
 * products Meta refused, chats waiting for a reply, comments waiting for an answer, a Meta login about to end, posts
 * that failed to publish, failing setup checks and templates waiting for approval. Then the KPI tiles for the last 30
 * days, then one table of every channel with its state and numbers.
 *
 * Every figure comes from a route the admin already calls (marketing hub overview, doctor and channels; Meta alerts,
 * insights, setup, catalog summary; social posts and comments; the inbox; lead ads). A read that is not served on
 * this server, or that this person may not open, leaves its line out; nothing is guessed.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Megaphone } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { Page, PageHeader, StatCard, StatGrid, Btn, CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { INBOX_CHANNELS, INBOX_CHANNEL_LABEL } from '@/lib/v2/messaging';
import { metaAdsApi, metaApi, metaLeadsApi, metaSocialApi, type MetaAlert } from '@/lib/v2/areas/meta';
import { readinessLabel, type ChannelStatus } from './campaigns/ChannelReadiness';
import { CHANNEL_LIST, CHANNEL_META } from './campaigns/channelMeta';
import { ago, money, moneyMajor, num, plural, useLoad, type Tone } from './meta/common';
import { ADS_ROUTES, META_ROUTES, SOCIAL_ROUTES, connectionsHref, metaHref } from './meta/routes';
import { alertLink, dayIso, roasText, toneOfAlert } from './meta/ads/shared';
import { tokenEndsSoon, useTokenWarnDays } from './meta/SetupTab';
import { useInboxSummary } from './meta/inbox/InboxPage';
import { paceState, pctOf } from './budgetPace';

/** The KPI tiles and the channel table cover the last 30 store days (yesterday back). */
const PERIOD_DAYS = 30;

interface Act { key: string; tone: Tone; text: React.ReactNode; to: string; label: string; since?: string | null }

const hubGet = (path: string) => api.get(path).then((r) => payload(r));

const MarketingDashboard: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const mayAds = hasPerm('ads.read') && canAccess('ads_management') && canAccess('marketing');
  const mayMeta = hasPerm('marketing.read') && canAccess('connectors');
  const mayMarketing = hasPerm('marketing.read') && canAccess('marketing');
  const from = dayIso(-PERIOD_DAYS);
  const to = dayIso(-1);

  /* Reads (each fails on its own, quietly; `useLoad` keeps the error) */
  const overviewQ = useLoad(() => hubGet('/marketing-hub/overview'), []);
  const doctorQ = useLoad(() => hubGet('/marketing-hub/doctor'), []);
  const channelsQ = useLoad(() => hubGet('/marketing-hub/channels').then((d: any) => (d?.channels ?? []) as ChannelStatus[]), []);
  const alertsQ = useLoad(() => (mayAds ? metaAdsApi.alerts() : Promise.resolve([] as MetaAlert[])), [mayAds]);
  const insightsQ = useLoad(() => (mayAds ? metaAdsApi.insights({ level: 'account', from, to }) : Promise.resolve(null)), [mayAds, from, to]);
  const setupQ = useLoad(() => (mayMeta ? metaApi.setup() : Promise.resolve(null)), [mayMeta]);
  const catalogQ = useLoad(async () => {
    if (!mayMeta) return null;
    const fb = (await metaApi.channels()).find((c) => c.platform_code === 'facebook_catalog');
    return fb ? metaApi.catalogSummary(fb.id) : null;
  }, [mayMeta]);
  const socialQ = useLoad(() => (mayMarketing ? metaSocialApi.channels() : Promise.resolve([])), [mayMarketing]);
  const failedPostsQ = useLoad(() => (mayMarketing ? metaSocialApi.posts({ status: 'failed', limit: 10 }) : Promise.resolve(null)), [mayMarketing]);
  const commentsQ = useLoad(() => (mayMarketing ? metaSocialApi.comments({ status: 'open', limit: 1 }) : Promise.resolve(null)), [mayMarketing]);
  const socialInsightsQ = useLoad(() => (mayMarketing ? metaSocialApi.insights({ from, to }) : Promise.resolve(null)), [mayMarketing, from, to]);
  const leadsQ = useLoad(() => (mayMarketing ? metaLeadsApi.leads({ from, to, limit: 1 }) : Promise.resolve(null)), [mayMarketing, from, to]);
  /* The store's own attribution and budget pace (MENU-1: the spec's "revenue attributed" on the home) */
  const kpisQ = useLoad(() => (mayMarketing ? api.get('/marketing-hub/analytics/kpis', { params: { days: PERIOD_DAYS } }).then((r) => payload<any>(r)) : Promise.resolve(null)), [mayMarketing]);
  const inbox = useInboxSummary(mayMarketing ? INBOX_CHANNELS : []);
  const warnDays = useTokenWarnDays();

  const data: any = overviewQ.data;
  const doctor: any = doctorQ.data;
  const alerts = alertsQ.data ?? [];
  const ins = insightsQ.data;
  const cur = ins?.currency ?? 'INR';
  const conn = setupQ.data?.connection ?? null;
  const unread = INBOX_CHANNELS.map((c) => ({ c, n: inbox.byChannel[c]?.unread ?? 0 })).filter((x) => x.n > 0);

  /* What to act on, most serious first */
  const acts: Act[] = useMemo(() => {
    const out: Act[] = [];
    for (const a of alerts) {
      const l = alertLink(a);
      out.push({ key: `alert-${a.kind}-${a.id ?? ''}`, tone: toneOfAlert(a.kind), text: a.text, to: l.to, label: l.label, since: a.since });
    }
    if (setupQ.data && !conn) {
      out.push({ key: 'connect', tone: 'warn', text: 'Meta is not connected: the catalog, ads, posts and Messenger and Instagram chats need it.', to: connectionsHref('meta'), label: 'Connect' });
    }
    const ends = tokenEndsSoon(conn, warnDays);
    const tokenBad = conn?.token_valid === false || !!conn?.token_error;
    if ((tokenBad || ends !== null) && !alerts.some((a) => a.kind === 'token')) {
      out.push({ key: 'token', tone: 'bad', text: tokenBad ? `Meta no longer accepts the store's connection${conn?.token_error ? `: ${conn.token_error}` : '.'}` : ends !== null && ends < 0 ? 'Meta access has ended; catalog, ads and messages have stopped.' : `Meta access ends in ${plural(ends ?? 0, 'day')}. Reconnect with the business login so it does not end.`, to: connectionsHref('meta'), label: 'Reconnect' });
    }
    const errors = catalogQ.data?.counts?.errors ?? 0;
    if (errors > 0) out.push({ key: 'catalog', tone: 'bad', text: `Meta refused ${plural(errors, 'product')} in your catalog, so they do not show in the shop or in ads.`, to: metaHref(META_ROUTES.catalog, { status: 'error' }), label: 'Fix products' });
    const failed = failedPostsQ.data?.total ?? 0;
    if (failed > 0) out.push({ key: 'posts', tone: 'bad', text: `${plural(failed, 'post')} failed to publish on a channel.`, to: metaHref(SOCIAL_ROUTES.publisher), label: 'Try again' });
    if (unread.length) {
      const total = unread.reduce((t, x) => t + x.n, 0);
      out.push({ key: 'inbox', tone: 'warn', text: `${plural(total, 'chat')} waiting for a reply (${unread.map((x) => `${INBOX_CHANNEL_LABEL[x.c]} ${x.n}`).join(', ')}).`, to: metaHref(SOCIAL_ROUTES.inbox), label: 'Open inbox' });
    }
    const openComments = commentsQ.data?.total ?? 0;
    if (openComments > 0) out.push({ key: 'comments', tone: 'warn', text: `${plural(openComments, 'comment')} on your posts waiting for an answer.`, to: metaHref(SOCIAL_ROUTES.comments), label: 'Answer' });
    for (const c of (doctor?.checks ?? []).filter((x: any) => !x.ok)) {
      out.push({ key: `check-${c.key}`, tone: 'warn', text: <>{c.message}{c.fix ? `. ${c.fix}` : ''}</>, to: '/panel/marketing/settings', label: 'Fix' });
    }
    if (data?.templates_pending > 0 && hasPerm('marketing.approve')) {
      out.push({ key: 'templates', tone: 'info', text: `${plural(data.templates_pending, 'template')} waiting for your approval.`, to: '/panel/marketing/templates', label: 'Review' });
    }
    const budget = kpisQ.data?.budget;
    const pace = budget && Number(budget.monthly_total) > 0 ? paceState(budget.pace) : null;
    if (pace?.tone === 'bad') {
      const kc = kpisQ.data?.currency ?? 'INR';
      out.push({ key: 'budget', tone: 'warn', text: `Marketing is ${pace.text}: ${moneyMajor(Number(budget.mtd_spend ?? 0), kc)} spent of ${moneyMajor(Number(budget.monthly_total), kc)} with ${pctOf(budget.month_progress)} of the month gone.`, to: '/panel/marketing/performance', label: 'See pacing' });
    }
    const rank: Record<Tone, number> = { bad: 0, warn: 1, info: 2, neutral: 3, good: 4 };
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
  }, [alerts, conn, setupQ.data, warnDays, catalogQ.data, failedPostsQ.data, unread, commentsQ.data, doctor, data, hasPerm, kpisQ.data]);

  const reading = overviewQ.loading || alertsQ.loading || setupQ.loading || catalogQ.loading || failedPostsQ.loading || commentsQ.loading;

  /* KPI tiles (last 30 days) */
  const truth = ins?.store_truth ?? null;
  const tiles: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' }> = [];
  if (ins) {
    tiles.push({ label: 'Meta ad spend', value: money(ins.totals.spend_minor, cur), sub: `${num(ins.totals.impressions)} impressions` });
    tiles.push({ label: 'Sales Meta counts', value: money(ins.totals.purchase_value_minor, cur), sub: `${plural(ins.totals.purchases, 'purchase')}` });
    tiles.push({ label: 'Return on ad spend', value: roasText(ins.totals.roas), tone: ins.totals.roas !== null && ins.totals.roas < 1 ? 'bad' : 'default', sub: 'Meta sales divided by spend' });
    if (truth) tiles.push({ label: 'Orders your store matched', value: money(truth.revenue_minor, truth.currency ?? cur), sub: `${plural(truth.orders, 'order')} from ad clicks` });
  }
  const k = kpisQ.data;
  if (k) {
    const kc = k.currency ?? cur;
    tiles.push({ label: 'Sales from marketing', value: moneyMajor(Number(k.attributed_revenue ?? 0), kc), sub: <>{pctOf(k.attributed_share)} of {moneyMajor(Number(k.revenue ?? 0), kc)} store sales, by last click. <Link className="hover:underline" to="/panel/marketing/performance">Performance</Link></> });
  }
  if (data) {
    tiles.push({ label: 'Messages sent', value: num(data.messages_30d), sub: `${moneyMajor(Number(data.spend_30d ?? 0), cur)} spent on messages` });
  }
  if (leadsQ.data) tiles.push({ label: 'Leads from Meta forms', value: num(leadsQ.data.total), sub: <Link className="hover:underline" to={metaHref(ADS_ROUTES.leads)}>See the leads</Link> });

  /* The channel table */
  const hubChannels = channelsQ.data ?? [];
  const social = socialQ.data ?? [];
  const sIns = socialInsightsQ.data?.channels ?? {};
  type Row = { key: string; name: string; state: { text: string; tone: Tone }; activity: string; money: string; to: string };
  const rows: Row[] = [];
  if (mayAds) {
    const account = setupQ.data?.items.find((i) => i.key === 'ad_account')?.picked ?? null;
    rows.push({ key: 'meta_ads', name: 'Meta ads', state: account ? { text: alerts.some((a) => toneOfAlert(a.kind) === 'bad') ? 'Needs you' : 'Running', tone: alerts.some((a) => toneOfAlert(a.kind) === 'bad') ? 'bad' : 'good' } : { text: 'No ad account', tone: 'warn' },
      activity: ins ? `${plural(ins.totals.purchases, 'purchase')}, ${num(ins.totals.clicks)} clicks` : 'Not read yet', money: ins ? `${money(ins.totals.spend_minor, cur)} spent` : '', to: metaHref(ADS_ROUTES.manager) });
  }
  if (mayMeta && catalogQ.data) {
    const c = catalogQ.data.counts;
    rows.push({ key: 'catalog', name: 'Meta catalog', state: c.errors ? { text: `${num(c.errors)} refused`, tone: 'bad' } : { text: 'In step', tone: 'good' }, activity: `${num(c.synced)} of ${num(c.total)} products on Meta`, money: '', to: metaHref(META_ROUTES.catalog) });
  }
  for (const s of social) {
    const name = s.key === 'facebook_page' ? 'Facebook Page' : s.key === 'instagram' ? 'Instagram' : s.key === 'threads' ? 'Threads' : s.key;
    const t = sIns[s.key]?.totals ?? {};
    const views = t.views ?? t.page_media_view;
    rows.push({ key: `social-${s.key}`, name, state: s.can_publish ? { text: 'Can post', tone: 'good' } : { text: s.connected ? 'Cannot post' : 'Not connected', tone: s.connected ? 'warn' : 'neutral' },
      activity: views != null ? `${num(views)} views` : s.account?.name ?? '', money: '', to: s.can_publish ? metaHref(SOCIAL_ROUTES.publisher) : connectionsHref(s.key === 'threads' ? 'threads' : 'meta') });
  }
  if (mayMarketing) {
    for (const c of INBOX_CHANNELS.filter((x) => x !== 'whatsapp')) {
      const b = inbox.byChannel[c];
      if (!b || b.gap) continue;
      rows.push({ key: `chat-${c}`, name: `${INBOX_CHANNEL_LABEL[c]} chats`, state: b.unread ? { text: `${num(b.unread)} waiting`, tone: 'warn' } : { text: 'All answered', tone: 'good' }, activity: `${plural(b.items.length, 'open chat')}`, money: '', to: metaHref(SOCIAL_ROUTES.inbox) });
    }
  }
  for (const s of [...hubChannels].sort((a, b) => CHANNEL_LIST.findIndex((c) => c.key === a.channel) - CHANNEL_LIST.findIndex((c) => c.key === b.channel))) {
    const r = readinessLabel(s);
    const tone: Tone = r.tone === 'green' ? 'good' : r.tone === 'red' ? 'bad' : r.tone === 'amber' ? 'warn' : 'neutral';
    rows.push({ key: `msg-${s.channel}`, name: CHANNEL_META[s.channel]?.label ?? s.channel, state: { text: r.text, tone },
      activity: `${num(s.messages_30d)} sent${s.failed_30d ? `, ${num(s.failed_30d)} failed` : ''}`, money: s.spend_30d ? `${moneyMajor(s.spend_30d, cur)} spent` : '', to: s.fix_path || `/panel/marketing/campaigns/${s.channel}` });
  }
  if (data && hasPerm('ads.read') && canAccess('ads_management')) {
    rows.push({ key: 'other_ads', name: 'Google and other ad accounts', state: data.ad_accounts ? { text: plural(data.ad_accounts, 'account'), tone: 'neutral' } : { text: 'None connected', tone: 'neutral' }, activity: `${plural(data.ads_active ?? 0, 'active campaign')}`, money: '', to: '/panel/marketing/ads' });
  }

  return (
    <Page>
      <PageHeader
        title="Marketing"
        icon={Megaphone}
        description="What to act on today, then what is running and what it brings in, across Meta, Google and messages."
        actions={
          <>
            {hasPerm('marketing.manage') && <Btn size="sm" asChild><Link to={metaHref(SOCIAL_ROUTES.publisher)}>New post</Link></Btn>}
            {hasPerm('ads.manage') && canAccess('ads_management') && <Btn size="sm" variant="outline" asChild><Link to={metaHref(ADS_ROUTES.create)}>Create ad</Link></Btn>}
            {hasPerm('marketing.manage') && <Btn size="sm" variant="outline" asChild><Link to="/panel/marketing/campaigns">New campaign</Link></Btn>}
          </>
        }
      />

      <section aria-labelledby="mh-act" className={cn(CARD, 'overflow-hidden')}>
        <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3', acts.some((a) => a.tone === 'bad') ? 'bg-red-50' : acts.length ? 'bg-amber-50/70' : 'bg-emerald-50/60')}>
          <h2 id="mh-act" className="flex items-center gap-2 text-base font-semibold text-gray-900">
            {acts.length ? <AlertTriangle className={cn('h-4 w-4', acts.some((a) => a.tone === 'bad') ? 'text-red-600' : 'text-amber-600')} /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {acts.length ? `${plural(acts.length, 'thing')} to act on` : reading ? 'Checking what needs you...' : 'Nothing needs you today'}
          </h2>
          {overviewQ.error && !overviewQ.error.gap && <span className="text-xs text-red-700">The marketing overview did not load: {overviewQ.error.message}</span>}
        </div>
        {acts.length > 0 && (
          <ul className="divide-y">
            {acts.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', a.tone === 'bad' ? 'bg-red-500' : a.tone === 'warn' ? 'bg-amber-500' : 'bg-blue-500')} aria-hidden />
                <span className="min-w-0 flex-1 text-gray-800">{a.text}{a.since ? <span className="text-xs text-gray-500"> ({ago(a.since)})</span> : null}</span>
                <Link to={a.to} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary hover:underline">{a.label}<ChevronRight className="h-3.5 w-3.5" /></Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Last {PERIOD_DAYS} days</h2>
        <StatGrid cols={4}>
          {tiles.map((t) => <StatCard key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone ?? 'default'} />)}
          {!tiles.length && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />)}
        </StatGrid>
      </div>

      <section aria-labelledby="mh-ch" className={cn(CARD, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="mh-ch" className="text-base font-semibold text-gray-900">Channels</h2>
          <span className="text-xs text-gray-500">Last {PERIOD_DAYS} days</span>
        </div>
        {!rows.length ? <p className="px-4 py-6 text-sm text-gray-500">{reading ? 'Loading the channels...' : 'No marketing channel is set up yet.'}</p> : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="text-left text-xs text-gray-500">
                <tr className="border-b"><th className="px-4 py-2 font-medium">Channel</th><th className="px-4 py-2 font-medium">State</th><th className="px-4 py-2 font-medium">Activity</th><th className="px-4 py-2 font-medium">Money</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2.5"><StateDot {...r.state} /></td>
                    <td className="px-4 py-2.5 text-gray-700">{r.activity}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.money}</td>
                    <td className="px-4 py-2.5 text-right"><Link to={r.to} className="text-sm font-medium text-primary hover:underline">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y md:hidden">
              {rows.map((r) => (
                <li key={r.key}>
                  <Link to={r.to} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2"><span className="font-medium text-gray-900">{r.name}</span><StateDot {...r.state} /></span>
                      <span className="block text-xs text-gray-600">{[r.activity, r.money].filter(Boolean).join(', ')}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Page>
  );
};

const StateDot: React.FC<{ text: string; tone: Tone }> = ({ text, tone }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
    <span className={cn('h-2 w-2 rounded-full', tone === 'good' ? 'bg-emerald-500' : tone === 'bad' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-gray-300')} aria-hidden />
    {text}
  </span>
);

export default MarketingDashboard;
