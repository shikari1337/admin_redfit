import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';

/**
 * Connector insights — Search Console, Analytics and Merchant Center in one
 * screen, fed by GET /connectors/dashboard.
 *
 * That endpoint never fails as a whole: each block reports its own connected /
 * error state, so one broken integration cannot blank the page. This component
 * mirrors that contract rather than assuming data is present.
 */

const nf = new Intl.NumberFormat('en-IN');
const pctFmt = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

const Delta: React.FC<{ value?: number; inverse?: boolean }> = ({ value, inverse }) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const good = inverse ? value < 0 : value > 0;
  const neutral = value === 0;
  return (
    <span className={`ml-2 text-xs font-medium ${
      neutral ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-600'}`}>
      {pctFmt(value)}
    </span>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; delta?: number; inverse?: boolean }> =
  ({ label, value, delta, inverse }) => (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value}<Delta value={delta} inverse={inverse} />
      </div>
    </div>
  );

const Block: React.FC<{
  title: string; state: any; connectHint: string; children: (data: any) => React.ReactNode;
}> = ({ title, state, connectHint, children }) => (
  <section className="mb-8">
    <h2 className="mb-3 text-lg font-semibold">{title}</h2>
    {!state?.connected ? (
      <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-600">
        Not connected. <Link to="/panel/marketing/connections" className="text-primary hover:underline">
          {connectHint}
        </Link>
      </div>
    ) : state.error ? (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.error}</div>
    ) : (
      children(state.data)
    )}
  </section>
);

