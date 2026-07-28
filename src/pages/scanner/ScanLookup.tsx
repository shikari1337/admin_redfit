import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../../services/api';
import ScanInput, { scanFeedback } from './ScanInput';

/** Scan anything — barcode, SKU, bin code, batch number — and see what it is. */
const ScanLookup: React.FC = () => {
  const [result, setResult] = useState<any | null>(null);
  const [miss, setMiss] = useState('');
  const [binRows, setBinRows] = useState<any[] | null>(null);

  const onScan = async (code: string) => {
    setResult(null); setMiss(''); setBinRows(null);
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      const hit = res.data;
      setResult(hit);
      if (hit?.type === 'bin' && hit.location_id) {
        const br = await api.get('/wms/stock', { params: { binId: hit.location_id } });
        setBinRows(br.data.rows ?? []);
      }
    } catch (e: any) {
      scanFeedback(false);
      setMiss(e?.response?.status === 404 ? `Nothing matches "${code}"` : (e?.response?.data?.message ?? e.message));
    }
  };

  return (
    <div className="space-y-4">
      <ScanInput placeholder="Scan barcode / SKU / bin / batch" onScan={onScan} />
      {miss && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{miss}</div>}
      {result?.type === 'variation' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-400">Product · matched by {result.matchedBy}</div>
          <div className="mt-1 text-lg font-bold">{result.product_name}</div>
          <div className="font-mono text-sm text-gray-600">{result.sku}</div>
          <div className="mt-2 text-sm">Stock: <b>{result.legacy_stock}</b>{result.pack_qty ? ` · pack of ${result.pack_qty}` : ''}</div>
          {result.is_internal && <div className="mt-1 flex items-center gap-1 text-xs text-amber-700"><Lock className="h-3 w-3" /> internal barcode — not for marketplaces</div>}
        </div>
      )}
      {result?.type === 'bin' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-400">Bin</div>
          <div className="mt-1 font-mono text-lg font-bold">{result.code}</div>
          <div className="text-sm">status <b>{result.status}</b> · {result.units} unit(s)</div>
          {binRows && (
            <div className="mt-2 divide-y text-sm">
              {binRows.length === 0 && <div className="py-1 text-gray-500">Empty bin.</div>}
              {binRows.map((r: any, i: number) => (
                <div key={i} className="flex justify-between py-1">
                  <span className="font-mono">{r.sku}</span>
                  <span>×{r.qty}{r.batch_number ? ` · ${r.batch_number}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {result?.type === 'serial' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-400">Serial number</div>
          <div className="mt-1 font-mono text-lg font-bold">{result.serial_no}</div>
          <div className="text-sm">
            {result.sku ?? ''} · status <b className="capitalize">{String(result.status ?? '').replace('_', ' ')}</b>
          </div>
          {result.summary && <div className="mt-2 text-sm text-gray-600">{result.summary}</div>}
        </div>
      )}
      {result?.type === 'batch' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-400">Batch</div>
          <div className="mt-1 font-mono text-lg font-bold">{result.batch_number}</div>
          <div className="text-sm">{result.sku} · {result.qty_on_hand} on hand · exp {result.expiry_date ?? '—'} · {result.status}</div>
        </div>
      )}
    </div>
  );
};

export default ScanLookup;
