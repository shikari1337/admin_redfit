import React, { useEffect, useMemo, useState } from 'react';
import {
  FaBolt, FaDownload, FaFlag, FaRegFlag, FaSpinner, FaStickyNote,
  FaTruck, FaUserCheck, FaCheck, FaTimes, FaMinus, FaBalanceScale,
} from 'react-icons/fa';
import Modal from './Modal';
import { api, ordersAPI, packagesAPI, shipmentsAPI, shippingAPI, warehousesAPI } from '../../services/api';
import { BOOKABLE, bookOrder, boxLabel, boxOf, defaultBoxOf, listOf, orderWeightKg, unwrap } from '../../lib/bulkShip';

/**
 * Bulk actions for the Orders list, and Create shipments alone on the Growcord Ship board's Pending Orders
 * (pages/Shipments.tsx, owner 27 Nov 2026: "in pending order add bulk ship option"), starting on Growcord Ship there.
 *
 * Create shipments books an order with nothing booked yet through the same safe step as Growcord Ship's Bulk
 * shipment (lib/bulkShip bookOrder): the order is re-read just before it is sent, and a booking whose answer was lost
 * is looked up on the order, never sent again from here. Each parcel goes with the warehouse picked here and its own
 * weight and size: its items weighed as Bulk shipment weighs them (lib/bulkShip orderWeightKg) in the box picked here,
 * the store's default box at first (GS-AUDIT-P, 28 Nov 2026: the server's 0.5 kg, 10x10x5 cm stand-in is never sent).
 * With no box size, or an order with nothing to weigh, the order is skipped with the reason.
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

type ActionKey = 'status' | 'assign' | 'flag' | 'unflag' | 'note' | 'notify' | 'ship' | 'codrebook';

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
  /** The parcels a COD rebook can still correct (the courier has not picked them up). */
  cod_rebook_ids?: string[];
  codRebookIds?: string[];
}

interface Props {
  rows: BulkOrderRow[];
  selectedIds: string[];
  onClear: () => void;
  /** Refetch the list — called once the run finishes, even on partial failure. */
  onDone: () => void;
  canManageOrders: boolean;
  canManageShipments: boolean;
  /** Export CSV of the selection; the button shows only when given (the Orders list). */
  onExportSelected?: () => void;
  exporting?: boolean;
  staff?: Array<{ id: string; name: string | null; role: string }>;
  /** Who Create shipments books with at first: Shiprocket as before, or Growcord Ship on its own board. */
  startProvider?: 'shiprocket' | 'growcord_ship';
  /** The warehouse Create shipments starts on (the shipments board's warehouse filter, when one is set). */
  startWarehouseId?: string;
  /**
   * Compare prices and book: hands the ticked orders to a page that prices each one and picks the cheapest or the
   * fastest (Growcord Ship's Bulk shipment, from its board's Pending Orders). Shown only when given.
   */
  onComparePrices?: (ids: string[]) => void;
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
  /**
   * `skipped`: left alone when re-read (cancelled meanwhile, or a parcel already on it). `unknown`: a booking whose
   * answer was lost and no parcel shows yet; it may still have been made, so it is not sent again from here.
   */
  state: 'ok' | 'nochange' | 'skipped' | 'unknown' | 'fail';
  detail?: string;
}