const ConnectorInsights: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [inspectUrl, setInspectUrl] = useState('');
  const [inspection, setInspection] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(payload(await api.get('/connectors/dashboard'))); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitSitemap = async () => {
    setBusy('sitemap'); setError('');
    try {
      const r = payload<any>(await api.post('/connectors/google/search-console/sitemaps', {}));
      alert(`Sitemap submitted to Search Console:\n${r.sitemapUrl}`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  const syncMerchant = async () => {
    setBusy('merchant'); setError('');
    try {
      const r = payload<any>(await api.post('/connectors/google/merchant/sync-status', {}));
      alert(`Scanned ${r.scanned} offers — ${r.approved} approved, ${r.pending} pending, ${r.disapproved} disapproved.`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  const runInspect = async () => {
    if (!inspectUrl) return;
    setBusy('inspect'); setError(''); setInspection(null);
    try {
      setInspection(payload(await api.post('/connectors/google/search-console/inspect', { url: inspectUrl })));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading insights…</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Search, Analytics &amp; Shopping</h1>
          <p className="mt-1 text-sm text-gray-600">
            Live data from your connected Google services.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">Refresh</button>
          <Link to="/panel/marketing/connections"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Manage connections
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* ── Search Console ─────────────────────────────────────────── */}
      <Block title="Search Console" state={data?.searchConsole} connectHint="Connect Search Console">
        {(sc) => (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Tile label="Clicks" value={nf.format(sc.totals?.clicks ?? 0)} delta={sc.deltas?.clicks} />
              <Tile label="Impressions" value={nf.format(sc.totals?.impressions ?? 0)} delta={sc.deltas?.impressions} />
              <Tile label="CTR" value={`${((sc.totals?.ctr ?? 0) * 100).toFixed(2)}%`} delta={sc.deltas?.ctr} />
              <Tile label="Avg position" value={(sc.totals?.position ?? 0).toFixed(1)} delta={sc.deltas?.position} />
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button onClick={submitSitemap} disabled={busy === 'sitemap'}
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                {busy === 'sitemap' ? 'Submitting…' : 'Submit sitemap'}
              </button>
              <div className="flex flex-1 gap-2">
                <input value={inspectUrl} onChange={(e) => setInspectUrl(e.target.value)}
                  placeholder="https://yourstore.com/product/… — check if a URL is indexed"
                  className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm" />
                <button onClick={runInspect} disabled={busy === 'inspect' || !inspectUrl}
                  className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                  Inspect
                </button>
              </div>
            </div>

            {inspection && (
              <div className="mb-4 rounded border bg-gray-50 p-3 text-sm">
                <div><strong>Verdict:</strong> {inspection.indexStatusResult?.verdict ?? '—'}</div>
                <div><strong>Coverage:</strong> {inspection.indexStatusResult?.coverageState ?? '—'}</div>
                <div><strong>Last crawled:</strong> {inspection.indexStatusResult?.lastCrawlTime ?? 'never'}</div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {[['Top queries', sc.topQueries], ['Top pages', sc.topPages]].map(([label, rows]: any) => (
                <div key={label} className="overflow-hidden rounded-lg border bg-white">
                  <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold">{label}</div>
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">{label === 'Top queries' ? 'Query' : 'Page'}</th>
                        <th className="px-3 py-2 text-right font-medium">Clicks</th>
                        <th className="px-3 py-2 text-right font-medium">Impr.</th>
                        <th className="px-4 py-2 text-right font-medium">Pos.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(rows ?? []).slice(0, 10).map((r: any) => (
                        <tr key={r.key}>
                          <td className="max-w-[16rem] truncate px-4 py-2" title={r.key}>{r.key}</td>
                          <td className="px-3 py-2 text-right">{nf.format(r.clicks)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{nf.format(r.impressions)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{r.position?.toFixed(1)}</td>
                        </tr>
                      ))}
                      {!(rows ?? []).length && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No data yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}
      </Block>

      {/* ── Analytics ──────────────────────────────────────────────── */}
      <Block title="Analytics (GA4)" state={data?.analytics} connectHint="Connect Analytics">
        {(ga) => (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Tile label="Active users" value={nf.format(ga.totals?.activeUsers ?? 0)} delta={ga.deltas?.activeUsers} />
              <Tile label="Sessions" value={nf.format(ga.totals?.sessions ?? 0)} delta={ga.deltas?.sessions} />
              <Tile label="Page views" value={nf.format(ga.totals?.screenPageViews ?? 0)} delta={ga.deltas?.screenPageViews} />
              <Tile label="Bounce rate" value={`${((ga.totals?.bounceRate ?? 0) * 100).toFixed(1)}%`}
                delta={ga.deltas?.bounceRate} inverse />
            </div>
            {ga.ecommerce && (
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Tile label="GA4 revenue" value={`₹${nf.format(Math.round(ga.ecommerce.totalRevenue ?? 0))}`} />
                <Tile label="Transactions" value={nf.format(ga.ecommerce.transactions ?? 0)} />
                <Tile label="Avg order value"
                  value={`₹${nf.format(Math.round(ga.ecommerce.averagePurchaseRevenue ?? 0))}`} />
              </div>
            )}
            <div className="overflow-hidden rounded-lg border bg-white">
              <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold">Traffic by channel</div>
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
                  {(ga.channels ?? []).map((c: any) => (
                    <tr key={c.sessionDefaultChannelGroup}>
                      <td className="px-4 py-2">{c.sessionDefaultChannelGroup}</td>
                      <td className="px-3 py-2 text-right">{nf.format(c.sessions)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{nf.format(c.activeUsers)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{nf.format(c.conversions ?? 0)}</td>
                    </tr>
                  ))}
                  {!(ga.channels ?? []).length && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Block>

      {/* ── Merchant Center ────────────────────────────────────────── */}
      <Block title="Merchant Center" state={data?.merchant} connectHint="Connect Merchant Center">
        {(m) => (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {m.lastCheckedAt
                  ? `Last checked ${new Date(m.lastCheckedAt).toLocaleString('en-IN')}`
                  : 'Never checked — run a scan to pull per-offer approval status.'}
              </p>
              <button onClick={syncMerchant} disabled={busy === 'merchant'}
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                {busy === 'merchant' ? 'Scanning…' : 'Scan product status'}
              </button>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Tile label="Total offers" value={nf.format(m.total ?? 0)} />
              <Tile label="Approved" value={nf.format(m.byStatus?.approved ?? 0)} />
              <Tile label="Pending" value={nf.format(m.byStatus?.pending ?? 0)} />
              <Tile label="Disapproved" value={nf.format(m.byStatus?.disapproved ?? 0)} />
            </div>
            {(m.topIssues ?? []).length > 0 && (
              <div className="overflow-hidden rounded-lg border bg-white">
                <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold">
                  Most common issues
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {m.topIssues.map((i: any) => (
                      <tr key={i.code}>
                        <td className="px-4 py-2">{i.description ?? i.code}</td>
                        <td className="px-4 py-2 text-right font-medium">{nf.format(i.affected)} SKUs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Block>

      {/* ── Google Ads ─────────────────────────────────────────────── */}
      <Block title="Google Ads" state={data?.ads} connectHint="Connect Google Ads">
        {(campaigns) => (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium">Conv.</th>
                  <th className="px-4 py-2 text-right font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(campaigns ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.status}</td>
                    <td className="px-3 py-2 text-right">₹{nf.format(Math.round(c.spend))}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{nf.format(c.clicks)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{c.conversions?.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
                {!(campaigns ?? []).length && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No campaigns with data in the last 30 days
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Block>
    </div>
  );
};

export default ConnectorInsights;
