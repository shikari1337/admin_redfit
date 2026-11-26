import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Loader2, Check, X, FileDown, AlertTriangle, Minus } from 'lucide-react';
import { api, shipmentsAPI, shippingAPI, warehousesAPI, packagesAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtRupees } from '@/lib/money';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, TabBar,
  Field, SelectInput, TextInput, Chip,
} from '../../components/erp';
import { WalletCard, WalletRechargeBox, useStoreWallet, type StoreWallet } from '../../components/growship/WalletCard';
import { courierRatesOf, itemUnitWeightKg, type CourierRate } from '../../components/order/ShipmentCreationModal';
import { shipmentAwb } from '../../components/shipments/shipmentFacts';
import { downloadCsv } from '@/lib/csv';
import { GS_SHEET_HEADERS, growshipAPI, paiseToRupees, type GsAccount, type GsBulkRun } from '@/lib/v2/growship';

const GS = 'growcord_ship' as const;
const PAGE_SIZE = 50;
/** The box the shipments board books with when none is chosen (Shipments.tsx handleCreateShipment). */
const DEFAULT_BOX = { length: 20, breadth: 15, height: 10, deadWeightKg: 0 };
/** The order statuses a booking takes (`POST /shipments/book`, ship api/shipping.rs create_shipment). */
const BOOKABLE = ['confirmed', 'processing'];

/** What happened when the order was sent. `skip` and `unknown` are never sent again from this page. */
interface Outcome { ok: boolean; text: string; skip?: boolean; unknown?: boolean }

/** One order on its way through quote and booking. */
interface Plan {
  weightKg?: string;
  /** True when the weight was worked out here (a new box works it out again); false once typed. */
  autoWeight?: boolean;
  quotes?: CourierRate[];
  /** The chosen offer id; '' = let Growcord Ship choose. */
  chosen?: string;
  quoting?: boolean;
  quoteError?: string;
  booking?: boolean;
  result?: Outcome;
}

const orderNo = (o: any) => o?.orderId || o?.order_id || String(o?._id ?? '').slice(0, 8);
const unwrap = (res: any) => res?.data?.data ?? res?.data ?? res ?? {};
const listOf = (r: any): any[] => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : []);
/** A parcel that still counts: anything not cancelled. */
const liveParcels = (r: any) => listOf(r).filter((s) => String(s?.status ?? '') !== 'cancelled');

/** Run `task` over `items`, `width` at a time. */
async function pooled<T>(items: T[], width: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await task(items[i]);
    }
  }));
}

/**
 * How much more the wallet needs for `need` rupees: 0 when it covers it, when Growcord Ship does not take freight
 * from the wallet (another billing mode), or when the wallet may go below zero; null while the balance is read.
 */
function shortfall(wallet: StoreWallet | null | undefined, account: GsAccount | null | undefined, need: number): number | null {
  const mode = account?.plan?.billing_mode ?? account?.shipper?.billing_mode;
  if (mode && mode !== 'prepaid_wallet') return 0;
  if (wallet === undefined) return null;
  if (wallet === null || wallet.allow_negative) return 0;
  return Math.max(0, Math.round((need - wallet.balance) * 100) / 100);
}

/** "Add Rs X to book all", with Add money beside it. */
const ShortNotice: React.FC<{ short: number; onPaid: () => void }> = ({ short, onPaid }) => (
  <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span className="font-medium">Add {fmtRupees(short)} to book all.</span>
    <WalletRechargeBox compact onPaid={onPaid} defaultAmount={Math.ceil(short / 100) * 100} />
  </div>
);

/**
 * Many parcels at once with Growcord Ship (owner 26 Nov 2026: "bulk shipment"). Ready orders: pick orders with
 * nothing booked yet, see each one's price from Growcord Ship and the total against the wallet, then book them one
 * by one, each re-read just before it is sent (cancelled, already shipped or already holding a parcel is skipped,
 * with the reason), and a booking whose answer was lost is looked up on the order, never sent twice. A sheet: a CSV
 * of parcels that are not store orders goes to Growcord Ship's own sheet reader, a dry run first; a real run is
 * sent once, and a lost answer is read back from Growcord Ship's job list.
 */
