/**
 * Product identifiers (PRODUCT-ID): the barcode (GTIN) a maker prints, the maker's part number
 * (MPN), or "this item has none". ONE place for the admin's identifier rules: the type list, the
 * instant check while typing, the editor draft, the write body (Design rule 4) and the status words.
 *
 * Reads (Design rule 5), per variation:
 *   identifiers: { codes: [{id, type, value, source, is_internal, pack_qty}], mpn, exists,
 *                  effective: {gtin, gtin_type, mpn, identifier_exists, status} }
 * Write (Design rule 4), per variation, only when the user changed it:
 *   identifiers: { codes: [{type, value, pack_qty}], mpn, exists }
 * Codes with source legacy or internal (WMS label codes) are never sent: the server keeps them.
 *
 * No GTIN helper existed in the admin or the suite kit (searched 15 Nov 2026); the server's kernel
 * `Gtin` stays the authority, and this check only answers early with the same GS1 check digit.
 */

export type IdentifierType = 'gtin13' | 'gtin12' | 'gtin8' | 'gtin14' | 'isbn' | 'code128' | 'mpn';
export type CodeType = Exclude<IdentifierType, 'mpn'>;
export type IdentifierStatus = 'gtin' | 'mpn' | 'none' | 'missing';

/** The fixed technical list of identifier types (GS1 and ISBN formats), in the order the select shows them. */
export const IDENTIFIER_TYPES: ReadonlyArray<{ value: IdentifierType; label: string }> = [
  { value: 'gtin13', label: 'Barcode EAN-13 (GTIN-13)' },
  { value: 'gtin12', label: 'UPC-A (GTIN-12)' },
  { value: 'gtin8', label: 'EAN-8 (GTIN-8)' },
  { value: 'gtin14', label: 'Case barcode (GTIN-14)' },
  { value: 'isbn', label: 'ISBN' },
  { value: 'code128', label: 'Store or supplier code (Code 128, not sent to Google)' },
  { value: 'mpn', label: 'Manufacturer part number (MPN)' },
];

const TYPE_VALUES = new Set<string>(IDENTIFIER_TYPES.map((t) => t.value));
const GTIN_LENGTH: Record<string, number> = { gtin13: 13, gtin12: 12, gtin8: 8, gtin14: 14 };
const SHORT_NAME: Record<string, string> = {
  gtin13: 'EAN-13', gtin12: 'UPC-A', gtin8: 'EAN-8', gtin14: 'GTIN-14', isbn: 'ISBN', code128: 'store code',
};

/** At most this many characters in a part number (Design rule 1). */
export const MPN_MAX = 70;

/* ── reads ─────────────────────────────────────────────────────────────── */

export interface IdentifierCodeRead {
  id?: string;
  type?: string;
  kind?: string;
  value?: string;
  barcode?: string;
  source?: string;
  is_internal?: boolean;
  pack_qty?: number | null;
}

export interface IdentifierEffective {
  gtin?: string | null;
  gtin_type?: string | null;
  mpn?: string | null;
  identifier_exists?: boolean | null;
  status?: string | null;
}

export interface IdentifiersRead {
  codes?: IdentifierCodeRead[];
  mpn?: string | null;
  exists?: boolean | null;
  effective?: IdentifierEffective | null;
}

/** A WMS label code (made in Labels and barcodes): shown, never edited or sent from the product form. */
export const isLabelCode = (c: IdentifierCodeRead): boolean =>
  c.source === 'legacy' || c.source === 'internal' || c.is_internal === true;

export const labelCodesOf = (read?: IdentifiersRead | null): IdentifierCodeRead[] =>
  (Array.isArray(read?.codes) ? read!.codes : []).filter((c) => c && typeof c === 'object' && isLabelCode(c));

export const codeValueOf = (c: IdentifierCodeRead): string => String(c.value ?? c.barcode ?? '');

/* ── the editor draft ──────────────────────────────────────────────────── */

export interface IdentifierRow {
  key: string;
  type: IdentifierType;
  value: string;
  /** Packs in a case: asked for a case barcode; kept as loaded for any other code. */
  packQty: string;
}

