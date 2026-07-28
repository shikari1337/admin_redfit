import React, { useState } from 'react';
import { api } from '../../services/api';
import ScanInput, { scanFeedback } from './ScanInput';
import { scanPost } from './offlineQueue';

/** Move flow: scan source bin → tap the stock row → qty → scan target bin. */
const ScanMove: React.FC = () => {
  const [from, setFrom] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reset = () => { setFrom(null); setRows([]); setSel(null); setQty('1'); };

  const onFromScan = async (code: string) => {
    setMsg(null);
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      if (res.data?.type !== 'bin') { scanFeedback(false); setMsg({ kind: 'err', text: `"${code}" is not a bin` }); return; }
      setFrom(res.data);
      const br = await api.get('/wms/stock', { params: { binId: res.data.location_id } });
      setRows(br.data.rows ?? []);
    } catch { scanFeedback(false); setMsg({ kind: 'err', text: `No bin matches "${code}"` }); }
  };

  const onToScan = async (code: string) => {
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      if (res.data?.type !== 'bin') { scanFeedback(false); setMsg({ kind: 'err', text: `"${code}" is not a bin` }); return; }
      const r = await scanPost('/wms/move', {
        variationId: sel.variation_id, qty: parseInt(qty) || 1,
        fromBinId: from.location_id, toBinId: res.data.location_id,
        batchId: sel.batch_id ?? null, reason: 'scanner move',
      }, `Move ${qty} × ${sel.sku}: ${from.code} → ${res.data.code}`);
      if (r.ok) {
        scanFeedback(true);
        setMsg({ kind: 'ok', text: `${r.queued ? '⏳ queued (offline):' : '✓'} ${qty} × ${sel.sku}: ${from.code} → ${res.data.code}` });
        reset();
      } else {
        scanFeedback(false);
        setMsg({ kind: 'err', text: r.error! });
      }
    } catch (e: any) {
      scanFeedback(false);
      setMsg({ kind: 'err', text: e?.response?.data?.message ?? e.message });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg px-4 py-3 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}
      {!from && (
        <>
          <h2 className="text-lg font-bold">1 · Scan the source bin</h2>
          <ScanInput placeholder="Scan source bin" onScan={onFromScan} />
        </>
      )}
      {from && !sel && (
        <>
          <h2 className="text-lg font-bold">2 · What moves out of <span className="font-mono">{from.code}</span>?</h2>
          {rows.length === 0 && <div className="rounded-lg bg-white p-4 text-gray-500 shadow-sm">Bin is empty.</div>}
          {rows.map((r: any, i: number) => (
            <button key={i} onClick={() => { setSel(r); setQty(String(r.qty)); }}
                    className="block w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm active:border-gray-900">
              <span className="font-mono font-bold">{r.sku}</span> ×{r.qty}
              {r.batch_number && <span className="text-sm text-gray-500"> · {r.batch_number}</span>}
            </button>
          ))}
          <button onClick={reset} className="w-full rounded-lg border-2 py-3">Back</button>
        </>
      )}
      {sel && (
        <>
          <h2 className="text-lg font-bold">3 · Qty, then scan the target bin</h2>
          <input type="number" min={1} max={sel.qty} value={qty} onChange={(e) => setQty(e.target.value)}
                 className="w-full rounded-lg border-2 px-3 py-3 text-center text-2xl font-bold" />
          <ScanInput placeholder="Scan target bin" autoFocus={false} onScan={onToScan} />
          <button onClick={() => setSel(null)} className="w-full rounded-lg border-2 py-3">Back</button>
        </>
      )}
    </div>
  );
};

export default ScanMove;
