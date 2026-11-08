/**
 * STAFF NOTIFICATIONS (lane META-21, INS-07): the store team's in-app notifications, the second half of
 * the admin bell (the first is the latest orders it already lists). The routes are the comms app's
 * (`/api/v2/comms/staff-notifications`, `growcord-rs/apps/comms/core/src/api/staff_notifications.rs`):
 * every answer is the signed-in person's own (what they may see, what they read, which kinds they switched
 * off for themselves). Meta ads alerts, the Meta connection, the Meta catalog push, a post that did not
 * publish and a lead form that could not be read raise them, once per fact while it holds.
 *
 * Nothing here decides what is raised or who sees it: the server owns the kinds, the permissions and the
 * switches. A server that does not serve these routes yet answers 404 or `v2.backend_gap`; the bell then
 * shows the orders only.
 *
 * Development only: with `?mock=meta` in the address bar a dev server answers from
 * `staffNotifications.mock.ts` (the Meta screens' mock flag). A production build replaces
 * `import.meta.env.DEV` with `false`, the branch is dropped and the mock module is never bundled.
 */
import { V2_ENABLED } from './config';
import { backendGap, v2call } from './http';
import { metaMockOn } from './areas/meta';
import type { StaffNotesMock } from './staffNotifications.mock';

const C = '/api/v2/comms/staff-notifications';

export type StaffSeverity = 'info' | 'warning' | 'critical';

/** One notification (`StaffNoteView`). */
export interface StaffNote {
  id: string;
  kind: string;
  kind_label: string;
  title: string;
  body: string;
  /** An admin path (`/panel/marketing/ads/analytics`). */
  link: string | null;
  severity: StaffSeverity;
  created_at: string;
  /** When the fact stopped holding; null = it still holds. */
  cleared_at: string | null;
  /** When this person read it; null = unread. */
  read_at: string | null;
}

export interface StaffNoteList {
  items: StaffNote[];
  /** Unread notifications whose fact still holds. */
  unread: number;
  next_before: string | null;
}

/** One kind and its switches (`StaffKindView`). */
export interface StaffKind {
  kind: string;
  product: string;
  label: string;
  help: string;
  permission: string;
  /** The person holds the permission the kind needs. */
  may_see: boolean;
  /** The store's own switch. */
  store_on: boolean;
  /** The roles it goes to; empty = every staff member allowed to see it. */
  roles: string[];
  /** The person's own switch. */
  mine_on: boolean;
}

export interface StaffKindList {
  items: StaffKind[];
  can_manage: boolean;
}

export interface StaffNoteQuery {
  open?: boolean;
  unread?: boolean;
  before?: string;
  limit?: number;
}

async function call<T>(method: string, path: string, opts: Parameters<typeof v2call>[2] = {}): Promise<T> {
  if (!V2_ENABLED) backendGap(`${method} ${C}${path} (this build is not on the v2 API)`);
  return v2call<T>(method, `${C}${path}`, opts);
}

async function via<T>(real: () => Promise<T>, mock: (m: StaffNotesMock) => T | Promise<T>): Promise<T> {
  if (import.meta.env.DEV && metaMockOn()) {
    const mod = await import('./staffNotifications.mock');
    return mock(mod.staffNotesMock);
  }
  return real();
}

const SEVERITIES: StaffSeverity[] = ['info', 'warning', 'critical'];
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const opt = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function note(raw: any): StaffNote {
  return {
    id: str(raw?.id),
    kind: str(raw?.kind),
    kind_label: str(raw?.kind_label) || str(raw?.kind),
    title: str(raw?.title),
    body: str(raw?.body),
    link: opt(raw?.link),
    severity: SEVERITIES.includes(raw?.severity) ? raw.severity : 'warning',
    created_at: str(raw?.created_at),
    cleared_at: opt(raw?.cleared_at),
    read_at: opt(raw?.read_at),
  };
}

function noteList(raw: any): StaffNoteList {
  return {
    items: Array.isArray(raw?.items) ? raw.items.map(note) : [],
    unread: num(raw?.unread),
    next_before: opt(raw?.next_before),
  };
}

function kindList(raw: any): StaffKindList {
  const items: StaffKind[] = Array.isArray(raw?.items) ? raw.items.map((k: any) => ({
    kind: str(k?.kind),
    product: str(k?.product),
    label: str(k?.label) || str(k?.kind),
    help: str(k?.help),
    permission: str(k?.permission),
    may_see: k?.may_see !== false,
    store_on: k?.store_on !== false,
    roles: Array.isArray(k?.roles) ? k.roles.map(String) : [],
    mine_on: k?.mine_on !== false,
  })) : [];
  return { items, can_manage: !!raw?.can_manage };
}

/** True for an answer that says "this server does not serve the route" (404, 501, `v2.backend_gap`). */
export function staffNotesGap(e: any): boolean {
  const status = e?.response?.status;
  return status === 404 || status === 501 || e?.code === 'V2_BACKEND_GAP' || e?.response?.data?.code === 'v2.backend_gap';
}

/**
 * The admin path a notification opens, or null when the server's link is not a path inside this admin
 * (a full address or `//host` is never followed).
 */
export function staffNoteHref(link: string | null): { path: string; query: Record<string, string> } | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  const [path, q = ''] = link.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(q)) };
}

export const staffNotesApi = {
  list: (q: StaffNoteQuery = {}) => via(
    async () => noteList(await call<any>('GET', '', { params: { ...q } })),
    (m) => m.list(q),
  ),
  count: () => via(
    async () => num((await call<any>('GET', '/count'))?.unread),
    (m) => m.count(),
  ),
  /** Marks `ids` read, or every unread one when `ids` is omitted. Answers the unread count after. */
  read: (ids?: string[]) => via(
    async () => num((await call<any>('POST', '/read', { data: ids ? { ids } : { all: true } }))?.unread),
    (m) => m.read(ids),
  ),
  kinds: () => via(
    async () => kindList(await call<any>('GET', '/kinds')),
    (m) => m.kinds(),
  ),
  /** The person's own switch for one kind. Answers every kind as it now is. */
  setMine: (kind: string, enabled: boolean) => via(
    async () => kindList(await call<any>('PUT', `/kinds/${encodeURIComponent(kind)}/mine`, { data: { enabled } })),
    (m) => m.setMine(kind, enabled),
  ),
  /** The store's switch for one kind, for the whole team (`settings.manage`). Answers every kind as it now is. */
  setStore: (kind: string, enabled: boolean) => via(
    async () => kindList(await call<any>('PUT', `/kinds/${encodeURIComponent(kind)}`, { data: { enabled } })),
    (m) => m.setStore(kind, enabled),
  ),
};
