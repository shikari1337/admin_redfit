import React, { useMemo, useState } from 'react';
import {
  FaBolt, FaDownload, FaFlag, FaRegFlag, FaSpinner, FaStickyNote,
  FaTruck, FaUserCheck, FaCheck, FaTimes, FaMinus,
} from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI, shippingAPI } from '../../services/api';

/**
 * Bulk actions for the Orders list.
 *
 * ── Why this loops instead of calling one bulk endpoint ──────────────────
 * There is no bulk order route, and adding one would mean a SECOND
 * implementation of everything the per-order routes already do: the status
 * machine's ALLOWED_TRANSITIONS, the status-history entry naming the real
 * staff member (#133), the `staff_activity` ledger (#209), the return-deadline
 * stamp (#238), the customer notification, and the `orders.manage` gate. A
 * set-based UPDATE would silently skip all of it. So each selected order goes
 * through the SAME route the per-order buttons use, a few at a time, and every
 * order reports its own outcome.
 *
 * ── The two rules this dialog will not bend ──────────────────────────────
 * 1. It says what it will SKIP before it runs anything. The status machine is
 *    mirrored here (see ALLOWED_TRANSITIONS) purely to pre-warn; the server is
 *    still the authority and its refusal is shown verbatim per order.
 * 2. A partial failure is NEVER reported as success. If one order of forty
 *    fails, the dialog stays open, says so, and names it.
 */

// ── The order status machine, mirrored from backend routes/orders.ts ───────
// Kept in step by hand and used ONLY to pre-warn; every real decision is the
// server's, which answers 409 with its own `allowed` list.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'processing', 'on_hold', 'cancelled'],
  confirmed: ['processing', 'shipped', 'on_hold', 'cancelled'],
  processing: ['shipped', 'on_hold', 'cancelled'],
  on_hold: ['pending', 'confirmed', 'processing', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'returned', 'cancelled'],
  out_for_delivery: ['delivered', 'shipped', 'returned'],
  delivered: ['return_requested', 'completed'],
  partially_delivered: ['return_requested', 'completed'],
  return_requested: ['returned', 'delivered'],
  returned: ['completed'],
  cancelled: [],
  completed: [],
};

/**
 * Statuses staff may pick as a bulk TARGET.
 *
 * `partially_delivered` is deliberately absent: it is system-derived from the
 * shipment rollup (migration 133) and is not a transition target from anywhere.
 * `cancelled` is absent too — cancelling reverses money and may raise a credit
 * note, which needs the per-order dialog's refund-rail choice, not a checkbox.
 */
const BULK_STATUS_TARGETS: Array<[string, string]> = [
  ['confirmed', 'Confirmed'],
  ['processing', 'Processing'],
  ['shipped', 'Shipped'],
  ['out_for_delivery', 'Out for delivery'],
  ['delivered', 'Delivered'],
  ['on_hold', 'On hold'],
  ['completed', 'Completed'],
];

const NOTIFY_EVENTS: Array<[string, string]> = [
  ['order_confirmation', 'Order confirmed'],
  ['order_shipped', 'Order shipped'],
  ['out_for_delivery', 'Out for delivery'],
  ['order_delivered', 'Order delivered'],
  ['payment_link', 'Payment link'],
];

type ActionKey = 'status' | 'assign' | 'flag' | 'unflag' | 'note' | 'notify' | 'ship';

export interface BulkOrderRow {
  _id: string;
  orderId?: string;
  orderStatus?: string;
  order_status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  isFlagged?: boolean;
  is_flagged?: boolean;
  fulfilment?: string;
  fulfillment_state?: string;
}

interface Props {
  rows: BulkOrderRow[];
  selectedIds: string[];
  onClear: () => void;
  /** Refetch the list — called once the run finishes, even on partial failure. */
  onDone: () => void;
  canManageOrders: boolean;
  canManageShipments: boolean;
  onExportSelected: () => void;
  exporting: boolean;
  staff: Array<{ id: string; name: string | null; role: string }>;
}

interface Plan {
  /** Orders this action can be attempted on. */
  run: BulkOrderRow[];
  /** Orders left out, each with the reason a person can act on. */
  skip: Array<{ row: BulkOrderRow; why: string }>;
}

interface RunResult {
  id: string;
  label: string;
  state: 'ok' | 'nochange' | 'fail';
  detail?: string;
}

