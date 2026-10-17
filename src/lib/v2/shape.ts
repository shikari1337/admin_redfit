/**
 * Generic, schema-driven shapers for the route rows (ADMIN-V2-2). The running
 * binary declares every typed input (`gc-api routes --json`: request body schema,
 * and the query struct each handler takes); the rows carry a compact copy of that
 * declaration and these functions turn the legacy call into exactly what v2
 * accepts — nothing more (v2 REFUSES unknown fields), nothing renamed by hand:
 *
 *   body   camelCase → snake_case; only declared fields kept; rupees → Money
 *          (`m`) or minor integers (`p`); percent → milli-percent (`r`);
 *          numbers → exact decimal strings (`d`); "12" → 12 (`i`); "true" → true (`b`)
 *   query  camelCase → snake_case; the common legacy spellings (search/q,
 *          startDate/from, skip/offset, page → offset) re-pointed; only the
 *          handler's declared fields sent
 *   reply  milli-percent → percent, minor integers → rupees (the leaves the reply
 *          schema declares); Money is already rupees (http.ts)
 *
 * Spec letters: m Money · p minor-unit integer · d exact decimal string ·
 * r milli-percent integer · i integer · b boolean · s string/uuid/date (as is) ·
 * j free JSON (as is) · {…} object · [x] array.
 */
import type { V2Ctx } from './routes';
import { isMoney, majorToMinor, toMoney } from './money';
import { mapList } from './http';

export type Spec = 'm' | 'p' | 'd' | 'r' | 'i' | 'b' | 's' | 'j' | 'f' | { [k: string]: Spec } | [Spec];
export type ReplySpec = 'r' | 'p' | { [k: string]: ReplySpec } | [ReplySpec];

export const snake = (k: string): string => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  && !(typeof FormData !== 'undefined' && v instanceof FormData) && !(typeof Blob !== 'undefined' && v instanceof Blob) && !(v instanceof Date);

/** A decimal (number or string) × 10^digits → integer, half-up, through the decimal string (never a float product). */
export function scaleDecimal(value: unknown, digits: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  let s = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(Math.min(digits + 4, 20)) : '') : String(value).replace(/[,\s%]/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [ip = '0', fr = ''] = s.split('.');
  const frac = fr.padEnd(digits + 1, '0');
  let n = Number(`${ip || '0'}${frac.slice(0, digits)}`);
  if (frac.charCodeAt(digits) - 48 >= 5) n += 1;
  if (!Number.isSafeInteger(n)) return null;
  return neg ? -n : n;
}

/** Integer ÷ 10^digits → the number a screen shows (string arithmetic). */
function unscale(n: unknown, digits: number): unknown {
  if (typeof n !== 'number' && !(typeof n === 'string' && /^-?\d+$/.test(n))) return n;
  let s = String(typeof n === 'number' ? Math.trunc(n) : n);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  s = s.padStart(digits + 1, '0');
  return Number(`${neg ? '-' : ''}${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`);
}

function decimalString(v: unknown): unknown {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // shortest exact rendering without exponent
    const t = String(v);
    return /e/i.test(t) ? v.toFixed(10).replace(/\.?0+$/, '') : t;
  }
  if (typeof v === 'string') { const t = v.trim().replace(/[,₹\s]/g, ''); return t === '' ? null : t; }
  return v;
}

/** One value → what its spec declares. */
export function shapeValue(v: unknown, spec: Spec): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (Array.isArray(spec)) return Array.isArray(v) ? v.map((x) => shapeValue(x, spec[0])) : v;
  if (typeof spec === 'object') return isPlain(v) ? shapeObject(v, spec) : v;
  switch (spec) {
    case 'm': return isMoney(v) ? v : (v === '' ? null : toMoney(v as number | string));
    case 'p': return isMoney(v) ? v.minor : majorToMinor(v as number | string);
    case 'd': return decimalString(v);
    case 'r': return scaleDecimal(v, 3);
    case 'i': {
      if (typeof v === 'string') { if (v.trim() === '') return null; const n = Number(v); return Number.isFinite(n) ? n : v; }
      return v;
    }
    case 'b': {
      if (v === 'true' || v === 1 || v === '1' || v === 'on' || v === 'yes') return true;
      if (v === 'false' || v === 0 || v === '0' || v === 'off' || v === 'no' || v === '') return false;
      return v;
    }
    case 's': return typeof v === 'number' || typeof v === 'boolean' ? String(v) : v;
    default: return v;
  }
}

