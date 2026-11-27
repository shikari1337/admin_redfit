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
import { settingsRegistryAPI } from '../services/api';
import { code128Svg, escapeXml as x } from './code128';
import {
  DEFAULT_LABEL_SIZE, LABEL_SIZES, LABEL_SIZE_KEYS, cellPadMm, labBorderMm, labPadMm, labelBarcodes,
  type LabelSizeKey, type SizeSpec,
} from './labelSizes';
import { fmtMinor } from './money';
import { formatDate } from '../utils/date';

// The sizes live in lib/labelSizes.ts (pure, tested with the barcode sizes); the screens read them from here.
export { DEFAULT_LABEL_SIZE, LABEL_SIZES, LABEL_SIZE_GROUPS, LABEL_SIZE_KEYS } from './labelSizes';
export type { LabelSizeKey } from './labelSizes';

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
  /** How it was booked: `growcord_ship`, `shiprocket`, `delhivery`, `manual`. */
  provider?: string | null;
  /** Growcord Ship's brand for its own parcels (name and logo), printed top left; other carriers have none. */
  brand?: { name?: string | null; logo_url?: string | null } | null;
}

export interface LabelMissing { shipment_id: string; reason?: string | null }

/** How a shipment was booked (label-data `provider`): `growcord_ship`, `shiprocket`, `delhivery`, `manual`. */
export const isGrowcordShip = (l: LabelData) => String(l.provider ?? '') === 'growcord_ship';

/**
 * The label facts of the given shipments, 50 at a time, and the store's label setting as the server answers it with
 * them (`print_defaults`, defaults filled in): the fallback when the settings registry cannot be read.
 */
export async function readLabelData(ids: string[]): Promise<{ labels: LabelData[]; missing: LabelMissing[]; printDefaults: LabelPrintSetting | null }> {
  const labels: LabelData[] = [];
  const missing: LabelMissing[] = [];
  let printDefaults: LabelPrintSetting | null = null;
  for (let i = 0; i < ids.length; i += 50) {
    const d = await v2call<any>('GET', '/api/v2/ship/shipments/label-data', { params: { ids: ids.slice(i, i + 50).join(',') } });
    if (Array.isArray(d?.labels)) labels.push(...d.labels);
    if (Array.isArray(d?.missing)) missing.push(...d.missing);
    if (!printDefaults && d?.print_defaults && typeof d.print_defaults === 'object') printDefaults = labelPrintOf(d.print_defaults);
  }
  return { labels, missing, printDefaults };
}

/* ── the store's label setting ──────────────────────────────────────────── */

/**
 * The store's label setting (owner 26 Nov 2026: size and options are a STORE setting): the settings registry key
 * `shippingLabels` (growcord-rs commerce settings_registry.rs; read by ship domain/label_data.rs PrintDefaults), read and
 * written through the store settings routes (`GET /settings/registry`, `PATCH /settings/registry/shippingLabels`).
 * Its fields are snake_case: size, show_products, show_invoice_value, show_logo, default_kind. The print window starts
 * from it and allows a change for one print.
 */
export const LABEL_PRINT_KEY = 'shippingLabels';

export interface LabelPrintSetting {
  size: LabelSizeKey;
  showProducts: boolean;
  showInvoiceValue: boolean;
  showLogo: boolean;
  /** Which label a print starts on. Growcord Ship parcels always start on Growcord's own. */
  defaultKind: 'growcord' | 'courier';
}

export const LABEL_PRINT_DEFAULTS: LabelPrintSetting = {
  size: DEFAULT_LABEL_SIZE, showProducts: true, showInvoiceValue: true, showLogo: true, defaultKind: 'growcord',
};

/**
 * A stored value (snake_case, as the registry and `print_defaults` carry it) made safe: unknown sizes and kinds fall
 * back to the defaults.
 */
export function labelPrintOf(v: unknown): LabelPrintSetting {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const bool = (key: string, k: keyof LabelPrintSetting) => (typeof o[key] === 'boolean' ? (o[key] as boolean) : (LABEL_PRINT_DEFAULTS[k] as boolean));
  return {
    size: LABEL_SIZE_KEYS.includes(o.size as LabelSizeKey) ? (o.size as LabelSizeKey) : LABEL_PRINT_DEFAULTS.size,
    showProducts: bool('show_products', 'showProducts'),
    showInvoiceValue: bool('show_invoice_value', 'showInvoiceValue'),
    showLogo: bool('show_logo', 'showLogo'),
    defaultKind: o.default_kind === 'courier' ? 'courier' : 'growcord',
  };
}

