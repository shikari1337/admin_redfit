/**
 * Tests for lib/code128.ts. The admin has no test runner, so this file runs on its own:
 *   npx esbuild src/lib/code128.test.ts --bundle --platform=node --outfile=<scratch>/code128.test.js && node <scratch>/code128.test.js
 * It throws on the first failure and prints "code128: N checks passed" otherwise. The app never imports it.
 */
import {
  CODE_B, CODE_C, PATTERNS, START_B, START_C, STOP, X_STEPS_MM, checksum, code128Fit, code128Modules, code128Svg,
  code128Values, code128Widths, minBarHeightMm, valueOfPattern,
} from './code128';

let checks = 0;
function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
  checks += 1;
}

// The table: 107 symbols, each data or start symbol 11 modules over 3 bars and 3 spaces, the stop 13 modules, all different.
eq(PATTERNS.length, 107, 'symbol count');
PATTERNS.slice(0, 106).forEach((p, v) => {
  eq(p.length, 6, `symbol ${v} has 6 elements`);
  eq([...p].reduce((s, w) => s + Number(w), 0), 11, `symbol ${v} is 11 modules`);
  eq([...p].filter((_, k) => k % 2 === 0).reduce((s, w) => s + Number(w), 0) % 2, 0, `symbol ${v} has an even bar sum`);
});
eq(PATTERNS[106].length, 7, 'stop has 7 elements');
eq([...PATTERNS[106]].reduce((s, w) => s + Number(w), 0), 13, 'stop is 13 modules');
eq(new Set(PATTERNS).size, 107, 'every symbol is different');
// Spot values from the published table.
eq(PATTERNS[0], '212222', 'space symbol');
eq(PATTERNS[33], '111323', 'A in B');
eq(PATTERNS[103], '211412', 'Start A');
eq(PATTERNS[104], '211214', 'Start B');
eq(PATTERNS[105], '211232', 'Start C');

// Subset B: "Wikipedia" (Start B, W i k i p e d i a, check 88, stop).
eq(code128Values('Wikipedia'), [START_B, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, STOP], 'Wikipedia in B');
// Subset C for an even run of digits: 12 34, check (105 + 12 + 34 x 2) mod 103 = 82.
eq(code128Values('1234'), [START_C, 12, 34, 82, STOP], '1234 in C');
// A 14-digit AWB is all C: 7 pairs.
const awb = '30482910000162';
const awbValues = code128Values(awb);
eq(awbValues[0], START_C, 'AWB starts in C');
eq(awbValues.length, 1 + 7 + 1 + 1, 'AWB is 7 pairs');
eq(awbValues.slice(1, 8), [30, 48, 29, 10, 0, 1, 62], 'AWB pairs');
// An odd run of digits opening the text: C for the pairs, B for the last digit.
eq(code128Values('12345'), [START_C, 12, 34, CODE_B, 21, checksum([START_C, 12, 34, CODE_B, 21]), STOP], '12345');
// Letters then six digits: B, then C for the digits.
eq(code128Values('AB123456'), [START_B, 33, 34, CODE_C, 12, 34, 56, 26, STOP], 'AB123456');
// An order number ending in five digits: the first digit in B, the last four in C.
eq(code128Values('SM-13402'), [START_B, 51, 45, 13, 17, CODE_C, 34, 2, checksum([START_B, 51, 45, 13, 17, CODE_C, 34, 2]), STOP], 'SM-13402');
// Three digits in the middle stay in B.
eq(code128Values('A123B'), [START_B, 33, 17, 18, 19, 34, checksum([START_B, 33, 17, 18, 19, 34]), STOP], 'A123B');
// A short odd digit text stays in B.
eq(code128Values('7')[0], START_B, 'one digit in B');

// The check symbol by its definition, for a few texts.
for (const t of ['Wikipedia', 'SHP/26-27/000011', 'X1', '0000', 'a b c']) {
  const v = code128Values(t);
  eq(v[v.length - 2], checksum(v.slice(0, -2)), `check symbol of ${t}`);
}

// Round trip: the widths read back to the same symbols, and the symbols back to the text.
function decode(values: number[]): string {
  let set = values[0] === START_C ? 'C' : 'B';
  let out = '';
  for (const v of values.slice(1, -2)) {
    if (v === CODE_B) { set = 'B'; continue; }
    if (v === CODE_C) { set = 'C'; continue; }
    out += set === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
  }
  return out;
}
for (const t of ['Wikipedia', awb, '12345', 'AB123456', 'SM-13402', 'A123B', 'SHP/26-27/000011', 'X 99 Y 123456 Z', '000000001']) {
  const widths = code128Widths(t);
  const groups: number[] = [];
  for (let k = 0; k < widths.length - 7; k += 6) groups.push(valueOfPattern(widths.slice(k, k + 6)));
  groups.push(valueOfPattern(widths.slice(widths.length - 7)));
  eq(groups, code128Values(t), `widths of ${t} read back`);
  eq(decode(groups), t, `${t} decodes`);
}

