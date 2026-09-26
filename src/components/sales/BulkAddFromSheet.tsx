import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Download, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveBlob } from '@/lib/saveBlob';
import { salesAPI, type SheetResolvedLine } from '../../services/api';
import type { BasketLine } from './OrderLinesTable';

/**
 * ADD SIXTY LINES FROM THE SHEET THE CUSTOMER SENT.
 *
 * Numbered 1 → 2 → 3, the same shape as the inventory bulk bars
 * (`components/inventory/BatchBulkBar.tsx`), because a person who has used one
 * of them already knows how this works.
 *
 * The file is read by the SERVER (`POST /orders/manual/lines/from-sheet`), the
 * one workbook reader on this platform — so .xlsx and .csv behave identically
 * and the admin gains no parser of its own. It resolves and prices nothing:
 * the lines land in the basket and the normal server preview prices them.
 *
 * A SKU that matched nothing is LISTED with its spreadsheet row. It is never
 * silently dropped, and the panel stays open until the operator has read it.
 */

const TEMPLATE_HEADERS = ['SKU', 'Qty', 'Rate', 'Discount %'];

/** A four-column CSV every spreadsheet opens. Built here — no dependency, no round trip. */
function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(','),
    'SKU-EXAMPLE-1,2,,',
    'SKU-EXAMPLE-2,10,118.50,',
    'SKU-EXAMPLE-3,6,,7.5',
  ].join('\r\n');
  saveBlob(new Blob([`﻿${rows}`], { type: 'text/csv;charset=utf-8' }), 'order-lines-template.csv');
}

interface Props {
  /** Called with the resolved lines, ready to append to the basket. */
  onAdd: (lines: BasketLine[]) => void;
}

const BulkAddFromSheet: React.FC<Props> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    lines: SheetResolvedLine[];
    problems: Array<{ line: number; sku: string; reason: string }>;
    read: number; matched: number; headers: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Array<{ header: string; required: boolean; help: string }>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // The four columns and what each does come from the server, so this panel and
  // the importer can never describe the sheet differently.
  useEffect(() => {
    if (!open || columns.length) return;
    salesAPI.orderSheetColumns().then(setColumns).catch(() => setColumns([]));
  }, [open, columns.length]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await salesAPI.orderLinesFromSheet(file));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'That file could not be read.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const accept = () => {
    if (!result?.lines.length) return;
    onAdd(result.lines.map((l) => ({
      productId: l.productId,
      variationId: l.variationId,
      sku: l.sku,
      name: l.name,
      price: Number(l.price) || 0,
      mrp: l.mrp,
      stock: l.stock,
      attributes: l.attributes,
      quantity: l.quantity,
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : undefined,
      discountPercent: l.discountPercent != null ? String(l.discountPercent) : undefined,
      sheetLines: l.sheetLines,
    })));
    setResult(null); setOpen(false);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Add from Excel
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Add lines from a spreadsheet</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            One row per pack. Prices still come from the price book unless a row names its own.
          </p>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Close"
          onClick={() => { setOpen(false); setResult(null); setError(null); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        <li className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-xs font-semibold text-ink"><span className="text-ink-mute">1</span> Get the template</p>
          <Button type="button" size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3 w-3" /> Download template
          </Button>
        </li>
        <li className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-xs font-semibold text-ink"><span className="text-ink-mute">2</span> Fill it in</p>
          <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-soft">
            {(columns.length ? columns : TEMPLATE_HEADERS.map((h) => ({ header: h, required: h === 'SKU' || h === 'Qty', help: '' })))
              .map((c) => (
                <li key={c.header}>
                  <span className="font-medium text-ink">{c.header}</span>
                  {c.required ? '' : ' (optional)'}{c.help ? ` — ${c.help}` : ''}
                </li>
              ))}
          </ul>
        </li>
        <li className="rounded-md border border-line bg-surface p-2.5">
          <p className="text-xs font-semibold text-ink"><span className="text-ink-mute">3</span> Send it back</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            aria-label="Choose an order sheet"
            onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" size="sm" className="mt-1.5 h-7 text-xs" disabled={busy}
            onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Upload className="mr-1.5 h-3 w-3" />}
            {busy ? 'Reading…' : 'Choose file'}
          </Button>
          <p className="mt-1 text-[11px] text-ink-mute">.xlsx or .csv, up to 2,000 rows</p>
        </li>
      </ol>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-bad bg-bad-bg px-2.5 py-2 text-xs text-bad-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-line bg-surface p-2.5">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-good" />
            <span className="font-medium text-ink tabular-nums">{result.matched} line{result.matched === 1 ? '' : 's'} matched</span>
            <span className="text-ink-soft tabular-nums">of {result.read} row{result.read === 1 ? '' : 's'} read</span>
            {result.problems.length > 0 && (
              <span className="font-medium text-warn-ink tabular-nums">{result.problems.length} could not be used</span>
            )}
          </p>
          {result.problems.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-warn bg-warn-bg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-warn-ink">
                    <th className="px-2 py-1 font-semibold">Row</th>
                    <th className="px-2 py-1 font-semibold">SKU</th>
                    <th className="px-2 py-1 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {result.problems.map((p, i) => (
                    <tr key={`${p.line}-${i}`} className="border-t border-warn/30 text-warn-ink">
                      <td className="px-2 py-1 tabular-nums">{p.line}</td>
                      <td className="px-2 py-1 font-mono">{p.sku}</td>
                      <td className="px-2 py-1">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.matched === 0 && result.headers.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              The columns found were: {result.headers.join(' · ')}. A SKU column is what this needs.
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <Button type="button" size="sm" disabled={!result.matched} onClick={accept}>
              Add {result.matched} line{result.matched === 1 ? '' : 's'} to the order
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setResult(null)}>Choose a different file</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkAddFromSheet;
