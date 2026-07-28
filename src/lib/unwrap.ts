/**
 * The admin axios response interceptor (services/api.ts normalizeResponse)
 * UNWRAPS `{success, data}` envelopes — `res.data` is already the payload for
 * enveloped endpoints, while non-enveloped shapes (e.g. `{success, rows,
 * total}`) pass through intact. This helper reads correctly under BOTH shapes,
 * so pages don't care whether the interceptor unwrapped.
 */
export const payload = <T = any>(res: any): T =>
  (res?.data?.data !== undefined ? res.data.data : res?.data) as T;
