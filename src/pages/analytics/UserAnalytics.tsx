import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import DateRangeBar, { useDateRange } from '../../components/panelAnalytics/DateRangeBar';
import { ChartCard, CategoryBars, Donut, StatTile } from '../../components/panelAnalytics/Kit';
import { FaSearch, FaUser } from 'react-icons/fa';

/**
 * Analytics → Users. Who visits and how they behave: devices, browsers,
 * countries, most-viewed products, live-ish session list with one-click
 * journey drill-down (plus manual session-ID lookup).
 */
const UserAnalytics: React.FC = () => {
  const { range, preset, setPreset, custom, setCustom } = useDateRange('30d');
  const [deviceStats, setDeviceStats] = useState<any>(null);
  const [geo, setGeo] = useState<any[]>([]);
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [traffic, setTraffic] = useState<{ sessions: number; page_views: number } | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [journey, setJourney] = useState<any[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    const params = { startDate: range.from ?? '2000-01-01', endDate: range.to ?? today, range: 'custom' };
    Promise.allSettled([
      api.get('/analytics/devices', { params }),
      api.get('/analytics/live/map', { params }),
      api.get('/analytics/dashboard', { params }),
      api.get('/analytics/panels/commerce', { params: { from: range.from, to: range.to } }),
      api.get('/analytics/realtime/visitors'),
    ]).then(([d, g, dash, comm, rt]) => {
      if (!alive) return;
      if (d.status === 'fulfilled') setDeviceStats(payload(d.value));
      if (g.status === 'fulfilled') setGeo(payload<any[]>(g.value) ?? []);
      if (dash.status === 'fulfilled') setTopViewed(payload<any>(dash.value)?.topViewedProducts ?? []);
      if (comm.status === 'fulfilled') {
        const s = payload<any>(comm.value)?.summary;
        if (s) setTraffic({ sessions: s.sessions, page_views: s.page_views });
      }
      if (rt.status === 'fulfilled') setSessions(payload<any[]>(rt.value) ?? []);
    });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const loadJourney = async (sid: string) => {
    if (!sid) return;
    setSessionId(sid);
    try {
      setJourneyLoading(true);
      const response = await api.get(`/analytics/user/journey/${encodeURIComponent(sid)}`);
      setJourney(payload<any[]>(response) ?? []);
    } catch {
      setJourney([]);
    } finally {
      setJourneyLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Analytics</h1>
          <p className="text-sm text-gray-500">Visitor behaviour: devices, geography, most-viewed products and session journeys.</p>
        </div>
        <DateRangeBar preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Sessions" value={(traffic?.sessions ?? 0).toLocaleString('en-IN')} />
        <StatTile label="Page views" value={(traffic?.page_views ?? 0).toLocaleString('en-IN')}
          sub={traffic && traffic.sessions > 0 ? `${(traffic.page_views / traffic.sessions).toFixed(1)} per session` : undefined} />
        <StatTile label="Active in last 30 min" value={sessions.length.toLocaleString('en-IN')} />
        <StatTile label="Countries" value={geo.length.toLocaleString('en-IN')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Devices" sub="Tracked activity by device">
          <CategoryBars height={220}
            data={(deviceStats?.devices ?? []).map((d: any) => ({ label: d.name, value: d.value }))} />
        </ChartCard>
        <ChartCard title="Browsers">
          <Donut height={220}
            data={(deviceStats?.browsers ?? []).map((b: any) => ({ name: b.name, value: b.value }))} />
        </ChartCard>
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold text-gray-900">Countries</div>
          <div className="max-h-64 divide-y overflow-y-auto text-sm">
            {geo.map((g: any) => (
              <div key={g.code} className="flex items-center justify-between px-4 py-2">
                <span>{g.code}</span>
                <span className="font-mono">{Number(g.count).toLocaleString('en-IN')}</span>
              </div>
            ))}
            {geo.length === 0 && <div className="p-4 text-gray-500">No tracked visits in range.</div>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold text-gray-900">Most-viewed products</div>
          <div className="divide-y text-sm">
            {topViewed.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between px-4 py-2">
                <div className="min-w-0 pr-3">
                  <span className="mr-2 font-mono text-xs text-gray-400">#{idx + 1}</span>
                  <span className="font-medium text-gray-800">{item.name}</span>
                </div>
                <span className="font-mono">{item.views} views</span>
              </div>
            ))}
            {topViewed.length === 0 && <div className="p-4 text-gray-500">No product views tracked in range.</div>}
          </div>
        </div>

        <div className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 font-semibold text-gray-900">Recent sessions (last 30 min)</div>
          <div className="max-h-72 divide-y overflow-y-auto text-sm">
            {sessions.map((v: any) => (
              <button key={v.sessionId ?? v.session_id} type="button"
                onClick={() => loadJourney(v.sessionId ?? v.session_id)}
                className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50">
                <div className="min-w-0 pr-3">
                  <div className="font-medium text-gray-800">{v.location || 'Unknown'} · {v.device || '—'}</div>
                  <div className="truncate font-mono text-xs text-gray-400">{v.sessionId ?? v.session_id}</div>
                </div>
                <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800 capitalize">
                  {(v.lastAction ?? v.last_action ?? '').replace(/_/g, ' ')}
                </span>
              </button>
            ))}
            {sessions.length === 0 && <div className="p-4 text-gray-500">No active sessions right now.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Session journey</h2>
        <form onSubmit={(e) => { e.preventDefault(); loadJourney(sessionId); }} className="mb-6 flex gap-2">
          <input type="text" value={sessionId} onChange={(e) => setSessionId(e.target.value)}
            placeholder="Session ID (or click a session above)"
            className="flex-1 rounded border px-4 py-2" />
          <button type="submit" disabled={journeyLoading}
            className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
            {journeyLoading ? 'Searching…' : <FaSearch />}
          </button>
        </form>

        {journey.length > 0 ? (
          <div className="relative ml-4 space-y-6 border-l-2 border-gray-200">
            {journey.map((step: any, index: number) => (
              <div key={index} className="relative ml-6">
                <span className="absolute -left-9 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
                  <FaUser className="text-xs text-blue-600" />
                </span>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {String(step.action ?? '').replace(/_/g, ' ').toUpperCase()}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {step.resourceId ?? step.resource_id
                        ? `Resource: ${step.resourceId ?? step.resource_id}`
                        : step.metadata?.path || 'No details'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(step.createdAt ?? step.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !journeyLoading && sessionId && <p className="py-4 text-center text-gray-500">No journey found for this session.</p>
        )}
      </div>
    </div>
  );
};

export default UserAnalytics;
