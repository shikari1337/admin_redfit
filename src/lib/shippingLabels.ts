/**
 * Growcord's own shipping label (owner 26 Nov 2026: "create Growcord's own shipping label like Shiprocket, with
 * barcode and information, and options like A4 sheet can have up to 8 or 16 labels or thermal printer 4x6 or other
 * popular sizes"). The facts come from one backend read, `GET /api/v2/ship/shipments/label-data?ids=a,b`
 * (shipments.read): each booked shipment's AWB, courier, routing, payment, parcel, addresses and items. This file
 * turns them into one self-contained HTML page (inline CSS, SVG Code 128 barcodes from lib/code128.ts, no network
 * but the store's logo) laid out per paper size with CSS @page, so a thermal printer and an A4 sheet both come out
 * right. Money arrives in minor units.
 */
import { v2call } from './v2/http';
import { code128Svg, escapeXml as x } from './code128';
import { fmtMinor } from './money';
import { formatDate } from '../utils/date';

export interface LabelAddress {
  name?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; landmark?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null; country?: string | null; gstin?: string | null;
}

/** One shipment's label facts (the backend's label-data answer). */
export interface LabelData {
  shipment_id: string;
  shipment_number?: string | null;
  awb?: string | null;
  courier?: { name?: string | null; code?: string | null; service?: string | null } | null;
  mode?: string | null;
  routing?: { sort_code?: string | null; destination_code?: string | null; origin_code?: string | null; cluster?: string | null; extra?: string | null } | null;
  order?: { number?: string | null; date?: string | null; invoice_number?: string | null; invoice_value_minor?: number | null; currency?: string | null } | null;
  payment?: { type?: 'cod' | 'prepaid' | string | null; cod_amount_minor?: number | null } | null;
  weight_g?: number | null;
  dimensions_cm?: { l?: number | null; b?: number | null; h?: number | null } | null;
  pieces?: number | null;
  ship_to?: LabelAddress | null;
  return_to?: LabelAddress | null;
  items?: Array<{ name?: string | null; sku?: string | null; qty?: number | null }> | null;
  store?: { name?: string | null; logo_url?: string | null } | null;
  booked_at?: string | null;
}

export interface LabelMissing { shipment_id: string; reason?: string | null }

/** The label facts of the given shipments, 50 at a time. */
export async function readLabelData(ids: string[]): Promise<{ labels: LabelData[]; missing: LabelMissing[] }> {
  const labels: LabelData[] = [];
  const missing: LabelMissing[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await v2call<any>('GET', '/api/v2/ship/shipments/label-data', { params: { ids: ids.slice(i, i + 50).join(',') } });
    if (Array.isArray(d?.labels)) labels.push(...d.labels);
    if (Array.isArray(d?.missing)) missing.push(...d.missing);
  }
  return { labels, missing };
}

/* ── sizes ──────────────────────────────────────────────────────────────── */

export type LabelSizeKey = 'a5' | '4x6' | '4x4' | 'a6' | 'a5-2' | 'a4-2' | 'a4-4' | 'a4-6' | 'a4-8' | 'a4-16';
type Layout = 'full' | 'medium' | 'compact';

interface SizeSpec {
  label: string;
  /** The paper, in mm. */
  pageW: number; pageH: number;
  cols: number; rows: number;
  layout: Layout;
  /** The text size of a label, in pt. */
  font: number;
  /** Bar heights in mm (AWB, order) when the size wants them bigger than its layout's. */
  bars?: { awb: number; order: number };
  /** A large label (A5): the payment block, sort code and courier name drawn bigger so they read at arm's length. */
  big?: boolean;
  /** The margin around a label, in mm. */
  pad?: number;
}

