import { inrMinor } from '@/components/erp/Money';

/**
 * THE client-side CSV path for the admin.
 *
 * One helper so every Books/list/report screen that builds a CSV *in the browser*
 * (from rows it already holds) escapes, formats money, and downloads the file the
 * same way — RFC-4180 quoting, CRLF line endings, a UTF-8 BOM so Excel reads ₹ /
 * Devanagari / embedded commas correctly.
 *
 * NOTE: report pages whose numbers are generated server-side keep using the
 * server blob path (`api.get(path,{params:{...,format:'csv'},responseType:'blob'})`
 * — surfaced here through `ExportMenu`'s `serverExports`). Use `toCsv`/`downloadCsv`
 * only for CSVs assembled from client-held rows.
 */

/** A single exported column. `format` wins; else `money` renders the raw value (minor units) as ₹. */
export type CsvColumn<T> = {
  /** Property to read from each row (or any string key). Ignored when `format` is given. */
  key: keyof T | string;
  /** Human header for this column. */
  label: string;
  /** Custom cell renderer — takes the whole row, returns the printable value. */
  format?: (row: T) => string | number | null | undefined;
  /** When true (and no `format`), treat the raw value as **minor units** and render via `inrMinor`. */
  money?: boolean;
};

/** UTF-8 byte-order mark — makes Excel open the file as UTF-8 (₹/Devanagari survive). */
const BOM = '﻿';

/** RFC-4180 escape one cell: quote when it holds a comma / quote / CR / LF; double embedded quotes. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Resolve the printable value for one column of one row. */
function resolveCell<T>(col: CsvColumn<T>, row: T): unknown {
  if (col.format) return col.format(row);
  const raw = (row as Record<string, unknown>)[col.key as string];
  if (col.money) return inrMinor(raw as number | string | null | undefined);
  return raw;
}

/** Serialize rows to an RFC-4180 CSV string (CRLF line endings, quoted as needed). No BOM. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(resolveCell(c, row))).join(','));
  return [header, ...body].join('\r\n');
}

/**
 * Build the CSV from client-held rows and trigger a browser download.
 * Prepends a UTF-8 BOM so Excel keeps ₹/Unicode intact. Appends `.csv` if missing.
 */
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