export interface IdentifiersDraft {
  rows: IdentifierRow[];
  /** false = "this item has no barcode or part number"; null = decide from the codes; true = it has one. */
  exists: boolean | null;
  /** `exists` as loaded, restored when the switch is turned off again. */
  loadedExists: boolean | null;
}

let rowSeq = 0;
export const newRowKey = (): string => `idrow-${Date.now().toString(36)}-${(rowSeq += 1)}`;

export const blankRow = (type: IdentifierType = 'gtin13'): IdentifierRow => ({ key: newRowKey(), type, value: '', packQty: '' });

const asType = (t: unknown, fallback: IdentifierType): IdentifierType => {
  const s = String(t ?? '').toLowerCase();
  return TYPE_VALUES.has(s) ? (s as IdentifierType) : fallback;
};

/** The editor's starting point from a variation's read (absent read = nothing saved yet). */
export function draftFromRead(read?: IdentifiersRead | null): IdentifiersDraft {
  const rows: IdentifierRow[] = [];
  for (const c of Array.isArray(read?.codes) ? read!.codes : []) {
    if (!c || typeof c !== 'object' || isLabelCode(c)) continue;
    rows.push({
      key: c.id ? `idrow-${c.id}` : newRowKey(),
      type: asType(c.type ?? c.kind, 'code128'),
      value: codeValueOf(c),
      packQty: c.pack_qty != null ? String(c.pack_qty) : '',
    });
  }
  const mpn = typeof read?.mpn === 'string' ? read.mpn.trim() : '';
  if (mpn) rows.push({ key: 'idrow-mpn', type: 'mpn', value: mpn, packQty: '' });
  const exists = read?.exists === true || read?.exists === false ? read.exists : null;
  return { rows, exists, loadedExists: exists };
}

/** The draft a variation shows: its edited one, else the one its read gives. */
export const draftOf = (v: { identifiers?: IdentifiersRead | null; identifiersDraft?: IdentifiersDraft | null }): IdentifiersDraft =>
  v.identifiersDraft ?? draftFromRead(v.identifiers);

/** "This item has no barcode or part number" on or off. */
export const withNoIdentifier = (d: IdentifiersDraft, on: boolean): IdentifiersDraft => ({
  ...d,
  exists: on ? false : (d.loadedExists === true ? true : null),
});

/* ── the instant check ─────────────────────────────────────────────────── */

const isGtinType = (t: IdentifierType) => t in GTIN_LENGTH;

/** What is sent for a typed value: GTIN and ISBN lose spaces and hyphens; other codes are trimmed. */
export function cleanValue(type: IdentifierType, value: string): string {
  if (isGtinType(type)) return value.replace(/[\s-]+/g, '');
  if (type === 'isbn') return value.replace(/[\s-]+/g, '').toUpperCase();
  return value.trim();
}

/** The GS1 check digit (mod 10, weights 3 and 1 from the right) of the digits before it. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10;
}

const gs1Valid = (digits: string) => gs1CheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);

/** ISBN-10: weights 10 to 1, mod 11; the last character may be X (ten). */
function isbn10Valid(code: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = code[i];
    const d = i === 9 && ch === 'X' ? 10 : Number(ch);
    sum += d * (10 - i);
  }
  return sum % 11 === 0;
}

export interface RowError { value?: string; packQty?: string }
export type RowErrors = Record<string, RowError>;

/**
 * The plain-words problem with one row, or nothing. `sku` refuses our own SKU as a part number;
 * `taken` maps a cleaned code to the other SKU of this product that already has it.
 */