/** An object → only the declared fields (snake_case), each shaped. A snake key wins over its camel twin. */
export function shapeObject(src: Record<string, unknown>, spec: { [k: string]: Spec }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  const pending: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    if (k in spec) out[k] = shapeValue(v, spec[k]);
    else pending.push([k, v]);
  }
  for (const [k, v] of pending) {
    const t = snake(k);
    if (t in spec) { if (!(t in out)) out[t] = shapeValue(v, spec[t]); } else if (!/^_/.test(k)) dropped.push(k);
  }
  if (dropped.length) console.debug('v2 body: fields the route does not take were left out:', dropped.join(', '));
  return out;
}

/** The row's body shaper: a JSON body shaped by the spec; FormData/Blob/strings pass as sent. */
export const shapeBody = (spec: Spec | 'multipart' | null) => (c: V2Ctx): unknown => {
  const body = c.body;
  if (spec === null || spec === 'multipart' || spec === undefined) return body;
  if (isMultipart(spec)) return shapeForm(body, spec as Record<string, Spec>);
  // a write whose input is free JSON (or all-optional) still needs a JSON body: `{}`, never nothing
  if (body === undefined || body === null || body === '') return (typeof spec === 'object' && !Array.isArray(spec)) || spec === 'j' ? {} : body;
  return shapeValue(body, spec as Spec);
};

const isMultipart = (spec: unknown): boolean => !!spec && typeof spec === 'object' && !Array.isArray(spec) && '#mp' in (spec as object);

/**
 * A multipart body: the parts renamed to the route's snake_case part names, undeclared parts left out,
 * a file sent under a different name re-filed under the route's file part. A JSON body sent to a
 * multipart route becomes its text parts.
 */
function shapeForm(body: unknown, spec: Record<string, Spec>): unknown {
  if (typeof FormData === 'undefined') return body;
  const parts = Object.keys(spec).filter((k) => k !== '#mp');
  const fileParts = parts.filter((k) => spec[k] === 'f' || (Array.isArray(spec[k]) && (spec[k] as Spec[])[0] === 'f'));
  const out = new FormData();
  const dropped: string[] = [];
  const add = (k: string, v: FormDataEntryValue | string) => {
    const isFile = typeof v !== 'string';
    let t = parts.includes(k) ? k : parts.includes(snake(k)) ? snake(k) : null;
    if (!t && isFile && fileParts.length) t = fileParts[0];
    if (!t) { dropped.push(k); return; }
    out.append(t, v as Blob);
  };
  if (body instanceof FormData) body.forEach((v, k) => add(k, v));
  else if (isPlain(body)) for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) add(k, typeof v === 'object' && !(v instanceof Blob) ? JSON.stringify(v) : (v instanceof Blob ? (v as unknown as FormDataEntryValue) : String(v)));
  else return body;
  if (dropped.length) console.debug('v2 upload: parts the route does not take were left out:', dropped.join(', '));
  return out;
}

const QUERY_ALIASES: Record<string, string[]> = {
  q: ['search', 'query', 'term', 'keyword'],
  search: ['q', 'query', 'term', 'keyword'],
  from: ['start_date', 'startDate', 'date_from', 'dateFrom', 'since'],
  to: ['end_date', 'endDate', 'date_to', 'dateTo', 'until'],
  start_date: ['from', 'startDate'],
  end_date: ['to', 'endDate'],
  offset: ['skip'],
  limit: ['page_size', 'pageSize', 'per_page', 'perPage'],
  sort: ['sort_by', 'sortBy', 'order_by', 'orderBy'],
};

