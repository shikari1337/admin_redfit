import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { connectionsHref } from './meta/routes';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';
import { localeDateTime } from '../../../utils/date';
import { Page, PageHeader, Btn, CARD } from '@/components/erp';
import { cn } from '@/lib/utils';
import { Lead, moneyMajor, num, plural, type Tone } from './meta/common';

/**
 * Search insights (`/panel/marketing/connections/insights`): Search Console, Analytics, Merchant Center, Google Ads and
 * PageSpeed in one screen. Opens with what to act on (products Google refused, a Google service that failed), then the
 * numbers.
 *
 * `GET /connectors/dashboard` never fails as a whole: each block reports its own connected or error state, so one broken
 * service cannot blank the page. PageSpeed (`GET /connectors/google/pagespeed`, v2 `/marketing/google/pagespeed`) runs one
 * page on a phone or a desktop; with no address the server checks the store's home page. A sitemap submitted with no
 * address is the store's own (the robots `Sitemap:` line, else `/sitemap.xml` on the store domain).
 */

const errOf = (e: any): string => e?.response?.data?.message ?? e?.message ?? 'Something went wrong.';
const pctFmt = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
const DEVICES = [{ key: 'mobile', label: 'Phone' }, { key: 'desktop', label: 'Desktop' }] as const;

/** Lighthouse bands: 90 and up good, 50 to 89 needs work, under 50 poor. */
const scoreTone = (s: number | null | undefined): Tone => (s == null ? 'neutral' : s >= 90 ? 'good' : s >= 50 ? 'warn' : 'bad');
const TONE_INK: Record<Tone, string> = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', info: 'text-blue-700', neutral: 'text-gray-900' };