export function checkRow(row: IdentifierRow, opts: { sku?: string; taken?: Map<string, string> } = {}): RowError | null {
  const v = cleanValue(row.type, row.value);
  const err: RowError = {};
  if (!v) err.value = 'Type the code, or remove this row.';
  else if (isGtinType(row.type)) {
    const n = GTIN_LENGTH[row.type];
    if (/\D/.test(v)) err.value = 'Use digits only.';
    else if (v.length !== n) err.value = `${SHORT_NAME[row.type]} codes have ${n} digits; this one has ${v.length}.`;
    else if (!gs1Valid(v)) err.value = 'The last digit does not match the rest. Check the number on the pack.';
  } else if (row.type === 'isbn') {
    if (v.length === 13) {
      if (/\D/.test(v)) err.value = 'Use digits only.';
      else if (!/^97[89]/.test(v)) err.value = 'An ISBN of 13 digits starts with 978 or 979.';
      else if (!gs1Valid(v)) err.value = 'The last digit does not match the rest. Check the ISBN on the book.';
    } else if (v.length === 10) {
      if (!/^\d{9}[\dX]$/.test(v)) err.value = 'Use digits only (the last one may be X).';
      else if (!isbn10Valid(v)) err.value = 'The last digit does not match the rest. Check the ISBN on the book.';
    } else if (/[^\dX]/.test(v)) err.value = 'Use digits only.';
    else err.value = `An ISBN has 10 or 13 digits; this one has ${v.length}.`;
  } else if (row.type === 'mpn') {
    if (v.length > MPN_MAX) err.value = `A part number has at most ${MPN_MAX} characters.`;
    else if (opts.sku && v.toUpperCase() === opts.sku.trim().toUpperCase()) {
      err.value = 'This is your own SKU. A part number is the one the maker gives the item.';
    }
  } else if (/[^\x20-\x7E]/.test(v)) err.value = 'Use letters, digits and plain symbols only.';
  if (!err.value && row.type !== 'mpn' && opts.taken?.has(v)) err.value = `${opts.taken.get(v)} already has this code.`;
  const pq = row.packQty.trim();
  if (row.type === 'gtin14' && !pq) err.packQty = 'Say how many packs are in this case.';
  else if (pq && !(/^\d+$/.test(pq) && Number(pq) > 0)) err.packQty = 'A whole number above zero.';
  return err.value || err.packQty ? err : null;
}

/** Every row's problem, keyed by row key (duplicates within the item and label codes included). */
export function draftErrors(d: IdentifiersDraft, opts: { sku?: string; taken?: Map<string, string>; labelValues?: string[] } = {}): RowErrors {
  const out: RowErrors = {};
  if (d.exists === false) return out;
  const seen = new Set<string>();
  const labels = new Set((opts.labelValues ?? []).map((x) => x.replace(/[\s-]+/g, '')));
  for (const row of d.rows) {
    const e = checkRow(row, opts) ?? {};
    const v = cleanValue(row.type, row.value);
    if (!e.value && v && row.type !== 'mpn') {
      if (seen.has(v)) e.value = 'This code is already in the list.';
      else if (labels.has(v)) e.value = 'This code is already on this item as a label code.';
      seen.add(v);
    }
    if (e.value || e.packQty) out[row.key] = e;
  }
  return out;
}

type VariationIds = { id: string; sku?: string; identifiers?: IdentifiersRead | null; identifiersDraft?: IdentifiersDraft | null };

/** Every code on a product's variations (typed or label), with the variations holding it. */
export function codeOwners(vars: VariationIds[]): Map<string, Array<{ id: string; sku: string }>> {
  const owners = new Map<string, Array<{ id: string; sku: string }>>();
  for (const v of vars) {
    const d = draftOf(v);
    const codes = new Set<string>();
    if (d.exists !== false) {
      for (const r of d.rows) if (r.type !== 'mpn') { const c = cleanValue(r.type, r.value); if (c) codes.add(c); }
    }
    for (const c of labelCodesOf(v.identifiers)) { const x = codeValueOf(c).replace(/[\s-]+/g, ''); if (x) codes.add(x); }
    for (const c of codes) owners.set(c, [...(owners.get(c) ?? []), { id: v.id, sku: v.sku || 'Another variant' }]);
  }
  return owners;
}

/** The codes another variation of the product already holds, for the variation `id`. */
export function takenFor(owners: Map<string, Array<{ id: string; sku: string }>>, id: string): Map<string, string> {
  const taken = new Map<string, string>();
  for (const [code, list] of owners) {
    const other = list.find((o) => o.id !== id);
    if (other) taken.set(code, other.sku);
  }
  return taken;
}

/* ── the write ─────────────────────────────────────────────────────────── */

