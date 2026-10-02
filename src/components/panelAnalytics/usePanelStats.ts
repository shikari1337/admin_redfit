import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import type { PanelRange } from './DateRangeBar';

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
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

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
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data as T);
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
  }, [url, range.from, range.to, enabled, extraKey]);

  return { data, loading, error, status };
}