const Delta: React.FC<{ value?: number; inverse?: boolean }> = ({ value, inverse }) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const good = inverse ? value < 0 : value > 0;
  const neutral = value === 0;
  return (
    <span className={cn('ml-2 text-xs font-medium', neutral ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-600')}>
      {pctFmt(value)}
    </span>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; delta?: number; inverse?: boolean; tone?: Tone }> =
  ({ label, value, delta, inverse, tone }) => (
    <div className={cn(CARD, 'p-4')}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', TONE_INK[tone ?? 'neutral'])}>
        {value}<Delta value={delta} inverse={inverse} />
      </div>
    </div>
  );

const Block: React.FC<{
  title: string; state: any; connectHint: string; children: (data: any) => React.ReactNode;
}> = ({ title, state, connectHint, children }) => (
  <section className="space-y-3">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {!state?.connected ? (
      <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-600">
        Not connected. <Link to={connectionsHref('google')} className="text-primary hover:underline">{connectHint}</Link>
      </div>
    ) : state.error ? (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.error}</div>
    ) : (
      children(state.data)
    )}
  </section>
);

const TableWrap: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className={cn(CARD, 'overflow-hidden')}>
    <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold">{title}</div>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

const ConnectorInsights: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [inspectUrl, setInspectUrl] = useState('');
  const [inspection, setInspection] = useState<any>(null);
  const [speedUrl, setSpeedUrl] = useState('');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [pageSpeed, setPageSpeed] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(payload(await api.get('/connectors/dashboard'))); setError(''); }
    catch (e: any) { setError(errOf(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(''); setInfo('');
    try { await fn(); } catch (e: any) { setError(errOf(e)); } finally { setBusy(''); }
  };

  const submitSitemap = () => run('sitemap', async () => {
    const r = payload<any>(await api.post('/connectors/google/search-console/sitemaps', sitemapUrl.trim() ? { url: sitemapUrl.trim() } : {}));
    setInfo(`Sitemap sent to Search Console: ${r?.sitemap_url ?? r?.sitemapUrl ?? 'the store sitemap'}.`);
    await load();
  });

  const syncMerchant = () => run('merchant', async () => {
    const r = payload<any>(await api.post('/connectors/google/merchant/sync-status', {}));
    setInfo(`Checked ${num(r?.scanned)} products: ${num(r?.approved)} approved, ${num(r?.pending)} pending, ${num(r?.disapproved)} refused.`);
    await load();
  });

  const runInspect = () => run('inspect', async () => {
    setInspection(null);
    setInspection(payload(await api.post('/connectors/google/search-console/inspect', { url: inspectUrl.trim() })));
  });

  const runPageSpeed = () => run('pagespeed', async () => {
    setPageSpeed(null);
    const params: Record<string, string> = { strategy: device };
    if (speedUrl.trim()) params.url = speedUrl.trim();
    setPageSpeed(payload(await api.get('/connectors/google/pagespeed', { params })));
  });

  const currency = data?.currency ?? 'INR';
  const sc = data?.searchConsole ?? data?.search_console;
  const merchant = data?.merchant;

  /* What to act on: products Google refused, and any connected Google service that failed to answer. */
  const acts: Array<{ key: string; tone: Tone; text: string }> = [];
  const refused = Number(merchant?.data?.byStatus?.disapproved ?? merchant?.data?.by_status?.disapproved ?? 0);
  if (merchant?.connected && !merchant?.error && refused > 0) {
    acts.push({ key: 'refused', tone: 'bad', text: `Google refused ${plural(refused, 'product')} in Merchant Center, so they do not show in Shopping ads. See the issues below.` });
  }
  for (const [key, label] of [['searchConsole', 'Search Console'], ['analytics', 'Analytics'], ['merchant', 'Merchant Center'], ['ads', 'Google Ads']] as const) {
    const b = key === 'searchConsole' ? sc : data?.[key];
    if (b?.connected && b?.error) acts.push({ key, tone: 'warn', text: `${label} did not answer: ${b.error}` });
  }
  const scores = pageSpeed?.scores ?? {};
  const perf = scores.performance ?? null;
  if (perf != null && perf < 50) acts.push({ key: 'speed', tone: 'warn', text: `The page scored ${perf} for speed on ${pageSpeed?.strategy === 'desktop' ? 'a desktop' : 'a phone'}. Slow pages lose shoppers and rank lower.` });
  const leadTone: Tone = acts.some((a) => a.tone === 'bad') ? 'bad' : acts.length ? 'warn' : 'good';

  return (
    <Page>
      <PageHeader
        title="Search insights"
        icon={Search}
        description="What people searched before they found you, how Google sees your pages and products, and how fast your pages load."
        actions={
          <>
            <Btn size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Btn>
            <Btn size="sm" asChild><Link to={connectionsHref('google')}>Manage connections</Link></Btn>
          </>
        }
      />

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {info && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</div>}

      {loading && !data ? (
        <div className={cn(CARD, 'p-6 text-sm text-gray-500')}>Reading your Google services...</div>
      ) : (
        <Lead tone={leadTone} title={acts.length ? `${plural(acts.length, 'thing')} to act on` : 'Nothing needs you here today'}>
          {acts.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">{acts.map((a) => <li key={a.key}>{a.text}</li>)}</ul>
          )}
        </Lead>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Page speed</h2>
          <p className="mt-0.5 text-sm text-gray-600">Google's Lighthouse check of one page. Leave the address empty to check your home page.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm text-gray-700" style={{ minWidth: 'min(100%, 16rem)' }}>
            Page address
            <input value={speedUrl} onChange={(e) => setSpeedUrl(e.target.value)} inputMode="url"
              placeholder="https://yourstore.com/products/..."
              className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm" />
          </label>
          <div className="flex rounded-lg border bg-white p-0.5" role="group" aria-label="Device">
            {DEVICES.map((d) => (
              <button key={d.key} type="button" onClick={() => setDevice(d.key)} aria-pressed={device === d.key}
                className={cn('rounded-md px-3 py-1 text-sm', device === d.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                {d.label}
              </button>
            ))}
          </div>
          <Btn variant="outline" onClick={runPageSpeed} disabled={busy === 'pagespeed'}>
            {busy === 'pagespeed' ? 'Checking, this takes up to a minute...' : 'Check speed'}
          </Btn>
        </div>
        {pageSpeed ? (
          <div className={cn(CARD, 'space-y-3 p-4')}>
            <p className="truncate text-xs text-gray-500" title={pageSpeed.url}>
              {pageSpeed.url}{pageSpeed.fetched_at ? `, checked ${localeDateTime(pageSpeed.fetched_at, undefined, 'en-IN')}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Speed" value={scores.performance ?? 'Not read'} tone={scoreTone(scores.performance)} />
              <Tile label="Accessibility" value={scores.accessibility ?? 'Not read'} tone={scoreTone(scores.accessibility)} />
              <Tile label="Best practices" value={scores.best_practices ?? scores.bestPractices ?? 'Not read'} tone={scoreTone(scores.best_practices ?? scores.bestPractices)} />
              <Tile label="SEO" value={scores.seo ?? 'Not read'} tone={scoreTone(scores.seo)} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
              {[['lcp', 'Largest paint'], ['inp', 'Response to input'], ['cls', 'Layout shift'], ['fcp', 'First paint'], ['tbt', 'Blocking time']].map(([k, label]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{pageSpeed.metrics?.[k]?.display ?? 'Not measured'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-600">
            Switch on PageSpeed Insights on your Google connection, then check a page.
          </div>
        )}
      </section>

      <Block title="Search Console" state={sc} connectHint="Connect Search Console">
        {(d) => {
          const queries = d?.topQueries ?? d?.top_queries ?? [];
          const pages = d?.topPages ?? d?.top_pages ?? [];
          return (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Clicks" value={num(d?.totals?.clicks)} delta={d?.deltas?.clicks} />
                <Tile label="Impressions" value={num(d?.totals?.impressions)} delta={d?.deltas?.impressions} />
                <Tile label="Click rate" value={`${((d?.totals?.ctr ?? 0) * 100).toFixed(2)}%`} delta={d?.deltas?.ctr} />
                <Tile label="Average position" value={(d?.totals?.position ?? 0).toFixed(1)} delta={d?.deltas?.position} inverse />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm text-gray-700">
                    Sitemap address
                    <input value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)} inputMode="url"
                      placeholder="Empty sends the store's own sitemap"
                      className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm" />
                  </label>
                  <Btn variant="outline" onClick={submitSitemap} disabled={busy === 'sitemap'}>
                    {busy === 'sitemap' ? 'Sending...' : 'Send sitemap'}
                  </Btn>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm text-gray-700">
                    Is a page on Google?
                    <input value={inspectUrl} onChange={(e) => setInspectUrl(e.target.value)} inputMode="url"
                      placeholder="https://yourstore.com/products/..."
                      className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm" />
                  </label>
                  <Btn variant="outline" onClick={runInspect} disabled={busy === 'inspect' || !inspectUrl.trim()}>
                    {busy === 'inspect' ? 'Checking...' : 'Check page'}
                  </Btn>
                </div>
              </div>

              {inspection && (
                <dl className="grid gap-1 rounded-lg border bg-gray-50 p-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-gray-500">Verdict</dt><dd>{inspection.indexStatusResult?.verdict ?? 'Not given'}</dd></div>
                  <div><dt className="text-xs text-gray-500">Coverage</dt><dd>{inspection.indexStatusResult?.coverageState ?? 'Not given'}</dd></div>
                  <div><dt className="text-xs text-gray-500">Last crawled</dt><dd>{inspection.indexStatusResult?.lastCrawlTime ? localeDateTime(inspection.indexStatusResult.lastCrawlTime, undefined, 'en-IN') : 'Never'}</dd></div>
                </dl>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {([['Top searches', 'Search', queries], ['Top pages', 'Page', pages]] as const).map(([label, col, rows]) => (
                  <TableWrap key={label} title={label}>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">{col}</th>
                          <th className="px-3 py-2 text-right font-medium">Clicks</th>
                          <th className="px-3 py-2 text-right font-medium">Seen</th>
                          <th className="px-4 py-2 text-right font-medium">Position</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(rows as any[]).slice(0, 10).map((r: any) => (
                          <tr key={r.key}>
                            <td className="max-w-[16rem] truncate px-4 py-2" title={r.key}>{r.key}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{num(r.impressions)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500">{r.position != null ? Number(r.position).toFixed(1) : ''}</td>
                          </tr>
                        ))}
                        {!(rows as any[]).length && (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No searches recorded yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </TableWrap>
                ))}
              </div>
            </>
          );
        }}
      </Block>

      <Block title="Analytics (GA4)" state={data?.analytics} connectHint="Connect Analytics">
        {(ga) => (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Active users" value={num(ga?.totals?.activeUsers)} delta={ga?.deltas?.activeUsers} />
              <Tile label="Sessions" value={num(ga?.totals?.sessions)} delta={ga?.deltas?.sessions} />
              <Tile label="Page views" value={num(ga?.totals?.screenPageViews)} delta={ga?.deltas?.screenPageViews} />
              <Tile label="Bounce rate" value={`${((ga?.totals?.bounceRate ?? 0) * 100).toFixed(1)}%`} delta={ga?.deltas?.bounceRate} inverse />
            </div>
            {ga?.ecommerce && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tile label="GA4 revenue" value={moneyMajor(Number(ga.ecommerce.totalRevenue ?? 0), currency)} />
                <Tile label="Transactions" value={num(ga.ecommerce.transactions)} />
                <Tile label="Average order" value={moneyMajor(Number(ga.ecommerce.averagePurchaseRevenue ?? 0), currency)} />
              </div>
            )}
            <TableWrap title="Visits by channel">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Channel</th>
                    <th className="px-3 py-2 text-right font-medium">Sessions</th>
                    <th className="px-3 py-2 text-right font-medium">Users</th>
                    <th className="px-4 py-2 text-right font-medium">Conversions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(ga?.channels ?? []).map((c: any) => (
                    <tr key={c.sessionDefaultChannelGroup}>
                      <td className="px-4 py-2">{c.sessionDefaultChannelGroup}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(c.sessions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{num(c.activeUsers)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">{num(c.conversions)}</td>
                    </tr>
                  ))}
                  {!(ga?.channels ?? []).length && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No visits recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </Block>

      <Block title="Merchant Center" state={merchant} connectHint="Connect Merchant Center">
        {(m) => {
          const by = m?.byStatus ?? m?.by_status ?? {};
          const issues = m?.topIssues ?? m?.top_issues ?? [];
          const checked = m?.lastCheckedAt ?? m?.last_checked_at;
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  {checked ? `Last checked ${localeDateTime(checked, undefined, 'en-IN')}` : 'Never checked. Check now to read each product\'s approval.'}
                </p>
                <Btn variant="outline" size="sm" onClick={syncMerchant} disabled={busy === 'merchant'}>
                  {busy === 'merchant' ? 'Checking...' : 'Check products'}
                </Btn>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Products" value={num(m?.total)} />
                <Tile label="Approved" value={num(by.approved)} />
                <Tile label="Pending" value={num(by.pending)} />
                <Tile label="Refused" value={num(by.disapproved)} tone={Number(by.disapproved ?? 0) > 0 ? 'bad' : 'neutral'} />
              </div>
              {issues.length > 0 && (
                <TableWrap title="Most common issues">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {issues.map((i: any) => (
                        <tr key={i.code}>
                          <td className="px-4 py-2">{i.description ?? i.code}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{plural(Number(i.affected ?? 0), 'product')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </>
          );
        }}
      </Block>

      <Block title="Google Ads" state={data?.ads} connectHint="Connect Google Ads">
        {(campaigns) => (
          <TableWrap title="Campaigns, last 30 days">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium">Conversions</th>
                  <th className="px-4 py-2 text-right font-medium">Sales per 1 spent</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(campaigns ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moneyMajor(Number(c.spend ?? 0), currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{num(c.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{num(Math.round(Number(c.conversions ?? 0)))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(c.spend) > 0 ? (Number(c.revenue ?? 0) / Number(c.spend)).toFixed(2) : 'No spend'}</td>
                  </tr>
                ))}
                {!(campaigns ?? []).length && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No campaign with results in the last 30 days</td></tr>
                )}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Block>
    </Page>
  );
};

export default ConnectorInsights;
