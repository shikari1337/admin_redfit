/**
 * Tests for lib/labelSizes.ts: the two barcodes of a label in every size meet the Code 128 rules (ISO/IEC 15417 as
 * the brief GS-ACC-M sets them): a fixed module width X from 0.25, 0.33, 0.375, 0.5, 0.75, 1.0 mm, the symbol with
 * its 10-module quiet zones inside the space it has, and bars at least 6.35 mm and 15% of the printed width tall.
 * The admin has no test runner, so this file runs on its own:
 *   npx esbuild src/lib/labelSizes.test.ts --bundle --platform=node --outfile=<scratch>/labelSizes.test.js && node <scratch>/labelSizes.test.js
 * It throws on the first failure and prints "labelSizes: N checks passed" otherwise. The app never imports it.
 */
import { X_STEPS_MM, code128Modules } from './code128';
import {
  LABEL_SIZES, LABEL_SIZE_KEYS, barHeightsMm, innerWidthMm, labelBarcodes, orderShare, type LabelSizeKey,
} from './labelSizes';

let checks = 0;
function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
  checks += 1;
}

const AWB = '30482910000151';
const ORDER = 'SM-13391';

// What every size prints for a 14-digit AWB and order SM-13391 (both 132 modules): X and bar height in mm.
const expected: Record<LabelSizeKey, { awb: [number, number]; order: [number, number] | null }> = {
  a5_1: { awb: [0.75, 26], order: [0.5, 10] },
  in4x6: { awb: [0.5, 16], order: [0.375, 8] },
  in4x4: { awb: [0.5, 12], order: [0.375, 7.5] },
  a6: { awb: [0.5, 16], order: [0.375, 8] },
  a5_2: { awb: [0.5, 16], order: [0.375, 8] },
  a4_2: { awb: [1.0, 22], order: [0.375, 9] },
  a4_4: { awb: [0.5, 16], order: [0.375, 8] },
  a4_6: { awb: [0.5, 12], order: [0.375, 7.5] },
  a4_8: { awb: [0.5, 10], order: null },
  a4_16: { awb: [0.25, 10], order: null },
};
eq(Object.keys(expected).sort(), [...LABEL_SIZE_KEYS].sort(), 'every size is listed');
for (const k of LABEL_SIZE_KEYS) {
  const b = labelBarcodes(LABEL_SIZES[k], AWB, ORDER);
  eq(b.awb ? [b.awb.xMm, b.awb.heightMm] : null, expected[k].awb, `${k}: AWB X and height`);
  eq(b.order ? [b.order.xMm, b.order.heightMm] : null, expected[k].order, `${k}: order X and height`);
}

/** The rules, for one barcode in a space `room` mm wide. */
function meets(f: NonNullable<ReturnType<typeof labelBarcodes>['awb']>, text: string, room: number, want: number, what: string) {
  eq(f.modules, code128Modules(text), `${what}: modules with both quiet zones`);
  eq(X_STEPS_MM.includes(f.xMm), true, `${what}: X from the list`);
  eq(Math.abs(f.widthMm - f.modules * f.xMm) < 0.001, true, `${what}: printed width is modules x X`);
  eq(f.widthMm <= room + 1e-9, true, `${what}: fits its space (${f.widthMm} in ${room.toFixed(2)})`);
  eq(f.heightMm >= 6.35, true, `${what}: bars at least 6.35 mm`);
  eq(f.heightMm >= 0.15 * f.widthMm, true, `${what}: bars at least 15% of the width`);
  eq(f.heightMm >= want, true, `${what}: never lower than the size's own height`);
  // The largest X that fits the space and the size's height, when one does.
  const bigger = X_STEPS_MM.filter((x) => x > f.xMm && f.modules * x <= room + 1e-9
    && Math.max(6.35, 0.15 * f.modules * x) <= want);
  eq(bigger, [], `${what}: no larger X would fit`);
}

// Every size, with AWBs and order numbers of the lengths the couriers and stores use.
const awbs = ['30482910000151', '1490811234567', '149081123456789', 'D12345678', 'SF1234567890ABC', '77665544332211009'];
const orders = ['SM-13391', 'SM-13402-P2', 'ORD-2026-000123', '#1001'];
for (const k of LABEL_SIZE_KEYS) {
  const s = LABEL_SIZES[k];
  const h = barHeightsMm(s);
  for (const a of awbs) {
    const b = labelBarcodes(s, a, '');
    if (!b.awb) throw new Error(`${k}: no AWB barcode for ${a}`);
    if (b.awb.undersize) {
      // Only when even 0.25 mm does not fit: then cut to the width, bars still to the height rule.
      eq(code128Modules(a) * 0.25 > innerWidthMm(s), true, `${k} AWB ${a}: cut only when 0.25 mm does not fit`);
      eq(b.awb.widthMm <= innerWidthMm(s) && b.awb.heightMm >= Math.max(6.35, 0.15 * b.awb.widthMm), true, `${k} AWB ${a}: cut to the width`);
      continue;
    }
    meets(b.awb, a, innerWidthMm(s), h.awb, `${k} AWB ${a}`);
  }
  for (const o of orders) {
    const b = labelBarcodes(s, '', o);
    if (s.layout === 'compact') { eq(b.order, null, `${k}: compact prints the order as text`); continue; }
    if (!b.order) throw new Error(`${k}: no order barcode for ${o}`);
    meets(b.order, o, innerWidthMm(s) * orderShare(s), h.order, `${k} order ${o}`);
  }
}

// Which sizes cut which AWBs: only the 16-label sheet (43.3 mm inside a label), and only an AWB of more than 173
// modules (a 15-character AWB with letters, 187 modules, needs 46.75 mm at 0.25 mm); every digit AWB fits everywhere.
const cut = LABEL_SIZE_KEYS.flatMap((k) => awbs.filter((a) => labelBarcodes(LABEL_SIZES[k], a, '').awb?.undersize).map((a) => `${k} ${a}`));
eq(cut, ['a4_16 SF1234567890ABC'], 'the only AWB cut to the width');
eq(Math.floor(innerWidthMm(LABEL_SIZES.a4_16) / 0.25), 173, 'a4_16 holds 173 modules at 0.25 mm');
// An AWB too long for the smallest X is still printed, cut to the width (it must never drop off the label); an order
// number that long is left as text.
const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
const tiny = labelBarcodes(LABEL_SIZES.a4_16, long, long);
eq(tiny.awb?.undersize, true, 'a too long AWB on a4_16: cut to the width');
eq((tiny.awb?.widthMm ?? 99) <= innerWidthMm(LABEL_SIZES.a4_16), true, 'and inside the label');
eq(labelBarcodes(LABEL_SIZES.in4x4, '', long).order, null, 'a too long order number: text only');
eq(labelBarcodes(LABEL_SIZES.in4x6, 'café', '').awb, null, 'a text Code 128 cannot carry: text only');

console.log(`labelSizes: ${checks} checks passed`);