// Refusals and the SVG.
let refused = false;
try { code128Values('café'); } catch { refused = true; }
eq(refused, true, 'a character outside ASCII is refused');
eq(code128Svg('café', 10, 0.5), null, 'no SVG for a refused text');
const svg = code128Svg('1234', 12, 0.5) ?? '';
eq(svg.startsWith('<svg'), true, 'SVG markup');
eq((svg.match(/<rect /g) ?? []).length, 1 + 3 * 4 + 4, 'one bar per pattern bar plus the background');
// A fixed module width: 77 modules x 0.5 mm, never stretched to its box; the viewBox keeps the printed proportions.
eq(svg.includes('preserveAspectRatio="none"'), false, 'not stretched');
eq(svg.includes('width:38.5mm;height:12mm'), true, 'printed at modules x X');
eq(svg.includes('viewBox="0 0 77 24"'), true, 'viewBox in modules, height 12 mm / 0.5 mm');

// The symbol's width in modules: 11 per start, data and check symbol, 13 for the stop, 10 of quiet zone each side.
eq(code128Modules('1234'), 11 * 4 + 13 + 20, '1234: start, 2 pairs, check, stop, quiet zones');
eq(code128Modules(awb), 11 * 9 + 13 + 20, '14-digit AWB: 132 modules');
eq(code128Modules('SM-13391'), 132, 'SM-13391: S M - 1 in B, then 33 91 in C');
eq(code128Modules('SM-13402-P2'), 11 * 13 + 13 + 20, 'SM-13402-P2 all in B: start, 11 characters, check');
eq(code128Modules('7'), code128Widths('7').reduce((s, w) => s + w, 0) + 20, 'the sum of the widths plus the quiet zones');

// The lowest bar height: 6.35 mm or 15% of the printed width, rounded up to 0.1 mm.
eq(minBarHeightMm(20), 6.4, 'a narrow symbol: 6.35 mm');
eq(minBarHeightMm(66), 9.9, '66 mm wide: 9.9 mm');
eq(minBarHeightMm(49.5), 7.5, '49.5 mm wide: 7.425 rounds up');

// The fit: the largest X of the list that fits the width with bars within the wanted height.
eq(X_STEPS_MM, [1.0, 0.75, 0.5, 0.375, 0.33, 0.25], 'the module widths');
eq(code128Fit(awb, 92.2, 16), { modules: 132, xMm: 0.5, widthMm: 66, heightMm: 16, undersize: false }, 'AWB on 4 x 6');
eq(code128Fit('SM-13391', 55.32, 8), { modules: 132, xMm: 0.375, widthMm: 49.5, heightMm: 8, undersize: false }, 'order on 4 x 6');
eq(code128Fit('SM-13391', 55.32, 7)?.xMm, 0.33, 'a lower bar: a smaller X keeps it');
eq(code128Fit('SM-13391', 55.32, 5), { modules: 132, xMm: 0.25, widthMm: 33, heightMm: 6.4, undersize: false }, 'below the rule: the least height, never lower than 6.35 mm');
eq(code128Fit(awb, 30, 9), null, 'nothing fits 30 mm');
eq(code128Fit(awb, 30, 9, { shrink: true }), { modules: 132, xMm: 0.227, widthMm: 29.964, heightMm: 9, undersize: true }, 'cut to the width when asked');
eq(code128Fit('café', 90, 10), null, 'a text it cannot carry');
for (const t of [awb, 'SM-13391', 'SHP/26-27/000011', 'X 99 Y 123456 Z']) {
  for (const width of [33, 43.3, 55.32, 92.2, 130.8, 196.8]) {
    for (const want of [5, 8, 16]) {
      const f = code128Fit(t, width, want);
      if (!f) continue;
      eq(f.widthMm <= width && Math.abs(f.widthMm - f.modules * f.xMm) < 0.001, true, `${t} in ${width} mm: width is modules x X and fits`);
      eq(f.heightMm >= Math.max(6.35, 0.15 * f.widthMm) && f.heightMm >= want, true, `${t} in ${width} mm: bar height to the rule`);
      eq(X_STEPS_MM.includes(f.xMm), true, `${t} in ${width} mm: X from the list`);
    }
  }
}

console.log(`code128: ${checks} checks passed`);
