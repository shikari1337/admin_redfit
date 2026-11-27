/**
 * Ship from a file (AUTOSHIP-FILE-1; owner 27 Nov 2026): a CSV of processed orders, each with its invoice number
 * and its box or its weight and sides, is shipped with the cheapest courier the store allows, comparing Growcord
 * Ship (the store's price: the commission set for the store included, as every Growcord Ship price the store sees)
 * with the store's own Shiprocket account (its total as displayed). Untick any courier (India Post, or any other)
 * and it is never chosen. Plan: docs/AUTOSHIP-FILE-1.md.
 *
 * Check first (writes nothing): each row's order, state, invoice, parcel, and its cheapest and fastest allowed
 * courier; the page picks one of the two for every order (owner 27 Nov 2026: "cheaper or fast option for each") and
 * each row can switch. Ship then sends each row once: the invoice (the file's number saved; an order's own number
 * kept; a Growcord number issued only when the store ticks it, since a store's invoices may come from its own ERP),
 * the order read again and booked only when it holds that number, with the shared safe-booking rules
 * (lib/bulkShip): re-read just before sending, a lost answer looked up on the order and never sent twice.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileUp, Loader2, Minus, Truck, X } from 'lucide-react';
import { ordersAPI, invoicesAPI, packagesAPI, shippingAPI, warehousesAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtRupees } from '@/lib/money';
import { downloadCsv, parseCsv, parseCsvRecords } from '@/lib/csv';
import { courierRatesOf, itemUnitWeightKg, type CourierRate } from '../../components/order/ShipmentCreationModal';
import {
  boxLabel, boxOf, listOf, orderNo, outcomeAfterError, pickOffers, pickedBy, pooled, recheckOrder, type Outcome, type PickBy,
} from '@/lib/bulkShip';
import {
  Page, PageHeader, SectionCard, StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, Field,
  SelectInput, Chip,
} from '../../components/erp';

type Source = 'growcord_ship' | 'shiprocket';
const SOURCE_LABEL: Record<Source, string> = { growcord_ship: 'Growcord Ship', shiprocket: 'Your Shiprocket' };
const SOURCES: Source[] = ['growcord_ship', 'shiprocket'];

/** The template's columns, in order. */
const COLUMNS = ['Order Number', 'Invoice Number', 'Invoice Date', 'Box Number', 'Weight (kg)', 'Length (cm)', 'Breadth (cm)', 'Height (cm)'] as const;

/** One row of the file, read. */
interface FileRow {
  line: number;
  orderNumber: string;
  invoiceNumber: string;
  /** yyyy-mm-dd, or '' when the file has none. */
  invoiceDate: string;
  box: string;
  weightKg: number | null;
  length: number | null;
  breadth: number | null;
  height: number | null;
  /** Why the row cannot be used as written. */
  problem?: string;
}

interface Offer { source: Source; rate: CourierRate }

/** What the check found for a row, and what shipping it did. */
interface RowPlan {
  orderId?: string;
  order?: any;
  parcel?: { weight: number; length: number; breadth: number; height: number };
  offers?: Offer[];
  /** The invoice number the order held when checked ('' for none). */
  orderInvoice?: string;
  /** This row's own choice between the cheapest and the fastest, when it differs from the page's. */
  pick?: PickBy;
  /** Why the row will not ship (found by the check). */
  stop?: string;
  checking?: boolean;
  sending?: boolean;
  step?: string;
  /** What shipping did, with the invoice number the order was booked with. */
  result?: Outcome & { courier?: string; source?: Source; price?: number; awb?: string; invoice?: string; picked?: PickBy };
}

/**
 * The file's columns: each one and the usual names a sheet heads it with, in order of preference (owner 27 Nov 2026:
 * a sheet headed "Order ID" and "Box No" read as empty). The one list the reader and the missing-column message read.
 */
const HEADERS = {
  orderNumber: ['Order Number', 'Order ID', 'Order No', 'Order #', 'Order'],
  invoiceNumber: ['Invoice Number', 'Invoice No', 'Invoice ID', 'Bill No'],
  invoiceDate: ['Invoice Date', 'Bill Date'],
  box: ['Box', 'Box Number', 'Box No', 'Box ID', 'Box Name', 'Package'],
  weight: ['Weight', 'Weight (kg)', 'Wt'],
  length: ['Length', 'L'],
  breadth: ['Breadth', 'Width', 'B', 'W'],
  height: ['Height', 'H'],
} as const;
type Col = keyof typeof HEADERS;

