import React, { useState } from 'react';
import { api, searchAPI } from '../../services/api';
import { Page, PageHeader } from '../../components/erp';

/**
 * Barcodes & labels (WMS slice 4): per-variant barcode manager (vendor codes
 * validated with the GS1 check digit; internal restricted-range GTIN
 * allocation), universal scan tester, and ZPL/PDF label generation.
 */

const LabelsBarcodes: React.FC = () => {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // variation context
  const [sku, setSku] = useState('');
  const [variation, setVariation] = useState<any | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [packQty, setPackQty] = useState('');
  // scan tester
  const [scanQ, setScanQ] = useState('');
  const [scanResult, setScanResult] = useState<any | null>(null);
  // labels
  const [labelSize, setLabelSize] = useState<'4x6' | '2x1' | '50x25mm'>('50x25mm');

  const fail = (e: any) => setError(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const loadCodes = async (variationId: string) => {
    const res = await api.get('/wms/barcodes', { params: { variationId } });
    setCodes(res.data.rows ?? []);
  };

  const resolveSku = async () => {
    setError(''); setVariation(null); setCodes([]);
    const hits = await searchAPI.query('variation', sku, 1);
    const hit = hits[0];
    if (!hit) { setError(`No variation for "${sku}" (min 3 chars)`); return; }
    setVariation(hit);
    loadCodes(hit.id).catch(fail);
  };

  const addCode = async () => {
    if (!variation || !newCode.trim()) return;
    try {
      await api.post('/wms/barcodes', {
        variationId: variation.id, barcode: newCode.trim(), source: 'vendor',
        packQty: packQty ? parseInt(packQty) : null,
      });
      setNewCode(''); setPackQty(''); flash('Barcode added');
      loadCodes(variation.id);
    } catch (e) { fail(e); }
  };

  const allocateInternal = async () => {
    if (!variation) return;
    try {
      const res = await api.post('/wms/barcodes/allocate-internal', { variationId: variation.id });
      flash(`Internal GTIN ${res.data?.barcode ?? ''} allocated (never push to marketplaces)`);
      loadCodes(variation.id);
    } catch (e) { fail(e); }
  };

  const removeCode = async (id: string) => {
    try { await api.delete(`/wms/barcodes/${id}`); if (variation) loadCodes(variation.id); } catch (e) { fail(e); }
  };

  const runScan = async () => {
    setScanResult(null); setError('');
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(scanQ.trim())}`);
      setScanResult(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) setScanResult({ type: 'none' });
      else fail(e);
    }
  };

  const downloadLabels = async (format: 'zpl' | 'pdf') => {
    if (!variation) { setError('Resolve a SKU first.'); return; }
    try {
      const res = await api.post('/wms/labels',
        { type: 'product', ids: [variation.id], format, size: labelSize },
        { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `label-${variation.sublabel ?? 'product'}.${format === 'zpl' ? 'zpl' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { fail(e); }
  };

  return (
    <Page>
      <PageHeader
        title="Barcodes & Labels"
        description="GTINs are check-digit-validated on entry. Internal GTINs use the GS1 restricted range (20–29) and are never pushed to marketplace feeds. Labels print as ZPL (thermal, Code128) or PDF (EAN-13 bars for GTINs)."
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Variant barcodes</h2>
            <div className="flex gap-2">
              <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && resolveSku()}
                     className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm" />
              <button className="rounded bg-gray-900 px-3 py-1 text-sm text-white" onClick={resolveSku}>Load</button>
            </div>
            {variation && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="text-xs text-emerald-700">✓ {variation.label} ({variation.sublabel})</div>
                <table className="w-full text-xs">
                  <thead className="text-left text-gray-500">
                    <tr><th className="py-1">Barcode</th><th>Kind</th><th>Source</th><th>Pack</th><th></th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {codes.map((c: any) => (
                      <tr key={c.id}>
                        <td className="py-1 font-mono">{c.barcode}{c.is_internal ? ' 🔒' : ''}</td>
                        <td>{c.kind}</td><td>{c.source}</td><td>{c.pack_qty ?? '—'}</td>
                        <td><button className="rounded border px-1.5 text-red-600" onClick={() => removeCode(c.id)}>del</button></td>
                      </tr>
                    ))}
                    {codes.length === 0 && <tr><td colSpan={5} className="py-2 text-gray-500">No barcodes yet.</td></tr>}
                  </tbody>
                </table>
                <div className="flex flex-wrap gap-2">
                  <input placeholder="Add barcode (GTIN or code)" value={newCode}
                         onChange={(e) => setNewCode(e.target.value)}
                         className="w-52 rounded border px-2 py-1 font-mono text-xs" />
                  <input placeholder="Pack qty" type="number" min={1} value={packQty}
                         onChange={(e) => setPackQty(e.target.value)}
                         className="w-20 rounded border px-2 py-1 text-xs" />
                  <button className="rounded border px-2 py-1 text-xs" onClick={addCode}>Add</button>
                  <button className="rounded bg-gray-900 px-2 py-1 text-xs text-white" onClick={allocateInternal}>
                    Allocate internal GTIN
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Print labels</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select value={labelSize} onChange={(e) => setLabelSize(e.target.value as any)}
                      className="rounded border px-2 py-1">
                <option value="50x25mm">50×25 mm</option>
                <option value="2x1">2×1 in</option>
                <option value="4x6">4×6 in</option>
              </select>
              <button className="rounded bg-gray-900 px-3 py-1 text-white" onClick={() => downloadLabels('zpl')}>ZPL</button>
              <button className="rounded border px-3 py-1" onClick={() => downloadLabels('pdf')}>PDF</button>
              <span className="text-xs text-gray-500">for the loaded variant</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Scan tester</h2>
          <div className="flex gap-2">
            <input placeholder="Scan / type any code (barcode, SKU, bin, batch)" value={scanQ}
                   onChange={(e) => setScanQ(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && runScan()}
                   className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm" />
            <button className="rounded bg-gray-900 px-3 py-1 text-sm text-white" onClick={runScan}>Resolve</button>
          </div>
          {scanResult && (
            <pre className="mt-3 max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs">
              {scanResult.type === 'none' ? 'No match.' : JSON.stringify(scanResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </Page>
  );
};

export default LabelsBarcodes;
