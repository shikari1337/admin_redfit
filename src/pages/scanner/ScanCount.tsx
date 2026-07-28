import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { scanFeedback } from './ScanInput';
import { scanPost } from './offlineQueue';

/** Count flow: open cycle counts → big numeric entry per item (blind-aware). */
const ScanCount: React.FC = () => {
  const [counts, setCounts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/wms/counts', { params: { status: 'counting' } });
      setCounts(res.data.rows ?? []);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    const res = await api.get(`/wms/counts/${id}`);
    setDetail(res.data); setEntry({});
  };

  const save = async (item: any) => {
    const v = entry[item.id];
    if (v === undefined || v === '') return;
    setMsg('');
    const r = await scanPost(`/wms/counts/items/${item.id}`, { countedQty: parseInt(v) },
      `Count ${item.bin_code} ${item.sku} = ${v}`);
    if (r.ok) {
      scanFeedback(true);
      if (r.queued) setMsg('⏳ queued — will sync when online');
      open(detail.id);
    } else { scanFeedback(false); setMsg(r.error!); }
  };

  const review = async () => {
    setMsg('');
    try {
      await api.post(`/wms/counts/${detail.id}/review`, {});
      scanFeedback(true);
      setDetail(null); load();
    } catch (e: any) { scanFeedback(false); setMsg(e?.response?.data?.message ?? e.message); }
  };

  if (!detail) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Counts in progress</h2>
        {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
        {counts.length === 0 && (
          <div className="rounded-lg bg-white p-4 text-gray-500 shadow-sm">
            No open counts — a manager creates them in Cycle Counts.
          </div>
        )}
        {counts.map((r: any) => (
          <button key={r.id} onClick={() => open(r.id)}
                  className="block w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm active:border-gray-900">
            <div className="font-mono font-bold">{r.reference ?? r.id.slice(0, 8)}{r.blind ? ' 🙈' : ''}</div>
            <div className="text-sm text-gray-500">{r.counted_count}/{r.item_count} counted</div>
          </button>
        ))}
      </div>
    );
  }

  const remaining = detail.items?.filter((i: any) => i.counted_qty === null).length ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{detail.reference ?? detail.id.slice(0, 8)}{detail.blind ? ' 🙈' : ''}</h2>
        <button onClick={() => setDetail(null)} className="rounded border-2 px-3 py-1 text-sm">Counts</button>
      </div>
      {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
      {detail.items?.map((i: any) => (
        <div key={i.id} className="rounded-xl border-2 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-lg font-bold">{i.bin_code}</div>
              <div className="font-mono text-sm">{i.sku}</div>
              {i.batch_number && <div className="text-xs text-gray-500">{i.batch_number}</div>}
              {i.expected_qty !== null && <div className="text-xs text-gray-400">expected {i.expected_qty}</div>}
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={0} inputMode="numeric"
                     value={entry[i.id] ?? i.counted_qty ?? ''}
                     onChange={(e) => setEntry({ ...entry, [i.id]: e.target.value })}
                     className="w-20 rounded-lg border-2 px-2 py-3 text-center text-xl font-bold" />
              <button onClick={() => save(i)}
                      className="rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white">✓</button>
            </div>
          </div>
        </div>
      ))}
      {remaining === 0 && (
        <button onClick={review} className="w-full rounded-lg bg-blue-700 py-3 font-semibold text-white">
          Submit for review
        </button>
      )}
    </div>
  );
};

export default ScanCount;
