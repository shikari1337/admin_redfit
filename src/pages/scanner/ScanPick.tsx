import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { scanFeedback } from './ScanInput';
import { scanPost } from './offlineQueue';

/** Pick flow: open lists → walk the serpentine route, thumb-sized Pick/Short. */
const ScanPick: React.FC = () => {
  const [lists, setLists] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/wms/pick-lists', { params: { status: 'open' } });
      setLists(res.data.rows ?? []);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, []);

  const open = async (id: string) => {
    const res = await api.get(`/wms/pick-lists/${id}`);
    setDetail(res.data);
  };

  const act = async (path: string) => {
    setMsg('');
    const r = await scanPost(path, {}, `Pick action ${path.split('/').slice(-2).join('/')}`);
    if (r.ok) {
      scanFeedback(true);
      if (r.queued) setMsg('⏳ queued — will sync when online');
      if (detail) open(detail.id);
      load();
    } else {
      scanFeedback(false);
      setMsg(r.error!);
    }
  };

  if (!detail) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Open pick lists</h2>
        {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
        {lists.length === 0 && <div className="rounded-lg bg-white p-4 text-gray-500 shadow-sm">Nothing to pick.</div>}
        {lists.map((r: any) => (
          <button key={r.id} onClick={() => open(r.id)}
                  className="block w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm active:border-gray-900">
            <div className="font-mono font-bold">{r.reference ?? r.id.slice(0, 8)}</div>
            <div className="text-sm text-gray-500">{r.done_count}/{r.item_count} items done</div>
          </button>
        ))}
      </div>
    );
  }

  const pending = detail.items?.filter((i: any) => i.status === 'pending') ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{detail.reference ?? detail.id.slice(0, 8)}</h2>
        <button onClick={() => setDetail(null)} className="rounded border-2 px-3 py-1 text-sm">Lists</button>
      </div>
      {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
      {detail.items?.map((i: any, idx: number) => (
        <div key={i.id}
             className={`rounded-xl border-2 bg-white p-4 shadow-sm ${i.status !== 'pending' ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-gray-400">#{idx + 1} on route</div>
              <div className="font-mono text-lg font-bold">{i.bin_code}</div>
              <div className="font-mono text-sm">{i.sku}</div>
              {i.batch_number && <div className="text-xs text-gray-500">{i.batch_number} · exp {i.expiry_date ?? '—'}</div>}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{i.qty_picked}/{i.qty}</div>
              {i.status === 'pending' ? (
                <div className="mt-1 flex gap-1">
                  <button onClick={() => act(`/wms/pick-lists/items/${i.id}/pick`)}
                          className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Pick</button>
                  <button onClick={() => act(`/wms/pick-lists/items/${i.id}/short`)}
                          className="rounded-lg border-2 px-3 py-2">Short</button>
                </div>
              ) : <span className="text-sm">{i.status}</span>}
            </div>
          </div>
        </div>
      ))}
      {pending.length === 0 && (
        <button onClick={() => act(`/wms/pick-lists/${detail.id}/complete`).then(() => setDetail(null))}
                className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700">
          Complete pick list
        </button>
      )}
    </div>
  );
};

export default ScanPick;