export const LABEL_SIZES: Record<LabelSizeKey, SizeSpec> = {
  // Homeomed prints its labels on A5 (owner 26 Nov 2026): the label fills the page with a small margin.
  a5: { label: 'A5, one label', pageW: 148, pageH: 210, cols: 1, rows: 1, layout: 'full', font: 11.5, bars: { awb: 26, order: 10 }, big: true, pad: 5 },
  '4x6': { label: '4 x 6 inch, thermal', pageW: 101.6, pageH: 152.4, cols: 1, rows: 1, layout: 'full', font: 8.5 },
  '4x4': { label: '4 x 4 inch, thermal', pageW: 101.6, pageH: 101.6, cols: 1, rows: 1, layout: 'medium', font: 8 },
  a6: { label: 'A6 (105 x 148 mm)', pageW: 105, pageH: 148, cols: 1, rows: 1, layout: 'full', font: 8.5 },
  // Two A6 labels side by side on an A5 sheet (landscape), with a cut line between them.
  'a5-2': { label: 'A5 sheet, 2 labels (A6 each)', pageW: 210, pageH: 148, cols: 2, rows: 1, layout: 'full', font: 8.5 },
  'a4-2': { label: 'A4 sheet, 2 labels (A5 each)', pageW: 210, pageH: 297, cols: 1, rows: 2, layout: 'full', font: 11, bars: { awb: 22, order: 9 }, big: true },
  'a4-4': { label: 'A4 sheet, 4 labels', pageW: 210, pageH: 297, cols: 2, rows: 2, layout: 'full', font: 8.5 },
  'a4-6': { label: 'A4 sheet, 6 labels', pageW: 210, pageH: 297, cols: 2, rows: 3, layout: 'medium', font: 8 },
  'a4-8': { label: 'A4 sheet, 8 labels', pageW: 210, pageH: 297, cols: 2, rows: 4, layout: 'compact', font: 7.5 },
  'a4-16': { label: 'A4 sheet, 16 labels (compact)', pageW: 210, pageH: 297, cols: 4, rows: 4, layout: 'compact', font: 5.5 },
};
export const LABEL_SIZE_KEYS = Object.keys(LABEL_SIZES) as LabelSizeKey[];

/** The size picker's two groups. */
export const LABEL_SIZE_GROUPS: Array<{ label: string; keys: LabelSizeKey[] }> = [
  { label: 'One label per page', keys: ['a5', '4x6', '4x4', 'a6'] },
  { label: 'Several per sheet', keys: ['a5-2', 'a4-2', 'a4-4', 'a4-6', 'a4-8', 'a4-16'] },
];

/** The size used when nothing is remembered for the store. */
export const DEFAULT_LABEL_SIZE: LabelSizeKey = 'a5';

export interface LabelOptions {
  /** Product names (and SKU, quantity) on the label. */
  items: boolean;
  /** The invoice value beside the invoice number. */
  invoiceValue: boolean;
  /** The store's logo at the top. */
  logo: boolean;
}

/* ── one label ──────────────────────────────────────────────────────────── */

const line = (...parts: Array<string | null | undefined>) => parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(', ');
const kg = (g: number | null | undefined) => (Number(g) > 0 ? `${(Number(g) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg` : '');
const words = (s: string | null | undefined) => String(s ?? '').replace(/_/g, ' ').trim();

function addressHtml(a: LabelAddress | null | undefined, opts: { gstin?: boolean; full: boolean }): string {
  if (!a) return '';
  const rows = [
    `<div class="nm">${x(a.name)}</div>`,
    opts.full ? `<div>${x(line(a.line1, a.line2))}</div>` : '',
    opts.full && a.landmark ? `<div>${x(`Near ${a.landmark}`)}</div>` : '',
    `<div>${x(line(a.city, a.state))}${a.pincode ? ` <b class="pin">${x(a.pincode)}</b>` : ''}</div>`,
    a.phone ? `<div>Phone ${x(a.phone)}</div>` : '',
    opts.gstin && a.gstin ? `<div>GSTIN ${x(a.gstin)}</div>` : '',
  ];
  return rows.join('');
}

