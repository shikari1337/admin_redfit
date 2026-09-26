import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import type { PanelRange } from './DateRangeBar';

/**
 * Fetch /analytics/panels/<panel> for a range. from/to omitted = all time.
 * RULE: read via payload(), never res.data.data (interceptor unwraps envelopes).
 * `enabled=false` skips the request entirely (module/permission gates) —
 * `data`/`error` stay null, `loading` stays false.
 */
export function usePanelStats<T = any>(panel: string, range: PanelRange, enabled = true) {
  return useRangedGet<T>(`/analytics/panels/${panel}`, range, enabled);
}

/**
 * A short memory of answers, shared by every caller: the same URL + range
 * asked twice inside a minute (two tiles, a page revisited, a preset toggled
 * back) is ONE request. In-flight requests are shared too.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function fetchRanged<T>(url: string, range: PanelRange): Promise<T> {
  const key = `${url}?from=${range.from ?? ''}&to=${range.to ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = api.get(url, { params: { from: range.from, to: range.to } })
    .then((res) => { const data = payload<T>(res); cache.set(key, { at: Date.now(), data }); return data; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/**
 * Generic ranged GET + payload-unwrap, for endpoints outside `/analytics/panels/*`
 * that still take `?from&to` (e.g. `/product-questions/admin/counts`,
 * `/reviews/admin/counts`). Same `enabled` skip-fetch contract as usePanelStats.
 */
export function useRangedGet<T = any>(url: string, range: PanelRange, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setData(null); setError(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    fetchRanged<T>(url, range)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load analytics');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, range.from, range.to, enabled]);

  return { data, loading, error };
}
