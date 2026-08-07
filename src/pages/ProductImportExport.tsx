import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, FileSpreadsheet, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { productsAPI } from '../services/api';

interface SheetPreview {
  sheetKey: string;
  fileSheet: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, any>[];
  canonicalColumns: string[];
  suggestedMapping: Record<string, string>;
}
interface PreviewResponse { sheets: SheetPreview[]; unmatchedSheets: string[]; }
interface SheetResult { created: number; updated: number; skipped: number; errors: string[]; }
interface ImportResponse { dryRun: boolean; sheets: Record<string, SheetResult>; totalErrors: number; }

const SHEET_LABELS: Record<string, string> = {
  products: 'Products', variations: 'Variations', aplus: 'A+ Content', contentBoxes: 'Content Boxes',
  specGroups: 'Spec Groups', brands: 'Brands', categories: 'Categories', tags: 'Tags',
  attributes: 'Attributes', attributeValues: 'Attribute Values',
};
const SKIP = '__skip__';

const ProductImportExport: React.FC = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  // mappings[sheetKey][canonicalColumn] = sourceHeader | SKIP
  const [mappings, setMappings] = useState<Record<string, Record<string, string>>>({});
  const [mode, setMode] = useState<'upsert' | 'create_only'>('upsert');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  type Entity = 'catalog' | 'brands' | 'categories' | 'attributes' | 'tags' | 'specgroups' | 'all';
  const download = async (kind: 'export' | 'template', entity: Entity = 'all') => {
    setBusy(kind === 'template' ? 'template' : `export:${entity}`); setError(null);
    try { await productsAPI.downloadWorkbook(kind, entity); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'Download failed'); }
    finally { setBusy(null); }
  };
  // Separate files per entity: products + their variations together; every other
  // schema (brands, categories, attributes, tags) as its own downloadable file.
  const ENTITY_EXPORTS: Array<{ entity: Entity; label: string }> = [
    { entity: 'brands', label: 'Brands' },
    { entity: 'categories', label: 'Categories' },
    { entity: 'attributes', label: 'Attributes' },
    { entity: 'tags', label: 'Tags' },
    { entity: 'specgroups', label: 'Spec Groups' },
  ];

  const onFile = async (f: File | null) => {
    setFile(f); setPreview(null); setResult(null); setError(null);
    if (!f) return;
    setBusy('preview');
    try {
      const pv: PreviewResponse = await productsAPI.previewWorkbook(f);
      setPreview(pv);
      const init: Record<string, Record<string, string>> = {};
      for (const s of pv.sheets) {
        init[s.sheetKey] = {};
        for (const col of s.canonicalColumns) init[s.sheetKey][col] = s.suggestedMapping[col] || SKIP;
      }
      setMappings(init);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not read that file');
    } finally { setBusy(null); }
  };

  const buildOptions = (dryRun: boolean) => {
    const mapping: Record<string, any> = {};
    for (const s of preview?.sheets ?? []) {
      const cols: Record<string, string> = {};
      const m = mappings[s.sheetKey] || {};
      for (const col of s.canonicalColumns) if (m[col] && m[col] !== SKIP) cols[col] = m[col];
      mapping[s.sheetKey] = { sheet: s.fileSheet, columns: cols };
    }
    return { mapping, mode, dryRun };
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'validate' : 'import'); setError(null); setResult(null);
    try {
      const res: ImportResponse = await productsAPI.importWorkbook(file, buildOptions(dryRun));
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Import failed');
    } finally { setBusy(null); }
  };

  const totals = useMemo(() => {
    if (!result) return null;
    let created = 0, updated = 0, skipped = 0;
    for (const r of Object.values(result.sheets)) { created += r.created; updated += r.updated; skipped += r.skipped; }
    return { created, updated, skipped };
  }, [result]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import / Export Catalog</h1>
          <p className="text-sm text-gray-500">One linked workbook — products, variations, A+ content, specs, brands, categories, tags & attributes.</p>
        </div>
      </div>

      {/* Export */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-red-600" />
          <div className="flex-1 min-w-[220px]">
            <p className="font-medium text-gray-900">Export</p>
            <p className="text-sm text-gray-500">
              Products &amp; their variations download as one file (each attribute gets its own column);
              every other schema exports separately.
            </p>
          </div>
          <Button variant="outline" onClick={() => download('template')} disabled={busy === 'template'}>
            {busy === 'template' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Blank template
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => download('export', 'catalog')} disabled={busy === 'export:catalog'} className="bg-red-600 hover:bg-red-700">
            {busy === 'export:catalog' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Products &amp; Variations
          </Button>
          <span className="text-xs text-gray-400 px-1">or a single schema:</span>
          {ENTITY_EXPORTS.map(({ entity, label }) => (
            <Button key={entity} variant="outline" size="sm" onClick={() => download('export', entity)} disabled={busy === `export:${entity}`}>
              {busy === `export:${entity}` ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
              {label}
            </Button>
          ))}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => download('export', 'all')} disabled={busy === 'export:all'} className="text-gray-500">
            {busy === 'export:all' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Everything in one file
          </Button>
        </div>
      </div>

      {/* Import: file picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-red-600" />
          <p className="font-medium text-gray-900">Import</p>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/40 transition-colors"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          {busy === 'preview'
            ? <span className="inline-flex items-center text-gray-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading workbook…</span>
            : file
              ? <span className="text-gray-800 font-medium">{file.name}</span>
              : <span className="text-gray-500">Drop an <b>.xlsx</b> workbook here, or click to choose. Column names don’t have to match — you’ll map them below.</span>}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Mapping */}
      {preview && (
        <div className="space-y-4">
          {preview.unmatchedSheets.length > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              Ignored sheets (not recognized): {preview.unmatchedSheets.join(', ')}
            </p>
          )}

          {preview.sheets.map((s) => (
            <div key={s.sheetKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200">
                <Table2 className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-900">{SHEET_LABELS[s.sheetKey] || s.sheetKey}</span>
                <span className="text-xs text-gray-500">from “{s.fileSheet}” · {s.rowCount} row(s)</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {s.canonicalColumns.map((col) => {
                  const val = mappings[s.sheetKey]?.[col] ?? SKIP;
                  const auto = s.suggestedMapping[col];
                  return (
                    <label key={col} className="text-sm">
                      <span className="block text-gray-700 font-medium mb-1">
                        {col}{auto ? '' : <span className="ml-1 text-xs text-gray-400">(unmapped)</span>}
                      </span>
                      <select
                        value={val}
                        onChange={(e) => setMappings((prev) => ({
                          ...prev, [s.sheetKey]: { ...prev[s.sheetKey], [col]: e.target.value },
                        }))}
                        className={`w-full px-2 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-red-500 ${val === SKIP ? 'border-gray-200 text-gray-400' : 'border-gray-300'}`}
                      >
                        <option value={SKIP}>— skip —</option>
                        {s.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-700 flex items-center gap-2">
              Mode:
              <select value={mode} onChange={(e) => setMode(e.target.value as any)}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm">
                <option value="upsert">Create &amp; update (upsert)</option>
                <option value="create_only">Create new only</option>
              </select>
            </label>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => run(true)} disabled={!!busy}>
              {busy === 'validate' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Validate (dry run)
            </Button>
            <Button onClick={() => run(false)} disabled={!!busy} className="bg-red-600 hover:bg-red-700">
              {busy === 'import' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Import now
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className={`rounded-xl border p-5 ${result.totalErrors ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
          <div className="flex items-center gap-2 mb-3">
            {result.totalErrors
              ? <AlertTriangle className="h-5 w-5 text-amber-600" />
              : <CheckCircle2 className="h-5 w-5 text-green-600" />}
            <p className="font-semibold text-gray-900">
              {result.dryRun ? 'Validation complete (nothing written)' : 'Import complete'}
              {totals && <span className="ml-2 text-sm font-normal text-gray-600">
                {totals.created} created · {totals.updated} updated · {totals.skipped} skipped · {result.totalErrors} error(s)
              </span>}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-6">Sheet</th><th className="py-1 pr-6">Created</th>
                  <th className="py-1 pr-6">Updated</th><th className="py-1 pr-6">Skipped</th><th className="py-1">Errors</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.sheets).map(([key, r]) => (
                  <tr key={key} className="border-t border-black/5">
                    <td className="py-1.5 pr-6 font-medium text-gray-800">{SHEET_LABELS[key] || key}</td>
                    <td className="py-1.5 pr-6">{r.created}</td>
                    <td className="py-1.5 pr-6">{r.updated}</td>
                    <td className="py-1.5 pr-6">{r.skipped}</td>
                    <td className="py-1.5">
                      {r.errors.length === 0 ? <span className="text-gray-400">—</span> : (
                        <details>
                          <summary className="cursor-pointer text-amber-700">{r.errors.length} error(s)</summary>
                          <ul className="mt-1 list-disc pl-5 text-amber-800 space-y-0.5">
                            {r.errors.slice(0, 15).map((e, i) => <li key={i}>{e}</li>)}
                            {r.errors.length > 15 && <li>…and {r.errors.length - 15} more</li>}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductImportExport;
