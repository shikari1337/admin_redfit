import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import ScanInput, { scanFeedback } from './ScanInput';
import { scanPost } from './offlineQueue';

/**
 * Putaway flow: scan SKU/barcode → qty → scored bin suggestions → scan (or
 * tap) the bin → confirmed. Capacity is re-checked server-side at confirm.
 */
const ScanPutaway: React.FC = () => {
  const [step, setStep] = useState<'item' | 'qty' | 'bin'>('item');
  const [item, setItem] = useState<any | null>(null);
  const [qty, setQty] = useState('1');
  const [warehouseId, setWarehouseId] = useState('');
  const [sugg, setSugg] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    api.get('/warehouses').then((res) => {
      const rows = res.data.warehouses ?? res.data.rows ?? res.data ?? [];
      if (rows[0]) setWarehouseId(rows[0].id ?? rows[0]._id);
    }).catch(() => {});
  }, []);

  const reset = () => { setStep('item'); setItem(null); setQty('1'); setSugg(null); };

  const onItemScan = async (code: string) => {
    setMsg(null);
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      if (res.data?.type !== 'variation') {
        scanFeedback(false);
        setMsg({ kind: 'err', text: `"${code}" is a ${res.data?.type ?? 'mystery'} — scan a product` });
        return;
      }
      setItem(res.data); setStep('qty');
    } catch {
      scanFeedback(false);
      setMsg({ kind: 'err', text: `No product matches "${code}"` });
    }
  };

  const fetchSuggestions = async () => {
    setMsg(null);
    try {
      const res = await api.post('/wms/putaway/suggest', {
        warehouseId, variationId: item.variation_id, qty: parseInt(qty) || 1,
      });
      setSugg(res.data); setStep('bin');
    } catch (e: any) { setMsg({ kind: 'err', text: e?.response?.data?.message ?? e.message }); }
  };

  const confirmInto = async (binId: string, binCode: string) => {
    const r = await scanPost('/wms/putaway/confirm',
      { variationId: item.variation_id, qty: parseInt(qty) || 1, binId },
      `Putaway ${qty} × ${item.sku} → ${binCode}`);
    if (r.ok) {
      scanFeedback(true);
      setMsg({ kind: 'ok', text: r.queued ? `⏳ queued: ${qty} × ${item.sku} → ${binCode} (offline)` : `✓ ${qty} × ${item.sku} → ${binCode}` });
      reset();
    } else {
      scanFeedback(false);
      setMsg({ kind: 'err', text: r.error! });
    }
  };

  const onBinScan = async (code: string) => {
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      if (res.data?.type !== 'bin') {
        scanFeedback(false);
        setMsg({ kind: 'err', text: `"${code}" is not a bin` });
        return;
      }
      confirmInto(res.data.location_id, res.data.code);
    } catch {
      scanFeedback(false);
      setMsg({ kind: 'err', text: `No bin matches "${code}"` });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg px-4 py-3 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}
      {step === 'item' && (
        <>
          <h2 className="text-lg font-bold">1 · Scan the product</h2>
          <ScanInput placeholder="Scan product barcode / SKU" onScan={onItemScan} />
        </>
      )}
      {step === 'qty' && item && (
        <>
          <h2 className="text-lg font-bold">2 · Quantity</h2>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="font-bold">{item.product_name}</div>
            <div className="font-mono text-sm text-gray-600">{item.sku}</div>
          </div>
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
                 className="w-full rounded-lg border-2 px-3 py-3 text-center text-2xl font-bold" />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 rounded-lg border-2 py-3">Back</button>
            <button onClick={fetchSuggestions} className="flex-[2] rounded-lg bg-gray-900 py-3 font-semibold text-white">
              Suggest bins
            </button>
          </div>
        </>
      )}
      {step === 'bin' && (
        <>
          <h2 className="text-lg font-bold">3 · Scan the bin to confirm</h2>
          <ScanInput placeholder="Scan bin barcode / code" onScan={onBinScan} />
          {(sugg?.suggestions ?? []).length === 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
              No compliant bin has capacity — scan any active bin or free space first.
            </div>
          )}
          {(sugg?.suggestions ?? []).map((s: any) => (
            <button key={s.locationId} onClick={() => confirmInto(s.locationId, s.code)}
                    className="block w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm active:border-gray-900">
              <div className="font-mono text-lg font-bold">{s.code}</div>
              <ul className="mt-1 list-inside list-disc text-xs text-gray-500">
                {s.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </button>
          ))}
          <button onClick={reset} className="w-full rounded-lg border-2 py-3">Cancel</button>
        </>
      )}
    </div>
  );
};

export default ScanPutaway;
