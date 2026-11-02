/**
 * The inventory lock (DEC-069, INV-LOCK-1) — ONE client-side copy of it for the whole admin.
 *
 * While a store's stock is set from its ERP every hour, manual stock changes would be
 * silently overwritten at the next run, so WMS locks them: the ledger refuses every manual
 * movement with `409 wms.inventory_locked`. Reads, sheet downloads and the ERP order
 * export stay open. Only an admin (`inventory.delete`) unlocks, with a reason; while
 * unlocked the hourly ERP apply is skipped, and locking again resumes it.
 *
 *   GET  /api/v2/wms/inventory-lock          (inventory.read)   → { state, events[≤20] }
 *   POST /api/v2/wms/inventory-lock/unlock   (inventory.delete) { reason ≥ 10 chars }
 *   POST /api/v2/wms/inventory-lock/lock     (inventory.delete) { reason? }
 *
 * On a server without these routes the lock reads as "not available" and nothing is
 * disabled — the server stays the authority either way, and a 409 from any save is turned
 * into the lock message (`client.ts`) and refreshes this copy.
 */
import { v2call } from './http';

export interface InventoryLockState {
  locked: boolean;
  /** "erp:<connection uuid>" or "manual". */
  source: string | null;
  since_us: number | null;
  by: string | null;
  by_name: string | null;
  reason: string | null;
}

export interface InventoryLockSnapshot {
  /** Not asked yet / asking. */
  loading: boolean;
  /** This server does not serve the lock routes (or refused to tell us). */
  unavailable: boolean;
  state: InventoryLockState | null;
  events: InventoryLockState[];
  /** The ERP connection's own label, when the lock names one and we could read it. */
  erpLabel: string | null;
}

export const INVENTORY_LOCKED_CODE = 'wms.inventory_locked';
export const UNLOCK_PERM = 'inventory.delete';

const PATH = '/api/v2/wms/inventory-lock';

let snap: InventoryLockSnapshot = { loading: true, unavailable: false, state: null, events: [], erpLabel: null };
let lastAt = 0;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

function set(next: Partial<InventoryLockSnapshot>) {
  snap = { ...snap, ...next };
  subs.forEach((fn) => fn());
}

export function subscribeInventoryLock(fn: () => void): () => void {
  subs.add(fn);
  // First screen to ask loads it; a screen opened a minute or more later re-reads it (the hourly
  // job or another admin may have locked / unlocked in between).
  if (Date.now() - lastAt > 60_000) { lastAt = Date.now(); void refreshInventoryLock(); }
  return () => { subs.delete(fn); };
}

export function inventoryLockSnapshot(): InventoryLockSnapshot {
  return snap;
}

function readState(v: unknown): InventoryLockState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    locked: o.locked === true,
    source: typeof o.source === 'string' ? o.source : null,
    // The state carries `since_us`; each history event carries its own instant as `at_us`
    // (wms `LockEventView`, apps/wms/core/src/views/inventory_lock.rs).
    since_us: typeof o.since_us === 'number' ? o.since_us : typeof o.at_us === 'number' ? o.at_us : null,
    by: typeof o.by === 'string' ? o.by : null,
    by_name: typeof o.by_name === 'string' ? o.by_name : null,
    reason: typeof o.reason === 'string' ? o.reason : null,
  };
}

/** The ERP connection a lock source names, for its label. Best effort (needs settings.read). */
async function erpLabelFor(source: string | null): Promise<string | null> {
  if (!source || !source.startsWith('erp:')) return null;
  const id = source.slice(4);
  try {
    const c = await v2call<{ label?: string }>('GET', `/api/v2/erp/connections/${encodeURIComponent(id)}`);
    return typeof c?.label === 'string' && c.label ? c.label : null;
  } catch {
    return null;
  }
}

export function refreshInventoryLock(): Promise<void> {
  if (inflight) return inflight;
  lastAt = Date.now();
  inflight = (async () => {
    try {
      const out = await v2call<{ state?: unknown; events?: unknown }>('GET', PATH);
      const state = readState(out?.state);
      const events = (Array.isArray(out?.events) ? out.events : []).map(readState).filter((e): e is InventoryLockState => !!e);
      const label = state?.source && state.source === snap.state?.source && snap.erpLabel ? snap.erpLabel : await erpLabelFor(state?.source ?? null);
      set({ loading: false, unavailable: !state, state, events, erpLabel: label });
    } catch {
      // 404 / backend gap / 403: the lock cannot be read here, so nothing is disabled on its account.
      set({ loading: false, unavailable: true, state: null, events: [] });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function unlockInventory(reason: string): Promise<void> {
  await v2call('POST', `${PATH}/unlock`, { data: { reason } });
  await refreshInventoryLock();
}

export async function lockInventory(reason?: string): Promise<void> {
  await v2call('POST', `${PATH}/lock`, { data: reason ? { reason } : {} });
  await refreshInventoryLock();
}

/** The one sentence a locked store shows, wherever stock could otherwise be changed. */
export function lockedMessage(label?: string | null): string {
  return `Stock is managed by ${label || 'the ERP'} and updated every hour. Manual changes are locked.`;
}

/** The tooltip on a control the lock has switched off. */
export function lockedTitle(label?: string | null): string {
  return `${lockedMessage(label)} An admin can unlock it on the Inventory page.`;
}

/** True for the ledger's refusal of a manual stock change. */
export function isInventoryLockedError(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { code?: string; error?: { code?: string } } } };
  const code = e?.response?.data?.code ?? e?.response?.data?.error?.code;
  return code === INVENTORY_LOCKED_CODE;
}

/** A save was refused because stock is locked: re-read the lock so every screen shows it. */
export function noteInventoryLockedRefusal(): void {
  void refreshInventoryLock();
}
