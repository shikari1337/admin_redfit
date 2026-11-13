/**
 * ACTIVITY LOG (lane MENU-1 staff-logs): the store's own audit trail, the System > Logs page. The routes
 * are the platform app's (`/api/v2/platform/audit`, `growcord-rs/apps/platform/core/src/api/audit.rs`),
 * `audit.read`, read only: every entry is on the store's `audit.v1` chain, written by the change it
 * records and never edited or removed. The server decides the actor words, the kinds of entry worth a
 * look and what each filter matches; this file only types the answers.
 *
 * The old page read the server's log files (`GET /logs`), which held every store's lines; on v2 those
 * are a Growcord console screen only.
 */
import { V2_ENABLED } from './config';
import { backendGap, v2call } from './http';

const P = '/api/v2/platform/audit';

/** One entry (`LogEntryView`). */
export interface LogEntry {
  seq: number;
  /** UTC, ISO 8601. */
  occurred_at: string;
  /** `admin` (a staff member of the store), `platform`, `platform_support`, `service`, `api_key`, `ai_agent`, `customer`, `system` ... */
  actor_kind: string;
  /** The service, key, AI agent (`name/vendor`) or support session. */
  actor_detail: string | null;
  actor_id: string | null;
  /** The staff member's name when the actor is one of the store's accounts. */
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  /** Fields whose value differs between before and after. */
  changed: string[];
}

export interface LogPage {
  items: LogEntry[];
  /** Pass as `before` for the next page; null = no more. */
  next_before: number | null;
}

export interface LogEntryDetail {
  entry: LogEntry;
  before: unknown;
  after: unknown;
}

export interface LogCount { value: string; count: number }

export interface LogActor {
  actor_id: string | null;
  actor_kind: string;
  actor_name: string | null;
  count: number;
  last_at: string | null;
}

/** Entries of the week worth a look, and the list filter that shows them. */
export interface LogAttention {
  /** `access`, `removals`, `outside` or `growcord`. */
  key: string;
  count: number;
  entity_type: string | null;
  actions: string[];
  actor_kinds: string[];
}

export interface LogSummary {
  today: number;
  people_today: number;
  week: number;
  /** How many of the newest entries the figures read. */
  looked_at: number;
  /** The week holds more entries than were read: its figures are a floor. */
  capped: boolean;
  attention: LogAttention[];
  entity_types: LogCount[];
  actions: LogCount[];
  actor_kinds: LogCount[];
  actors: LogActor[];
}

export interface LogQuery {
  before?: number;
  limit?: number;
  actor_id?: string;
  /** Comma separated. */
  actor_kind?: string;
  entity_type?: string;
  entity_id?: string;
  /** Comma separated. */
  action?: string;
  /** `YYYY-MM-DD`, the store's calendar, inclusive. */
  from?: string;
  to?: string;
}

async function call<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  if (!V2_ENABLED) backendGap(`GET ${P}${path} (this build is not on the v2 API)`);
  return v2call<T>('GET', `${P}${path}`, { params });
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function entryOf(raw: any): LogEntry {
  return {
    seq: num(raw?.seq),
    occurred_at: String(raw?.occurred_at ?? ''),
    actor_kind: String(raw?.actor_kind ?? 'system'),
    actor_detail: str(raw?.actor_detail),
    actor_id: str(raw?.actor_id),
    actor_name: str(raw?.actor_name),
    action: String(raw?.action ?? ''),
    entity_type: String(raw?.entity_type ?? ''),
    entity_id: str(raw?.entity_id),
    changed: strs(raw?.changed),
  };
}

const countsOf = (v: unknown): LogCount[] =>
  Array.isArray(v) ? v.map((c: any) => ({ value: String(c?.value ?? ''), count: num(c?.count) })) : [];

/** Only the filled filters are sent (the server refuses an unknown or blank one as absent anyway). */
function cleanQuery(q: LogQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

export const activityLogApi = {
  list: async (q: LogQuery = {}): Promise<LogPage> => {
    const raw = await call<any>('', cleanQuery(q));
    return {
      items: Array.isArray(raw?.items) ? raw.items.map(entryOf) : [],
      next_before: raw?.next_before == null ? null : num(raw.next_before),
    };
  },
  summary: async (): Promise<LogSummary> => {
    const raw = await call<any>('/summary');
    return {
      today: num(raw?.today),
      people_today: num(raw?.people_today),
      week: num(raw?.week),
      looked_at: num(raw?.looked_at),
      capped: raw?.capped === true,
      attention: Array.isArray(raw?.attention)
        ? raw.attention.map((a: any) => ({
          key: String(a?.key ?? ''),
          count: num(a?.count),
          entity_type: str(a?.entity_type),
          actions: strs(a?.actions),
          actor_kinds: strs(a?.actor_kinds),
        }))
        : [],
      entity_types: countsOf(raw?.entity_types),
      actions: countsOf(raw?.actions),
      actor_kinds: countsOf(raw?.actor_kinds),
      actors: Array.isArray(raw?.actors)
        ? raw.actors.map((a: any) => ({
          actor_id: str(a?.actor_id),
          actor_kind: String(a?.actor_kind ?? ''),
          actor_name: str(a?.actor_name),
          count: num(a?.count),
          last_at: str(a?.last_at),
        }))
        : [],
    };
  },
  entry: async (seq: number): Promise<LogEntryDetail> => {
    const raw = await call<any>(`/${encodeURIComponent(String(seq))}`);
    return { entry: entryOf(raw?.entry), before: raw?.before ?? null, after: raw?.after ?? null };
  },
};

/** True for an answer that says "this server does not serve the route yet" (404, 501, `v2.backend_gap`). */
export function activityLogGap(e: any): boolean {
  const status = e?.response?.status;
  return status === 404 || status === 501 || e?.code === 'V2_BACKEND_GAP' || e?.response?.data?.code === 'v2.backend_gap';
}

/** The words of a stored code (`staff_member` reads "staff member"). */
export function words(code: string): string {
  return code.replace(/[_.:/-]+/g, ' ').trim();
}

/**
 * Who acted, in words: the store account's name; otherwise the kind of actor (the kernel's actor words)
 * with what names it. An unknown kind falls back to its own words.
 */
export function actorLabel(e: Pick<LogEntry, 'actor_kind' | 'actor_detail' | 'actor_name'>): string {
  if (e.actor_name) return e.actor_name;
  const detail = e.actor_detail ? words(e.actor_detail) : '';
  switch (e.actor_kind) {
    case 'admin': return 'A staff account';
    case 'platform': return 'Growcord staff';
    case 'platform_support': return 'Growcord support';
    case 'service': return detail ? `Automatic (${detail})` : 'Automatic';
    case 'api_key': return 'An API key';
    case 'ai_agent': return detail ? `AI agent ${detail}` : 'An AI agent';
    case 'customer': return 'A shopper';
    case 'system': return 'The system';
    default: return words(e.actor_kind) || 'Unknown';
  }
}
