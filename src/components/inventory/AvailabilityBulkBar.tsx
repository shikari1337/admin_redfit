import React, { useRef, useState } from 'react';
import { inventoryAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Btn, SectionCard } from '../erp';

/**
 * Availability — the spreadsheet round-trip for WHO may buy a SKU and WHERE it
 * may be sold (staged migration 174, services/availability.ts on the backend):
 *   - B2B Only: wholesale accounts only — a bulk pack that a retail shopper must
 *     never see or buy, even in India;
 *   - Blocked / Allowed Countries: ISO-2 lists per SKU (or per whole product via
 *     the "Product …" columns); `*` = every country except India.
 * Blank cells leave the stored value unchanged; `none` clears a list — so an
 * untouched export re-imports as a no-op. The same rules hide the SKU from
 * listings, the product page and checkout for that viewer.
 */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

interface ImportSummary {
  processed?: number; b2bFlagsSet?: number; rulesWritten?: number; skipped?: number;
  failed?: Array<{ ref: string; error: string }>;
}

const AvailabilityBulkBar: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('inventory.read');
  const canImport = hasPerm('inventory.adjust');

  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'' | 'template' | 'export' | 'import'>('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleTemplate = async () => {
    setError(''); setBusy('template');
    try { downloadBlob(await inventoryAPI.downloadAvailabilityTemplate(), 'availability-template.xlsx'); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Could not download the template.'); }
    finally { setBusy(''); }
  };
  const handleExport = async () => {
    setError(''); setBusy('export');
    try {
      const blob = await inventoryAPI.exportAvailability({ search: search.trim() || undefined });
      downloadBlob(blob, `availability-${today}.xlsx`);
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Could not export the availability sheet.'); }
    finally { setBusy(''); }
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(''); setSummary(null); setBusy('import');
    try {
      const res = await inventoryAPI.importAvailability(file);
      setSummary((res?.data ?? res) as ImportSummary);
      onImported?.();
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.message ?? 'Could not import the file.');
      if (Array.isArray(d?.errors) && d.errors.length) setSummary({ failed: d.errors.map((x: any) => ({ ref: `Row ${x.row}`, error: x.error })) });
    } finally { setBusy(''); }
  };

  if (!canRead) return null;
  const failed = summary?.failed ?? [];

  return (
    <SectionCard title="Availability (B2B-only SKUs & country restrictions)">
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">
          Two facts per SKU. <strong>B2B Only</strong> = only wholesale accounts can see and buy it (bulk
          packs a retail shopper must not get, in India or abroad). <strong>Blocked / Allowed Countries</strong> =
          where it may be sold — not every country admits every homeopathic medicine. Type <code>*</code> in
          Blocked to stop a SKU leaving India. The <em>Product …</em> columns set the same for a whole
          product. Blank cells leave things unchanged; <code>none</code> clears a list.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-gray-700">
            <span className="block text-xs font-medium text-gray-500">Filter export (SKU or product name, optional)</span>
            <input className="mt-1 w-56 rounded-md border border-gray-300 px-2 py-1" placeholder="e.g. Arnica" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" onClick={handleExport} disabled={!!busy}>{busy === 'export' ? 'Exporting…' : '⬇ Export sheet'}</Btn>
            <Btn variant="ghost" onClick={handleTemplate} disabled={!!busy}>{busy === 'template' ? 'Preparing…' : 'Blank template'}</Btn>
            {canImport && (
              <>
                <Btn onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === 'import' ? 'Importing…' : '⬆ Import sheet'}</Btn>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Export first: every active SKU arrives with its Variation ID and what is currently set. A restricted
          SKU disappears from listings and the product page for that shopper, and checkout refuses it — so a
          retail customer never sees a B2B-only pack, and a country that does not allow a medicine never gets it.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        {summary && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="flex flex-wrap gap-4 text-gray-800">
              {summary.processed != null && <span>Rows applied: <strong>{summary.processed}</strong></span>}
              {summary.b2bFlagsSet != null && <span>B2B flags written: <strong>{summary.b2bFlagsSet}</strong></span>}
              {summary.rulesWritten != null && <span>Country rules written: <strong>{summary.rulesWritten}</strong></span>}
              {summary.skipped != null && <span>Skipped (nothing to apply): <strong>{summary.skipped}</strong></span>}
              {failed.length > 0 && <span className="text-red-700">Failed: <strong>{failed.length}</strong></span>}
            </div>
            {failed.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs text-red-700">
                {failed.slice(0, 200).map((f, i) => <li key={i}>{f.ref}: {f.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default AvailabilityBulkBar;
