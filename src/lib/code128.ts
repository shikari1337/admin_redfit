/**
 * Code 128 barcodes, drawn as SVG, with no library and no network (shipping labels, owner 26 Nov 2026).
 *
 * Subset B carries printable ASCII (32 to 126); subset C packs two digits into one symbol, so a run of digits (an
 * AWB is usually all digits) takes half the width. The encoder starts in C when the text opens with four or more
 * digits (or is an even run of digits), switches to C for a run of six or more digits in the middle or four or more
 * at the end, and back to B after. The check symbol is (start + the sum of each symbol times its position) mod 103.
 * Tested in code128.test.ts (pattern table, known values, checksums, a decode round trip).
 */

/** Bar and space widths (in modules) of the 107 symbols: values 0 to 102, Start A 103, Start B 104, Start C 105, Stop 106. */
export const PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export const START_B = 104;
export const START_C = 105;
export const CODE_B = 100;
export const CODE_C = 99;
export const STOP = 106;

const isDigit = (c: string) => c >= '0' && c <= '9';

/** How many digits run from `i`. */
function digitRun(text: string, i: number): number {
  let n = 0;
  while (i + n < text.length && isDigit(text[i + n])) n += 1;
  return n;
}

/**
 * The symbol values of `text`: start, data (with subset switches), check symbol and stop. Throws for an empty text
 * or a character outside printable ASCII, so a caller can print the text alone instead.
 */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Nothing to encode.');
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128 cannot carry the character "${ch}".`);
  }
  const out: number[] = [];
  let i = 0;
  const first = digitRun(text, 0);
  let set: 'B' | 'C';
  if (first >= 4 || (first === text.length && first % 2 === 0)) {
    set = 'C';
    out.push(START_C);
  } else {
    set = 'B';
    out.push(START_B);
  }
  while (i < text.length) {
    if (set === 'C') {
      if (digitRun(text, i) >= 2) {
        out.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      out.push(CODE_B);
      set = 'B';
      continue;
    }
    const run = digitRun(text, i);
    const toEnd = i + run === text.length;
    if (run >= 6 || (run >= 4 && toEnd)) {
      // An odd run sends its first digit in B, so C carries whole pairs.
      if (run % 2 === 1) {
        out.push(text.charCodeAt(i) - 32);
        i += 1;
      }
      out.push(CODE_C);
      set = 'C';
      continue;
    }
    out.push(text.charCodeAt(i) - 32);
    i += 1;
  }
  out.push(checksum(out));
  out.push(STOP);
  return out;
}

/** The check symbol of a start and data symbols. */
export function checksum(values: number[]): number {
  let sum = values[0];
  for (let k = 1; k < values.length; k += 1) sum += values[k] * k;
  return sum % 103;
}

/** Bar and space widths in modules, bar first, for the whole symbol sequence (quiet zones not included). */
export function code128Widths(text: string): number[] {
  const widths: number[] = [];
  for (const v of code128Values(text)) for (const w of PATTERNS[v]) widths.push(Number(w));
  return widths;
}

/** The value a 6-width (or the 7-width stop) group stands for, or -1. For the round-trip test. */
export function valueOfPattern(widths: number[]): number {
  return PATTERNS.indexOf(widths.join(''));
}

/** Escapes text for HTML and SVG markup. */
export const escapeXml = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * An SVG of the barcode: black bars on white, 10 modules of quiet zone each side, stretched to the box it is put in
 * (every bar keeps its share, so it scans at any print width). `heightMm` is the bar height. Answers null when the
 * text cannot be carried, so the label prints the text alone.
 */
export function code128Svg(text: string, heightMm: number): string | null {
  let widths: number[];
  try { widths = code128Widths(text); } catch { return null; }
  const quiet = 10;
  const total = widths.reduce((s, w) => s + w, 0) + quiet * 2;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, k) => {
    if (k % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="100"/>`);
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" preserveAspectRatio="none" `
    + `style="display:block;width:100%;height:${heightMm}mm" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(text)}">`
    + `<rect x="0" y="0" width="${total}" height="100" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}