export interface IdentifiersWrite {
  codes: Array<{ type: CodeType; value: string; pack_qty: number | null }>;
  mpn: string | null;
  exists: boolean | null;
}

/** The write body (Design rule 4) and which row each sent code came from (server errors are per index). */
export function toWrite(d: IdentifiersDraft): { body: IdentifiersWrite; codeKeys: string[]; mpnKey: string | null } {
  if (d.exists === false) return { body: { codes: [], mpn: null, exists: false }, codeKeys: [], mpnKey: null };
  const codes: IdentifiersWrite['codes'] = [];
  const codeKeys: string[] = [];
  let mpn: string | null = null;
  let mpnKey: string | null = null;
  for (const row of d.rows) {
    const value = cleanValue(row.type, row.value);
    if (row.type === 'mpn') {
      if (value && mpn === null) { mpn = value; mpnKey = row.key; }
      continue;
    }
    if (!value) continue;
    const pq = row.packQty.trim();
    codes.push({ type: row.type, value, pack_qty: /^\d+$/.test(pq) && Number(pq) > 0 ? Number(pq) : null });
    codeKeys.push(row.key);
  }
  return { body: { codes, mpn, exists: d.exists }, codeKeys, mpnKey };
}

/** True when the draft would write something other than what was loaded. */
export function draftChanged(read: IdentifiersRead | null | undefined, d: IdentifiersDraft | null | undefined): boolean {
  if (!d) return false;
  return JSON.stringify(toWrite(d).body) !== JSON.stringify(toWrite(draftFromRead(read)).body);
}

/* ── server errors ─────────────────────────────────────────────────────── */

/** Where the last write's codes came from, to put a server error back on its row. */
export interface WriteMap { codeKeys: string[]; mpnKey: string | null }

const FIELD_RE = /^(?:variations\[(\d+)\]\.)?identifiers(?:\.codes\[(\d+)\](?:\.(\w+))?|\.(\w+))?$/;

/**
 * The server's field errors (`identifiers.codes[1].value`, or `variations[3].identifiers.mpn` on a
 * product save) as row errors. `mapFor(variationIndex)` gives the WriteMap of that sent variation
 * (index undefined on the variation save). A message with no row lands under the key `_`.
 */
export function serverRowErrors(
  errors: Array<{ field?: string; msg?: string; message?: string }> | undefined,
  mapFor: (variationIndex: number | undefined) => WriteMap | undefined,
): Map<number | undefined, RowErrors> {
  const out = new Map<number | undefined, RowErrors>();
  for (const e of Array.isArray(errors) ? errors : []) {
    const m = FIELD_RE.exec(String(e?.field ?? ''));
    if (!m) continue;
    const vIdx = m[1] !== undefined ? Number(m[1]) : undefined;
    const map = mapFor(vIdx);
    const text = String(e.msg ?? e.message ?? 'Check this code.');
    const bucket = out.get(vIdx) ?? {};
    let key = '_';
    let field: keyof RowError = 'value';
    if (m[2] !== undefined && map) {
      key = map.codeKeys[Number(m[2])] ?? '_';
      if (m[3] === 'pack_qty') field = 'packQty';
    } else if (m[4] === 'mpn' && map?.mpnKey) key = map.mpnKey;
    if (key === '_') bucket._ = { value: bucket._?.value ? `${bucket._.value} ${text}` : text };
    else bucket[key] = { ...bucket[key], [field]: text };
    out.set(vIdx, bucket);
  }
  return out;
}

/* ── status words ──────────────────────────────────────────────────────── */

export const IDENTIFIER_STATUS_LABEL: Record<IdentifierStatus, string> = {
  gtin: 'GTIN',
  mpn: 'MPN only',
  none: 'No identifier',
  missing: 'Missing identifier',
};

export const statusOf = (s: unknown): IdentifierStatus | null =>
  s === 'gtin' || s === 'mpn' || s === 'none' || s === 'missing' ? s : null;