const statusOf = (o: BulkOrderRow) => String(o.orderStatus ?? o.order_status ?? '');
const flaggedOf = (o: BulkOrderRow) => Boolean(o.isFlagged ?? o.is_flagged);
const fulfilOf = (o: BulkOrderRow) => String(o.fulfilment ?? o.fulfillment_state ?? 'none');
const rebookIdsOf = (o: BulkOrderRow) => o.cod_rebook_ids ?? o.codRebookIds ?? [];
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
  onExportSelected, exporting = false, staff = [], startProvider = 'shiprocket', onComparePrices, startWarehouseId,
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
  // Who books the parcels: Shiprocket as before, or Growcord Ship when the store has it on (owner 26 Nov 2026); its
  // own board starts on Growcord Ship (owner 27 Nov 2026).
  const [shipProvider, setShipProvider] = useState<'shiprocket' | 'growcord_ship'>(startProvider);
  const [hasGrowcordShip, setHasGrowcordShip] = useState(false);
  // Orders whose booking got no answer here: never sent again from this screen (read the page again to retry).
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  // Where the parcels leave from and the box they go in (null until read): the first warehouse in use and the store's
  // default box, as Bulk shipment and the create window start.
  const [warehouses, setWarehouses] = useState<any[] | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [boxes, setBoxes] = useState<any[] | null>(null);
  const [boxId, setBoxId] = useState('');
  useEffect(() => {
    if (action !== 'ship') return;
    if (warehouses === null) {
      warehousesAPI.getAll()
        .then((r: any) => {
          const list = listOf(r);
          setWarehouses(list);
          // The board's warehouse filter when it names one of them, else the first in use.
          const first = (startWarehouseId ? list.find((w) => String(w?._id) === startWarehouseId) : undefined)
            ?? list.find((w) => w?.isActive !== false) ?? list[0];
          if (first?._id) setWarehouseId(String(first._id));
        })
        .catch(() => setWarehouses([]));
    } else if (startWarehouseId && warehouses.some((w) => String(w?._id) === startWarehouseId)) {
      setWarehouseId(startWarehouseId);
    }
    if (boxes === null) {
      packagesAPI.getAll()
        .then((r: any) => {
          const list = listOf(r).filter((b) => b && (b.isActive ?? b.is_active) !== false);
          setBoxes(list);
          const box = defaultBoxOf(list);
          if (box) setBoxId(String(box._id ?? box.id ?? ''));
        })
        .catch(() => setBoxes([]));
    }
    shippingAPI.getProviders()
      .then((res: any) => {
        const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        const on = rows.some((p) => p?.id === 'growcord_ship' && p?.enabled !== false);
        setHasGrowcordShip(on);
        if (!on) setShipProvider('shiprocket');
      })
      .catch(() => { setHasGrowcordShip(false); setShipProvider('shiprocket'); });
    // The warehouses and boxes are read once; the providers each time the window opens, as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // The box chosen, and its sides and own weight (null when it has no usable sides or none is chosen).
  const chosenBox = useMemo(() => (boxes ?? []).find((b) => String(b._id ?? b.id ?? '') === boxId) ?? null, [boxes, boxId]);
  const parcelBox = useMemo(() => boxOf(chosenBox), [chosenBox]);
  /** Why no parcel can be sized or sent from here, said before anything runs; null when it can. */
  const shipBlock = action !== 'ship' || boxes === null || warehouses === null ? null
    : !warehouseId ? 'no warehouse to ship from: add one in Pickup locations'
      : !chosenBox ? 'no box to book with: add a box with its length, breadth and height in Settings, Packages'
        : !parcelBox ? `box ${boxLabel(chosenBox)} has no length, breadth and height in Settings, Packages`
          : null;

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
        // The booking takes confirmed or processing orders only (lib/bulkShip BOOKABLE); said before anything runs.
        else if (st && !BOOKABLE.includes(st)) why = `order is ${st.replace(/_/g, ' ')}; only confirmed or processing orders are booked`;
        else if (unknownIds.includes(o._id)) why = 'the last booking got no answer. Open the order to see whether it was booked; if not, read the page again to book it';
        else if (shipBlock) why = shipBlock;
      } else if (action === 'codrebook' && rebookIdsOf(o).length === 0) {
        why = 'nothing to correct, or the courier already has the parcel';
      }
      if (why) skip.push({ row: o, why });
      else run.push(o);
    }
    return { run, skip };
  }, [selected, action, target, unknownIds, shipBlock]);

  const close = () => {
    if (running) return;
    setAction(null);
    setResults(null);
    setNoteText('');
    setFlagReason('');
    // The next Create shipments starts on this screen's carrier again (Shiprocket, or Growcord Ship on its board).
    setShipProvider(startProvider);
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
        case 'ship': {
          // The plan refuses the run without a sized box, so it is here; each order is weighed as it stands now.
          const box = parcelBox!;
          const partial = fulfilOf(o) === 'partial';
          const kgOf = (order: any, tare: number) => orderWeightKg(order, tare, { remaining: partial });
          const noWeight = (order: any) => (kgOf(order, 0) > 0 ? null : 'none of its lines is left to ship, so no weight could be worked out');
          const send = (order: any) => shippingAPI.createShipment(o._id, {
            shippingProvider: shipProvider,
            warehouseId,
            dimensions: { weight: kgOf(order, box.deadWeightKg), length: box.length, breadth: box.breadth, height: box.height },
          });
          if (!partial) {
            // Nothing shipped yet (the list's none or unshipped, or a Pending Orders row): the shared safe step
            // (lib/bulkShip bookOrder), as Growcord Ship's Bulk shipment. An order already holding a parcel is skipped.
            const out = await bookOrder(o._id, send, noWeight);
            return { id: o._id, label, state: out.ok ? 'ok' : out.skip ? 'skipped' : out.unknown ? 'unknown' : 'fail', detail: out.text };
          }
          // Part shipped already, as before: a parcel is on the order, so the re-read and the look-up after a lost
          // answer (both read "a parcel is on it" as booked) cannot tell the new parcel from the old one. The order is
          // read once to weigh what is still to ship.
          const order = unwrap(await api.get(`/orders/${o._id}`));
          const why = noWeight(order);
          if (why) return { id: o._id, label, state: 'skipped', detail: `Skipped: ${why}` };
          const r: any = await send(order);
          const s = r?.shipment ?? r?.data?.shipment;
          const awb = s?.awbCode ?? s?.awb_code ?? s?.waybill;
          return { id: o._id, label, state: 'ok', detail: awb ? `AWB ${awb}${s?.courierName ? `, ${s.courierName}` : ''}` : undefined };
        }
        case 'codrebook': {
          // One parcel at a time: each is a cancel and a booking at the courier, and the
          // server's own words, what to print again included, are what the person reads.
          const lines: string[] = [];
          let failed = false;
          for (const id of rebookIdsOf(o)) {
            const r = await shipmentsAPI.codRebook(id);
            failed = failed || r?.state === 'needs_booking';
            lines.push(String(r?.message ?? ''));
            if (r?.pickup && !r.pickup.scheduled) lines.push(String(r.pickup.reason ?? ''));
            lines.push(...(Array.isArray(r?.reprint) ? r.reprint.slice(0, 2).map(String) : []));
          }
          return { id: o._id, label, state: failed ? 'fail' : 'ok', detail: lines.filter(Boolean).join(' ') };
        }
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
    await runPooled(plan.run, action === 'codrebook' ? 1 : action === 'ship' ? 2 : 4, perform, (r) => {
      acc.push(r);
      setResults([...acc]);
    });
    setRunning(false);
    const lost = acc.filter((r) => r.state === 'unknown').map((r) => r.id);
    if (lost.length) setUnknownIds((prev) => [...new Set([...prev, ...lost])]);
    onDone();
    const failed = acc.filter((r) => r.state === 'fail' || r.state === 'unknown' || r.state === 'skipped').length;
    // Clean sweep closes itself; anything unresolved (or skipped on the re-read) stays on screen to be
    // read. A rebook always stays: it says what to print again.
    if (failed === 0 && action !== 'codrebook') {
      onClear();
      close();
    }
  };

  // The list reloads after a run and clears the ticks, but the result still has to be read.
  if (selectedIds.length === 0 && action === null) return null;

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
    codrebook: 'Rebook at correct COD amount',
  };

  const okCount = results?.filter((r) => r.state === 'ok').length ?? 0;
  const failCount = results?.filter((r) => r.state === 'fail').length ?? 0;
  const noChange = results?.filter((r) => r.state === 'nochange').length ?? 0;
  const skipCount = results?.filter((r) => r.state === 'skipped').length ?? 0;
  const unknownCount = results?.filter((r) => r.state === 'unknown').length ?? 0;
  const done = results !== null && !running;

  const blocked =
    (action === 'note' && !noteText.trim()) ||
    (action === 'notify' && channels.length === 0) ||
    (action === 'ship' && (boxes === null || warehouses === null)) ||
    plan.run.length === 0;

  return (
    <>
      {n > 0 && <div
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
        {canManageShipments && onComparePrices && (
          <button className={btn} onClick={() => onComparePrices([...selectedIds])} title="See each order's price, pick the cheapest or the fastest courier, then book">
            <FaBalanceScale className="h-3 w-3" /> Compare prices and book
          </button>
        )}
        {canManageShipments && selected.some((o) => rebookIdsOf(o).length > 0) && (
          <button className={btn} onClick={() => setAction('codrebook')}>
            <FaTruck className="h-3 w-3" /> Rebook at correct COD amount
          </button>
        )}
        {onExportSelected && (
          <button className={btn} onClick={onExportSelected} disabled={exporting}>
            <FaDownload className="h-3 w-3" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}

        <button className="ml-auto text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline" onClick={onClear}>
          Clear selection
        </button>
      </div>}

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
          {!results && action === 'codrebook' && (
            <div className="space-y-2 text-ink">
              <p>
                Each parcel is cancelled at the courier first. If the courier refuses, that order is
                left as it is. It is then booked again with the same courier at the due amount, under
                your name, and the order keeps its status.
              </p>
              <p className="text-xs text-ink-soft">
                The AWB changes, so printed labels and manifests must be replaced. The result below
                says what to print for each order. A parcel the courier has picked up is refused.
              </p>
            </div>
          )}

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
                Cancelling is not offered here: it reverses money and may raise a credit note, so it
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
                  <option key={s.id} value={s.id}>{s.name || s.id}, {s.role}</option>
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
              <span className="mt-1.5 block text-xs text-ink-soft">Internal only: the customer never sees this.</span>
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

          {!results && action === 'ship' && hasGrowcordShip && (
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Book with</span>
              <div className="flex gap-4">
                {([['shiprocket', 'Shiprocket'], ['growcord_ship', 'Growcord Ship']] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="bulk-ship-provider" checked={shipProvider === v} onChange={() => setShipProvider(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!results && action === 'ship' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Ship from</span>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  disabled={!warehouses?.length}
                  className="h-9 w-full rounded border border-line bg-surface px-2"
                >
                  {warehouses === null && <option value="">Reading the warehouses...</option>}
                  {warehouses?.length === 0 && <option value="">No warehouse yet</option>}
                  {(warehouses ?? []).map((w) => (
                    <option key={String(w._id)} value={String(w._id)}>{w.name}{w.isActive === false ? ' (not in use)' : ''}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-mute">Box</span>
                <select
                  value={boxId}
                  onChange={(e) => setBoxId(e.target.value)}
                  disabled={!boxes?.length}
                  className="h-9 w-full rounded border border-line bg-surface px-2"
                >
                  {boxes === null && <option value="">Reading the boxes...</option>}
                  {boxes?.length === 0 && <option value="">No box yet</option>}
                  {(boxes ?? []).map((b) => {
                    const d = boxOf(b);
                    return (
                      <option key={String(b._id ?? b.id)} value={String(b._id ?? b.id)}>
                        {boxLabel(b)}{d ? `, ${d.length} x ${d.breadth} x ${d.height} cm` : ', no size'}{(b.isDefault ?? b.is_default) ? ' (default)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              <span className="block text-xs text-ink-soft sm:col-span-2">
                Each parcel weighs its items (0.5 kg for an item whose product has no weight) plus the box's own weight,
                and goes with the box's sides. An order that cannot be weighed is skipped and says why.
              </span>
            </div>
          )}
          {!results && action === 'ship' && shipProvider === 'shiprocket' && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              This books <strong>real shipments with Shiprocket</strong>, one per order, and may cost
              money. It cannot be undone from this screen: a shipment is cancelled from the order.
            </p>
          )}
          {!results && action === 'ship' && shipProvider === 'growcord_ship' && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              This books <strong>real shipments with Growcord Ship</strong>, one per order. Growcord Ship picks the
              courier for each parcel and the freight comes off your Growcord wallet. To see each price first, use
              Growcord Ship, Bulk shipment. A shipment is cancelled from the order.
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
                  <li key={row._id}><span className="font-medium text-ink">{nameOf(row)}</span>: {why}</li>
                ))}
              </ul>
            </div>
          )}
          {!results && plan.run.length === 0 && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Nothing to do: none of the selected orders can take this action.
            </p>
          )}

          {/* ── Outcome, per order ────────────────────────────────────── */}
          {results && (
            <div>
              <p className={`text-sm font-semibold ${failCount ? 'text-red-700' : unknownCount ? 'text-amber-800' : 'text-emerald-700'}`}>
                {running
                  ? `Working… ${results.length} of ${plan.run.length}`
                  : failCount
                    ? `${plural(failCount, 'order')} could not be done${okCount ? `; ${okCount} went through` : ''}${skipCount ? `; ${skipCount} skipped` : ''}${unknownCount ? `; ${unknownCount} not known yet` : ''}.`
                    : unknownCount
                      ? `${plural(unknownCount, 'order')} not known yet${okCount ? `; ${okCount} went through` : ''}${skipCount ? `; ${skipCount} skipped` : ''}.`
                      : `Done: ${plural(okCount, 'order')} updated${noChange ? `, ${noChange} already as asked` : ''}${skipCount ? `, ${skipCount} skipped` : ''}.`}
              </p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                {results.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    {r.state === 'ok' && <FaCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />}
                    {r.state === 'fail' && <FaTimes className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />}
                    {(r.state === 'nochange' || r.state === 'skipped') && <FaMinus className="mt-0.5 h-3 w-3 shrink-0 text-ink-mute" />}
                    {r.state === 'unknown' && <FaMinus className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />}
                    <span className="font-medium text-ink">{r.label}</span>
                    {r.detail && <span className={r.state === 'unknown' ? 'text-amber-800' : 'text-ink-soft'}>{r.detail}</span>}
                  </li>
                ))}
              </ul>
              {failCount > 0 && !running && (
                <p className="mt-2 text-xs text-ink-soft">
                  The orders that failed were not changed. The selection is kept so you can fix and retry.
                </p>
              )}
              {unknownCount > 0 && !running && (
                <p className="mt-2 text-xs text-amber-900">
                  No answer came back for {plural(unknownCount, 'order')} and no parcel shows on it yet. It may still
                  have been booked, so it is not sent again from this screen: open the order in a minute, and if
                  nothing is booked, read the page again to book it.
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
