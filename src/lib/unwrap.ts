/**
 * The admin axios response interceptor (services/api.ts normalizeResponse)
 * UNWRAPS `{success, data}` envelopes — `res.data` is already the payload for
 * enveloped endpoints, while non-enveloped shapes (e.g. `{success, rows,
 * total}`) pass through intact. This helper reads correctly under BOTH shapes,
 * so pages don't care whether the interceptor unwrapped.
 */
export const payload = <T = any>(res: any): T =>
  (res?.data?.data !== undefined ? res.data.data : res?.data) as T;

/**
 * The `total` a list endpoint carries BESIDE its rows (ask with `limit: 1` to count cheaply). The
 * interceptor keeps it on the array as a non-enumerable property, which `payload()` would drop, so
 * it is read from every place it can sit. Not a number answers 0.
 */
export const listTotal = (res: any): number => {
  const body = res?.data ?? res;
  const t = Number(body?.total ?? res?.total ?? body?.data?.total ?? 0);
  return Number.isFinite(t) ? t : 0;
};