const GrowshipBulk: React.FC = () => {
  const { hasPerm } = useAuth();
  const canBook = hasPerm('shipments.manage');
  const [tab, setTab] = useState<'orders' | 'sheet'>('orders');
  const { wallet, error: walletError, reload: reloadWallet } = useStoreWallet(hasPerm('billing.read'));
  // The account: how freight is paid (the wallet check) and the pickup addresses (the sheet).
  const [account, setAccount] = useState<GsAccount | null | undefined>(undefined);
  const [accountError, setAccountError] = useState<string | null>(null);
  useEffect(() => {
    growshipAPI.account().then(setAccount).catch((e) => { setAccount(null); setAccountError(errorText(e, 'Growcord Ship could not be read.')); });
  }, []);

  /* ── ready orders ── */
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [boxes, setBoxes] = useState<any[]>([]);
  const [boxId, setBoxId] = useState('');
  const [orders, setOrders] = useState<any[] | null>(null);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [running, setRunning] = useState<'quote' | 'book' | null>(null);

  const setPlan = (id: string, patch: Partial<Plan>) => setPlans((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  useEffect(() => {
    warehousesAPI.getAll()
      .then((r: any) => {
        const list = listOf(r);
        setWarehouses(list);
        const first = list.find((w) => w?.isActive !== false) ?? list[0];
        if (first?._id) setWarehouseId(String(first._id));
      })
      .catch(() => setWarehouses([]));
    packagesAPI.getAll().then((r: any) => setBoxes(listOf(r))).catch(() => setBoxes([]));
  }, []);

  const loadOrders = (p = page) => {
    setOrdersError(null);
    shipmentsAPI.getPendingOrders({ page: p, limit: PAGE_SIZE })
      .then((r: any) => {
        const rows: any[] = Array.isArray(r) ? r : Array.isArray(r?.orders) ? r.orders : Array.isArray(r?.data?.orders) ? r.data.orders : [];
        setOrders(rows);
        setOrdersTotal(Number(r?.pagination?.total ?? r?.data?.pagination?.total ?? rows.length) || 0);
      })
      .catch((e) => { setOrders([]); setOrdersError(errorText(e, 'The orders to book could not be read.')); });
  };
  useEffect(() => { if (tab === 'orders') loadOrders(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, page]);

  const box = useMemo(() => {
    const b = boxes.find((x) => String(x._id ?? x.id) === boxId);
    if (!b) return DEFAULT_BOX;
    return {
      length: Number(b.length ?? b.lengthCm) || DEFAULT_BOX.length,
      breadth: Number(b.breadth ?? b.widthCm) || DEFAULT_BOX.breadth,
      height: Number(b.height ?? b.heightCm) || DEFAULT_BOX.height,
      deadWeightKg: Number(b.weight ?? b.deadWeightKg ?? 0) || 0,
    };
  }, [boxes, boxId]);

  // A new box or warehouse changes every price: the quotes taken so far no longer hold, and a weight worked out
  // here (it includes the box) is worked out again.
  useEffect(() => {
    setPlans((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, {
      ...v, quotes: undefined, chosen: undefined, quoteError: undefined, ...(v.autoWeight ? { weightKg: undefined } : {}),
    }])));
  }, [boxId, warehouseId]);

  const rows = orders ?? [];
  const allOnPage = rows.length > 0 && rows.every((o) => selected.includes(o._id));
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id)));

  const priceOf = (id: string): number | null => {
    const pl = plans[id];
    if (!pl?.quotes?.length) return null;
    const pick = pl.chosen ? pl.quotes.find((q) => String(q.courierCompanyId) === pl.chosen) : pl.quotes[0];
    return pick ? pick.rate : null;
  };
  /** Selected orders still to send: not booked, not skipped, not waiting to be checked by hand. */
  const open = selected.filter((id) => { const r = plans[id]?.result; return !r || (!r.ok && !r.skip && !r.unknown); });
  const bookable = open.filter((id) => (plans[id]?.quotes?.length ?? 0) > 0);
  const total = Math.round(bookable.reduce((s, id) => s + (priceOf(id) ?? 0), 0) * 100) / 100;
  const unpriced = open.filter((id) => priceOf(id) === null).length;
  const ordersShort = bookable.length ? shortfall(wallet, account, total) : 0;

  /** Weight in kg from an order's lines (each unit's weight, 0.5 kg when the product has none) and the box. */
  const weighOrder = (order: any): number => {
    const items: any[] = Array.isArray(order?.items) ? order.items : [];
    const kg = items.reduce((s, it) => s + itemUnitWeightKg(it) * (Number(it?.quantity) || 1), 0) + box.deadWeightKg;
    return Math.round((kg > 0 ? kg : 0.5) * 100) / 100;
  };
  const weightFor = async (id: string, order?: any): Promise<number> => {
    const typed = parseFloat(plans[id]?.weightKg ?? '');
    if (typed > 0) return typed;
    const w = weighOrder(order ?? unwrap(await api.get(`/orders/${id}`)));
    setPlan(id, { weightKg: String(w), autoWeight: true });
    return w;
  };

  const getQuotes = async () => {
    if (!warehouseId) return;
    setRunning('quote');
    await pooled(open, 3, async (id) => {
      setPlan(id, { quoting: true, quoteError: undefined });
      try {
        const weight = await weightFor(id);
        const res = await shippingAPI.getCourierRates(id, warehouseId, { weight, length: box.length, breadth: box.breadth, height: box.height }, GS);
        const quotes = courierRatesOf(res);
        setPlan(id, { quoting: false, quotes, chosen: quotes[0] ? String(quotes[0].courierCompanyId) : '', quoteError: quotes.length ? undefined : 'No courier can take this parcel.' });
      } catch (e) {
        setPlan(id, { quoting: false, quotes: [], quoteError: errorText(e, 'Growcord Ship did not answer.') });
      }
    });
    setRunning(null);
  };

  /**
   * Re-read the order just before it is sent: only a confirmed or processing order with no parcel yet is booked.
   * Answers the reason to skip it, or the order as it stands now.
   */
  const recheck = async (id: string): Promise<{ skip: string } | { order: any }> => {
    const [res, parcels] = await Promise.all([api.get(`/orders/${id}`), shipmentsAPI.byOrder(id)]);
    const order = unwrap(res);
    const status = String(order?.orderStatus ?? order?.order_status ?? '');
    if (!BOOKABLE.includes(status)) {
      return { skip: `Skipped: the order is ${status.replace(/_/g, ' ') || 'not confirmed'}. Only confirmed or processing orders are booked.` };
    }
    const live = liveParcels(parcels);
    if (live.length) {
      const awb = shipmentAwb(live[0]);
      return { skip: `Skipped: it already has a parcel${awb ? ` (AWB ${awb})` : ''}.` };
    }
    return { order };
  };

  /** After an error: is a parcel on the order now? The answer may have been lost after the booking was made. */
  const lookUp = async (id: string, why: string): Promise<Outcome> => {
    try {
      const live = liveParcels(await shipmentsAPI.byOrder(id));
      if (live.length) {
        const awb = shipmentAwb(live[0]);
        return { ok: true, text: `Booked; the answer was lost, the parcel is on the order${awb ? ` (AWB ${awb})` : ''}.` };
      }
      return { ok: false, text: `Not booked: ${why} Nothing is on the order, so it can be sent again.` };
    } catch {
      return { ok: false, unknown: true, text: `Not known whether it was booked (${why}). Open the order before booking it again.` };
    }
  };

  const book = async () => {
    if (!warehouseId) return;
    const ids = [...bookable];
    setRunning('book');
    await pooled(ids, 2, async (id) => {
      setPlan(id, { booking: true });
      let checked: { skip: string } | { order: any };
      try {
        checked = await recheck(id);
      } catch (e) {
        setPlan(id, { booking: false, result: { ok: false, text: `Not sent: the order could not be read again (${errorText(e, 'no answer')}).` } });
        return;
      }
      if ('skip' in checked) {
        setPlan(id, { booking: false, result: { ok: false, skip: true, text: checked.skip } });
        return;
      }
      try {
        const weight = await weightFor(id, checked.order);
        const res: any = await shippingAPI.createShipment(id, {
          warehouseId, shippingProvider: GS,
          ...(plans[id]?.chosen ? { courierCode: plans[id].chosen } : {}),
          dimensions: { weight, length: box.length, breadth: box.breadth, height: box.height },
        });
        const s = res?.shipment ?? res?.data?.shipment ?? {};
        const awb = s.awbCode ?? s.awb_code;
        setPlan(id, { booking: false, result: { ok: true, text: [s.courierName ?? s.courier, awb ? `AWB ${awb}` : 'waiting for its AWB'].filter(Boolean).join(', ') } });
      } catch (e) {
        setPlan(id, { booking: false, result: await lookUp(id, errorText(e, 'no answer.')) });
      }
    });
    setRunning(null);
    reloadWallet();
  };

  const results = Object.values(plans).map((p) => p.result).filter(Boolean) as Outcome[];
  const booked = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skip).length;
  const failedCount = results.filter((r) => !r.ok && !r.skip).length;

  /* ── a sheet ── */
  const locations = (account?.locations ?? []).filter((l) => l.is_active !== false);
  const [locationId, setLocationId] = useState('');
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [run, setRun] = useState<GsBulkRun | null>(null);
  /** The sheet and pickup address the last DRY run was for; a real run needs it to match, and clears it. */
  const [dryKey, setDryKey] = useState<string | null>(null);
  /** Sheets already sent for real in this visit (same text and address), and when. */
  const [sentReal, setSentReal] = useState<Record<string, string>>({});
  /** A real run whose answer was lost: what Growcord Ship's job list says about it. */
  const [lost, setLost] = useState<{ sentAt: number; filename: string | null; job: GsBulkRun | null; checking: boolean } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GsBulkRun[] | null>(null);
  const sheetKey = `${locationId}\n${csv}`;

  const loadJobs = () => growshipAPI.bulkJobs().then((j) => { setJobs(j); return j; }).catch(() => { setJobs([]); return [] as GsBulkRun[]; });
  useEffect(() => { if (tab === 'sheet') void loadJobs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  /** A new sheet or pickup address: the dry run no longer holds. */
  const sheetChanged = () => { setRun(null); setDryKey(null); setSheetError(null); };

  /** The job a lost real run became: the newest real run sent from here since `sentAt`. */
  const findLost = async (l: { sentAt: number; filename: string | null }) => {
    setLost((x) => (x ? { ...x, checking: true } : x));
    const list = await loadJobs();
    const since = l.sentAt - 5 * 60_000;
    const job = list
      .filter((j) => !j.is_dry_run && Date.parse(String(j.created_at ?? '')) >= since && (!l.filename || !j.filename || j.filename === l.filename))
      .sort((a, b) => Date.parse(String(b.created_at ?? '')) - Date.parse(String(a.created_at ?? '')))[0] ?? null;
    setLost({ ...l, job, checking: false });
    reloadWallet();
  };

  const runDry = async () => {
    if (!csv.trim()) return;
    const key = sheetKey;
    setSheetBusy(true); setSheetError(null); setLost(null);
    try {
      const r = await growshipAPI.bulkRun({ csv, filename, dryRun: true, pickupLocationId: locationId || null });
      setRun(r);
      setDryKey(key);
      void loadJobs();
    } catch (e) {
      setSheetError(errorText(e, 'The dry run could not be done.'));
    } finally {
      setSheetBusy(false);
    }
  };

  const runReal = async () => {
    if (!csv.trim() || dryKey !== sheetKey) return;
    const key = sheetKey;
    const sentAt = Date.now();
    // Sent once: the dry run is used up before the call leaves, so the button cannot send it again.
    setDryKey(null);
    setSentReal((m) => ({ ...m, [key]: new Date(sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }));
    setSheetBusy(true); setSheetError(null); setLost(null);
    try {
      const r = await growshipAPI.bulkRun({ csv, filename, dryRun: false, pickupLocationId: locationId || null });
      setRun(r);
      void loadJobs();
      reloadWallet();
    } catch (e) {
      setRun(null);
      setSheetError(`${errorText(e, 'No answer came back.')} Some rows may have been booked; what Growcord Ship recorded is shown below.`);
      await findLost({ sentAt, filename });
    } finally {
      setSheetBusy(false);
    }
  };

  const runRows = Array.isArray(run?.rows) ? run!.rows : [];
  const runFailed = runRows.filter((r) => r.result === 'failed');
  const isDry = run?.dry_run === true;
  const dryTotal = isDry
    ? Math.round(runRows.filter((r) => r.result === 'ok').reduce((s, r) => s + (paiseToRupees(r.quoted?.sell_with_gst_minor) ?? 0), 0) * 100) / 100
    : 0;
  const sheetShort = isDry && dryTotal > 0 ? shortfall(wallet, account, dryTotal) : 0;
  const canRealRun = canBook && !sheetBusy && !!csv.trim() && dryKey === sheetKey && isDry && Number(run?.ok) > 0 && sheetShort === 0;
  const lostJob = lost?.job ?? null;

  return (
    <Page>
      <PageHeader
        icon={Upload}
        title="Bulk shipment"
        description="Book many parcels with Growcord Ship in one go. Freight comes off your wallet as each parcel is booked."
      />

      <WalletCard
        wallet={wallet} error={walletError} onChanged={reloadWallet}
        needed={tab === 'orders' ? (total > 0 ? total : null) : (dryTotal > 0 ? dryTotal : null)}
      />
      {account === null && accountError && <p className="text-sm text-red-600">{accountError}</p>}

      <TabBar
        tabs={[{ key: 'orders', label: 'Ready orders' }, { key: 'sheet', label: 'Upload a sheet' }]}
        active={tab}
        onChange={(k) => setTab(k as 'orders' | 'sheet')}
      />

      {tab === 'orders' && (
        <>
          <SectionCard
            title="1. Where from and in what box"
            description="Every selected order is priced and booked from this warehouse in this box. Each order's weight comes from its products (0.5 kg a unit when a product has none) and the box; type a weight to change it."
          >
            <div className="flex flex-wrap gap-4">
              <Field label="Warehouse">
                <SelectInput value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label="Warehouse">
                  {warehouses.length === 0 && <option value="">No warehouse</option>}
                  {warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}{w.isActive === false ? ' (inactive)' : ''}</option>)}
                </SelectInput>
              </Field>
              <Field label="Box">
                <SelectInput value={boxId} onChange={(e) => setBoxId(e.target.value)} aria-label="Box">
                  <option value="">Standard, 20 x 15 x 10 cm</option>
                  {boxes.map((b) => (
                    <option key={b._id ?? b.id} value={String(b._id ?? b.id)}>
                      {b.name || 'Box'}, {b.length ?? b.lengthCm} x {b.breadth ?? b.widthCm} x {b.height ?? b.heightCm} cm
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            flush
            title="2. Orders to book"
            description="Orders with nothing booked yet. Tick the ones to send, get their prices, then book. Each order is read again just before it is sent."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="outline" disabled={!open.length || !!running || !warehouseId} onClick={getQuotes}>
                  {running === 'quote' ? <Loader2 className="animate-spin" /> : null}
                  Get prices for {open.length}
                </Btn>
                {canBook && (
                  <Btn disabled={!bookable.length || !!running || !warehouseId || ordersShort !== 0} onClick={() => {
                    if (window.confirm(`Book ${bookable.length} parcel${bookable.length === 1 ? '' : 's'} with Growcord Ship for about ${fmtRupees(total)}? Freight comes off your wallet.`)) void book();
                  }}>
                    {running === 'book' ? <Loader2 className="animate-spin" /> : null}
                    Book {bookable.length}
                  </Btn>
                )}
              </div>
            }
          >
            {ordersError && <p className="px-5 py-3 text-sm text-red-600">{ordersError}</p>}
            {!canBook && <p className="px-5 py-3 text-sm text-amber-800">Booking needs the shipments.manage permission. You can still see the prices.</p>}
            {canBook && bookable.length > 0 && !!ordersShort && <ShortNotice short={ordersShort} onPaid={reloadWallet} />}
            {canBook && bookable.length > 0 && ordersShort === null && <p className="border-b border-gray-100 px-5 py-2 text-sm text-gray-500">Reading the wallet balance before booking...</p>}
            {(open.length > 0 || results.length > 0) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-100 px-5 py-2 text-sm">
                <span>To send: <strong>{open.length}</strong></span>
                <span>Total: <strong className="tabular-nums">{fmtRupees(total)}</strong>{unpriced ? <span className="text-gray-500"> ({unpriced} not priced yet)</span> : null}</span>
                {booked > 0 && <span className="text-emerald-700">Booked: {booked}</span>}
                {skipped > 0 && <span className="text-gray-600">Skipped: {skipped}</span>}
                {failedCount > 0 && <span className="text-red-700">Not booked: {failedCount}</span>}
              </div>
            )}
            <TableShell className="rounded-none border-0 shadow-none">
              <table className="w-full text-sm">
                <THead>
                  <Th className="w-8">
                    <input type="checkbox" aria-label="Select every order on this page" checked={allOnPage}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...new Set([...s, ...rows.map((o) => o._id)])] : s.filter((id) => !rows.some((o) => o._id === id))))} />
                  </Th>
                  <Th>Order</Th><Th>To</Th><Th>Payment</Th><Th num>Order value</Th><Th>Weight (kg)</Th><Th>Courier</Th><Th num>Price</Th><Th>Result</Th>
                </THead>
                <TBody>
                  {orders === null && <EmptyRow colSpan={9}>Reading...</EmptyRow>}
                  {orders !== null && rows.length === 0 && <EmptyRow colSpan={9}>Every order is booked. Nothing to send.</EmptyRow>}
                  {rows.map((o) => {
                    const pl = plans[o._id] ?? {};
                    const a = o.shippingAddress ?? {};
                    const on = selected.includes(o._id);
                    const r = pl.result;
                    return (
                      <Tr key={o._id} className={on ? 'bg-blue-50/40' : undefined}>
                        <Td><input type="checkbox" aria-label={`Select ${orderNo(o)}`} checked={on} onChange={(e) => toggle(o._id, e.target.checked)} /></Td>
                        <Td>
                          <Link to={`/orders/${o._id}`} className="font-medium text-blue-700 hover:underline">{orderNo(o)}</Link>
                          <div className="text-xs text-gray-500">{o.customerName || o.customer_name || a.fullName || ''}</div>
                        </Td>
                        <Td className="text-xs">{[a.district || a.city, a.pincode].filter(Boolean).join(', ')}</Td>
                        <Td>{o.paymentMethod === 'cod' ? <Chip tone="amber">COD</Chip> : <Chip tone="neutral">Prepaid</Chip>}</Td>
                        <Td num>{o.total != null ? fmtRupees(o.total) : ''}</Td>
                        <Td>
                          <TextInput className="w-20" inputMode="decimal" value={pl.weightKg ?? ''} placeholder="auto"
                            aria-label={`Weight of ${orderNo(o)} in kg`} disabled={!!r?.ok}
                            onChange={(e) => setPlan(o._id, { weightKg: e.target.value, autoWeight: false, quotes: undefined, chosen: undefined })} />
                        </Td>
                        <Td>
                          {pl.quoting && <span className="text-xs text-gray-500">Pricing...</span>}
                          {!pl.quoting && pl.quoteError && <span className="text-xs text-red-600">{pl.quoteError}</span>}
                          {!pl.quoting && !!pl.quotes?.length && (
                            <SelectInput value={pl.chosen ?? ''} onChange={(e) => setPlan(o._id, { chosen: e.target.value })} aria-label={`Courier for ${orderNo(o)}`} className="max-w-[16rem]" disabled={!!r?.ok}>
                              {pl.quotes.map((q) => (
                                <option key={String(q.courierCompanyId)} value={String(q.courierCompanyId)}>
                                  {q.courierName}, {fmtRupees(q.rate)}{q.estimatedDeliveryDays ? `, ${q.estimatedDeliveryDays} days` : ''}
                                </option>
                              ))}
                            </SelectInput>
                          )}
                        </Td>
                        <Td num>{priceOf(o._id) != null ? fmtRupees(priceOf(o._id)) : ''}</Td>
                        <Td className="text-xs">
                          {pl.booking && <span className="text-gray-500">Booking...</span>}
                          {r && (
                            <span className={`flex items-start gap-1 ${r.ok ? 'text-emerald-700' : r.skip ? 'text-gray-600' : 'text-red-700'}`}>
                              {r.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : r.skip ? <Minus className="mt-0.5 h-3 w-3 shrink-0" /> : <X className="mt-0.5 h-3 w-3 shrink-0" />}
                              {r.text}
                            </span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </table>
            </TableShell>
            {ordersTotal > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm">
                <span className="text-gray-500">Page {page} of {Math.ceil(ordersTotal / PAGE_SIZE)}, {ordersTotal} orders</span>
                <div className="flex gap-2">
                  <Btn variant="outline" size="sm" disabled={page <= 1 || !!running} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
                  <Btn variant="outline" size="sm" disabled={page * PAGE_SIZE >= ordersTotal || !!running} onClick={() => setPage((p) => p + 1)}>Next</Btn>
                </div>
              </div>
            )}
          </SectionCard>
          {results.length > 0 && !running && (
            <p className="text-sm">
              {booked > 0 && <>Booked parcels wait on the board for their pickup: <Link to="/growship/shipments?tab=ready_to_pick" className="text-blue-700 hover:underline">schedule the pickup and print labels</Link>. </>}
              <button type="button" className="text-blue-700 hover:underline" onClick={() => { setSelected([]); setPlans({}); loadOrders(page); }}>Clear and read the list again</button>
            </p>
          )}
        </>
      )}

      {tab === 'sheet' && (
        <>
          <p className="text-sm text-gray-600">
            For parcels that are not store orders. A sheet's parcels are booked on Growcord Ship directly and are not linked to an order here; for store orders use Ready orders.
          </p>
          <SectionCard
            title="1. The sheet"
            description="One row is one parcel. Download the blank sheet for the column names Growcord Ship reads."
            action={<Btn variant="outline" onClick={() => downloadCsv('growcord-ship-sheet', GS_SHEET_HEADERS.map((h) => ({ key: h, label: h })), [])}><FileDown /> Blank sheet</Btn>}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Collect from">
                  <SelectInput value={locationId} onChange={(e) => { setLocationId(e.target.value); sheetChanged(); }} aria-label="Pickup address" disabled={sheetBusy}>
                    <option value="">The account's main pickup address</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{[l.label || l.code, l.city, l.pincode].filter(Boolean).join(', ')}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="CSV file">
                  <input type="file" accept=".csv,text/csv" className="text-sm" disabled={sheetBusy}
                    onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setFilename(f.name); setCsv(await f.text()); sheetChanged(); }} />
                </Field>
              </div>
              <textarea
                className="h-32 w-full rounded-lg border border-gray-200 p-2 font-mono text-xs"
                value={csv}
                disabled={sheetBusy}
                placeholder="Or paste the sheet here."
                onChange={(e) => { setCsv(e.target.value); setFilename(null); sheetChanged(); }}
              />
              {csv.trim() && <p className="text-xs text-gray-500">{Math.max(0, csv.trim().split(/\r?\n/).length - 1)} row(s){filename ? ` from ${filename}` : ''}.</p>}
              {sentReal[sheetKey] && (
                <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  This sheet was already sent for real at {sentReal[sheetKey]}. Sending it again books every row again.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            flush
            title="2. Try it, then book"
            description="A dry run prices and checks every row and books nothing. Booking for real needs a dry run of this same sheet and address, and uses it up: each real run needs a new dry run."
            action={
              <div className="flex flex-wrap gap-2">
                <Btn variant="outline" disabled={!csv.trim() || sheetBusy || !canBook} onClick={runDry}>
                  {sheetBusy ? <Loader2 className="animate-spin" /> : null} Dry run
                </Btn>
                <Btn variant="danger" disabled={!canRealRun}
                  onClick={() => {
                    const again = sentReal[sheetKey] ? ` This sheet was already sent for real at ${sentReal[sheetKey]}; every row is booked again.` : '';
                    if (window.confirm(`Book ${run?.ok} parcel(s) for real for about ${fmtRupees(dryTotal)}? Freight comes off your wallet.${again}`)) void runReal();
                  }}>
                  Book for real
                </Btn>
              </div>
            }
          >
            {canBook && isDry && !!sheetShort && dryKey === sheetKey && <ShortNotice short={sheetShort} onPaid={reloadWallet} />}
            <div className="space-y-3 p-5">
              {!canBook && <p className="text-sm text-amber-800">Running a sheet needs the shipments.manage permission.</p>}
              {sheetError && <p className="text-sm text-red-600">{sheetError}</p>}
              {lost && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {lost.checking && <p>Reading Growcord Ship's job list...</p>}
                  {!lost.checking && lostJob && (
                    <p>
                      Growcord Ship recorded this run ({formatDate(lostJob.created_at, 'dd MMM, HH:mm', '')}): {String(lostJob.status ?? '').replace(/_/g, ' ') || 'state not given'},
                      {' '}{Number(lostJob.ok) || 0} booked, {Number(lostJob.failed) || 0} failed of {Number(lostJob.total) || 0}.
                      {' '}Do not send the sheet again; book only the rows it did not.
                    </p>
                  )}
                  {!lost.checking && !lostJob && (
                    <p>Growcord Ship has no record of this run yet. It may still be starting: check again in a minute before doing anything else with this sheet.</p>
                  )}
                  {!lost.checking && (
                    <Btn variant="outline" size="sm" className="mt-2" onClick={() => void findLost(lost)}>Check again</Btn>
                  )}
                </div>
              )}
              {!run && !sheetError && !lost && <p className="text-sm text-gray-500">Nothing has been run yet.</p>}
              {run && (
                <>
                  <p className={`text-sm ${Number(run.failed) ? 'text-red-700' : 'text-emerald-700'}`}>
                    {typeof run.detail === 'string' ? run.detail : ''}{isDry ? ' Nothing was booked.' : ''}
                  </p>
                  <StatGrid cols={4}>
                    <StatCard label="Rows" value={Number(run.total) || 0} />
                    <StatCard label={isDry ? 'Would book' : 'Booked'} value={Number(run.ok) || 0} tone="good" sub={isDry && dryTotal > 0 ? `About ${fmtRupees(dryTotal)}` : undefined} />
                    <StatCard label={isDry ? 'Would fail' : 'Failed'} value={Number(run.failed) || 0} tone={Number(run.failed) ? 'bad' : 'default'} />
                    <StatCard label="Skipped" value={Number(run.skipped) || 0} />
                  </StatGrid>
                  {runFailed.length > 0 && (
                    <Btn variant="outline" size="sm" onClick={() => downloadCsv('growcord-ship-sheet-failed', [
                      { key: 'line_no', label: 'Line in your file' },
                      { key: 'error', label: 'Why it failed' },
                    ], runFailed)}>
                      Download the {runFailed.length} failed line(s)
                    </Btn>
                  )}
                  <TableShell maxHeight="24rem">
                    <table className="w-full text-sm">
                      <THead><Th num>Line</Th><Th>Result</Th><Th>Parcel</Th><Th>Courier or reason</Th><Th num>Price</Th></THead>
                      <TBody>
                        {runRows.map((r, i) => (
                          <Tr key={`${r.line_no}-${i}`}>
                            <Td num>{Number(r.line_no) || ''}</Td>
                            <Td><Chip tone={r.result === 'ok' ? 'green' : r.result === 'skipped' ? 'neutral' : 'red'}>{String(r.result ?? '')}</Chip></Td>
                            <Td className="font-mono text-xs">{r.consignment_number || r.awb || ''}</Td>
                            <Td className="text-xs">{r.error ? <span className="text-red-700">{String(r.error)}</span> : r.quoted ? [r.quoted.courier, r.quoted.service, r.quoted.edd_days ? `${r.quoted.edd_days} days` : null].filter(Boolean).join(', ') : ''}</Td>
                            <Td num>{r.quoted?.sell_with_gst_minor != null ? fmtRupees(paiseToRupees(r.quoted.sell_with_gst_minor)) : ''}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </table>
                  </TableShell>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Earlier sheets" flush>
            <TableShell className="rounded-none border-0 shadow-none">
              <table className="w-full text-sm">
                <THead><Th>When</Th><Th>File</Th><Th>Kind</Th><Th num>Rows</Th><Th num>OK</Th><Th num>Failed</Th><Th>Status</Th></THead>
                <TBody>
                  {jobs === null && <EmptyRow colSpan={7}>Reading...</EmptyRow>}
                  {jobs && jobs.length === 0 && <EmptyRow colSpan={7}>No sheet has been run yet.</EmptyRow>}
                  {(jobs ?? []).map((j) => (
                    <Tr key={String(j.id ?? j.job_id)}>
                      <Td muted>{formatDate(j.created_at, 'dd MMM yyyy, HH:mm', '')}</Td>
                      <Td>{j.filename || <span className="text-gray-400">pasted</span>}</Td>
                      <Td>{j.is_dry_run ? 'Dry run' : 'Booked'}</Td>
                      <Td num>{Number(j.total) || 0}</Td>
                      <Td num>{Number(j.ok) || 0}</Td>
                      <Td num>{Number(j.failed) || 0}</Td>
                      <Td>{String(j.status ?? '').replace(/_/g, ' ')}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          </SectionCard>
        </>
      )}
    </Page>
  );
};

export default GrowshipBulk;