/**
 * The row's query shaper: the legacy query re-spelt onto the handler's declared
 * fields. `accepted` is the binary's list; an entry `...x` (a flattened struct)
 * or `?X` (unresolved) means "forward every key, snake_cased".
 */
export const shapeQuery = (accepted: readonly string[], fixed?: (c: V2Ctx) => Record<string, unknown>) => (c: V2Ctx): Record<string, unknown> => {
  const query = c.query || {};
  const open = accepted.some((a) => a.startsWith('...') || a.startsWith('?'));
  const has = new Set(accepted);
  const out: Record<string, unknown> = {};
  const used = new Set<string>();
  const put = (k: string, v: unknown) => { if (v === undefined || v === null || v === '') return; out[k] = Array.isArray(v) ? v.join(',') : v; };
  for (const [k, v] of Object.entries(query)) {
    if (has.has(k)) { put(k, v); used.add(k); continue; }
    const s = snake(k);
    if (has.has(s) && out[s] === undefined) { put(s, v); used.add(k); }
  }
  for (const target of accepted) {
    if (out[target] !== undefined) continue;
    for (const alt of QUERY_ALIASES[target] ?? []) {
      if (query[alt] !== undefined && query[alt] !== '' && !used.has(alt)) { put(target, query[alt]); used.add(alt); break; }
    }
  }
  if (!has.has('page') && has.has('offset') && out.offset === undefined && query.page !== undefined) {
    const page = Number(query.page);
    const limit = Number(out.limit ?? query.limit) || 20;
    if (Number.isFinite(page) && page > 0) out.offset = (page - 1) * limit;
    used.add('page');
  }
  if (open) {
    for (const [k, v] of Object.entries(query)) if (!used.has(k)) put(snake(k), v);
  }
  return fixed ? { ...out, ...fixed(c) } : out;
};

/** The reply shaper: milli-percent → percent and minor integers → rupees at the declared leaves. */
export function shapeReply(data: unknown, spec: ReplySpec | null | undefined): unknown {
  if (!spec || data === null || data === undefined) return data;
  if (spec === 'r') return unscale(data, 3);
  if (spec === 'p') return unscale(data, 2);
  if (Array.isArray(spec)) return Array.isArray(data) ? mapList(data, (x) => shapeReply(x, spec[0])) : data;
  // a Page spec ({items:[…]}) applied to the normalised array
  if (Array.isArray(data) && spec.items) return shapeReply(data, spec.items);
  if (!isPlain(data)) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [k, s] of Object.entries(spec)) if (k in out) out[k] = shapeReply(out[k], s);
  return out;
}


/**
 * The legacy answer of some Node routes carried no `success` flag (`{data: …, total}`), so the old
 * interceptor left it wrapped and the caller reads `r.data.data` / `r.data.total`. The v2 answer is
 * the bare data; this puts it back in the wrapper those callers read (list metadata beside it).
 */
export function wrapData(d: unknown): unknown {
  const meta = Array.isArray(d) ? listMetaOf(d) : {};
  return { success: true, data: d, ...meta };
}

/** A caller that reads `r.data.success` / `r.data.message` beside the fields: the v2 data with the old flag. */
export function withOk(d: unknown): unknown {
  return isPlain(d) ? { success: true, ...d } : d;
}

function listMetaOf(list: unknown[]): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const k of Object.getOwnPropertyNames(list)) {
    if (k === 'length' || /^\d+$/.test(k)) continue;
    meta[k] = (list as unknown as Record<string, unknown>)[k];
  }
  return meta;
}

/** A normalised list → the `{rows, total, …}` object a report screen reads (`res.data.rows`, `res.data.summary`). */
export const pageAs = (key: string) => (d: unknown): unknown => (Array.isArray(d) ? { [key]: Array.from(d), ...listMetaOf(d) } : d);