function labelHtml(l: LabelData, spec: SizeSpec, o: LabelOptions): string {
  const { layout } = spec;
  const cod = String(l.payment?.type ?? '').toLowerCase() === 'cod';
  const codAmount = l.payment?.cod_amount_minor;
  const awb = String(l.awb ?? '').trim();
  const orderNo = String(l.order?.number ?? '').trim();
  const sort = String(l.routing?.sort_code ?? '').trim();
  const route = line(
    l.routing?.destination_code ? `Dest ${l.routing.destination_code}` : '',
    l.routing?.origin_code ? `Origin ${l.routing.origin_code}` : '',
    l.routing?.cluster ? `Cluster ${l.routing.cluster}` : '',
    l.routing?.extra ?? '',
  );
  const barH = spec.bars?.awb ?? (layout === 'full' ? 16 : layout === 'medium' ? 12 : 9);
  const awbBar = awb ? code128Svg(awb, barH) : null;
  const orderBar = orderNo && layout !== 'compact' ? code128Svg(orderNo, spec.bars?.order ?? (layout === 'full' ? 7 : 5)) : null;
  const dims = l.dimensions_cm && (l.dimensions_cm.l || l.dimensions_cm.b || l.dimensions_cm.h)
    ? `${l.dimensions_cm.l ?? ''} x ${l.dimensions_cm.b ?? ''} x ${l.dimensions_cm.h ?? ''} cm` : '';
  const items = Array.isArray(l.items) ? l.items : [];
  const itemCap = layout === 'full' ? 6 : 2;
  const payBox = cod
    ? `<div class="pay cod"><div class="pk">COD</div><div class="amt">${codAmount != null ? x(fmtMinor(codAmount)) : 'Collect'}</div></div>`
    : '<div class="pay pre"><div class="amt">PREPAID</div></div>';
  const courier = `<div class="cour"><div><span class="cn">${x(l.courier?.name || 'Courier')}</span>`
    + `${l.mode || l.courier?.service ? ` <span class="md">${x(words(l.mode || l.courier?.service))}</span>` : ''}</div>`
    + `${sort ? `<div class="sort">${x(sort)}</div>` : ''}</div>`;
  const awbBlock = awb
    ? `<div class="bc">${awbBar ?? ''}<div class="dg">AWB ${x(awb)}</div></div>`
    : '<div class="bc"><div class="dg">No AWB yet</div></div>';

  if (layout === 'compact') {
    return `<div class="lab compact">`
      + `<div class="row">${courier}${payBox}</div>`
      + awbBlock
      + `<div class="to"><div class="h">Deliver to</div>${addressHtml(l.ship_to, { full: false })}</div>`
      + `<div class="sm">${x(line(orderNo ? `Order ${orderNo}` : '', kg(l.weight_g)))}</div>`
      + `${l.return_to ? `<div class="sm">Return: ${x(line(l.return_to.name, l.return_to.pincode))}</div>` : ''}`
      + `</div>`;
  }

  // The store's logo, or its name when it has no logo; neither when the option is off.
  const logo = !o.logo ? ''
    : l.store?.logo_url ? `<img class="logo" src="${x(l.store.logo_url)}" alt="" referrerpolicy="no-referrer"/>`
      : (l.store?.name ? `<div class="store">${x(l.store.name)}</div>` : '');
  const invoice = line(
    l.order?.invoice_number ? `Invoice ${l.order.invoice_number}` : '',
    o.invoiceValue && l.order?.invoice_value_minor != null ? `Value ${fmtMinor(l.order.invoice_value_minor)}` : '',
  );
  return `<div class="lab ${layout}${spec.big ? ' big' : ''}">`
    + `<div class="row top"><div class="to"><div class="h">Deliver to</div>${addressHtml(l.ship_to, { full: true })}</div>`
    + `<div class="side">${logo}${payBox}</div></div>`
    + courier
    + awbBlock
    + (route ? `<div class="sm">${x(route)}</div>` : '')
    + `<div class="ord"><div class="row"><div>${x(line(orderNo ? `Order ${orderNo}` : '', formatDate(l.order?.date, 'dd MMM yyyy', '')))}</div>`
    + `${invoice ? `<div>${x(invoice)}</div>` : ''}</div>${orderBar ? `<div class="obc">${orderBar}</div>` : ''}</div>`
    + `<div class="sm">${x(line(kg(l.weight_g) ? `Weight ${kg(l.weight_g)}` : '', dims ? `Box ${dims}` : '', l.pieces ? `Pieces ${l.pieces}` : ''))}</div>`
    + (o.items && items.length
      ? `<div class="items"><div class="h">Items</div>${items.slice(0, itemCap).map((it) => `<div>${x(`${it.qty ?? 1} x ${it.name ?? it.sku ?? 'Item'}${it.sku && it.name ? ` (${it.sku})` : ''}`)}</div>`).join('')}`
        + `${items.length > itemCap ? `<div>and ${items.length - itemCap} more</div>` : ''}</div>`
      : '')
    + (l.return_to ? `<div class="ret"><div class="h">If not delivered, return to</div>${addressHtml(l.return_to, { gstin: true, full: layout === 'full' })}</div>` : '')
    + `<div class="foot">${x(line(l.booked_at ? `Booked ${formatDate(l.booked_at, 'dd MMM yyyy', '')}` : '', l.shipment_number ? `Shipment ${l.shipment_number}` : ''))}</div>`
    + `</div>`;
}

/* ── the page ───────────────────────────────────────────────────────────── */

/**
 * The whole print document: one page per thermal label, or sheets of 2 to 16 with dashed cut lines. `screenZoom`
 * shrinks it on screen only (the preview); print is always true size.
 */
