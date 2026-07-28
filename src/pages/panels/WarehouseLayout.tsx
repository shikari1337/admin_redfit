import React, { useEffect, useMemo, useState } from 'react';
import { api, searchAPI } from '../../services/api';
import { Page, PageHeader, SelectInput } from '../../components/erp';
import { Warehouse } from 'lucide-react';

/**
 * WMS slice 1 — warehouse layout tree (zone→aisle→rack→shelf→bin), putaway
 * with scored suggestions, bin-to-bin move, find-stock. Capacity is re-checked
 * server-side at confirmation; suggestions are advisory.
 */

type Loc = {
  id: string; warehouse_id: string; parent_id: string | null;
  kind: 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin';
  code: string; name: string | null; status: string; pickable: boolean;
  flags: Record<string, boolean>; max_units: number | null;
  pick_sequence: number | null; current_units: number; sku_count: number;
};

const CHILD_KIND: Record<string, Loc['kind'] | null> = {
  zone: 'aisle', aisle: 'rack', rack: 'shelf', shelf: 'bin', bin: null,
};
const FLAG_OPTIONS = ['pick_face', 'bulk', 'quarantine', 'damaged', 'returns', 'cold_chain', 'hazmat', 'overflow'];

const WarehouseLayout: React.FC = () => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [whId, setWhId] = useState('');
  const [locs, setLocs] = useState<Loc[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [addUnder, setAddUnder] = useState<Loc | 'root' | null>(null);
  const [form, setForm] = useState({ code: '', name: '', maxUnits: '', pickSequence: '', flags: [] as string[] });
  const [selBin, setSelBin] = useState<Loc | null>(null);
  const [binRows, setBinRows] = useState<any[]>([]);
  const [findQ, setFindQ] = useState('');
  const [findRows, setFindRows] = useState<any[] | null>(null);
  const [replen, setReplen] = useState<any[] | null>(null);
  const [reslot, setReslot] = useState<any[] | null>(null);
  // putaway form
  const [pa, setPa] = useState({ sku: '', qty: '1' });
  const [paVar, setPaVar] = useState<any | null>(null);
  const [paSugg, setPaSugg] = useState<any | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});

  const fail = (e: any) => setError(e?.response?.data?.message ?? e.message);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/warehouses');
      const rows = res.data.warehouses ?? res.data.rows ?? res.data ?? [];
      setWarehouses(rows);
      if (!whId && rows[0]) setWhId(rows[0].id ?? rows[0]._id);
    } catch (e) { fail(e); }
  };
  const loadTree = async () => {
    if (!whId) return;
    try {
      setError('');
      const res = await api.get('/wms/locations', { params: { warehouseId: whId } });
      setLocs(res.data.rows ?? []);
      const rr = await api.get('/wms/replenishment', { params: { warehouseId: whId } });
      setReplen(rr.data.rows ?? []);
      const rs = await api.get('/wms/reslotting', { params: { warehouseId: whId } });
      setReslot(rs.data.rows ?? []);
    } catch (e) { fail(e); }
  };
  useEffect(() => { loadWarehouses(); }, []);
  useEffect(() => { loadTree(); setSelBin(null); }, [whId]);

  const children = useMemo(() => {
    const m = new Map<string | null, Loc[]>();
    for (const l of locs) {
      const key = l.parent_id ?? null;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return m;
  }, [locs]);
  const bins = useMemo(() => locs.filter((l) => l.kind === 'bin' && l.status === 'active'), [locs]);

  const submitAdd = async () => {
    const parent = addUnder === 'root' ? null : addUnder;
    const kind = parent ? CHILD_KIND[parent.kind] : 'zone';
    if (!kind || !form.code.trim()) return;
    try {
      await api.post('/wms/locations', {
        warehouseId: whId, parentId: parent?.id ?? null, kind,
        code: form.code.trim(), name: form.name.trim() || null,
        maxUnits: kind === 'bin' && form.maxUnits ? parseInt(form.maxUnits) : null,
        pickSequence: form.pickSequence ? parseInt(form.pickSequence) : null,
        flags: Object.fromEntries(form.flags.map((f) => [f, true])),
      });
      setAddUnder(null); setForm({ code: '', name: '', maxUnits: '', pickSequence: '', flags: [] });
      loadTree();
    } catch (e) { fail(e); }
  };

  const removeLoc = async (l: Loc) => {
    if (!window.confirm(`Delete ${l.kind} ${l.code}?`)) return;
    try { await api.delete(`/wms/locations/${l.id}`); loadTree(); } catch (e) { fail(e); }
  };
  const toggleBlock = async (l: Loc) => {
    try {
      await api.patch(`/wms/locations/${l.id}`, { status: l.status === 'active' ? 'blocked' : 'active' });
      loadTree();
    } catch (e) { fail(e); }
  };

  const openBin = async (l: Loc) => {
    setSelBin(l); setPaSugg(null);
    try {
      const res = await api.get('/wms/stock', { params: { binId: l.id } });
      setBinRows(res.data.rows ?? []);
    } catch (e) { fail(e); }
  };

  const runFind = async () => {
    try {
      const res = await api.get('/wms/stock', { params: { q: findQ } });
      setFindRows(res.data.rows ?? []);
    } catch (e) { fail(e); }
  };

  const lookupSku = async () => {
    setPaVar(null); setPaSugg(null); setError('');
    try {
      const hits = await searchAPI.query('variation', pa.sku, 1);
      const hit = hits[0];
      if (!hit) { setError(`No variation found for "${pa.sku}" (min 3 chars)`); return; }
      setPaVar(hit);
      const sres = await api.post('/wms/putaway/suggest', {
        warehouseId: whId, variationId: hit.id, qty: parseInt(pa.qty) || 1,
      });
      setPaSugg(sres.data);
    } catch (e) { fail(e); }
  };

  const confirmPutaway = async (binId: string) => {
    try {
      await api.post('/wms/putaway/confirm', {
        variationId: paVar.id ?? paVar._id, qty: parseInt(pa.qty) || 1, binId,
      });
      flash('Putaway confirmed'); setPaSugg(null); setPaVar(null); setPa({ sku: '', qty: '1' });
      loadTree();
    } catch (e) { fail(e); }
  };

  const moveRow = async (row: any) => {
    const toBinId = moveTo[row.location_id + row.variation_id];
    if (!toBinId || !selBin) return;
    const qty = parseInt(window.prompt(`Move how many? (max ${row.qty})`, String(row.qty)) ?? '');
    if (!qty || qty <= 0) return;
    try {
      await api.post('/wms/move', {
        variationId: row.variation_id, qty, fromBinId: selBin.id, toBinId,
        batchId: row.batch_id ?? null,
      });
      flash('Moved'); openBin(selBin); loadTree();
    } catch (e) { fail(e); }
  };

  const renderNode = (l: Loc, depth: number): React.ReactNode => (
    <React.Fragment key={l.id}>
      <div className="flex items-center gap-2 border-b py-1.5 text-sm hover:bg-gray-50"
           style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{l.kind}</span>
        <button className={`font-mono ${l.kind === 'bin' ? 'font-medium text-gray-900 hover:underline' : ''}`}
                onClick={() => l.kind === 'bin' && openBin(l)}>{l.code}</button>
        {l.name && <span className="text-gray-500">{l.name}</span>}
        {Object.keys(l.flags ?? {}).filter((k) => (l.flags as any)[k]).map((f) => (
          <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{f}</span>
        ))}
        {l.status !== 'active' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{l.status}</span>}
        {l.kind === 'bin' && (
          <span className="ml-auto mr-1 text-xs text-gray-500">
            {l.current_units}{l.max_units != null ? `/${l.max_units}` : ''} units · {l.sku_count} SKU
          </span>
        )}
        <span className={`${l.kind === 'bin' ? '' : 'ml-auto'} flex shrink-0 gap-1`}>
          {CHILD_KIND[l.kind] && (
            <button className="rounded border px-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={() => { setAddUnder(l); setForm({ code: `${l.code}-`, name: '', maxUnits: '', pickSequence: '', flags: [] }); }}>
              + {CHILD_KIND[l.kind]}
            </button>
          )}
          <button className="rounded border px-1.5 text-xs text-gray-600 hover:bg-gray-100" onClick={() => toggleBlock(l)}>
            {l.status === 'active' ? 'block' : 'unblock'}
          </button>
          <button className="rounded border px-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => removeLoc(l)}>del</button>
        </span>
      </div>
      {(children.get(l.id) ?? []).map((c) => renderNode(c, depth + 1))}
    </React.Fragment>
  );

  return (
    <Page>
      <PageHeader
        icon={Warehouse}
        title="Warehouse Layout"
        description="Zones → aisles → racks → shelves → bins. Putaway suggestions are scored (consolidation, restrictions, capacity, pick-face, velocity); capacity is re-checked at confirmation."
        actions={
          <SelectInput value={whId} onChange={(e) => setWhId(e.target.value)} className="min-w-[12rem]">
            {warehouses.map((w: any) => (
              <option key={w.id ?? w._id} value={w.id ?? w._id}>{w.name} ({w.code})</option>
            ))}
          </SelectInput>
        }
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* tree */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold text-gray-700">Locations</h2>
            <button className="rounded border px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    onClick={() => { setAddUnder('root'); setForm({ code: '', name: '', maxUnits: '', pickSequence: '', flags: [] }); }}>
              + zone
            </button>
          </div>
          <div className="max-h-[520px] overflow-y-auto px-2 py-1">
            {(children.get(null) ?? []).length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No locations yet — start by adding a zone (e.g. receiving, bulk, pick-face, quarantine).
              </div>
            )}
            {(children.get(null) ?? []).map((z) => renderNode(z, 0))}
          </div>
          {addUnder && (
            <div className="space-y-2 border-t bg-gray-50 px-4 py-3 text-sm">
              <div className="font-medium text-gray-700">
                New {addUnder === 'root' ? 'zone' : CHILD_KIND[addUnder.kind]}
                {addUnder !== 'root' && <> under <span className="font-mono">{addUnder.code}</span></>}
              </div>
              <div className="flex flex-wrap gap-2">
                <input placeholder="Code (unique)" value={form.code}
                       onChange={(e) => setForm({ ...form, code: e.target.value })}
                       className="w-48 rounded border px-2 py-1 font-mono" />
                <input placeholder="Name (optional)" value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })}
                       className="w-48 rounded border px-2 py-1" />
                {(addUnder === 'root' ? 'zone' : CHILD_KIND[addUnder.kind]) === 'bin' && (
                  <>
                    <input placeholder="Max units" type="number" value={form.maxUnits}
                           onChange={(e) => setForm({ ...form, maxUnits: e.target.value })}
                           className="w-28 rounded border px-2 py-1" />
                    <input placeholder="Pick seq" type="number" value={form.pickSequence}
                           onChange={(e) => setForm({ ...form, pickSequence: e.target.value })}
                           className="w-24 rounded border px-2 py-1" />
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {FLAG_OPTIONS.map((f) => (
                  <label key={f} className="flex items-center gap-1">
                    <input type="checkbox" checked={form.flags.includes(f)}
                           onChange={(e) => setForm({ ...form, flags: e.target.checked ? [...form.flags, f] : form.flags.filter((x) => x !== f) })} />
                    {f}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="rounded bg-gray-900 px-3 py-1 text-white" onClick={submitAdd}>Add</button>
                <button className="rounded border px-3 py-1" onClick={() => setAddUnder(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* right column: putaway / find / bin drawer */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Putaway</h2>
            <div className="flex gap-2">
              <input placeholder="SKU" value={pa.sku} onChange={(e) => setPa({ ...pa, sku: e.target.value })}
                     className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm" />
              <input type="number" min={1} value={pa.qty} onChange={(e) => setPa({ ...pa, qty: e.target.value })}
                     className="w-16 rounded border px-2 py-1 text-sm" />
              <button className="rounded bg-gray-900 px-3 py-1 text-sm text-white" onClick={lookupSku}>Suggest</button>
            </div>
            {paSugg && (
              <div className="mt-3 space-y-2 text-sm">
                {(paSugg.suggestions ?? []).length === 0 && (
                  <div className="text-gray-500">No compliant bin has capacity — add bins or free space.</div>
                )}
                {(paSugg.suggestions ?? []).map((s: any) => (
                  <div key={s.locationId} className="rounded border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">{s.code}</span>
                      <button className="rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700"
                              onClick={() => confirmPutaway(s.locationId)}>Put here</button>
                    </div>
                    <ul className="mt-1 list-inside list-disc text-xs text-gray-500">
                      {s.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Find stock</h2>
            <div className="flex gap-2">
              <input placeholder="SKU or bin code" value={findQ} onChange={(e) => setFindQ(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && runFind()}
                     className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm" />
              <button className="rounded bg-gray-900 px-3 py-1 text-sm text-white" onClick={runFind}>Find</button>
            </div>
            {findRows && (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {findRows.length === 0 && <div className="text-gray-500">Nothing in bins matches.</div>}
                {findRows.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between border-b py-1">
                    <span className="font-mono">{r.bin_code}</span>
                    <span>{r.sku} ×{r.qty}{r.batch_number ? ` · ${r.batch_number}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Occupancy heatmap</h2>
            {bins.length === 0 && <div className="text-sm text-gray-500">No bins yet.</div>}
            <div className="flex flex-wrap gap-1">
              {locs.filter((l) => l.kind === 'bin').map((b) => {
                const ratio = b.max_units ? b.current_units / b.max_units : null;
                const cls = b.status !== 'active' ? 'bg-gray-800 text-white'
                  : b.current_units === 0 ? 'bg-gray-100 text-gray-500'
                  : ratio === null ? 'bg-blue-100 text-blue-800'
                  : ratio >= 0.9 ? 'bg-red-200 text-red-900'
                  : ratio >= 0.6 ? 'bg-amber-200 text-amber-900'
                  : 'bg-green-200 text-green-900';
                return (
                  <button key={b.id} onClick={() => openBin(b)}
                    title={`${b.code}: ${b.current_units}${b.max_units != null ? `/${b.max_units}` : ''} units`}
                    className={`rounded px-1.5 py-1 font-mono text-[10px] ${cls}`}>
                    {b.code.split('-').pop()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              {locs.filter((l) => l.kind === 'bin' && l.current_units === 0).length} empty ·{' '}
              {locs.filter((l) => l.kind === 'bin' && l.max_units && l.current_units / l.max_units >= 0.9).length} nearly full ·
              grey = empty, blue = uncapped, dark = blocked
            </div>
          </div>

          {replen && replen.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Replenishment</h2>
              {replen.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-1.5 text-xs">
                  <span>
                    <span className="font-mono">{r.sku}</span>: {r.from_bin_code} → {r.to_bin_code}
                    <span className="text-gray-500"> ({r.total}/{r.min_units} min) ×{r.suggested_qty}</span>
                  </span>
                  <button className="rounded bg-gray-900 px-2 py-0.5 text-white"
                    onClick={async () => {
                      try {
                        await api.post('/wms/move', {
                          variationId: r.variation_id, qty: r.suggested_qty,
                          fromBinId: r.from_bin_id, toBinId: r.to_bin_id,
                          batchId: r.batch_id ?? null, reason: 'replenishment',
                        });
                        flash('Replenished'); loadTree();
                      } catch (e) { fail(e); }
                    }}>Apply</button>
                </div>
              ))}
            </div>
          )}

          {reslot && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Re-slotting</h2>
                <span className="text-[11px] text-gray-400">fast movers near the front, slow movers to bulk</span>
              </div>
              {reslot.length === 0 && (
                <div className="rounded bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
                  Nothing to improve right now — your fast movers are already well placed.
                </div>
              )}
              {reslot.map((r: any, i: number) => (
                <div key={i} className="border-b py-2 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      r.velocity_class === 'A' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>{r.velocity_class}</span>
                    <p className="flex-1 text-sm text-gray-700">{r.reason}</p>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      <span className="font-mono">{r.sku}</span>: {r.from_bin} → {r.to_bin}
                      <span className="text-gray-400"> ×{r.qty} · picked {r.picks_90d}× in 90d</span>
                    </span>
                    <button className="rounded bg-gray-900 px-2 py-0.5 text-white"
                      onClick={async () => {
                        try {
                          await api.post('/wms/move', {
                            variationId: r.variation_id, qty: r.qty,
                            fromBinId: r.from_bin_id, toBinId: r.to_bin_id,
                            batchId: r.batch_id ?? null, reason: 'reslotting',
                          });
                          flash('Re-slotted'); loadTree();
                        } catch (e) { fail(e); }
                      }}>Apply</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selBin && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Bin <span className="font-mono">{selBin.code}</span>
              </h2>
              {binRows.length === 0 && <div className="text-sm text-gray-500">Empty bin.</div>}
              {binRows.map((r: any, i: number) => (
                <div key={i} className="border-b py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-mono">{r.sku}</span>
                    <span>×{r.qty}{r.batch_number ? ` · ${r.batch_number} (exp ${r.expiry_date ?? '—'})` : ''}</span>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <select className="min-w-0 flex-1 rounded border px-1 py-0.5 text-xs"
                            value={moveTo[r.location_id + r.variation_id] ?? ''}
                            onChange={(e) => setMoveTo({ ...moveTo, [r.location_id + r.variation_id]: e.target.value })}>
                      <option value="">Move to…</option>
                      {bins.filter((b) => b.id !== selBin.id).map((b) => (
                        <option key={b.id} value={b.id}>{b.code}</option>
                      ))}
                    </select>
                    <button className="rounded border px-2 py-0.5 text-xs" onClick={() => moveRow(r)}>Move</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
};

export default WarehouseLayout;
