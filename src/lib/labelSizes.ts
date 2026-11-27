import { code128Fit, type Code128Fit } from './code128';

/**
 * The paper sizes of Growcord's own shipping label (lib/shippingLabels.ts, which re-exports them), the frame of a
 * label in mm (its CSS is written from these numbers, so the space a barcode has is known), and the two barcodes a
 * label prints in that space to the Code 128 rules (ISO/IEC 15417, lib/code128.ts code128Fit): the AWB across the
 * label for the courier, the order number beside the order's date and invoice for packing. Pure, tested in
 * labelSizes.test.ts.
 */

export type LabelSizeKey = 'a5_1' | 'in4x6' | 'in4x4' | 'a6' | 'a5_2' | 'a4_2' | 'a4_4' | 'a4_6' | 'a4_8' | 'a4_16';
export type Layout = 'full' | 'medium' | 'compact';

export interface SizeSpec {
  label: string;
  /** The paper, in mm. */
  pageW: number; pageH: number;
  cols: number; rows: number;
  layout: Layout;
  /** The text size of a label, in pt. */
  font: number;
  /** Bar heights in mm (AWB, order) when the size wants them other than its layout's; the rule can make them taller. */
  bars?: { awb: number; order: number };
  /** A large label (A5): the payment block, sort code and courier name drawn bigger so they read at arm's length. */
  big?: boolean;
  /** The margin around a label, in mm. */
  pad?: number;
}

export const LABEL_SIZES: Record<LabelSizeKey, SizeSpec> = {
  // Homeomed prints its labels on A5 (owner 26 Nov 2026): the label fills the page with a small margin.
  a5_1: { label: 'A5, one label', pageW: 148, pageH: 210, cols: 1, rows: 1, layout: 'full', font: 11.5, bars: { awb: 26, order: 10 }, big: true, pad: 5 },
  'in4x6': { label: '4 x 6 inch, thermal', pageW: 101.6, pageH: 152.4, cols: 1, rows: 1, layout: 'full', font: 8.5 },
  'in4x4': { label: '4 x 4 inch, thermal', pageW: 101.6, pageH: 101.6, cols: 1, rows: 1, layout: 'medium', font: 8 },
  a6: { label: 'A6 (105 x 148 mm)', pageW: 105, pageH: 148, cols: 1, rows: 1, layout: 'full', font: 8.5 },
  // Two A6 labels side by side on an A5 sheet (landscape), with a cut line between them.
  'a5_2': { label: 'A5 sheet, 2 labels (A6 each)', pageW: 210, pageH: 148, cols: 2, rows: 1, layout: 'full', font: 8.5 },
  'a4_2': { label: 'A4 sheet, 2 labels (A5 each)', pageW: 210, pageH: 297, cols: 1, rows: 2, layout: 'full', font: 11, bars: { awb: 22, order: 9 }, big: true },
  'a4_4': { label: 'A4 sheet, 4 labels', pageW: 210, pageH: 297, cols: 2, rows: 2, layout: 'full', font: 8.5 },
  'a4_6': { label: 'A4 sheet, 6 labels', pageW: 210, pageH: 297, cols: 2, rows: 3, layout: 'medium', font: 8 },
  'a4_8': { label: 'A4 sheet, 8 labels', pageW: 210, pageH: 297, cols: 2, rows: 4, layout: 'compact', font: 7.5 },
  'a4_16': { label: 'A4 sheet, 16 labels (compact)', pageW: 210, pageH: 297, cols: 4, rows: 4, layout: 'compact', font: 5.5 },
};
export const LABEL_SIZE_KEYS = Object.keys(LABEL_SIZES) as LabelSizeKey[];

/** The size picker's two groups. */
export const LABEL_SIZE_GROUPS: Array<{ label: string; keys: LabelSizeKey[] }> = [
  { label: 'One label per page', keys: ['a5_1', 'in4x6', 'in4x4', 'a6'] },
  { label: 'Several per sheet', keys: ['a5_2', 'a4_2', 'a4_4', 'a4_6', 'a4_8', 'a4_16'] },
];

/** The size used when the store has not chosen one. */
export const DEFAULT_LABEL_SIZE: LabelSizeKey = 'a5_1';

/* ── a label's frame, in mm ─────────────────────────────────────────────── */

/** The margin of a label's cell (a dashed cut line on a sheet). */
export const cellPadMm = (s: SizeSpec) => s.pad ?? (s.cols * s.rows > 1 ? 3 : 2.5);
/** The label's border. */
export const labBorderMm = (s: SizeSpec) => (s.big ? 0.6 : 0.4);
/** The label's padding inside its border. */
export const labPadMm = (s: SizeSpec) => (s.big ? 3 : s.layout === 'compact' ? 1.2 : 1.8);
/** The width inside a label, where its content and barcodes go. */
export const innerWidthMm = (s: SizeSpec) => s.pageW / s.cols - 2 * (cellPadMm(s) + labBorderMm(s) + labPadMm(s));
/** The share of the inner width the order barcode may take: its date and invoice sit beside it. */
export const orderShare = (s: SizeSpec) => (s.big ? 0.55 : 0.6);

/** The bar heights a size draws where the rule allows (its own, else its layout's), in mm. Compact has no order barcode. */
export function barHeightsMm(s: SizeSpec): { awb: number; order: number } {
  if (s.bars) return s.bars;
  return s.layout === 'full' ? { awb: 16, order: 8 } : s.layout === 'medium' ? { awb: 12, order: 7.5 } : { awb: 10, order: 0 };
}

/** The two barcodes of one label, each with its printed size; null where it is not printed. */
export interface LabelBarcodes { awb: Code128Fit | null; order: Code128Fit | null }

/**
 * The two barcodes of a label of size `s`. The AWB across the whole inner width, always printed when it can be
 * carried (X cut to the width only when even 0.25 mm does not fit, so the courier's number never drops off). The
 * order number in its share of the width (none on the compact sheets, which print it as text), left out when it
 * would need X below 0.25 mm: the text "Order ..." is on the label either way.
 */
export function labelBarcodes(s: SizeSpec, awb: string, order: string): LabelBarcodes {
  const h = barHeightsMm(s);
  const inner = innerWidthMm(s);
  return {
    awb: awb ? code128Fit(awb, inner, h.awb, { shrink: true }) : null,
    order: order && s.layout !== 'compact' ? code128Fit(order, inner * orderShare(s), h.order) : null,
  };
}