export function labelsHtml(labels: LabelData[], size: LabelSizeKey, o: LabelOptions, screenZoom = 1): string {
  const s = LABEL_SIZES[size];
  const per = s.cols * s.rows;
  const sheets: string[] = [];
  for (let i = 0; i < labels.length; i += per) {
    const cells = labels.slice(i, i + per).map((l) => `<div class="cell">${labelHtml(l, s, o)}</div>`);
    while (cells.length < per && per > 1) cells.push('<div class="cell empty"></div>');
    sheets.push(`<section class="sheet${per > 1 ? ' multi' : ''}">${cells.join('')}</section>`);
  }
  const css = `
@page { size: ${s.pageW}mm ${s.pageH}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Arial, Helvetica, sans-serif; font-size: ${s.font}pt; line-height: 1.25; }
.sheet { width: ${s.pageW}mm; height: ${s.pageH}mm; display: grid; overflow: hidden;
  grid-template-columns: repeat(${s.cols}, 1fr); grid-template-rows: repeat(${s.rows}, 1fr);
  break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.cell { overflow: hidden; padding: ${s.pad ?? (per > 1 ? 3 : 2.5)}mm; min-width: 0; min-height: 0; }
.sheet.multi .cell { border: 0.2mm dashed #888; }
.lab { height: 100%; display: flex; flex-direction: column; gap: 1.2mm; border: 0.4mm solid #000; padding: 1.8mm; overflow: hidden; }
.row { display: flex; justify-content: space-between; gap: 2mm; align-items: flex-start; }
.top { border-bottom: 0.3mm solid #000; padding-bottom: 1.2mm; }
.to { flex: 1; min-width: 0; }
.h { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.04em; color: #333; }
.nm { font-weight: bold; font-size: 1.15em; }
.pin { font-size: 1.25em; }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; max-width: 40%; }
.logo { max-height: 9mm; max-width: 100%; object-fit: contain; }
.store { font-weight: bold; text-align: right; }
.pay { border: 0.5mm solid #000; padding: 1mm 1.6mm; text-align: center; }
.pay.cod { background: #000; color: #fff; }
.pay .pk { font-size: 0.9em; font-weight: bold; }
.pay .amt { font-size: 1.6em; font-weight: bold; white-space: nowrap; }
.cour { display: flex; justify-content: space-between; align-items: center; gap: 2mm; }
.cn { font-weight: bold; font-size: 1.25em; }
.md { text-transform: capitalize; border: 0.3mm solid #000; padding: 0 1mm; font-size: 0.9em; }
.sort { font-weight: bold; font-size: 2em; letter-spacing: 0.05em; border: 0.5mm solid #000; padding: 0 1.5mm; }
.bc { text-align: center; }
.dg { font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.25em; letter-spacing: 0.08em; margin-top: 0.6mm; }
.ord { border-top: 0.3mm solid #000; padding-top: 1mm; }
.obc { margin-top: 0.8mm; width: 60%; }
.sm { font-size: 0.9em; }
.items { border-top: 0.3mm solid #000; padding-top: 1mm; font-size: 0.9em; overflow: hidden; }
.ret { border-top: 0.3mm solid #000; padding-top: 1mm; font-size: 0.85em; margin-top: auto; }
.foot { font-size: 0.8em; color: #333; }
.compact { gap: 0.8mm; padding: 1.2mm; }
.big { gap: 2mm; padding: 3mm; border-width: 0.6mm; }
.big .pay { padding: 2mm 3mm; border-width: 0.8mm; }
.big .pay .pk { font-size: 1.2em; }
.big .pay .amt { font-size: 2.4em; }
.big .cn { font-size: 1.5em; }
.big .sort { font-size: 2.6em; }
.big .dg { font-size: 1.6em; }
.big .nm { font-size: 1.3em; }
.big .pin { font-size: 1.45em; }
.big .obc { width: 55%; }
.compact .pay .amt { font-size: 1.3em; }
.compact .sort { font-size: 1.4em; }
@media screen {
  html { background: #e5e7eb; }
  body { zoom: ${screenZoom}; padding: 4mm 0; }
  .sheet { margin: 0 auto 6mm; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shipping labels</title><style>${css}</style></head><body>${sheets.join('')}</body></html>`;
}

/**
 * Prints an HTML document through a hidden frame, so only the labels print, at their own page size. Waits for the
 * logo images (at most 3 seconds) first.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
  frame.srcdoc = html;
  frame.onload = () => {
    const w = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!w || !doc) return;
    const images = Array.from(doc.images).filter((im) => !im.complete);
    const ready = Promise.race([
      Promise.all(images.map((im) => new Promise((r) => { im.onload = r; im.onerror = r; }))),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    void ready.then(() => {
      w.focus();
      w.print();
      setTimeout(() => frame.remove(), 60_000);
    });
  };
  document.body.appendChild(frame);
}
