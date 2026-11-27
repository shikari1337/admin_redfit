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
import {
  bookOrder, boxLabel, liveParcels, listOf, orderNo, pickOffers, pickedBy, pooled, unwrap, type Outcome, type PickBy,
} from '@/lib/bulkShip';

const GS = 'growcord_ship' as const;
const PAGE_SIZE = 50;
/** The box the shipments board books with when none is chosen (Shipments.tsx handleCreateShipment). */
const DEFAULT_BOX = { length: 20, breadth: 15, height: 10, deadWeightKg: 0 };


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


/** One real run of a sheet, sent from this page: what each row became. */
interface SheetRecord {
  at: string;
  sentAt: number;
  filename: string | null;
  /** The dry run's line numbers, to name the rows the run did not reach. */
  lines: number[];
  jobId: string | null;
  /** True once Growcord Ship finished the run; false while it runs; null when it has no record of it yet. */
  finished: boolean | null;
  /** The run's own answer came back (else what is shown was read from Growcord Ship's job). */
  answered: boolean;
  booked: Array<{ line: number; parcel: string }>;
  failed: Array<{ line: number; error: string }>;
  checking: boolean;
  readError?: string;
}

/** A real run's rows (its answer, or its job read whole) as booked and failed lines. */
function rowsOf(rows: Array<Record<string, any>> | null | undefined): Pick<SheetRecord, 'booked' | 'failed' | 'readError'> {
  const list = Array.isArray(rows) ? rows : [];
  return {
    booked: list.filter((r) => r.result === 'ok').map((r) => ({
      line: Number(r.line_no) || 0,
      parcel: [r.awb || r.consignment_awb ? `AWB ${r.awb || r.consignment_awb}` : '', r.consignment_number || ''].filter(Boolean).join(', '),
    })),
    failed: list.filter((r) => r.result === 'failed').map((r) => ({ line: Number(r.line_no) || 0, error: String(r.error ?? '') })),
    readError: undefined,
  };
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
  // Which courier each priced order starts on: the cheapest or the fastest (lib/bulkShip pickOffers, the one rule);
  // each row's courier list still switches it.
  const [pickBy, setPickBy] = useState<PickBy>('cheapest');
  const pickFor = (quotes: CourierRate[], by: PickBy) => pickedBy(pickOffers(quotes, (q) => q), by);
  const choosePick = (by: PickBy) => {
    setPickBy(by);
    setPlans((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => {
      const q = v.quotes?.length && !v.result?.ok ? pickFor(v.quotes, by) : undefined;
      return [k, q ? { ...v, chosen: String(q.courierCompanyId) } : v];
    })));
  };

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
        const first = pickFor(quotes, pickBy);
        setPlan(id, { quoting: false, quotes, chosen: first ? String(first.courierCompanyId) : '', quoteError: quotes.length ? undefined : 'No courier can take this parcel.' });
      } catch (e) {
        setPlan(id, { quoting: false, quotes: [], quoteError: errorText(e, 'Growcord Ship did not answer.') });
      }
    });
    setRunning(null);
  };

  /** An unknown order, looked up again by hand. */
  const checkAgain = async (id: string) => {
    setPlan(id, { booking: true });
    try {
      const live = liveParcels(await shipmentsAPI.byOrder(id));
      if (live.length) {
        const awb = shipmentAwb(live[0]);
        setPlan(id, { booking: false, result: { ok: true, text: `Booked; the parcel is on the order${awb ? ` (AWB ${awb})` : ''}.` } });
        return;
      }
      const at = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setPlan(id, { booking: false, result: { ok: false, unknown: true, text: `Unknown: still no parcel on the order at ${at}. Check again in a minute; if it stays empty, read the list again to book it.` } });
    } catch (e) {
      setPlan(id, { booking: false, result: { ok: false, unknown: true, text: `Unknown: the order could not be read (${errorText(e, 'no answer')}). Check again in a minute.` } });
    }
  };

  const book = async () => {
    if (!warehouseId) return;
    const ids = [...bookable];
    setRunning('book');
    // Each order through the shared safe step (lib/bulkShip bookOrder: re-read just before sending, an error's real
    // outcome), the one the bulk bar's Create shipments uses too.
    await pooled(ids, 2, async (id) => {
      setPlan(id, { booking: true });
      const result = await bookOrder(id, async (order) => shippingAPI.createShipment(id, {
        warehouseId, shippingProvider: GS,
        ...(plans[id]?.chosen ? { courierCode: plans[id].chosen } : {}),
        dimensions: { weight: await weightFor(id, order), length: box.length, breadth: box.breadth, height: box.height },
      }));
      setPlan(id, { booking: false, result });
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
  /** The line numbers of the last dry run, to name the rows a real run did not reach. */
  const [dryLines, setDryLines] = useState<number[]>([]);
  /** Every real run sent from this page, by the sheet's text (whatever the address): what each row became. */
  const [sheetLog, setSheetLog] = useState<Record<string, SheetRecord>>({});
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GsBulkRun[] | null>(null);
  const sheetKey = `${locationId}\n${csv}`;

  const loadJobs = () => growshipAPI.bulkJobs().then((j) => { setJobs(j); return j; }).catch(() => { setJobs([]); return [] as GsBulkRun[]; });
  useEffect(() => { if (tab === 'sheet') void loadJobs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  /** A new sheet or pickup address: the dry run no longer holds. What was sent for real stays listed. */
  const sheetChanged = () => { setRun(null); setDryKey(null); setSheetError(null); };

  const putRecord = (text: string, patch: Partial<SheetRecord>) =>
    setSheetLog((m) => ({ ...m, [text]: { ...(m[text] as SheetRecord), ...patch } }));

  /**
   * What Growcord Ship recorded for a real run whose answer was lost: its job (found in the job list by when it was
   * sent), then the job read whole with its rows, which are written as each row is booked, so a running or cut-off
   * run still shows what it booked. Its totals are only written when the run finishes.
   */
  const readRecord = async (text: string) => {
    const rec = sheetLog[text];
    if (!rec) return;
    putRecord(text, { checking: true });
    try {
      let jobId = rec.jobId;
      if (!jobId) {
        const since = rec.sentAt - 5 * 60_000;
        const found = (await loadJobs())
          .filter((j) => !j.is_dry_run && Date.parse(String(j.created_at ?? '')) >= since && (!rec.filename || !j.filename || j.filename === rec.filename))
          .sort((a, b) => Date.parse(String(b.created_at ?? '')) - Date.parse(String(a.created_at ?? '')))[0];
        jobId = found ? String(found.id ?? found.job_id ?? '') || null : null;
      }
      if (!jobId) { putRecord(text, { checking: false, finished: null }); return; }
      const job = await growshipAPI.bulkJob(jobId);
      putRecord(text, { checking: false, jobId, finished: !!job.finished_at, ...rowsOf(job.rows) });
      reloadWallet();
    } catch (e) {
      putRecord(text, { checking: false, readError: errorText(e, 'Growcord Ship could not be read.') });
    }
  };

  const runDry = async () => {
    if (!csv.trim()) return;
    const key = sheetKey;
    setSheetBusy(true); setSheetError(null);
    try {
      const r = await growshipAPI.bulkRun({ csv, filename, dryRun: true, pickupLocationId: locationId || null });
      setRun(r);
      setDryKey(key);
      setDryLines((Array.isArray(r.rows) ? r.rows : []).map((x) => Number(x.line_no)).filter((n) => n > 0));
      void loadJobs();
    } catch (e) {
      setSheetError(errorText(e, 'The dry run could not be done.'));
    } finally {
      setSheetBusy(false);
    }
  };

  const runReal = async () => {
    if (!csv.trim() || dryKey !== sheetKey || blockedWhy) return;
    const text = csv;
    const sentAt = Date.now();
    // Sent once: the dry run is used up before the call leaves, and the sheet is on record as sent.
    setDryKey(null);
    setSheetLog((m) => ({
      ...m,
      [text]: {
        at: new Date(sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), sentAt, filename,
        lines: dryLines, jobId: null, finished: false, answered: false, booked: [], failed: [], checking: false,
      },
    }));
    setSheetBusy(true); setSheetError(null);
    try {
      const r = await growshipAPI.bulkRun({ csv, filename, dryRun: false, pickupLocationId: locationId || null });
      setRun(r);
      putRecord(text, { answered: true, finished: true, jobId: r.job_id ? String(r.job_id) : null, ...rowsOf(r.rows) });
      void loadJobs();
      reloadWallet();
    } catch (e) {
      setRun(null);
      setSheetError(`${errorText(e, 'No answer came back.')} Some rows may have been booked; what Growcord Ship recorded is below.`);
      // The record is read once the state above is in place.
      setTimeout(() => setPendingRead(text), 0);
    } finally {
      setSheetBusy(false);
    }
  };
  // A lost answer: read the job as soon as its record is on screen (readRecord needs the record in state).
  const [pendingRead, setPendingRead] = useState<string | null>(null);
  useEffect(() => {
    if (pendingRead && sheetLog[pendingRead]) { const t = pendingRead; setPendingRead(null); void readRecord(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRead, sheetLog]);

  const runRows = Array.isArray(run?.rows) ? run!.rows : [];
  const runFailed = runRows.filter((r) => r.result === 'failed');
  const isDry = run?.dry_run === true;
  const dryTotal = isDry
    ? Math.round(runRows.filter((r) => r.result === 'ok').reduce((s, r) => s + (paiseToRupees(r.quoted?.sell_with_gst_minor) ?? 0), 0) * 100) / 100
    : 0;
  const sheetShort = isDry && dryTotal > 0 ? shortfall(wallet, account, dryTotal) : 0;
  // A sheet whose real run is still going (or not heard of yet), or that has booked rows, is not sent again as it is.
  const record = sheetLog[csv];
  const blockedWhy = !record ? null
    : record.finished !== true
      ? 'This sheet was sent for real and Growcord Ship has not finished it, or has no record of it yet. Check again below before sending it again.'
      : record.booked.length
        ? `Lines ${record.booked.map((b) => b.line).join(', ')} of this sheet are already booked. Remove those rows from the sheet, then do a new dry run to book the rest.`
        : null;
  const canRealRun = canBook && !sheetBusy && !!csv.trim() && dryKey === sheetKey && isDry && Number(run?.ok) > 0 && sheetShort === 0 && !blockedWhy;
  const records = Object.entries(sheetLog).sort(([, a], [, b]) => b.sentAt - a.sentAt);

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
                      {boxLabel(b)}, {b.length ?? b.lengthCm} x {b.breadth ?? b.widthCm} x {b.height ?? b.heightCm} cm
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
                <span className="flex items-center gap-3 text-sm" role="radiogroup" aria-label="Pick for each order">
                  <span className="text-gray-600">Pick for each order:</span>
                  {(['cheapest', 'fastest'] as const).map((v) => (
                    <label key={v} className="inline-flex items-center gap-1">
                      <input type="radio" name="bulk-pick" checked={pickBy === v} disabled={!!running} onChange={() => choosePick(v)} />
                      {v === 'cheapest' ? 'Cheapest' : 'Fastest'}
                    </label>
                  ))}
                </span>
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
                          {!pl.quoting && !!pl.quotes?.length && (() => {
                            const picks = pickOffers(pl.quotes, (q) => q);
                            return (
                              <>
                                <SelectInput value={pl.chosen ?? ''} onChange={(e) => setPlan(o._id, { chosen: e.target.value })} aria-label={`Courier for ${orderNo(o)}`} className="max-w-[16rem]" disabled={!!r?.ok}>
                                  {pl.quotes.map((q) => (
                                    <option key={String(q.courierCompanyId)} value={String(q.courierCompanyId)}>
                                      {q.courierName}, {fmtRupees(q.rate)}{q.estimatedDeliveryDays ? `, ${q.estimatedDeliveryDays} days` : ''}
                                      {q === picks.cheapest ? ' (cheapest)' : ''}{q === picks.fastest && q !== picks.cheapest ? ' (fastest)' : ''}{q === picks.fastest && q === picks.cheapest ? ' (also fastest)' : ''}
                                    </option>
                                  ))}
                                </SelectInput>
                                {pickBy === 'fastest' && !picks.fastest && <div className="mt-1 text-xs text-amber-700">No courier gave delivery days; the cheapest is picked.</div>}
                              </>
                            );
                          })()}
                        </Td>
                        <Td num>{priceOf(o._id) != null ? fmtRupees(priceOf(o._id)) : ''}</Td>
                        <Td className="text-xs">
                          {pl.booking && <span className="text-gray-500">Booking...</span>}
                          {r && (
                            <span className={`flex items-start gap-1 ${r.ok ? 'text-emerald-700' : r.skip ? 'text-gray-600' : r.unknown ? 'text-amber-800' : 'text-red-700'}`}>
                              {r.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : r.skip || r.unknown ? <Minus className="mt-0.5 h-3 w-3 shrink-0" /> : <X className="mt-0.5 h-3 w-3 shrink-0" />}
                              {r.text}
                            </span>
                          )}
                          {r?.unknown && !pl.booking && !running && (
                            <button type="button" className="mt-1 text-blue-700 hover:underline" onClick={() => void checkAgain(o._id)}>Check again</button>
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
              {record && (
                <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This sheet was already sent for real at {record.at}. Sending it again books every row again, whatever the pickup address.
                    {blockedWhy ? ` ${blockedWhy}` : ''}
                  </span>
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
                    const again = record ? ` This sheet was already sent for real at ${record.at}; every row is booked again.` : '';
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
              {records.filter(([, r]) => !r.answered).map(([text, r]) => {
                const seen = new Set([...r.booked.map((b) => b.line), ...r.failed.map((f) => f.line)]);
                const notReached = r.finished !== null ? r.lines.filter((n) => !seen.has(n)) : [];
                return (
                  <div key={r.sentAt} className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">
                      Sent for real at {r.at}{r.filename ? ` (${r.filename})` : ''}, the answer was lost.
                      {text === csv ? ' This is the sheet above.' : ''}
                    </p>
                    {r.checking && <p>Reading what Growcord Ship recorded...</p>}
                    {!r.checking && r.readError && <p>{r.readError}</p>}
                    {!r.checking && r.finished === null && !r.readError && (
                      <p>Growcord Ship has no record of this run yet. It may still be starting: check again in a minute before doing anything else with this sheet.</p>
                    )}
                    {!r.checking && r.finished === false && <p>Still running, check again. Rows are listed as Growcord Ship books them.</p>}
                    {!r.checking && r.finished === true && (
                      <p>Finished: {r.booked.length} booked, {r.failed.length} failed{notReached.length ? `, ${notReached.length} not reached` : ''}.</p>
                    )}
                    {(r.booked.length > 0 || r.failed.length > 0 || notReached.length > 0) && (
                      <TableShell maxHeight="16rem">
                        <table className="w-full text-sm">
                          <THead><Th num>Line</Th><Th>What happened</Th></THead>
                          <TBody>
                            {[
                              ...r.booked.map((b) => ({ line: b.line, tone: 'green' as const, word: 'Booked', text: b.parcel })),
                              ...r.failed.map((f) => ({ line: f.line, tone: 'red' as const, word: 'Failed', text: f.error })),
                              ...notReached.map((n) => ({ line: n, tone: 'neutral' as const, word: r.finished ? 'Not reached' : 'Not yet', text: '' })),
                            ].sort((a, b) => a.line - b.line).map((x) => (
                              <Tr key={`${x.word}-${x.line}`}>
                                <Td num>{x.line || ''}</Td>
                                <Td><Chip tone={x.tone}>{x.word}</Chip> <span className="text-xs">{x.text}</span></Td>
                              </Tr>
                            ))}
                          </TBody>
                        </table>
                      </TableShell>
                    )}
                    {!r.checking && r.finished !== true && (
                      <Btn variant="outline" size="sm" onClick={() => void readRecord(text)}>Check again</Btn>
                    )}
                  </div>
                );
              })}
              {!run && !sheetError && !records.some(([, r]) => !r.answered) && <p className="text-sm text-gray-500">Nothing has been run yet.</p>}
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