/** A header to compare, forgiving case, spaces, symbols and units: "Weight (kg)" is weight, "Order #" is order. */
const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
/** Which of the file's headers holds each column: the first usual name found, each header used once. */
function columnsOf(headers: string[]): Partial<Record<Col, string>> {
  const out: Partial<Record<Col, string>> = {};
  const taken = new Set<string>();
  for (const col of Object.keys(HEADERS) as Col[]) {
    for (const name of HEADERS[col]) {
      const h = headers.find((x) => !taken.has(x) && norm(x) === norm(name));
      if (h) { out[col] = h; taken.add(h); break; }
    }
  }
  return out;
}
/** Letters and digits only, lower case: "#SM-13448", "sm 13448" and "SM13448" all read as SM-13448; "Box-1" as Box 1. */
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (s: string): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

/** dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd to yyyy-mm-dd; null when it is not a date. */
function isoDate(s: string): string | null {
  const t = s.trim();
  let y: number; let m: number; let d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; } else {
    hit = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
    if (!hit) return null;
    d = +hit[1]; m = +hit[2]; y = +hit[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A file read: its headers, the required columns it lacks (rows are then not read), and its rows. */
interface ReadFile { headers: string[]; missing: string[]; rows: FileRow[] }

function readFile(text: string): ReadFile {
  const headers = (parseCsv(text)[0] ?? []).map((h) => h.trim()).filter(Boolean);
  const cols = columnsOf(headers);
  const missing: string[] = [];
  if (!cols.orderNumber) missing.push(`the order number (named ${HEADERS.orderNumber.join(', ')})`);
  if (!cols.box && !(cols.weight && cols.length && cols.breadth && cols.height)) {
    missing.push(`a box (named ${HEADERS.box.join(', ')}), or Weight, Length, Breadth and Height`);
  }
  if (missing.length) return { headers, missing, rows: [] };
  const cell = (rec: Record<string, string>, col: Col): string => {
    const h = cols[col];
    return h ? (rec[h] ?? '').trim() : '';
  };
  const rows = parseCsvRecords(text).map((rec, i) => {
    const row: FileRow = {
      line: i + 2,
      orderNumber: cell(rec, 'orderNumber').replace(/^#/, ''),
      invoiceNumber: cell(rec, 'invoiceNumber'),
      invoiceDate: '',
      box: cell(rec, 'box'),
      weightKg: num(cell(rec, 'weight')),
      length: num(cell(rec, 'length')),
      breadth: num(cell(rec, 'breadth')),
      height: num(cell(rec, 'height')),
    };
    const rawDate = cell(rec, 'invoiceDate');
    const problems: string[] = [];
    if (!row.orderNumber) problems.push('no order number');
    if (rawDate) {
      const iso = isoDate(rawDate);
      if (iso) row.invoiceDate = iso; else problems.push(`invoice date "${rawDate}" is not a date (use dd/mm/yyyy)`);
    }
    for (const [k, v] of [['weight', row.weightKg], ['length', row.length], ['breadth', row.breadth], ['height', row.height]] as const) {
      if (Number.isNaN(v)) problems.push(`${k} is not a number above 0`);
    }
    const sides = [row.length, row.breadth, row.height].filter((v) => v != null).length;
    if (!row.box && (sides !== 3 || row.weightKg == null)) problems.push('give a box, or the weight and all three sides');
    if (row.box && sides > 0 && sides < 3) problems.push('give all three sides or none');
    if (problems.length) row.problem = problems.join('; ');
    return row;
  });
  return { headers, missing, rows };
}

/** A box's name as the box list shows it. */
const boxName = (b: any) => String(b?.name ?? b?.label ?? '').trim();
/** The number a box goes by: the one run of digits in its name ("Box 1" is 1; "Box 20 x 15" has none). */
const boxNumber = (b: any): number | null => {
  const runs = boxName(b).match(/\d+/g);
  return runs && runs.length === 1 ? Number(runs[0]) : null;
};
/** The number a file's box gives: "1", "B1", "box1", "Box-1" and "BOX 1" are all 1. */
const askedBoxNumber = (s: string): number | null => {
  const m = /^(?:box|b)?(\d+)$/.exec(plain(s));
  return m ? Number(m[1]) : null;
};

/** An order's number as the list carries it. */
const numberOf = (o: any) => String(o?.orderId ?? o?.order_id ?? o?.order_number ?? '');

/** The courier as the exclusion list names it. */
const courierKey = (o: Offer) => `${o.source}:${o.rate.courierName.trim().toLowerCase()}`;
const EXCLUDED_KEY = 'gc.shipFromFile.excluded';

/**
 * The offers the store allows for a row, through the one pick rule (lib/bulkShip pickOffers): the cheapest, the
 * fastest, the next cheapest, and `best`, the one this row books (its own choice, else the page's).
 */
function pickOffer(offers: Offer[] | undefined, excluded: Set<string>, by: PickBy) {
  const picks = pickOffers((offers ?? []).filter((o) => !excluded.has(courierKey(o))), (o) => o.rate);
  return { ...picks, best: pickedBy(picks, by) };
}

/** The invoice number an order holds ('' for none). */
const invoiceOf = (o: any) => String(o?.invoiceNumber ?? o?.invoice_number ?? '').trim();

const ShipFromFile: React.FC = () => {
  const { hasPerm } = useAuth();
  const canShip = hasPerm('shipments.manage');

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [boxes, setBoxes] = useState<any[]>([]);
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

  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  // A file lacking a required column: its headers and what is missing, said once (its rows are not read).
  const [headerIssue, setHeaderIssue] = useState<{ headers: string[]; missing: string[] } | null>(null);
  const [plans, setPlans] = useState<Record<number, RowPlan>>({});
  const [running, setRunning] = useState<'check' | 'ship' | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<Source, string>>>({});
  const setPlan = (line: number, patch: Partial<RowPlan>) => setPlans((p) => ({ ...p, [line]: { ...p[line], ...patch } }));

  // The couriers this store has unticked, remembered on this browser.
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(EXCLUDED_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const toggleCourier = (key: string, allow: boolean) => setExcluded((prev) => {
    const next = new Set(prev);
    if (allow) next.delete(key); else next.add(key);
    try { localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next])); } catch { /* private window: this visit only */ }
    return next;
  });
  // Cheapest or fastest for each order (a row can switch), and whether a row with no invoice number anywhere gets a
  // Growcord number: off by default, since a store's invoices may come from its own accounting or ERP.
  const [pickBy, setPickBy] = useState<PickBy>('cheapest');
  const [issueWhenMissing, setIssueWhenMissing] = useState(false);
  const rowPick = (line: number): PickBy => plans[line]?.pick ?? pickBy;
  /** Why a checked row cannot ship for want of an invoice number; null when it has one or may get one. */
  const invoiceBlock = (r: FileRow, p?: RowPlan): string | null => (
    p?.orderId && !r.invoiceNumber && !p.orderInvoice && !issueWhenMissing
      ? 'No invoice number: add it to the file (or tick "Issue a Growcord invoice number" above).'
      : null
  );

  const onFile = async (file: File | null) => {
    setPlans({}); setSourceErrors({}); setHeaderIssue(null);
    if (!file) { setRows([]); setFilename(null); return; }
    setFilename(file.name);
    const read = readFile(await file.text());
    setRows(read.rows);
    if (read.missing.length) setHeaderIssue({ headers: read.headers, missing: read.missing });
  };

  /**
   * The box a row names. First its box number (the box list's unique number: "3", "B3", "Box-3" all read as 3, or the
   * number exactly as written), then its id, then its name, or the number in its name ("1", "B1", "Box-1" for Box 1),
   * each forgiving case, spaces and symbols, and only when exactly one box fits; otherwise the reason, with the
   * store's boxes.
   */
  const boxFor = (asked: string): { box: any } | { stop: string } => {
    const id = asked.trim().toLowerCase();
    const n = askedBoxNumber(asked);
    const codeOf = (b: any) => String(b?.code ?? '').trim();
    let hits = boxes.filter((b) => codeOf(b) && (codeOf(b).toLowerCase() === id || (n !== null && askedBoxNumber(codeOf(b)) === n)));
    if (!hits.length) {
      const byId = boxes.find((b) => String(b._id ?? b.id ?? '').toLowerCase() === id);
      if (byId) return { box: byId };
      const want = plain(asked);
      hits = want ? boxes.filter((b) => plain(boxName(b)) === want) : [];
      if (!hits.length && n !== null) hits = boxes.filter((b) => boxNumber(b) === n);
    }
    if (hits.length === 1) return { box: hits[0] };
    const names = boxes.map(boxLabel);
    const yours = names.length ? `Your boxes: ${names.join(', ')}.` : 'Your box list (Settings, Packages) is empty.';
    return {
      stop: hits.length > 1
        ? `Box "${asked}" could be ${hits.map(boxLabel).join(' or ')}: write its box number. ${yours}`
        : `No box "${asked}" in your box list (Settings, Packages). ${yours}`,
    };
  };

  /**
   * The order a row names, through the list's own search (it reads `search`, never an order id). The search is sent
   * the number's digits when it has one run of them ("13448" finds SM-13448), and the answer is matched here: the
   * whole number exactly, forgiving case, spaces, "#" and hyphens; a number alone only when exactly one order's
   * number has those digits.
   */
  const findOrder = async (asked: string): Promise<{ order: any } | { stop: string }> => {
    const runs = asked.match(/\d+/g) ?? [];
    const term = runs.length === 1 && runs[0].length >= 2 ? runs[0] : asked.trim();
    const r: any = await ordersAPI.getAll({ search: term, limit: 100 });
    const list: any[] = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray(r?.orders) ? r.orders : [];
    const want = plain(asked);
    const digitsOnly = /^\d+$/.test(want);
    const hits = list.filter((o) => (digitsOnly ? numberOf(o).replace(/\D/g, '') : plain(numberOf(o))) === want);
    if (hits.length === 1) return { order: hits[0] };
    if (hits.length > 1) return { stop: `"${asked}" could be ${hits.map(numberOf).join(', ')}: write the full order number.` };
    return { stop: 'No order has this number.' };
  };

  /** Check every usable row: order, state, invoice, parcel and both sources' prices. Writes nothing. */
  const check = async () => {
    if (!warehouseId) return;
    setRunning('check');
    setSourceErrors({});
    const usable = rows.filter((r) => !r.problem);
    await pooled(usable, 3, async (row) => {
      setPlan(row.line, { checking: true, stop: undefined, offers: undefined, result: undefined });
      try {
        const match = await findOrder(row.orderNumber);
        if ('stop' in match) { setPlan(row.line, { checking: false, stop: match.stop }); return; }
        const found = match.order;
        const id = String(found._id ?? found.id);
        const checked = await recheckOrder(id);
        if ('skip' in checked) { setPlan(row.line, { checking: false, orderId: id, stop: checked.skip.replace(/^Skipped: /, '') }); return; }
        const order = checked.order;
        const has = invoiceOf(order);
        if (row.invoiceNumber && has && has !== row.invoiceNumber) {
          setPlan(row.line, { checking: false, orderId: id, order, orderInvoice: has, stop: `The order already has invoice ${has}; the file says ${row.invoiceNumber}. Nothing is changed.` });
          return;
        }
        let parcel: RowPlan['parcel'];
        if (row.box) {
          const picked = boxFor(row.box);
          if ('stop' in picked) { setPlan(row.line, { checking: false, orderId: id, order, stop: picked.stop }); return; }
          const b = boxOf(picked.box);
          if (!b) { setPlan(row.line, { checking: false, orderId: id, order, stop: `Box ${boxName(picked.box) || row.box} has no size in your box list (Settings, Packages).` }); return; }
          const items: any[] = Array.isArray(order?.items) ? order.items : [];
          const worked = items.reduce((s, it) => s + itemUnitWeightKg(it) * (Number(it?.quantity) || 1), 0) + b.deadWeightKg;
          const weight = row.weightKg ?? Math.max(Math.round(worked * 100) / 100, b.deadWeightKg, 0.05);
          parcel = {
            weight, length: row.length ?? b.length, breadth: row.breadth ?? b.breadth, height: row.height ?? b.height,
          };
        } else {
          parcel = { weight: row.weightKg!, length: row.length!, breadth: row.breadth!, height: row.height! };
        }
        const offers: Offer[] = [];
        await Promise.all(SOURCES.map(async (source) => {
          try {
            const res = await shippingAPI.getCourierRates(id, warehouseId, parcel, source);
            for (const rate of courierRatesOf(res)) offers.push({ source, rate });
          } catch (e) {
            setSourceErrors((s) => (s[source] ? s : { ...s, [source]: errorText(e, 'did not answer') }));
          }
        }));
        setPlan(row.line, {
          checking: false, orderId: id, order, orderInvoice: has, parcel, offers,
          stop: offers.length ? undefined : 'No courier from either source can take this parcel.',
        });
      } catch (e) {
        setPlan(row.line, { checking: false, stop: `Could not be checked: ${errorText(e, 'no answer')}` });
      }
    });
    setRunning(null);
  };

  /** Every courier either source offered on this file, for the allow list. */
  const couriers = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; source: Source; count: number }>();
    for (const p of Object.values(plans)) {
      for (const o of p.offers ?? []) {
        const key = courierKey(o);
        const had = seen.get(key);
        if (had) had.count += 1; else seen.set(key, { key, name: o.rate.courierName, source: o.source, count: 1 });
      }
    }
    return [...seen.values()].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  }, [plans]);

  const ready = rows.filter((r) => {
    const p = plans[r.line];
    return !r.problem && p && !p.stop && !p.result && !invoiceBlock(r, p) && pickOffer(p.offers, excluded, rowPick(r.line)).best;
  });
  const total = Math.round(ready.reduce((s, r) => s + (pickOffer(plans[r.line].offers, excluded, rowPick(r.line)).best?.rate.rate ?? 0), 0) * 100) / 100;
  const shipped = Object.values(plans).filter((p) => p.result?.ok).length;
  const failed = Object.values(plans).filter((p) => p.result && !p.result.ok).length;

  /** Ship every ready row once: invoice, then booking, with the row's choice (cheapest or fastest allowed). */
  const ship = async () => {
    if (!warehouseId || !canShip) return;
    setRunning('ship');
    const sendRows = [...ready];
    await pooled(sendRows, 2, async (row) => {
      const plan = plans[row.line];
      const id = plan.orderId!;
      const picks = pickOffer(plan.offers, excluded, rowPick(row.line));
      const best = picks.best;
      // What was booked: the fastest only when asked and a courier gave days (else the cheapest stands in).
      const picked: PickBy = rowPick(row.line) === 'fastest' && picks.fastest ? 'fastest' : 'cheapest';
      if (!best || !plan.parcel) return;
      setPlan(row.line, { sending: true, step: 'checking the order again' });
      let checked: { skip: string } | { order: any };
      try {
        checked = await recheckOrder(id);
      } catch (e) {
        setPlan(row.line, { sending: false, result: { ok: false, text: `Not sent: the order could not be read again (${errorText(e, 'no answer')}).` } });
        return;
      }
      if ('skip' in checked) {
        setPlan(row.line, { sending: false, result: { ok: false, skip: true, text: checked.skip } });
        return;
      }
      // The invoice first, so the courier's papers carry it: the file's number saved, the order's own number kept, a
      // Growcord number only when ticked. After a write the order is read again and booked only when it holds the
      // number it should (owner 27 Nov 2026: "make sure invoice is updating correctly").
      let invoice = invoiceOf(checked.order);
      try {
        let wrote = false;
        if (row.invoiceNumber && invoice && invoice !== row.invoiceNumber) {
          setPlan(row.line, { sending: false, result: { ok: false, skip: true, text: `Skipped: the order now has invoice ${invoice}, the file says ${row.invoiceNumber}.` } });
          return;
        }
        if (row.invoiceNumber && !invoice) {
          setPlan(row.line, { step: 'saving the invoice number' });
          await invoicesAPI.saveDetails(id, { invoiceNumber: row.invoiceNumber, ...(row.invoiceDate ? { invoiceDate: row.invoiceDate } : {}) });
          wrote = true;
        } else if (!row.invoiceNumber && !invoice) {
          if (!issueWhenMissing) {
            setPlan(row.line, { sending: false, result: { ok: false, skip: true, text: 'Not shipped: no invoice number. Add it to the file.' } });
            return;
          }
          setPlan(row.line, { step: 'issuing a Growcord invoice number' });
          await ordersAPI.issueInvoice(id);
          wrote = true;
        }
        if (wrote) {
          setPlan(row.line, { step: 'checking the invoice on the order' });
          const again = await recheckOrder(id);
          if ('skip' in again) {
            setPlan(row.line, { sending: false, result: { ok: false, skip: true, text: again.skip } });
            return;
          }
          invoice = invoiceOf(again.order);
          const wanted = row.invoiceNumber;
          if (wanted ? invoice !== wanted : !invoice) {
            setPlan(row.line, {
              sending: false,
              result: {
                ok: false,
                text: `Not shipped: the order holds ${invoice ? `invoice ${invoice}` : 'no invoice number'}${wanted ? `, not ${wanted} from the file` : ''}. Open the order to set it.`,
              },
            });
            return;
          }
        }
      } catch (e) {
        setPlan(row.line, { sending: false, result: { ok: false, text: `Not shipped: the invoice was refused (${errorText(e, 'no answer')}).` } });
        return;
      }
      try {
        setPlan(row.line, { step: `booking ${best.rate.courierName}` });
        const res: any = await shippingAPI.createShipment(id, {
          warehouseId, shippingProvider: best.source, courierCode: String(best.rate.courierCompanyId),
          dimensions: plan.parcel,
        });
        const s = res?.shipment ?? res?.data?.shipment ?? {};
        const awb = s.awbCode ?? s.awb_code;
        setPlan(row.line, {
          sending: false,
          result: {
            ok: true, text: awb ? `AWB ${awb}` : 'booked, waiting for its AWB', courier: s.courierName ?? s.courier ?? best.rate.courierName,
            source: best.source, price: best.rate.rate, awb, invoice, picked,
          },
        });
      } catch (e) {
        setPlan(row.line, { sending: false, result: { ...(await outcomeAfterError(id, e)), courier: best.rate.courierName, source: best.source, invoice, picked } });
      }
    });
    setRunning(null);
  };

  const template = () => downloadCsv<Record<string, string>>('ship-from-file-template', COLUMNS.map((c) => ({ key: c, label: c })), [
    { 'Order Number': 'HM10234', 'Invoice Number': 'INV/26-27/0456', 'Invoice Date': '27/11/2026', 'Box Number': '1' },
    { 'Order Number': 'HM10235', 'Invoice Number': 'INV/26-27/0457', 'Invoice Date': '27/11/2026', 'Box Number': '', 'Weight (kg)': '0.8', 'Length (cm)': '20', 'Breadth (cm)': '15', 'Height (cm)': '10' },
  ]);

  const report = () => downloadCsv(`ship-from-file-${new Date().toISOString().slice(0, 10)}`, [
    { key: 'line', label: 'Line', format: (r: FileRow) => r.line },
    { key: 'order_number', label: 'Order Number', format: (r: FileRow) => r.orderNumber },
    { key: 'result', label: 'Result', format: (r: FileRow) => r.problem ?? plans[r.line]?.result?.text ?? plans[r.line]?.stop ?? invoiceBlock(r, plans[r.line]) ?? 'not sent' },
    { key: 'invoice_number', label: 'Invoice Number', format: (r: FileRow) => plans[r.line]?.result?.invoice ?? '' },
    { key: 'picked', label: 'Picked', format: (r: FileRow) => (plans[r.line]?.result?.picked === 'fastest' ? 'Fastest' : plans[r.line]?.result?.picked ? 'Cheapest' : '') },
    { key: 'courier', label: 'Courier', format: (r: FileRow) => plans[r.line]?.result?.courier ?? '' },
    { key: 'booked_through', label: 'Booked through', format: (r: FileRow) => (plans[r.line]?.result?.source ? SOURCE_LABEL[plans[r.line]!.result!.source!] : '') },
    { key: 'price', label: 'Price', format: (r: FileRow) => plans[r.line]?.result?.price ?? '' },
    { key: 'awb', label: 'AWB', format: (r: FileRow) => plans[r.line]?.result?.awb ?? '' },
  ], rows);

  const checkedAny = Object.keys(plans).length > 0;
  // No allowed courier on any checked row gave delivery days: "Fastest" cannot pick, and the page says so.
  const priced = rows.filter((r) => (plans[r.line]?.offers?.length ?? 0) > 0);
  const noDays = priced.length > 0 && priced.every((r) => !pickOffer(plans[r.line].offers, excluded, 'fastest').fastest);

  return (
    <Page>
      <PageHeader
        icon={FileUp}
        title="Ship from a file"
        description="Upload processed orders with their invoice number and box number (or weight and size). Each ships with the cheapest or the fastest courier you allow, comparing Growcord Ship and your own Shiprocket."
        actions={<Btn variant="outline" onClick={template}><Download /> Template</Btn>}
      />

      <SectionCard title="1. The file and the pickup warehouse">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="CSV file">
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          </Field>
          <Field label="Ship from">
            <SelectInput value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPlans({}); }}>
              {warehouses.map((w) => <option key={w._id} value={w._id}>{w.name ?? w.code ?? w._id}</option>)}
            </SelectInput>
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-mute">
          Columns: {COLUMNS.join(', ')}. The usual other names are read too, such as Order ID, Order No, Box No or Bill
          No. A row needs a box number from your box list (3, B3 or Box-3 for box number 3; the box's name works too), or
          the weight with all three sides. A box with no weight takes the order's own weight. A row with no invoice
          number keeps the one already on the order; an order that already has a different invoice number is never
          changed.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={issueWhenMissing} disabled={running !== null}
            onChange={(e) => setIssueWhenMissing(e.target.checked)} />
          <span>
            <span className="font-medium">Issue a Growcord invoice number when the file has none</span>
            <span className="block text-xs text-ink-mute">
              Off: an order with no invoice number in the file and none of its own stops and asks for it. Leave this off
              when your invoices come from your own accounting or ERP: ticking it starts Growcord's own invoice numbers
              for those orders.
            </span>
          </span>
        </label>
        {headerIssue && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <p className="font-medium">This file's columns could not be read, so no row was checked.</p>
            <p className="mt-1">Columns found: {headerIssue.headers.length ? headerIssue.headers.join(', ') : 'none'}.</p>
            <p className="mt-1">Missing: {headerIssue.missing.join('; and ')}.</p>
            <p className="mt-1">Rename the column in the file, or start from the template, then choose the file again.</p>
          </div>
        )}
        {filename && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Chip tone="blue">{filename}</Chip>
            <Chip>{rows.length} rows</Chip>
            {rows.some((r) => r.problem) && <Chip tone="red">{rows.filter((r) => r.problem).length} rows to fix in the file</Chip>}
          </div>
        )}
      </SectionCard>

      {couriers.length > 0 && (
        <SectionCard title="2. Couriers you allow" description="Untick a courier and it is never chosen for this file or the next. Prices are what you pay.">
          <div className="flex flex-wrap gap-2">
            {couriers.map((c) => {
              const on = !excluded.has(c.key);
              return (
                <label key={c.key} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${on ? 'border-brand-200 bg-brand-50 text-ink' : 'border-line bg-surface-2 text-ink-mute line-through'}`}>
                  <input type="checkbox" checked={on} onChange={(e) => toggleCourier(c.key, e.target.checked)} />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-ink-mute">{SOURCE_LABEL[c.source]}, {c.count}</span>
                </label>
              );
            })}
          </div>
          {Object.entries(sourceErrors).map(([s, err]) => (
            <p key={s} className="mt-3 text-xs text-amber-700">{SOURCE_LABEL[s as Source]} did not quote: {err}. The other source's prices are used.</p>
          ))}
        </SectionCard>
      )}

      <SectionCard
        title={couriers.length ? '3. Check, then ship' : '2. Check, then ship'}
        action={(
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" disabled={!rows.length || !warehouseId || running !== null} onClick={check}>
              {running === 'check' ? <Loader2 className="animate-spin" /> : <Check />} Check prices
            </Btn>
            <Btn disabled={!canShip || !ready.length || running !== null} onClick={ship}>
              {running === 'ship' ? <Loader2 className="animate-spin" /> : <Truck />} Ship {ready.length || ''} {ready.length === 1 ? 'order' : 'orders'}
            </Btn>
            {checkedAny && <Btn variant="ghost" onClick={report}><Download /> Results</Btn>}
          </div>
        )}
        flush
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm">
          <span className="font-medium">Pick for each order:</span>
          {(['cheapest', 'fastest'] as const).map((v) => (
            <label key={v} className="inline-flex items-center gap-1.5">
              <input type="radio" name="ship-file-pick" checked={pickBy === v} disabled={running !== null}
                onChange={() => {
                  setPickBy(v);
                  // The page's choice sets every row not yet shipped; a row can still switch after.
                  setPlans((ps) => Object.fromEntries(Object.entries(ps).map(([k, pl]) => [k, pl.result ? pl : { ...pl, pick: undefined }])));
                }} />
              {v === 'cheapest' ? 'Cheapest' : 'Fastest'}
            </label>
          ))}
          <span className="text-xs text-ink-mute">Fastest is the fewest delivery days the courier gives; the cheaper of two equal. Each row can switch.</span>
          {noDays && <span className="text-xs text-amber-700">No courier gave delivery days for these orders, so the cheapest is booked.</span>}
        </div>
        {checkedAny && (
          <div className="border-b border-line p-4">
            <StatGrid cols={4}>
              <StatCard label="Ready to ship" value={ready.length} />
              <StatCard label="Their freight" value={fmtRupees(total)} sub="as picked, what you pay" />
              <StatCard label="Shipped" value={shipped} tone={shipped ? 'good' : 'default'} />
              <StatCard label="Stopped or failed" value={rows.filter((r) => r.problem || plans[r.line]?.stop || (!plans[r.line]?.result && invoiceBlock(r, plans[r.line]))).length + failed} tone={failed ? 'bad' : 'default'} />
            </StatGrid>
          </div>
        )}
        {/* One <table> inside the shell, the Th straight in THead (it draws its own row), as every other page: without
            the table the browser built two and the headings sat apart from their columns (owner 27 Nov 2026). The
            shell scrolls sideways on a phone; long courier names wrap in their cell. */}
        <TableShell>
          <table className="w-full min-w-[60rem] text-sm">
          <THead>
            <Th>Line</Th>
            <Th>Order</Th>
            <Th>Invoice</Th>
            <Th>Parcel</Th>
            <Th>Cheapest allowed</Th>
            <Th>Fastest allowed</Th>
            <Th>Next</Th>
            <Th>Result</Th>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={8}>{headerIssue ? 'Fix the columns named above, then choose the file again.' : 'Choose a file to see its orders here.'}</EmptyRow>}
            {rows.map((r) => {
              const p = plans[r.line];
              const by = rowPick(r.line);
              const { cheapest, fastest, next, best } = pickOffer(p?.offers, excluded, by);
              const res = p?.result;
              // A switch only where the two differ and nothing is sent yet.
              const canSwitch = !!(cheapest && fastest && cheapest !== fastest && !res && !p?.sending);
              const offerCell = (o: Offer | undefined, which: PickBy) => (o ? (
                <div className="flex flex-col">
                  <span className="font-semibold">{o.rate.courierName} <span className="tabular-nums">{fmtRupees(o.rate.rate)}</span></span>
                  <span className="text-xs text-ink-mute">{SOURCE_LABEL[o.source]}{o.rate.estimatedDeliveryDays > 0 ? `, ${o.rate.estimatedDeliveryDays} days` : ', no days given'}</span>
                  {canSwitch && (
                    <label className="mt-1 inline-flex items-center gap-1 text-xs">
                      <input type="radio" name={`ship-file-pick-${r.line}`} checked={best === o} disabled={running !== null}
                        onChange={() => setPlan(r.line, { pick: which })} />
                      Book this
                    </label>
                  )}
                </div>
              ) : null);
              const blocked = !res ? invoiceBlock(r, p) : null;
              return (
                <Tr key={r.line}>
                  <Td className="tabular-nums text-ink-mute">{r.line}</Td>
                  <Td>
                    {p?.orderId ? <Link to={`/orders/${p.orderId}`} className="font-medium text-blue-700 hover:underline">{orderNo(p.order) || r.orderNumber}</Link> : <span className="font-medium">{r.orderNumber || 'none'}</span>}
                  </Td>
                  <Td className="text-xs">
                    {res?.invoice ? <span>{res.invoice}</span>
                      : r.invoiceNumber ? <span>{r.invoiceNumber}{r.invoiceDate ? `, ${r.invoiceDate.split('-').reverse().join('/')}` : ''}</span>
                      : p?.orderInvoice ? <span>{p.orderInvoice} <span className="text-ink-mute">(on the order)</span></span>
                      : issueWhenMissing ? <span className="text-ink-mute">Growcord number to be issued</span>
                      : <span className="text-ink-mute">none</span>}
                  </Td>
                  <Td className="text-xs tabular-nums">
                    {p?.parcel ? `${p.parcel.weight} kg, ${p.parcel.length} x ${p.parcel.breadth} x ${p.parcel.height} cm` : r.box ? `box ${r.box}` : ''}
                  </Td>
                  <Td>
                    {cheapest ? offerCell(cheapest, 'cheapest')
                      : p?.offers?.length ? <span className="text-xs text-amber-700">every courier for it is unticked</span> : null}
                  </Td>
                  <Td>
                    {fastest && fastest === cheapest ? <span className="text-xs text-ink-mute">the cheapest is also the fastest</span>
                      : fastest ? offerCell(fastest, 'fastest')
                      : cheapest ? <span className="text-xs text-amber-700">no courier gave delivery days{by === 'fastest' ? '; the cheapest is booked' : ''}</span>
                      : null}
                  </Td>
                  <Td className="text-xs">
                    {cheapest && next ? <span>{next.rate.courierName}, {fmtRupees(next.rate.rate)} <span className="text-emerald-700">(saves {fmtRupees(Math.round((next.rate.rate - cheapest.rate.rate) * 100) / 100)})</span></span> : null}
                  </Td>
                  <Td className="text-xs">
                    {r.problem ? <span className="text-red-700">Fix in the file: {r.problem}</span>
                      : p?.checking ? <span className="inline-flex items-center gap-1 text-ink-mute"><Loader2 className="h-3.5 w-3.5 animate-spin" /> checking</span>
                      : p?.sending ? <span className="inline-flex items-center gap-1 text-ink-mute"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {p.step}</span>
                      : res ? (
                        <span className={`inline-flex items-start gap-1 ${res.ok ? 'text-emerald-700' : res.unknown ? 'text-amber-700' : 'text-red-700'}`}>
                          {res.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : res.skip ? <Minus className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                          <span>{res.ok && res.courier ? `${res.courier}, ` : ''}{res.text}</span>
                        </span>
                      )
                      : p?.stop ? <span className="text-red-700">{p.stop}</span>
                      : blocked ? <span className="text-red-700">{blocked}</span>
                      : best ? <span className="text-ink-mute">ready, {best === fastest && by === 'fastest' ? 'fastest' : 'cheapest'}</span> : null}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
          </table>
        </TableShell>
      </SectionCard>
    </Page>
  );
};

export default ShipFromFile;
