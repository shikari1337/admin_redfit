/**
 * UUID — one definition for the admin panel (WS-L L.14).
 *
 * Mirrors `backend/src/utils/uuid.ts`. The same 8-4-4-4-12 literal was written
 * out in four places here; a form that checks "is this an id or a SKU?" gets
 * the answer from one place now.
 *
 * Shape, not RFC version — Postgres stores any 8-4-4-4-12 hex string as a
 * `uuid`, so a stricter test would refuse ids the server is happy with.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrowing predicate — `isUuid(x)` tells TypeScript `x` is a `string`. */
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);
