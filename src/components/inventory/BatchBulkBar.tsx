import React, { useRef, useState } from 'react';
import { inventoryAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Btn, SectionCard } from '../erp';

/**
 * Bulk batch-wise inventory — the spreadsheet round-trip for stock that is held
 * as batches, each carrying its OWN printed MRP, mfg and expiry date.
 *
 * This is NOT the Inventory page's SKU sheet: that one has a single stock figure
 * and a single MRP per SKU, which cannot describe two batches of the same
 * medicine printed at different MRPs. The two files look alike at a glance, so
 * the backend refuses a sheet with no "Batch Number" column and says which
 * importer it belongs to instead of failing thousands of rows one by one.
 *
 * Safe by construction: an untouched export re-imports as a no-op — its Action
 * column reads "update" (metadata only) and its Quantity column is blank.
 */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ImportSummary {
  batches_created?: number;
  batches_updated?: number;
  units_added?: number;
  units_removed?: number;
  sku_mrp_updated?: number;
  processed?: number;
  skipped_blank_batch?: number;
  failed?: Array<{ ref: string; error: string }>;
}

const BatchBulkBar: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { hasPerm } = useAuth();
  // Mirrors the backend gates exactly: read for the two downloads,
  // inventory.adjust for the write.
  const canRead = hasPerm('inventory.read');
  const canImport = hasPerm('inventory.adjust');

  const [busy, setBusy] = useState<'' | 'template' | 'export' | 'import'>('');
  const [includeUnbatched, setIncludeUnbatched] = useState(false);
  const [blankRows, setBlankRows] = useState(1);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleTemplate = async () => {
    setError(''); setBusy('template');
    try { downloadBlob(await inventoryAPI.downloadBatchTemplate(), 'batch-inventory-template.xlsx'); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Could not download the template.'); }
    finally { setBusy(''); }
  };

  const handleExport = async () => {
    setError(''); setBusy('export');
    try {
      const blob = await inventoryAPI.exportBatches({ includeUnbatched, blankRowsPerSku: blankRows });
      downloadBlob(blob, `batch-inventory-${today}.xlsx`);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not export batches.');
    } finally { setBusy(''); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(''); setSummary(null); setBusy('import');
    try {
      const res = await inventoryAPI.importBatches(file);
      setSummary((res?.data ?? res) as ImportSummary);
      onImported?.();
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.message ?? 'Could not import the file.');
      // A pre-flight rejection (wrong sheet, no usable rows) still carries the
      // per-row reasons — showing them is the difference between "it failed"
      // and "row 14 has no SKU".
      if (Array.isArray(d?.errors) && d.errors.length) {
        setSummary({ failed: d.errors.map((x: any) => ({ ref: `Row ${x.row}`, error: x.error })) });
      }
    } finally { setBusy(''); }
  };

  if (!canRead) return null;

  const failed = summary?.failed ?? [];

  return (
    <SectionCard title="Batch-wise bulk update">
    <div className="space-y-3 text-sm">
      {/* Export FIRST. The sheet is only safe to fill in when it already carries
          the Variation IDs, the current batches and the catalogue prices to
          compare against — so the flow is numbered rather than left to guess. */}
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">1</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">Export what you have now</div>
            <p className="mt-0.5 text-gray-600">
              Every row arrives filled in with its Variation ID, current batch, quantity and the
              catalogue prices to compare against. Start here — a sheet built from scratch has to
              match SKUs by hand.
            </p>
            <label className="mt-2 flex items-start gap-2 text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={includeUnbatched}
                onChange={(e) => setIncludeUnbatched(e.target.checked)} />
              <span>
                Also include SKUs that have no batches yet
                <span className="block text-xs text-gray-500">
                  For a first batch load. Rows left with a blank batch number are skipped, so the
                  file is safe to re-import as-is.
                </span>
              </span>
            </label>
            {includeUnbatched && (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-gray-700">
                <span>Give each of those SKUs</span>
                <select className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={blankRows} onChange={(e) => setBlankRows(parseInt(e.target.value, 10) || 1)}>
                  {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>blank row(s)</span>
                <span className="w-full text-xs text-gray-500">
                  One product usually holds several batches at once. Pick how many empty rows you
                  want per SKU so you can enter each lot — its own quantity, prices and dates —
                  without copying rows by hand.
                </span>
              </label>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn variant="outline" onClick={handleExport} disabled={!!busy}>
                {busy === 'export' ? 'Exporting…' : '⬇ Export batches'}
              </Btn>
              <Btn variant="ghost" onClick={handleTemplate} disabled={!!busy}>
                {busy === 'template' ? 'Preparing…' : 'Blank template instead'}
              </Btn>
            </div>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">2</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">Fill it in</div>
            <p className="mt-0.5 text-gray-600">
              One row per SKU <span className="font-mono">×</span> batch. Each row carries its own{' '}
              <strong>Quantity</strong>, <strong>Batch MRP</strong> and{' '}
              <strong>Batch Selling Price</strong>. To hold several batches of one product, repeat
              the SKU on more rows with different <strong>Batch Numbers</strong>.
            </p>
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
              <div className="font-medium text-gray-700">How the price is decided</div>
              <div className="mt-1 text-gray-600">
                Batch Selling Price → Batch MRP → Catalogue Selling Price → Catalogue MRP.
                Leave the selling price blank and the batch sells at its own printed MRP.
                Nothing is ever worked out as a percentage.
              </div>
            </div>
            <p className="mt-2 text-gray-600">
              The <strong>Action</strong> column says what each row does —{' '}
              <span className="font-mono">update</span> (details only, the default),{' '}
              <span className="font-mono">receive</span> (new units in),{' '}
              <span className="font-mono">assign</span> (label stock you already hold) or{' '}
              <span className="font-mono">set</span> (a physical count). Re-importing an untouched
              export changes nothing. The full guide is on the file's Instructions sheet.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">3</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">Send it back</div>
            <p className="mt-0.5 text-gray-600">
              A bad row is reported on its own — the rows beside it still apply.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canImport ? (
                <Btn onClick={() => fileRef.current?.click()} disabled={!!busy}>
                  {busy === 'import' ? 'Importing…' : '⬆ Import filled sheet'}
                </Btn>
              ) : (
                <p className="text-xs text-gray-500">
                  You can export batches but not import — importing needs the “adjust inventory”
                  permission.
                </p>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
            </div>
          </div>
        </li>
      </ol>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>
      )}

      {summary && (summary.processed !== undefined || failed.length > 0) && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          {summary.processed !== undefined && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-gray-800">
              <span><strong>{summary.batches_created ?? 0}</strong> batch(es) created</span>
              <span><strong>{summary.batches_updated ?? 0}</strong> updated</span>
              {!!summary.units_added && <span className="text-green-700">+{summary.units_added} units</span>}
              {!!summary.units_removed && <span className="text-amber-700">−{summary.units_removed} units</span>}
              {!!summary.sku_mrp_updated && <span>{summary.sku_mrp_updated} catalogue MRP(s) raised</span>}
              {!!summary.skipped_blank_batch && (
                <span className="text-gray-500">{summary.skipped_blank_batch} row(s) skipped (no batch number)</span>
              )}
            </div>
          )}
          {failed.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-red-700">{failed.length} row(s) not applied:</p>
              <ul className="mt-1 max-h-44 overflow-auto text-xs text-red-700">
                {failed.slice(0, 100).map((f, i) => (
                  <li key={i} className="py-0.5">
                    <span className="font-mono">{f.ref}</span> — {f.error}
                  </li>
                ))}
              </ul>
              {failed.length > 100 && (
                <p className="mt-1 text-xs text-gray-500">…and {failed.length - 100} more.</p>
              )}
              <p className="mt-1 text-xs text-gray-600">
                Everything not listed here was applied — a bad row never rolls back the rest.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
    </SectionCard>
  );
};

export default BatchBulkBar;