/**
 * The store's label setting: its stored value over the definition's own defaults. `exists` false when this server has
 * no such setting yet (the defaults apply); errors (no settings.read) propagate to the caller.
 */
export async function readLabelPrint(): Promise<{ setting: LabelPrintSetting; exists: boolean; canWrite: boolean }> {
  const def: any = await settingsRegistryAPI.definition(LABEL_PRINT_KEY);
  if (!def) return { setting: LABEL_PRINT_DEFAULTS, exists: false, canWrite: false };
  // The definition's own defaults (snake_case paths), under the stored value.
  const fromFields: Record<string, unknown> = {};
  for (const f of Array.isArray(def.fields) ? def.fields : []) if (f?.path && f.default !== undefined) fromFields[f.path] = f.default;
  const value = def.value && typeof def.value === 'object' ? def.value : {};
  return { setting: labelPrintOf({ ...fromFields, ...value }), exists: true, canWrite: def.canWrite === true };
}

/** Saves the store's label setting (settings.manage, checked by the server), in the registry's snake_case fields only. */
export const writeLabelPrint = (s: LabelPrintSetting) => settingsRegistryAPI.update(LABEL_PRINT_KEY, {
  size: s.size,
  show_products: s.showProducts,
  show_invoice_value: s.showInvoiceValue,
  show_logo: s.showLogo,
  default_kind: s.defaultKind,
});

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
  // Routing codes only: nothing from the courier account (its client name or ids) is printed, so `routing.extra`,
  // which a courier can fill with its own account details, is left out.
  const route = line(
    l.routing?.destination_code ? `Dest ${l.routing.destination_code}` : '',
    l.routing?.origin_code ? `Origin ${l.routing.origin_code}` : '',
    l.routing?.cluster ? `Cluster ${l.routing.cluster}` : '',
  );
  // Both barcodes at a fixed module width and a bar height to the Code 128 rules for this size (lib/labelSizes.ts).
  const bars = labelBarcodes(spec, awb, orderNo);
  const awbBar = bars.awb ? code128Svg(awb, bars.awb.heightMm, bars.awb.xMm) : null;
  const orderBar = bars.order ? code128Svg(orderNo, bars.order.heightMm, bars.order.xMm) : null;
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
  // Growcord Ship's own parcels carry its brand top left (label-data `brand`); other carriers have no brand box.
  const brand = isGrowcordShip(l) && (l.brand?.name || l.brand?.logo_url)
    ? `<div class="brand">${l.brand?.logo_url ? `<img src="${x(l.brand.logo_url)}" alt="" referrerpolicy="no-referrer"/>` : ''}`
      + `${l.brand?.name ? `<span>${x(l.brand.name)}</span>` : ''}</div>`
    : '';
  const invoice = line(
    l.order?.invoice_number ? `Invoice ${l.order.invoice_number}` : '',
    o.invoiceValue && l.order?.invoice_value_minor != null ? `Value ${fmtMinor(l.order.invoice_value_minor)}` : '',
  );
  const orderDate = formatDate(l.order?.date, 'dd MMM yyyy', '');
  // The order's own barcode (for packing) carries its number under it, as the AWB does, so the two never read as one
  // number twice; the order's date and invoice sit beside it. Without the barcode, the order line as text.
  const orderBlock = orderBar
    ? `<div class="ord"><div class="row"><div class="obc">${orderBar}<div class="oc">Order ${x(orderNo)}</div></div>`
      + `<div class="oi">${orderDate ? `<div>${x(`Order date ${orderDate}`)}</div>` : ''}${invoice ? `<div>${x(invoice)}</div>` : ''}</div></div></div>`
    : `<div class="ord"><div class="row"><div>${x(line(orderNo ? `Order ${orderNo}` : '', orderDate))}</div>`
      + `${invoice ? `<div>${x(invoice)}</div>` : ''}</div></div>`;
  return `<div class="lab ${layout}${spec.big ? ' big' : ''}">`
    + (brand || logo ? `<div class="row head">${brand || '<div></div>'}${logo ? `<div class="side">${logo}</div>` : ''}</div>` : '')
    + `<div class="row top"><div class="to"><div class="h">Deliver to</div>${addressHtml(l.ship_to, { full: true })}</div>`
    + `<div class="side">${payBox}</div></div>`
    + courier
    + awbBlock
    + (route ? `<div class="sm">${x(route)}</div>` : '')
    + orderBlock
    + `<div class="sm">${x(line(kg(l.weight_g) ? `Weight ${kg(l.weight_g)}` : '', dims ? `Box ${dims}` : '', l.pieces ? `Pieces ${l.pieces}` : ''))}</div>`
    + (o.items && items.length
      ? `<div class="items"><div class="h">Items</div>${items.slice(0, itemCap).map((it) => `<div>${x(`${it.qty ?? 1} x ${it.name ?? it.sku ?? 'Item'}${it.sku && it.name ? ` (${it.sku})` : ''}`)}</div>`).join('')}`
        + `${items.length > itemCap ? `<div>and ${items.length - itemCap} more</div>` : ''}</div>`
      : '')
    + (l.return_to ? `<div class="ret"><div class="h">If not delivered, return to</div>${addressHtml(l.return_to, { gstin: true, full: layout === 'full' })}</div>` : '')
    + `<div class="foot">${x(line(l.booked_at ? `Booked ${formatDate(l.booked_at, 'dd MMM yyyy', '')}` : '', l.shipment_number ? `Shipment ${l.shipment_number}` : ''))}</div>`
    + `</div>`;
}

