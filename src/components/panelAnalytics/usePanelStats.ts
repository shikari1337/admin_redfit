import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { v2http } from '../../lib/v2/http';
import type { PanelRange } from './DateRangeBar';
import { todayIso } from '../../utils/date';

/** Extra query parameters beside from/to (e.g. `granularity`). Undefined values are not sent. */
export type ExtraParams = Record<string, string | number | undefined>;

/**
 * Fetch /analytics/panels/<panel> for a range. from/to omitted = all time.
 * RULE: read via payload(), never res.data.data (interceptor unwraps envelopes).
 * `enabled=false` skips the request entirely (module/permission gates) —
 * `data`/`error` stay null, `loading` stays false.
 */
export function usePanelStats<T = any>(panel: string, range: PanelRange, enabled = true, extra?: ExtraParams) {
  return useRangedGet<T>(`/analytics/panels/${panel}`, range, enabled, extra);
}

/**
 * A short memory of answers, shared by every caller: the same URL + range
 * asked twice inside a minute (two tiles, a page revisited, a preset toggled
 * back) is ONE request. In-flight requests are shared too.
 *
 * The analytics panels keep theirs longer, by what the range can still do
 * (21 Nov 2026: every pass through the dashboard re-asked five ranges of the
 * commerce panel, 4 to 18 seconds of database time each, 123 times an hour):
 *   a period that has ended   15 minutes (only a late cancellation or refund moves it)
 *   today alone               1 minute
 *   a period still running,
 *   or the whole history      5 minutes
 */
const TTL_MS = 60_000;
const TTL_RUNNING_MS = 5 * 60_000;
const TTL_ENDED_MS = 15 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function ttlFor(url: string, range: PanelRange, extra?: ExtraParams): number {
  if (!url.startsWith('/analytics/panels/')) return TTL_MS;
  const today = todayIso();
  if (range.to && range.to < today) return TTL_ENDED_MS;
  if (range.from && range.from === range.to) return TTL_MS;
  // No range and no buckets is a live count (order queues, stock), not a period.
  if (!range.from && !range.to && !cleanExtra(extra).granularity) return TTL_MS;
  return TTL_RUNNING_MS;
}

/**
 * The dashboard's Refresh button (TSUM-1, owner 26 Nov 2026): `refreshPanels()` forgets every
 * kept answer and bumps a counter every ranged read on screen listens to, so each asks again at
 * once (keeping its last answer on screen while it does).
 */
let generation = 0;
const listeners = new Set<() => void>();

export function refreshPanels(): void {
  cache.clear();
  // A read started before the refresh may predate the new figures: the next one asks afresh.
  inflight.clear();
  generation += 1;
  listeners.forEach((l) => l());
}

/** The refresh counter; a hook that puts it in its effect's dependencies asks again on Refresh. */
export function usePanelsGeneration(): number {
  const [g, setG] = useState(generation);
  useEffect(() => {
    const l = () => setG(generation);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return g;
}

// Whatever this tab saves may move a figure, so the next read after a save is a fresh one.
// (Another person's save shows within the times above.)
const forgetOnWrite = (res: any) => {
  const method = String(res?.config?.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head' && method !== 'options') cache.clear();
  return res;
};
api.interceptors.response.use(forgetOnWrite);
v2http.interceptors.response.use(forgetOnWrite);

function cleanExtra(extra?: ExtraParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== undefined && v !== '') out[k] = String(v);
  return out;
}

function keyFor(url: string, range: PanelRange, extra?: ExtraParams): string {
  const e = cleanExtra(extra);
  const tail = Object.keys(e).sort().map((k) => `&${k}=${e[k]}`).join('');
  return `${url}?from=${range.from ?? ''}&to=${range.to ?? ''}${tail}`;
}

export function fetchRanged<T>(url: string, range: PanelRange, extra?: ExtraParams): Promise<T> {
  const key = keyFor(url, range, extra);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlFor(url, range, extra)) return Promise.resolve(hit.data as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = api.get(url, { params: { from: range.from, to: range.to, ...cleanExtra(extra) } })
    .then((res) => { const data = payload<T>(res); cache.set(key, { at: Date.now(), data }); return data; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/**
 * Generic ranged GET + payload-unwrap, for endpoints outside `/analytics/panels/*`
 * that still take `?from&to` (e.g. `/product-questions/admin/counts`,
 * `/reviews/admin/counts`). Same `enabled` skip-fetch contract as usePanelStats.
 *
 * A refetch KEEPS the previous answer in `data` while `loading` is true, so a
 * page can hold its last render at reduced opacity instead of flashing a
 * skeleton. `status` carries the HTTP status of a failure (403 = not allowed,
 * 409 = not connected) so the page can say why, not just that.
 */
export function useRangedGet<T = any>(url: string, range: PanelRange, enabled = true, extra?: ExtraParams) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const extraKey = JSON.stringify(cleanExtra(extra));
  const gen = usePanelsGeneration();

  useEffect(() => {
    if (!enabled) { setData(null); setError(null); setStatus(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    fetchRanged<T>(url, range, extra)
      .then((d) => { if (alive) { setData(d); setError(null); setStatus(null); } })
      .catch((e) => {
        if (alive) {
          setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load analytics');
          setStatus(Number(e?.response?.status) || null);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // `extra` is compared by its serialised form so an inline object is not a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, range.from, range.to, enabled, extraKey, gen]);

  return { data, loading, error, status };
}
