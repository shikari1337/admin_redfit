import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { analyticsAPI, LiveSummary } from '../../services/analyticsService';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { ChartCard, CategoryBars, Donut, KpiTile, InsightCard, Insight, Unavailable } from '../../components/panelAnalytics/Kit';
import { ChevronDown, ChevronRight, Search, User } from 'lucide-react';
import { localeDateTime, todayIso } from '../../utils/date';

/**
 * Analytics > Users. Who visits and how: sessions, page views, devices, browsers, countries and the
 * most viewed products for a period, then one session's journey on demand (from the list, from
 * Realtime's `?session=` link, or a typed session id). "Active now" is the live summary's count, which
 * has no row cap. The visitor routes are the store owner's (`settings.manage`); anyone else reads a
 * plain sentence instead of zeros that look real.
 */

const count = (n: number | undefined | null) => Number(n ?? 0).toLocaleString('en-IN');
const words = (s: string | null | undefined) => {
  const t = String(s ?? '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown';
};
const OWNER_ONLY = 'Open to the store owner only';

const UserAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const [params, setParams] = useSearchParams();
  const [deviceStats, setDeviceStats] = useState<any>(null);
  const [geo, setGeo] = useState<any[]>([]);
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [traffic, setTraffic] = useState<{ sessions: number; page_views: number } | null>(null);
  const [live, setLive] = useState<LiveSummary | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const [sessionId, setSessionId] = useState(params.get('session') ?? '');
  const [journey, setJourney] = useState<any[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyAsked, setJourneyAsked] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params2 = { from: range.from ?? '2000-01-01', to: range.to ?? todayIso(), range: 'custom' };
    Promise.allSettled([
      api.get('/analytics/devices', { params: params2 }),
      api.get('/analytics/live/map', { params: params2 }),
      api.get('/analytics/dashboard', { params: params2 }),
      api.get('/analytics/panels/commerce', { params: { from: range.from, to: range.to } }),
      analyticsAPI.getRealtimeSummary(),
      api.get('/analytics/realtime/visitors'),
    ]).then(([d, g, dash, comm, sum, rt]) => {
      if (!alive) return;
      const refused = [d, g, dash].some((r) => r.status === 'rejected' && (r.reason as any)?.response?.status === 403);
      setOwnerOnly(refused);
      setDeviceStats(d.status === 'fulfilled' ? payload(d.value) : null);
      if (g.status === 'fulfilled') {
        const rows = payload<any>(g.value);
        const list: any[] = Array.isArray(rows) ? rows : [];
        setGeo(list.map((r: any) => ({ code: r.code ?? r.country ?? 'Unknown', count: Number(r.count ?? r.visits ?? 0) || 0 })));
      } else setGeo([]);
      setTopViewed(dash.status === 'fulfilled' ? (payload<any>(dash.value)?.topViewedProducts ?? payload<any>(dash.value)?.top_viewed_products ?? []) : []);
      if (comm.status === 'fulfilled') {
        const s = payload<any>(comm.value)?.summary;
        setTraffic(s ? { sessions: Number(s.sessions ?? 0), page_views: Number(s.page_views ?? 0) } : null);
      }
      setLive(sum.status === 'fulfilled' ? sum.value : null);
      setSessions(rt.status === 'fulfilled' ? (payload<any[]>(rt.value) ?? []) : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const loadJourney = async (sid: string) => {
    const id = sid.trim();
    if (!id) return;
    setSessionId(id);
    setJourneyAsked(id);
    if (params.get('session') !== id) setParams((p) => { const n = new URLSearchParams(p); n.set('session', id); return n; }, { replace: true });
    try {
      setJourneyLoading(true);
      const response = await api.get(`/analytics/user/journey/${encodeURIComponent(id)}`);
      setJourney(payload<any[]>(response) ?? []);
    } catch {
      setJourney([]);
    } finally {
      setJourneyLoading(false);
    }
  };

  // A session named in the address (Realtime links here) opens its journey at once.
  useEffect(() => {
    const sid = params.get('session');
    if (sid && sid !== journeyAsked) loadJourney(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const devices = (deviceStats?.devices ?? []) as Array<{ name: string; value: number }>;
  const deviceTotal = devices.reduce((t, d) => t + Number(d.value || 0), 0);

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    if (traffic && traffic.sessions === 0 && !loading) {
      out.push({
        tone: 'bad', title: 'No visits recorded in this period',
        body: <>Visits are counted only from shoppers who allowed analytics in the cookie banner. If the shop had orders, check that the banner shows and that tracking is on.</>,
        action: { label: 'Open SEO', to: '/seo' },
      });
    }
    if (traffic && traffic.sessions > 0) {
      const per = traffic.page_views / traffic.sessions;
      if (per < 2) {
        out.push({
          tone: 'bad', title: `${per.toFixed(1)} pages per visit`,
          body: <>Most visitors leave after the first page. Check what the busiest landing pages show first and how fast they load.</>,
        });
      }
    }
    const mobile = devices.filter((d) => /mobile|phone/i.test(String(d.name))).reduce((t, d) => t + Number(d.value || 0), 0);
    if (deviceTotal >= 20 && mobile / deviceTotal >= 0.7) {
      out.push({ tone: 'info', title: `${Math.round((mobile / deviceTotal) * 100)}% of activity is on a phone`, body: <>Test every change on a phone first.</> });
    }
    const topCountry = [...geo].sort((a, b) => b.count - a.count)[0];
    const geoTotal = geo.reduce((t, g) => t + g.count, 0);
    if (topCountry && geoTotal >= 20 && topCountry.count / geoTotal < 0.9) {
      out.push({
        tone: 'info', title: `${Math.round((1 - topCountry.count / geoTotal) * 100)}% of visits from outside ${topCountry.code}`,
        body: <>Visits came from {geo.length} countries. Check shipping and prices for the next biggest ones.</>,
      });
    }
    return out;
  }, [traffic, devices, deviceTotal, geo, loading]);

  const activeNow = live ? count(live.sessions) : sessions.length >= 100 ? '100+' : count(sessions.length);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Who visits, on what device and from where, and one visit's journey.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      {ownerOnly && (
        <Unavailable className="rounded-lg border bg-white p-4">
          Device, country and product view figures are open to the store owner only. Sessions and page views below come from the sales panel.
        </Unavailable>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Sessions" value={traffic ? count(traffic.sessions) : undefined} unavailable={traffic ? undefined : loading ? 'Loading...' : 'Not available'} />
        <KpiTile label="Page views" value={traffic ? count(traffic.page_views) : undefined}
          unavailable={traffic ? undefined : loading ? 'Loading...' : 'Not available'}
          sub={traffic && traffic.sessions > 0 ? `${(traffic.page_views / traffic.sessions).toFixed(1)} per session` : undefined} />
        <KpiTile label="On the shop now" value={activeNow} sub="Last 30 minutes"
          unavailable={ownerOnly && !live ? OWNER_ONLY : undefined} />
        <KpiTile label="Countries" value={count(geo.length)} unavailable={ownerOnly ? OWNER_ONLY : undefined} />
      </div>

      {insights.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">What to act on</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
          </div>
        </section>
      )}

      {!ownerOnly && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Devices" sub="Tracked activity by device">
            <CategoryBars height={220} data={devices.map((d) => ({ label: words(d.name), value: Number(d.value || 0) }))} />
          </ChartCard>
          <ChartCard title="Browsers">
            <Donut height={220} data={(deviceStats?.browsers ?? []).map((b: any) => ({ name: b.name ?? 'Unknown', value: Number(b.value || 0) }))} />
          </ChartCard>
          <section className="min-w-0 rounded-lg border bg-white shadow-sm">
            <h2 className="border-b px-4 py-3 font-semibold text-gray-900">Countries</h2>
            <div className="max-h-64 divide-y overflow-y-auto text-sm">
              {geo.map((g: any) => (
                <div key={g.code} className="flex items-center justify-between px-4 py-2">
                  <span>{g.code}</span>
                  <span className="font-mono">{count(g.count)}</span>
                </div>
              ))}
              {geo.length === 0 && <div className="p-4 text-gray-500">{loading ? 'Loading...' : 'No tracked visits in this period.'}</div>}
            </div>
          </section>
        </div>
      )}

      {!ownerOnly && (
        <section className="rounded-lg border bg-white shadow-sm">
          <h2 className="border-b px-4 py-3 font-semibold text-gray-900">Most viewed products</h2>
          <div className="divide-y text-sm">
            {topViewed.map((item: any, idx: number) => (
              <div key={item.id ?? idx} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0 truncate">
                  <span className="mr-2 font-mono text-xs text-gray-400">{idx + 1}</span>
                  <span className="font-medium text-gray-800">{item.name}</span>
                </div>
                <span className="shrink-0 font-mono">{count(item.views)} views</span>
              </div>
            ))}
            {topViewed.length === 0 && <div className="p-4 text-gray-500">{loading ? 'Loading...' : 'No product views tracked in this period.'}</div>}
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-1 text-lg font-semibold">One visit's journey</h2>
        <p className="mb-4 text-sm text-gray-500">Every step one visit took, in order. Pick a visit from the list below or from Realtime.</p>
        <form onSubmit={(e) => { e.preventDefault(); loadJourney(sessionId); }} className="mb-4 flex gap-2">
          <input type="text" value={sessionId} onChange={(e) => setSessionId(e.target.value)}
            placeholder="Session id" aria-label="Session id"
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm" />
          <button type="submit" disabled={journeyLoading || !sessionId.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            <Search className="size-4" aria-hidden /> {journeyLoading ? 'Finding...' : 'Show'}
          </button>
        </form>

        {journey.length > 0 ? (
          <ol className="relative ml-3 space-y-5 border-l-2 border-gray-200">
            {journey.map((step: any, index: number) => (
              <li key={index} className="relative ml-6">
                <span className="absolute -left-9 flex size-6 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                  <User className="size-3 text-blue-600" aria-hidden />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{words(step.action)}</div>
                    <div className="break-all text-sm text-gray-500">
                      {step.metadata?.name || step.metadata?.path || step.resource_id || step.resourceId || 'No details'}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{localeDateTime(step.at ?? step.created_at ?? step.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          !journeyLoading && journeyAsked && <p className="py-3 text-center text-sm text-gray-500">No journey found for this session.</p>
        )}
      </section>

      <section className="rounded-lg border bg-white shadow-sm">
        <button type="button" onClick={() => setShowSessions((v) => !v)} aria-expanded={showSessions}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-semibold text-gray-900">
          <span>Visits in the last 30 minutes ({activeNow})</span>
          {showSessions ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        </button>
        {showSessions && (
          <div className="max-h-72 divide-y overflow-y-auto border-t text-sm">
            {sessions.map((v: any) => {
              const sid = v.session_id ?? v.sessionId;
              return (
                <button key={sid} type="button" onClick={() => loadJourney(sid)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800">{v.location || 'Unknown'}, {words(v.device)}</div>
                    <div className="truncate font-mono text-xs text-gray-400">{sid}</div>
                  </div>
                  <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">{words(v.last_action ?? v.lastAction)}</span>
                </button>
              );
            })}
            {sessions.length === 0 && <div className="p-4 text-gray-500">{ownerOnly ? 'The visit list is open to the store owner only.' : 'No visits in the last 30 minutes.'}</div>}
          </div>
        )}
      </section>
    </div>
  );
};

export default UserAnalytics;
