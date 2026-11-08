/**
 * Marketing > Insights > Social analytics (`/panel/marketing/social/insights`, lane META-15B, `GET /social/insights`).
 *
 * Leads with what to act on: a channel that is not connected, a read that failed, metrics Meta no longer gives. Then
 * per channel: the totals for the range as tiles, one metric a day as a line (with its table), and the latest
 * published posts with their own numbers. Numbers are only what the server kept from Meta and Threads; a metric Meta
 * refused is named, never filled in. The metric names per channel are the `social` setting's, not this screen's.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChartCard, Segmented, TimeSeries } from '@/components/panelAnalytics/Kit';
import { SERIES, fmtBucket } from '@/components/panelAnalytics/vizTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { isoDaysFromToday } from '@/utils/date';
import { metaSocialApi, type SocialInsightsChannel, type SocialPost } from '@/lib/v2/areas/meta';
import MetaHeader from '../MetaHeader';
import { Figure, Lead, LoadFailure, Section, ago, linkCls, num, plural, useLoad, writeError } from '../common';
import { META_ROUTES, SOCIAL_ROUTES, metaHref } from '../routes';
import { ChannelMark, channelName, civilDay, firstLine, metricLabel, metricValue, useSetup, useSocialChannels, when } from './shared';

/** Range presets in days (a screen choice; the server caps the range with its own setting). */
const RANGES = [7, 28, 90];

const SocialInsightsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const { toast } = useToast();
  const setupQ = useSetup();
  const chQ = useSocialChannels();
  const [days, setDays] = useState<number | null>(null);
  const range = days ? { from: isoDaysFromToday(-days), to: isoDaysFromToday(-1) } : {};
  const q = useLoad(() => metaSocialApi.insights(range), [days]);
  const postsQ = useLoad(() => metaSocialApi.posts({ status: 'published', limit: 10 }), []);
  const [reading, setReading] = useState(false);

  const shownDays = q.data?.from && q.data?.to ? Math.round((new Date(q.data.to).getTime() - new Date(q.data.from).getTime()) / 86_400_000) + 1 : null;
  const readNow = async () => {
    setReading(true);
    try { await metaSocialApi.syncInsights({ from: q.data?.from, to: q.data?.to }); toast({ title: 'Read from Meta and Threads' }); await q.reload(); await postsQ.reload(); }
    catch (e) { toast({ title: 'Not read', description: writeError(e, 'Meta did not answer.'), variant: 'destructive' }); }
    finally { setReading(false); }
  };

  const entries = Object.entries(q.data?.channels ?? {});
  const notConnected = (chQ.data ?? []).filter((c) => !c.account);
  const failed = entries.filter(([, c]) => c.error);
  const refused = entries.map(([k, c]) => [k, refusedOf(c)] as const).filter(([, r]) => r.length);

  return (
    <div className="space-y-5">
      <MetaHeader title="Social analytics" setup={setupQ.data}
        description="Views, reach, engagement and followers on your Facebook Page, Instagram and Threads, read from them every night."
        actions={hasPerm('marketing.manage') && <Button size="sm" variant="outline" onClick={readNow} disabled={reading || !q.data}>{reading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Read from Meta now</Button>} />

      {q.error && !q.data ? <LoadFailure failure={q.error} what="Social analytics (GET /api/v2/marketing/social/insights) is not served yet." onRetry={q.reload} /> : (
        <>
          {failed.map(([k, c]) => (
            <Lead key={k} tone="bad" title={`The last read of ${channelName(k)} failed`} actions={hasPerm('marketing.manage') && <Button size="sm" variant="outline" className="bg-white" onClick={readNow} disabled={reading}>Try again</Button>}>{c.error}</Lead>
          ))}
          {notConnected.length > 0 && (
            <Lead tone="warn" title={`No numbers from ${notConnected.map((c) => channelName(String(c.key))).join(' or ')}`}>
              <ul className="space-y-0.5">
                {notConnected.map((c) => (
                  <li key={String(c.key)} className="flex flex-wrap items-baseline gap-x-2">
                    <span>{c.reason ?? 'Not connected.'}</span>
                    <Link className={linkCls} to={c.key === 'threads' ? '/panel/marketing/connections' : metaHref(META_ROUTES.setup)}>{c.key === 'threads' ? 'Open Connections' : 'Open setup'}</Link>
                  </li>
                ))}
              </ul>
            </Lead>
          )}
          {!failed.length && !notConnected.length && q.data && <Lead tone="good" title="Every channel was read">The numbers below are as Meta and Threads gave them.</Lead>}
          {refused.length > 0 && (
            <Lead tone="info" title="Some numbers are no longer given">
              {refused.map(([k, r]) => <p key={k}>{channelName(k)} no longer answers {r.map(metricLabel).join(', ').toLowerCase()}, so {r.length === 1 ? 'it is' : 'they are'} left out rather than guessed.</p>)}
            </Lead>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Range" value={String(days ?? shownDays ?? '')} onChange={(k) => setDays(Number(k))} options={RANGES.map((n) => ({ key: String(n), label: `${n} days` }))} />
            {q.data?.from && q.data.to && <span className="text-xs text-gray-500">{civilDay(q.data.from)} to {civilDay(q.data.to)}</span>}
          </div>

          {!q.data ? <p className="text-sm text-gray-500">Loading...</p>
            : entries.filter(([, c]) => c.account).map(([k, c]) => <ChannelBlock key={k} channelKey={k} c={c} />)}

          <Section title="Latest posts" hint="Each post's numbers on each channel, read every night."
            actions={<Link className={`${linkCls} text-sm`} to={metaHref(SOCIAL_ROUTES.publisher)}>Open the Publisher</Link>}>
            {postsQ.error && !postsQ.data ? <LoadFailure failure={postsQ.error} what="Posts could not be read." onRetry={postsQ.reload} />
              : !postsQ.data ? <p className="text-sm text-gray-500">Loading...</p>
                : !postsQ.data.posts.length ? <p className="text-sm text-gray-600">Nothing published yet.</p> : (
                  <ul className="-my-2 divide-y">{postsQ.data.posts.map((p) => <PostRow key={p.id} p={p} />)}</ul>
                )}
          </Section>
        </>
      )}
    </div>
  );
};

const refusedOf = (c: SocialInsightsChannel): string[] => (Array.isArray(c.refused) ? (c.refused as unknown[]).map((r) => (typeof r === 'string' ? r : String((r as { metric?: string })?.metric ?? ''))).filter(Boolean) : []);

const ChannelBlock: React.FC<{ channelKey: string; c: SocialInsightsChannel }> = ({ channelKey, c }) => {
  const keys = useMemo(() => {
    const seen = new Set<string>();
    for (const d of c.days) Object.keys(d.metrics ?? {}).forEach((k) => seen.add(k));
    Object.keys(c.totals ?? {}).forEach((k) => seen.add(k));
    return [...seen];
  }, [c]);
  const [metric, setMetric] = useState(keys[0] ?? '');
  const m = keys.includes(metric) ? metric : keys[0] ?? '';
  const data = c.days.map((d) => ({ bucket: d.date, value: metricValue(d.metrics?.[m]) }));
  const name = c.account?.handle ? `@${c.account.handle}` : c.account?.name ?? '';
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-gray-900"><ChannelMark channel={channelKey} withName className="text-lg text-gray-900" /></h2>
        <span className="text-sm text-gray-600">{name}</span>
        {c.synced_at && <span className="text-xs text-gray-500">Read {ago(c.synced_at)}</span>}
      </div>
      {!keys.length ? <p className="text-sm text-gray-600">No numbers kept for this range yet. They are read every night.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {keys.filter((k) => c.totals?.[k] !== undefined).map((k) => (
              <Figure key={k} label={metricLabel(k)} value={num(metricValue(c.totals[k]))} active={k === m} onClick={() => setMetric(k)} />
            ))}
          </div>
          <ChartCard title={`${metricLabel(m)} a day`} sub={`${channelName(channelKey)}, ${plural(c.days.length, 'day')}`}
            table={{ columns: [{ key: 'bucket', label: 'Day', format: (v) => fmtBucket(String(v), 'day') }, { key: 'value', label: metricLabel(m), format: (v) => (v == null ? 'Not given' : num(v)) }], rows: [...data].reverse() }}>
            <TimeSeries data={data} granularity="day" series={[{ key: 'value', name: metricLabel(m), color: SERIES[0], kind: 'line' }]} height={220} />
          </ChartCard>
        </>
      )}
    </section>
  );
};

const PostRow: React.FC<{ p: SocialPost }> = ({ p }) => (
  <li className="flex gap-3 py-2.5">
    {p.media[0]?.url ? <img src={p.media[0].url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <span className="h-12 w-12 shrink-0 rounded bg-gray-100" aria-hidden />}
    <div className="min-w-0 flex-1 space-y-1">
      <p className="truncate text-sm font-medium text-gray-900">{firstLine(p)}</p>
      <p className="text-xs text-gray-500">{p.published_at ? `Published ${when(p.published_at)}` : ''}</p>
      <ul className="space-y-0.5">
        {p.channels.filter((ch) => ch.status === 'published').map((ch) => {
          const ms = Object.entries(ch.metrics ?? {}).map(([k, v]) => [k, metricValue(v)] as const).filter(([, v]) => v !== null);
          return (
            <li key={String(ch.key)} className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-700">
              <ChannelMark channel={String(ch.key)} withName />
              {ms.length ? ms.map(([k, v]) => <span key={k}><b className="tabular-nums">{num(v)}</b> {metricLabel(k).toLowerCase()}</span>) : <span className="text-gray-500">Numbers come the night after it goes out.</span>}
            </li>
          );
        })}
      </ul>
    </div>
  </li>
);

export default SocialInsightsPage;