const statusOf = (o: BulkOrderRow) => String(o.orderStatus ?? o.order_status ?? '');
const flaggedOf = (o: BulkOrderRow) => Boolean(o.isFlagged ?? o.is_flagged);
const fulfilOf = (o: BulkOrderRow) => String(o.fulfilment ?? o.fulfillment_state ?? 'none');
const nameOf = (o: BulkOrderRow) => o.orderId || o._id.slice(0, 8).toUpperCase();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pull the server's own words out of an axios error — never invent a reason. */
const reasonFrom = (err: any): string => {
  const d = err?.response?.data;
  const msg = d?.message || d?.error?.message || err?.message;
  const allowed: string[] | undefined = d?.allowed;
  if (msg && allowed?.length) return `${msg} (can go to: ${allowed.join(', ')})`;
  return msg || 'Request failed';
};

/** Run `task` over `items`, `width` at a time, reporting progress as it goes. */
async function runPooled<T>(
  items: T[],
  width: number,
  task: (item: T) => Promise<RunResult>,
  onResult: (r: RunResult) => void,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      onResult(await task(items[i]));
    }
  });
  await Promise.all(workers);
}

const OrderBulkBar: React.FC<Props> = ({
  rows, selectedIds, onClear, onDone, canManageOrders, canManageShipments,
  onExportSelected, exporting, staff,
}) => {
  const [action, setAction] = useState<ActionKey | null>(null);
  const [target, setTarget] = useState('confirmed');
  const [assignee, setAssignee] = useState('');
  const [noteText, setNoteText] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [notifyEvent, setNotifyEvent] = useState('order_confirmation');
  const [channels, setChannels] = useState<Array<'whatsapp' | 'sms' | 'email'>>(['whatsapp']);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);

  const selected = useMemo(
    () => rows.filter((r) => selectedIds.includes(r._id)),
    [rows, selectedIds],
  );

  /**
   * Who can take this action, and who cannot and why — computed BEFORE the run
   * so a person is never told "12 failed" for a reason the screen already knew.
   */
  const plan: Plan = useMemo(() => {
    const run: BulkOrderRow[] = [];
    const skip: Plan['skip'] = [];
    for (const o of selected) {
      const st = statusOf(o);
      let why: string | null = null;
      if (action === 'status') {
        if (st === target) why = `already ${target.replace(/_/g, ' ')}`;
        else if (!(ALLOWED_TRANSITIONS[st] ?? []).includes(target)) {
          why = st === 'completed' || st === 'cancelled'
            ? `${st} is final`
            : `cannot go from ${st.replace(/_/g, ' ')} to ${target.replace(/_/g, ' ')}`;
        }
      } else if (action === 'flag' && flaggedOf(o)) why = 'already flagged';
      else if (action === 'unflag' && !flaggedOf(o)) why = 'not flagged';
      else if (action === 'ship') {
        if (fulfilOf(o) === 'shipped') why = 'everything is already shipped';
        else if (st === 'cancelled' || st === 'completed' || st === 'returned') why = `order is ${st}`;
      }
      if (why) skip.push({ row: o, why });
      else run.push(o);
    }
    return { run, skip };
  }, [selected, action, target]);

  const close = () => {
    if (running) return;
    setAction(null);
    setResults(null);
    setNoteText('');
    setFlagReason('');
  };

  const perform = async (o: BulkOrderRow): Promise<RunResult> => {
    const label = nameOf(o);
    try {
      switch (action) {
        case 'status': {
          const r = await ordersAPI.updateStatus(o._id, target);
          return r?.message === 'Status unchanged'
            ? { id: o._id, label, state: 'nochange', detail: 'already there' }
            : { id: o._id, label, state: 'ok' };
        }
        case 'assign': {
          const r = await ordersAPI.assign(o._id, assignee || null);
          return r?.message === 'No change'
            ? { id: o._id, label, state: 'nochange', detail: 'already owned by them' }
            : { id: o._id, label, state: 'ok' };
        }
        case 'flag':
          await ordersAPI.setFlag(o._id, true, flagReason.trim() || undefined);
          return { id: o._id, label, state: 'ok' };
        case 'unflag':
          await ordersAPI.setFlag(o._id, false);
          return { id: o._id, label, state: 'ok' };
        case 'note':
          await ordersAPI.addNote(o._id, noteText.trim());
          return { id: o._id, label, state: 'ok' };
        case 'notify': {
          // One dispatch per channel — the priority chain stops at the first
          // channel that works, which is wrong for a deliberate bulk send.
          const r = await ordersAPI.notifyAll(o._id, notifyEvent, channels);
          const sent = r?.data?.results?.filter?.((x: any) => x?.success)?.length;
          return typeof sent === 'number' && sent === 0
            ? { id: o._id, label, state: 'fail', detail: r?.data?.results?.[0]?.error || 'no channel accepted it' }
            : { id: o._id, label, state: 'ok', detail: typeof sent === 'number' ? `${sent}/${channels.length} sent` : undefined };
        }
        case 'ship':
          await shippingAPI.createShipment(o._id, { shippingProvider: 'shiprocket' });
          return { id: o._id, label, state: 'ok' };
        default:
          return { id: o._id, label, state: 'fail', detail: 'unknown action' };
      }
    } catch (err: any) {
      return { id: o._id, label, state: 'fail', detail: reasonFrom(err) };
    }
  };

  const start = async () => {
    setRunning(true);
    const acc: RunResult[] = [];
    setResults([]);
    // Shipment booking calls a courier per order — keep it gentle. The rest are
    // our own DB writes and tolerate more.
    await runPooled(plan.run, action === 'ship' ? 2 : 4, perform, (r) => {
      acc.push(r);
      setResults([...acc]);
    });
    setRunning(false);
    onDone();
    const failed = acc.filter((r) => r.state === 'fail').length;
    // Clean sweep closes itself; anything unresolved stays on screen to be read.
    if (failed === 0) {
      onClear();
      close();
    }
  };

  if (selectedIds.length === 0) return null;

  const n = selectedIds.length;
  const btn = 'inline-flex h-7 items-center gap-1.5 rounded border border-line bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50';

  const ACTION_TITLE: Record<ActionKey, string> = {
    status: 'Change status',
    assign: 'Assign to someone',
    flag: 'Flag for attention',
    unflag: 'Clear the flag',
    note: 'Add an internal note',
    notify: 'Message these customers',
    ship: 'Create shipments',
  };

  const okCount = results?.filter((r) => r.state === 'ok').length ?? 0;
  const failCount = results?.filter((r) => r.state === 'fail').length ?? 0;
  const noChange = results?.filter((r) => r.state === 'nochange').length ?? 0;
  const done = results !== null && !running;

  const blocked =
    (action === 'note' && !noteText.trim()) ||
    (action === 'notify' && channels.length === 0) ||
    plan.run.length === 0;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border border-brand/25 bg-brand/10 px-3 py-2 text-sm"
        role="region"
        aria-label="Actions for the selected orders"
      >
        <span className="font-semibold text-brand-700 tabular-nums">{plural(n, 'order')} selected</span>

        {canManageOrders && (
          <>
            <button className={btn} onClick={() => setAction('status')}>
              <FaBolt className="h-3 w-3" /> Change status
            </button>
            <button className={btn} onClick={() => setAction('assign')}>
              <FaUserCheck className="h-3 w-3" /> Assign
            </button>
            <button className={btn} onClick={() => setAction('flag')}>
              <FaFlag className="h-3 w-3" /> Flag
            </button>
            <button className={btn} onClick={() => setAction('unflag')}>
              <FaRegFlag className="h-3 w-3" /> Clear flag
            </button>
            <button className={btn} onClick={() => setAction('note')}>
              <FaStickyNote className="h-3 w-3" /> Add note
            </button>
            <button className={btn} onClick={() => setAction('notify')}>
              <FaBolt className="h-3 w-3" /> Message
            </button>
          </>
        )}
        {canManageShipments && (
          <button className={btn} onClick={() => setAction('ship')}>
            <FaTruck className="h-3 w-3" /> Create shipments
          </button>
        )}
        <button className={btn} onClick={onExportSelected} disabled={exporting}>
          <FaDownload className="h-3 w-3" /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>

        <button className="ml-auto text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline" onClick={onClear}>
          Clear selection
        </button>
      </div>

      <Modal
        isOpen={action !== null}
        onClose={close}
        title={action ? ACTION_TITLE[action] : ''}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2 disabled:opacity-50"
              onClick={close}
              disabled={running}
            >
              {done ? 'Close' : 'Cancel'}
            </button>
            {!done && (
              <button
                className="inline-flex items-center gap-2 rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={start}
                disabled={running || blocked}
              >
                {running && <FaSpinner className="h-3 w-3 animate-spin" />}
                {running
                  ? `${results?.length ?? 0} of ${plan.run.length}…`
                  : `Run on ${plural(plan.run.length, 'order')}`}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {/* ── What the action needs ─────────────────────────────────── */}
          {!results && action === 'status' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Move to</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 w-full rounded border border-line bg-surface px-2"
              >
                {BULK_STATUS_TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="mt-1.5 block text-xs text-ink-soft">
                Each order goes through the same status change as the order page, so the customer
                notification for this status fires and the change is recorded against your name.
                Cancelling is not offered here — it reverses money and may raise a credit note, so it
                needs the order's own dialog.
              </span>
            </label>
          )}

          {!results && action === 'assign' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Owner</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 w-full rounded border border-line bg-surface px-2"
              >
                <option value="">Nobody (clear the owner)</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id} · {s.role}</option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-ink-soft">
                This is who is MANAGING the order now. It does not change who gets the sales credit.
              </span>
            </label>
          )}

          {!results && action === 'flag' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Reason (optional)</span>
              <input
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g. address needs checking"
                className="h-9 w-full rounded border border-line bg-surface px-2"
              />
            </label>
          )}

          {!results && action === 'note' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Note</span>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="Added to every selected order, with your name and the time."
                className="w-full rounded border border-line bg-surface p-2"
              />
              <span className="mt-1.5 block text-xs text-ink-soft">Internal only — the customer never sees this.</span>
            </label>
          )}

          {!results && action === 'notify' && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Message</span>
                <select
                  value={notifyEvent}
                  onChange={(e) => setNotifyEvent(e.target.value)}
                  className="h-9 w-full rounded border border-line bg-surface px-2"
                >
                  {NOTIFY_EVENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Send on</span>
                <div className="flex gap-3">
                  {(['whatsapp', 'sms', 'email'] as const).map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={channels.includes(c)}
                        onChange={(e) => setChannels((prev) =>
                          e.target.checked ? [...prev, c] : prev.filter((x) => x !== c))}
                      />
                      {c}
                    </label>
                  ))}
                </div>
                <span className="mt-1.5 block text-xs text-ink-soft">
                  Every ticked channel is sent, not just the first one that works. A channel whose
                  template the gateway has not approved will fail and say so.
                </span>
              </div>
            </div>
          )}

          {!results && action === 'ship' && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              This books <strong>real shipments with Shiprocket</strong>, one per order, and may cost
              money. It cannot be undone from this screen — a shipment is cancelled from the order.
            </p>
          )}

          {/* ── What will be skipped, before anything runs ─────────────── */}
          {!results && plan.skip.length > 0 && (
            <div className="rounded border border-line bg-surface-2 p-3">
              <p className="text-xs font-semibold text-ink">
                {plural(plan.skip.length, 'order')} will be skipped
              </p>
              <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs text-ink-soft">
                {plan.skip.map(({ row, why }) => (
                  <li key={row._id}><span className="font-medium text-ink">{nameOf(row)}</span> — {why}</li>
                ))}
              </ul>
            </div>
          )}
          {!results && plan.run.length === 0 && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Nothing to do — none of the selected orders can take this action.
            </p>
          )}

          {/* ── Outcome, per order ────────────────────────────────────── */}
          {results && (
            <div>
              <p className={`text-sm font-semibold ${failCount ? 'text-red-700' : 'text-emerald-700'}`}>
                {running
                  ? `Working… ${results.length} of ${plan.run.length}`
                  : failCount
                    ? `${plural(failCount, 'order')} could not be done${okCount ? `; ${okCount} went through` : ''}.`
                    : `Done — ${plural(okCount, 'order')} updated${noChange ? `, ${noChange} already as asked` : ''}.`}
              </p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                {results.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    {r.state === 'ok' && <FaCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />}
                    {r.state === 'fail' && <FaTimes className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />}
                    {r.state === 'nochange' && <FaMinus className="mt-0.5 h-3 w-3 shrink-0 text-ink-mute" />}
                    <span className="font-medium text-ink">{r.label}</span>
                    {r.detail && <span className="text-ink-soft">— {r.detail}</span>}
                  </li>
                ))}
              </ul>
              {failCount > 0 && !running && (
                <p className="mt-2 text-xs text-ink-soft">
                  The orders that failed were not changed. The selection is kept so you can fix and retry.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default OrderBulkBar;
