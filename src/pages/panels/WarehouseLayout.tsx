import React, { useEffect, useMemo, useState } from 'react';
import { api, searchAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Page, PageHeader, SelectInput, TextInput, Btn, StatCard, StatGrid } from '../../components/erp';
import { Warehouse, Boxes, Layers, Ruler, AlertTriangle } from 'lucide-react';
import LocationEditor, { type EditorTarget, type LocationRow } from '../../components/inventory/LocationEditor';

/**
 * WMS slice 1 — warehouse layout tree (zone→aisle→rack→shelf→bin), putaway
 * with scored suggestions, bin-to-bin move, find-stock. Capacity is re-checked
 * server-side at confirmation; suggestions are advisory.
 */

type Loc = LocationRow;

const CHILD_KIND: Record<string, Loc['kind'] | null> = {
  zone: 'aisle', aisle: 'rack', rack: 'shelf', shelf: 'bin', bin: null,
};

const num = (v: any) => (v == null || v === '' ? 0 : Number(v));
const kg = (g: any) => `${(num(g) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`;
const litres = (ml: any) => `${(num(ml) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;

/** One utilisation bar. Null capacity = no limit, which is not 0% — it is "n/a". */
const Meter: React.FC<{ label: string; used: number; max: number | null; fmt: (n: any) => string }> =
  ({ label, used, max, fmt }) => {
    if (max == null) return null;
    const pct = Math.min(1, max > 0 ? used / max : 0);
    const tone = pct >= 1 ? 'bg-red-500' : pct >= 0.85 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div className="flex items-center gap-1.5" title={`${label}: ${fmt(used)} of ${fmt(max)}`}>
        <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
          <span className={`block h-full ${tone}`} style={{ width: `${Math.round(pct * 100)}%` }} />
        </span>
        <span className="whitespace-nowrap text-[10px] tabular-nums text-gray-500">
          {fmt(used)}/{fmt(max)}
        </span>
      </div>
    );
  };

const WarehouseLayout: React.FC = () => {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [whId, setWhId] = useState('');
  const [locs, setLocs] = useState<Loc[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [treeFilter, setTreeFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  const { hasPerm } = useAuth();
  // Mirrors the backend exactly: every write route here is inventory.adjust.
  const canEdit = hasPerm('inventory.adjust');

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

  const editorApi = {
    create: (body: any) => api.post('/wms/locations', body),
    update: (id: string, body: any) => api.patch(`/wms/locations/${id}`, body),
    generate: (body: any) => api.post('/wms/locations/generate', body).then((r) => r.data),
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

  // A node is visible when it, or anything under it, matches the filter — so
  // filtering a 500-bin warehouse never orphans a bin from its zone.
  const matchIds = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    if (!q) return null;
    const hit = new Set<string>();
    const byId = new Map(locs.map((l) => [l.id, l]));
    for (const l of locs) {
      if (![l.code, l.name].some((x) => String(x ?? '').toLowerCase().includes(q))) continue;
      let cur: Loc | undefined = l;
      while (cur) { hit.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    }
    return hit;
  }, [locs, treeFilter]);

  const rollup = useMemo(() => {
    const bins = locs.filter((l) => l.kind === 'bin');
    const capped = bins.filter((b) => b.max_units != null || b.max_weight_g != null || b.max_volume_ml != null);
    const full = capped.filter((b) => {
      const u = b.max_units != null && num(b.current_units) >= num(b.max_units);
      const v = b.max_volume_ml != null && num(b.used_volume_ml) >= num(b.max_volume_ml);
      const w = b.max_weight_g != null && num(b.used_weight_g) >= num(b.max_weight_g);
      return u || v || w;
    });
    return {
      locations: locs.length, bins: bins.length, capped: capped.length, full: full.length,
      units: bins.reduce((n, b) => n + num(b.current_units), 0),
      unsized: bins.reduce((n, b) => n + num(b.unsized_units), 0),
      blocked: locs.filter((l) => l.status !== 'active').length,
    };
  }, [locs]);

  const renderNode = (l: Loc, depth: number): React.ReactNode => {
    if (matchIds && !matchIds.has(l.id)) return null;
    const kids = children.get(l.id) ?? [];
    const isCollapsed = collapsed[l.id] && !matchIds;
    const flagList = Object.keys(l.flags ?? {}).filter((k) => (l.flags as any)[k]);
    return (
      <React.Fragment key={l.id}>
        <div className="flex items-center gap-2 border-b border-gray-100 py-1.5 text-sm hover:bg-gray-50"
             style={{ paddingLeft: `${depth * 18 + 8}px` }}>
          <button
            className={`w-4 shrink-0 text-gray-400 ${kids.length ? 'hover:text-gray-700' : 'invisible'}`}
            onClick={() => setCollapsed((c) => ({ ...c, [l.id]: !c[l.id] }))}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            {isCollapsed ? '\u25b8' : '\u25be'}
          </button>
          <span className="w-11 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{l.kind}</span>
          <button className={`font-mono ${l.kind === 'bin' ? 'font-medium text-gray-900 hover:underline' : 'text-gray-700'}`}
                  onClick={() => (l.kind === 'bin' ? openBin(l) : setCollapsed((c) => ({ ...c, [l.id]: !c[l.id] })))}>
            {l.code}
          </button>
          {l.name && <span className="truncate text-gray-500">{l.name}</span>}
          {flagList.map((f) => (
            <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{f.replace(/_/g, ' ')}</span>
          ))}
          {l.status !== 'active' && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{l.status}</span>
          )}

          <span className="ml-auto flex shrink-0 items-center gap-3">
            {l.kind === 'bin' ? (
              <span className="flex items-center gap-2.5">
                <Meter label="units" used={num(l.current_units)} max={l.max_units == null ? null : num(l.max_units)} fmt={(n) => String(n)} />
                <Meter label="vol" used={num(l.used_volume_ml)} max={l.max_volume_ml == null ? null : num(l.max_volume_ml)} fmt={litres} />
                <Meter label="wt" used={num(l.used_weight_g)} max={l.max_weight_g == null ? null : num(l.max_weight_g)} fmt={kg} />
                {l.max_units == null && l.max_volume_ml == null && l.max_weight_g == null && (
                  <span className="text-[10px] text-gray-400">no limit set</span>
                )}
                {num(l.unsized_units) > 0 && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
                        title="These units have no pack size on record, so volume and weight here are a floor, not a total.">
                    {l.unsized_units} unsized
                  </span>
                )}
                <span className="whitespace-nowrap text-[11px] text-gray-500">{l.sku_count} SKU</span>
              </span>
            ) : (
              <span className="whitespace-nowrap text-[11px] text-gray-400">
                {num(l.descendant_bins)} bin{num(l.descendant_bins) === 1 ? '' : 's'}
              </span>
            )}
            <span className="flex gap-1">
              {canEdit && CHILD_KIND[l.kind] && (
                <>
                  <button className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-100"
                          onClick={() => setEditor({ mode: 'create', kind: CHILD_KIND[l.kind]!, parent: l })}>
                    + {CHILD_KIND[l.kind]}
                  </button>
                  <button className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-100"
                          title={`Create many ${CHILD_KIND[l.kind]}s at once`}
                          onClick={() => setEditor({ mode: 'generate', kind: CHILD_KIND[l.kind]!, parent: l })}>
                    ++
                  </button>
                </>
              )}
              <button className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-100"
                      onClick={() => setEditor({ mode: 'edit', kind: l.kind, parent: null, location: l })}>
                {canEdit ? 'edit' : 'view'}
              </button>
              {canEdit && (
                <>
                  <button className="rounded border border-gray-200 px-1.5 text-xs text-gray-600 hover:bg-gray-100" onClick={() => toggleBlock(l)}>
                    {l.status === 'active' ? 'block' : 'unblock'}
                  </button>
                  <button className="rounded border border-gray-200 px-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => removeLoc(l)}>del</button>
                </>
              )}
            </span>
          </span>
        </div>
        {!isCollapsed && kids.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

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

      <StatGrid>
        <StatCard label="Locations" value={rollup.locations} icon={Layers}
          sub={`${rollup.bins} bin${rollup.bins === 1 ? '' : 's'}`} />
        <StatCard label="Units stored" value={rollup.units.toLocaleString('en-IN')} icon={Boxes}
          sub={rollup.unsized ? `${rollup.unsized} with no pack size` : 'all measured'}
          tone={rollup.unsized ? 'warn' : 'default'} />
        <StatCard label="Bins with a limit" value={rollup.capped} icon={Ruler}
          sub={`${rollup.bins - rollup.capped} uncapped`} />
        <StatCard label="Full bins" value={rollup.full} icon={AlertTriangle}
          tone={rollup.full ? 'bad' : 'default'} sub="at or over a limit" />
        <StatCard label="Blocked" value={rollup.blocked}
          tone={rollup.blocked ? 'warn' : 'default'} sub="not available for putaway" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* tree */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-gray-700">Locations</h2>
            <div className="flex items-center gap-2">
              <TextInput value={treeFilter} onChange={(e) => setTreeFilter(e.target.value)}
                placeholder="Find a code or name" className="w-52" />
              {canEdit && (
                <>
                  <Btn variant="outline" onClick={() => setEditor({ mode: 'create', kind: 'zone', parent: null })}>+ zone</Btn>
                  <Btn variant="outline" onClick={() => setEditor({ mode: 'generate', kind: 'zone', parent: null })}>
                    Generate zones
                  </Btn>
                </>
              )}
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto px-2 py-1">
            {(children.get(null) ?? []).length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                <p className="font-medium text-gray-700">No layout drawn yet</p>
                <p className="mx-auto mt-1 max-w-md leading-relaxed">
                  A layout is zones → aisles → racks → shelves → bins. Stock only ever sits in a
                  <strong> bin</strong>; everything above it groups bins and passes its flags down.
                  Start with a zone (receiving, bulk, pick face, quarantine), then use{' '}
                  <span className="font-mono">++</span> to generate a run of bins rather than adding
                  them one at a time.
                </p>
              </div>
            )}
            {(children.get(null) ?? []).map((z) => renderNode(z, 0))}
            {matchIds && matchIds.size === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">Nothing matches “{treeFilter}”.</div>
            )}
          </div>
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

      <LocationEditor
        target={editor}
        warehouseId={whId}
        canEdit={canEdit}
        onClose={() => setEditor(null)}
        onSaved={(m) => { flash(m); loadTree(); }}
        api={editorApi}
      />
    </Page>
  );
};

export default WarehouseLayout;
