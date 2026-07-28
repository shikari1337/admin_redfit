import { api } from '../../services/api';

/**
 * Offline action queue for scanner mutations.
 *
 * A mutation that fails with NO server response (offline, mid-restart) is
 * queued with the SAME idempotency key it was first sent with — the server's
 * X-Idempotency-Key handling (kernel P15) makes the eventual replay apply
 * exactly once even if the original request actually landed.
 *
 * A response with a 4xx/5xx is NOT queued — the server rejected it (capacity,
 * stale bin…); replaying wouldn't help. Rejected replays are kept and shown
 * so nothing is silently dropped.
 */

export interface QueuedAction {
  id: string;           // idempotency key
  url: string;
  body: unknown;
  label: string;
  ts: number;
  status: 'queued' | 'rejected';
  error?: string;
}

const KEY = 'scan_offline_queue_v1';
const EVT = 'scan-queue-changed';

function read(): QueuedAction[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(list: QueuedAction[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function listActions(): QueuedAction[] { return read(); }
export function queueCounts() {
  const list = read();
  return {
    queued: list.filter((a) => a.status === 'queued').length,
    rejected: list.filter((a) => a.status === 'rejected').length,
  };
}
export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  window.addEventListener('storage', fn);
  return () => { window.removeEventListener(EVT, fn); window.removeEventListener('storage', fn); };
}

export function enqueueAction(id: string, url: string, body: unknown, label: string) {
  write([...read(), { id, url, body, label, ts: Date.now(), status: 'queued' }]);
}
export function discardAction(id: string) {
  write(read().filter((a) => a.id !== id));
}

let syncing = false;
/** Replay queued actions in order. Stops at the first network failure (still offline). */
export async function syncQueue(): Promise<{ synced: number; rejected: number }> {
  if (syncing) return { synced: 0, rejected: 0 };
  syncing = true;
  let synced = 0, rejected = 0;
  try {
    for (const action of read().filter((a) => a.status === 'queued')) {
      try {
        await api.post(action.url, action.body, { headers: { 'X-Idempotency-Key': action.id } });
        discardAction(action.id);
        synced++;
      } catch (e: any) {
        if (!e?.response) break; // still offline — keep the rest queued, retry later
        const list = read();
        const hit = list.find((a) => a.id === action.id);
        if (hit) {
          hit.status = 'rejected';
          hit.error = e.response?.data?.message ?? e.message;
          write(list);
        }
        rejected++;
      }
    }
  } finally { syncing = false; }
  return { synced, rejected };
}

let started = false;
/** Auto-sync on regaining connectivity + a slow safety interval. */
export function startQueueAutoSync() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => { syncQueue(); });
  setInterval(() => { if (navigator.onLine && queueCounts().queued > 0) syncQueue(); }, 30_000);
}

export interface ScanPostResult {
  ok: boolean;
  queued?: boolean;
  data?: any;
  error?: string;
}

/**
 * POST a scanner mutation with an idempotency key; offline → queued (returns
 * { ok: true, queued: true }); server rejection → { ok: false, error }.
 */
export async function scanPost(url: string, body: unknown, label: string): Promise<ScanPostResult> {
  const id = crypto.randomUUID();
  try {
    const res = await api.post(url, body, { headers: { 'X-Idempotency-Key': id } });
    return { ok: true, data: res.data };
  } catch (e: any) {
    if (!e?.response) {
      enqueueAction(id, url, body, label);
      return { ok: true, queued: true };
    }
    return { ok: false, error: e.response?.data?.message ?? e.message };
  }
}