/** The saved "Google sees" line of a variation, or null when the server sends no status. */
export function googleSeesLine(eff?: IdentifierEffective | null): { text: string; tone: 'good' | 'info' | 'muted' | 'warn' } | null {
  const status = statusOf(eff?.status);
  if (!status) return null;
  if (status === 'gtin') {
    const t = SHORT_NAME[String(eff?.gtin_type ?? '')];
    return { text: `Google sees: GTIN ${eff?.gtin ?? ''}${t ? ` (${t})` : ''}`.trim(), tone: 'good' };
  }
  if (status === 'mpn') return { text: `Google sees: MPN only${eff?.mpn ? ` (${eff.mpn})` : ''}. Add the barcode if the pack has one.`, tone: 'info' };
  if (status === 'none') return { text: 'Google sees: No identifier. Google is told this item has no barcode or part number.', tone: 'muted' };
  return { text: 'Google sees: Missing identifier. Add the barcode printed on the pack, or say the item has none.', tone: 'warn' };
}

/** A code's type in plain words, for the read-only label codes. */
export const typeLabel = (t: unknown): string => IDENTIFIER_TYPES.find((x) => x.value === t)?.label ?? String(t ?? '');

/* ── product CSV import (Products page) ───────────────────────────────── */

/** `barcode_type` values the product CSV accepts (Design rule 8). */
export const CSV_BARCODE_TYPES: ReadonlyArray<IdentifierType> = ['gtin13', 'gtin12', 'gtin8', 'gtin14', 'isbn', 'code128', 'mpn'];

/** The import help for the four identifier columns (product CSV and catalogue workbook). */
export const IDENTIFIER_CSV_COLUMNS: ReadonlyArray<{ column: string; help: string }> = [
  { column: 'barcode', help: 'The code printed on the pack, for example 8901234567890.' },
  {
    column: 'barcode_type',
    help: `One of ${CSV_BARCODE_TYPES.join(', ')}. gtin13 is EAN-13, gtin12 is UPC-A, gtin8 is EAN-8, gtin14 is a case barcode, `
      + 'isbn is a book number, code128 is a store or supplier code (never sent to Google), mpn means the barcode column holds a part number. '
      + 'Left empty, the number of digits decides.',
  },
  { column: 'mpn', help: "The maker's part number, never your own SKU. At most 70 characters." },
  { column: 'no_identifier', help: 'yes when the item has no barcode and no part number, no when it has one, empty to decide from the codes.' },
];

export const IDENTIFIER_CSV_NOTE =
  "Fill them on variation rows. A row that fills any of the four replaces that variant's barcodes and part number; "
  + 'leave all four empty to keep what is saved. Label codes made in Labels and barcodes always stay. '
  + 'A case barcode (gtin14) needs the number of packs in the case, so add those in the product form.';

/**
 * A CSV row's `barcode`, `barcode_type`, `mpn`, `no_identifier` as the write body, or undefined
 * when all four are empty (the saved identifiers stay). A filled row REPLACES that option's barcode
 * and part number. Without a type the length decides (8, 12, 13, 14 digits), else a store code.
 */
export function identifiersFromCsv(row: Record<string, string>): IdentifiersWrite | undefined {
  const barcode = (row.barcode ?? '').trim();
  const type = (row.barcode_type ?? '').trim().toLowerCase();
  const mpnCell = (row.mpn ?? '').trim();
  const none = (row.no_identifier ?? '').trim().toLowerCase();
  if (!barcode && !mpnCell && !none) return undefined;
  const yes = ['yes', 'y', 'true', '1'].includes(none);
  const no = ['no', 'n', 'false', '0'].includes(none);
  if (yes) return { codes: [], mpn: null, exists: false };
  let mpn: string | null = mpnCell || null;
  const codes: IdentifiersWrite['codes'] = [];
  if (barcode) {
    if (type === 'mpn') mpn = mpn ?? barcode;
    else {
      const digits = barcode.replace(/[\s-]+/g, '');
      const byLength: Record<number, CodeType> = { 8: 'gtin8', 12: 'gtin12', 13: 'gtin13', 14: 'gtin14' };
      const t: CodeType = TYPE_VALUES.has(type) ? (type as CodeType) : (/^\d+$/.test(digits) && byLength[digits.length]) || 'code128';
      codes.push({ type: t, value: cleanValue(t, barcode), pack_qty: null });
    }
  }
  return { codes, mpn, exists: no ? true : null };
}