/**
 * How many of `labels` have an AWB too long for `size` at the smallest module width (0.25 mm): it prints cut to the
 * label's width, thinner than the barcode standard allows, and a scanner may not read it. The print window says so.
 */
export function narrowAwbCount(labels: LabelData[], size: LabelSizeKey): number {
  const spec = LABEL_SIZES[size];
  return labels.filter((l) => labelBarcodes(spec, String(l.awb ?? '').trim(), '').awb?.undersize).length;
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
.cell { overflow: hidden; padding: ${cellPadMm(s)}mm; min-width: 0; min-height: 0; }
.sheet.multi .cell { border: 0.2mm dashed #888; }
.lab { height: 100%; display: flex; flex-direction: column; gap: 1.2mm; border: ${labBorderMm(s)}mm solid #000; padding: ${labPadMm(s)}mm; overflow: hidden; }
.row { display: flex; justify-content: space-between; gap: 2mm; align-items: flex-start; }
.top { border-bottom: 0.3mm solid #000; padding-bottom: 1.2mm; }
.to { flex: 1; min-width: 0; }
.h { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.04em; color: #333; }
.nm { font-weight: bold; font-size: 1.15em; }
.pin { font-size: 1.25em; }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 1mm; max-width: 40%; }
.logo { max-height: 9mm; max-width: 100%; object-fit: contain; }
.head { align-items: center; border-bottom: 0.3mm solid #000; padding-bottom: 1mm; }
.brand { display: flex; align-items: center; gap: 1.5mm; border: 0.4mm solid #000; padding: 0.8mm 1.6mm; font-weight: bold; font-size: 1.1em; }
.brand img { max-height: 7mm; max-width: 30mm; object-fit: contain; }
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
.obc { flex: none; text-align: center; }
.oc { font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.05em; letter-spacing: 0.06em; margin-top: 0.5mm; }
.oi { flex: 1; min-width: 0; text-align: right; }
.sm { font-size: 0.9em; }
.items { border-top: 0.3mm solid #000; padding-top: 1mm; font-size: 0.9em; overflow: hidden; }
.ret { border-top: 0.3mm solid #000; padding-top: 1mm; font-size: 0.85em; margin-top: auto; }
.foot { font-size: 0.8em; color: #333; }
.compact { gap: 0.8mm; }
.big { gap: 2mm; }
.big .pay { padding: 2mm 3mm; border-width: 0.8mm; }
.big .pay .pk { font-size: 1.2em; }
.big .pay .amt { font-size: 2.4em; }
.big .cn { font-size: 1.5em; }
.big .sort { font-size: 2.6em; }
.big .dg { font-size: 1.6em; }
.big .nm { font-size: 1.3em; }
.big .pin { font-size: 1.45em; }
.big .oc { font-size: 1.3em; }
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
