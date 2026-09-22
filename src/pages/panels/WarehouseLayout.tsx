import React, { useEffect, useMemo, useState } from 'react';
import { api, searchAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Page, PageHeader, SelectInput, Btn, StatCard, StatGrid, TabBar } from '../../components/erp';
import {
  Warehouse, Boxes, Layers, Ruler, AlertTriangle, Grid3x3, ChevronRight, Building2, Printer, Settings2,
  Plus, Search, Package, Info, ArrowRight,
} from 'lucide-react';
import {
  type Loc, type LayoutMeta, type LevelTemplate, CLASSIC_TEMPLATE, indexTree, racksUnder, asRack, rackRoot, isStorage,
  levelOf, levelLabel, childLevels, num, litres, kg, sizeLabel, fillRatio, apiError,
} from '../../components/warehouse/layoutModel';
import { RackElevation, FillLegend } from '../../components/warehouse/RackElevation';
import { NodeDialog, RackBuilderDialog, StructureDialog, type NodeTarget } from '../../components/warehouse/LayoutDialogs';

/**
 * Warehouse layout (program 11, docs/GROWCORD_WAREHOUSE_PLAN.md).
 *
 * The owner's words, 2026-09-21: "how will admin manage it … improvise the
 * display like a real warehouse … add buildings, units, floors, aisles, walls,
 * shelves, rows, columns — whatever the depth — and dimensions, to auto-
 * calculate the volume, because incoming inventory will later be shown the
 * space where it should be kept."
 *
 * So the page draws the warehouse the way a person walks it: areas (building,
 * floor, zone, aisle…) are tiles you step into, and racks are drawn as front
 * elevations — uprights, beams, row 1 on the floor — with every slot filled
 * from the bottom by how full it really is. The structure (how many levels,
 * what they are called) is the facility's own, chosen or written in
 * "Structure", and every slot carries its measured inside size, from which the
 * usable volume is worked out. On a database without migration 212 the page
 * says so and works on the classic five levels.
 */

const FILL_BAR = (r: number | null) =>
  r == null ? 'bg-sky-300' : r >= 0.9 ? 'bg-rose-500' : r >= 0.6 ? 'bg-amber-400' : 'bg-emerald-500';

const WarehouseLayout: React.FC = () => {
  const { hasPerm } = useAuth();
  // Mirrors the backend: structure = inventory.manage, every other write = inventory.adjust.
  const canEdit = hasPerm('inventory.adjust');
  const canStructure = hasPerm('inventory.manage');

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [whId, setWhId] = useState('');
  const [locs, setLocs] = useState<Loc[]>([]);
  const [meta, setMeta] = useState<LayoutMeta | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'layout' | 'ops'>('layout');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [nodeDlg, setNodeDlg] = useState<NodeTarget | null>(null);
  const [rackDlg, setRackDlg] = useState<{ parent: Loc | null } | null>(null);
  const [structDlg, setStructDlg] = useState(false);
  const [binRows, setBinRows] = useState<any[] | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  // operations tab
  const [replen, setReplen] = useState<any[] | null>(null);
  const [reslot, setReslot] = useState<any[] | null>(null);
  const [pa, setPa] = useState({ sku: '', qty: '1' });
  const [paVar, setPaVar] = useState<any | null>(null);
  const [paSugg, setPaSugg] = useState<any | null>(null);
  const [findQ, setFindQ] = useState('');
  const [findRows, setFindRows] = useState<any[] | null>(null);

  const fail = (e: any) => setError(apiError(e));
  const flash = (m: string) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 4500); };

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/warehouses');
      const rows = res.data?.warehouses ?? res.data?.rows ?? res.data?.data ?? res.data ?? [];
      setWarehouses(Array.isArray(rows) ? rows : []);
      if (!whId && rows[0]) setWhId(rows[0].id ?? rows[0]._id);
    } catch (e) { fail(e); }
  };
  const loadTree = async () => {
    if (!whId) return;
    try {
      const [l, m] = await Promise.all([
        api.get('/wms/locations', { params: { warehouseId: whId } }),
        // A backend that predates the layout routes answers 404 — treat as classic.
        api.get('/wms/layout/meta', { params: { warehouseId: whId } }).catch(() => null),
      ]);
      setLocs(l.data?.rows ?? l.data?.data?.rows ?? []);
      const md = m ? (m.data?.data ?? m.data) : null;
      setMeta(md?.modelAvailable != null ? md : {
        modelAvailable: false, template: null, templates: [], storageTypes: [],
        reason: 'The server does not have the new warehouse structure yet.',
      });
      api.get('/wms/replenishment', { params: { warehouseId: whId } }).then((r) => setReplen(r.data?.rows ?? [])).catch(() => setReplen(null));
      api.get('/wms/reslotting', { params: { warehouseId: whId } }).then((r) => setReslot(r.data?.rows ?? [])).catch(() => setReslot(null));
    } catch (e) { fail(e); }
  };
  useEffect(() => { loadWarehouses(); }, []); // eslint-disable-line
  useEffect(() => { setSelectedId(null); loadTree(); }, [whId]); // eslint-disable-line

  const template: LevelTemplate = meta?.modelAvailable && meta.template ? meta.template : CLASSIC_TEMPLATE;
  const tree = useMemo(() => indexTree(locs), [locs]);
  const selected = selectedId ? tree.byId.get(selectedId) ?? null : null;
  const facility = warehouses.find((w) => (w.id ?? w._id) === whId);

  // Open a slot's contents whenever a storage slot is selected.
  useEffect(() => {
    setBinRows(null);
    if (selected && isStorage(selected)) {
      api.get('/wms/stock', { params: { binId: selected.id } }).then((r) => setBinRows(r.data?.rows ?? [])).catch(() => setBinRows([]));
    }
  }, [selectedId, locs]); // eslint-disable-line

  const stats = useMemo(() => {
    const slots = locs.filter(isStorage);
    const measured = slots.filter((s) => s.w_mm && s.d_mm && s.h_mm);
    const full = slots.filter((s) => (fillRatio(s) ?? 0) >= 1);
    return {
      slots: slots.length, measured: measured.length,
      volume: slots.reduce((n, s) => n + num(s.max_volume_ml), 0),
      usedVolume: slots.reduce((n, s) => n + num(s.used_volume_ml), 0),
      units: slots.reduce((n, s) => n + num(s.current_units), 0),
      inUse: slots.filter((s) => num(s.current_units) > 0).length,
      full: full.length, blocked: locs.filter((l) => l.status !== 'active').length,
      unsized: slots.reduce((n, s) => n + num(s.unsized_units), 0),
      nextSeq: locs.reduce((m, l) => Math.max(m, num(l.pick_sequence)), 0) + 1,
    };
  }, [locs]);

  // Everything a subtree holds, for area tiles and the detail panel.
  const rollup = (node: Loc) => {
    const slots = [node, ...tree.descendants(node.id)].filter(isStorage);
    return {
      slots: slots.length,
      units: slots.reduce((n, s) => n + num(s.current_units), 0),
      inUse: slots.filter((s) => num(s.current_units) > 0).length,
      volume: slots.reduce((n, s) => n + num(s.max_volume_ml), 0),
      usedVolume: slots.reduce((n, s) => n + num(s.used_volume_ml), 0),
    };
  };

  // ── tree filter: keep a match's ancestors so nothing is orphaned ──
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return null;
    const hit = new Set<string>();
    for (const l of locs) {
      if (![l.code, l.name].some((x) => String(x ?? '').toLowerCase().includes(q))) continue;
      tree.pathOf(l).forEach((p) => hit.add(p.id));
    }
    return hit;
  }, [filter, locs, tree]);

  // ── actions ──
  const refresh = (msg?: string, focusId?: string) => { if (msg) flash(msg); loadTree(); if (focusId) setSelectedId(focusId); };
  const remove = async (l: Loc) => {
    if (!window.confirm(`Delete ${levelLabel(template, levelOf(l)).toLowerCase()} ${l.code}? It must be empty and hold no other locations.`)) return;
    try { await api.delete(`/wms/locations/${l.id}`); setSelectedId(l.parent_id); refresh(`${l.code} deleted`); } catch (e) { fail(e); }
  };
  const toggleBlock = async (l: Loc) => {
    try { await api.patch(`/wms/locations/${l.id}`, { status: l.status === 'active' ? 'blocked' : 'active' }); refresh(`${l.code} ${l.status === 'active' ? 'blocked' : 'unblocked'}`); } catch (e) { fail(e); }
  };
  const printLabels = async (ids: string[], what: string) => {
    if (!ids.length) { setError(`No ${what} to label here.`); return; }
    try {
      const r = await api.post('/wms/labels', { type: 'bin', ids, format: 'pdf', size: '50x25mm' }, { responseType: 'blob' });
      window.open(URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), '_blank');
    } catch (e) { fail(e); }
  };
  const moveRow = async (row: any) => {
    const to = moveTo[row.variation_id + (row.batch_id ?? '')];
    if (!to || !selected) return;
    const qty = parseInt(window.prompt(`Move how many? (up to ${row.qty})`, String(row.qty)) ?? '', 10);
    if (!qty || qty <= 0) return;
    try {
      await api.post('/wms/move', { variationId: row.variation_id, qty, fromBinId: selected.id, toBinId: to, batchId: row.batch_id ?? null });
      refresh('Moved');
    } catch (e) { fail(e); }
  };
  const suggest = async () => {
    setPaVar(null); setPaSugg(null); setError('');
    try {
      const hit = (await searchAPI.query('variation', pa.sku, 1))[0];
      if (!hit) { setError(`No SKU matches "${pa.sku}"`); return; }
      setPaVar(hit);
      const r = await api.post('/wms/putaway/suggest', { warehouseId: whId, variationId: hit.id, qty: parseInt(pa.qty) || 1 });
      setPaSugg(r.data?.data ?? r.data);
    } catch (e) { fail(e); }
  };
  const confirmPutaway = async (binId: string) => {
    try {
      await api.post('/wms/putaway/confirm', { variationId: paVar.id ?? paVar._id, qty: parseInt(pa.qty) || 1, binId });
      setPaSugg(null); setPaVar(null); setPa({ sku: '', qty: '1' }); refresh('Put away');
    } catch (e) { fail(e); }
  };
  const find = async () => {
    try { const r = await api.get('/wms/stock', { params: { q: findQ } }); setFindRows(r.data?.rows ?? []); } catch (e) { fail(e); }
  };
  const applyMove = async (r: any, reason: string) => {
    try {
      await api.post('/wms/move', { variationId: r.variation_id, qty: r.suggested_qty ?? r.qty, fromBinId: r.from_bin_id, toBinId: r.to_bin_id, batchId: r.batch_id ?? null, reason });
      refresh(reason === 'replenishment' ? 'Replenished' : 'Re-slotted');
    } catch (e) { fail(e); }
  };

  // ── pieces ──
  const TreeRow: React.FC<{ l: Loc; depth: number }> = ({ l, depth }) => {
    if (visible && !visible.has(l.id)) return null;
    const kids = tree.kids.get(l.id) ?? [];
    const isOpen = !collapsed[l.id] || !!visible;
    const storage = isStorage(l);
    return (
      <>
        <div className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm ${selectedId === l.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
             style={{ paddingLeft: depth * 14 + 4 }}>
          <button className={`w-4 shrink-0 text-xs ${kids.length ? '' : 'invisible'} ${selectedId === l.id ? 'text-slate-300' : 'text-slate-400'}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [l.id]: !c[l.id] }))} aria-label={isOpen ? 'Collapse' : 'Expand'}>
            {isOpen ? '▾' : '▸'}
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setSelectedId(l.id)}>
            <span className={`shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide ${selectedId === l.id ? 'bg-white/15 text-slate-200' : storage ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {levelLabel(template, levelOf(l))}
            </span>
            <span className="truncate font-mono text-[12px]">{l.code}</span>
            {l.status !== 'active' && <span className="rounded bg-rose-100 px-1 text-[9px] text-rose-700">{l.status}</span>}
          </button>
          <span className={`shrink-0 text-[10px] tabular-nums ${selectedId === l.id ? 'text-slate-300' : 'text-slate-400'}`}>
            {storage ? (num(l.current_units) || '') : num(l.descendant_bins) || ''}
          </span>
        </div>
        {isOpen && kids.map((k) => <TreeRow key={k.id} l={k} depth={depth + 1} />)}
      </>
    );
  };

  const AddButtons: React.FC<{ parent: Loc | null }> = ({ parent }) => {
    if (!canEdit || (parent && isStorage(parent))) return null;
    const next = childLevels(template, parent);
    if (!next.length) return null;
    const first = next[0];
    const hasRackLevels = meta?.modelAvailable && template.levels.some((l) => l.default_node_role === 'storage')
      && childLevels(template, parent).length >= 2;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="outline" onClick={() => setNodeDlg({ mode: 'create', parent, level: first.level_code })}>
          <Plus className="mr-1 h-3.5 w-3.5" />Add {first.label.toLowerCase()}
        </Btn>
        <Btn size="sm" variant="outline" onClick={() => setNodeDlg({ mode: 'several', parent, level: first.level_code })}>Add several</Btn>
        {hasRackLevels && (
          <Btn size="sm" onClick={() => setRackDlg({ parent })}><Grid3x3 className="mr-1 h-3.5 w-3.5" />Build a rack here</Btn>
        )}
      </div>
    );
  };

  const FloorView: React.FC = () => {
    // A slot, or a row of a rack, keeps the WHOLE rack in view (slot highlighted).
    const root = !selected ? null
      : rackRoot(selected, tree) ?? (isStorage(selected) ? tree.byId.get(selected.parent_id ?? '') ?? null : selected);
    const selfRack = root ? asRack(root, tree.kids) : null;
    const childAreas = (tree.kids.get(root?.id ?? null) ?? []).filter((k) => !isStorage(k) && !asRack(k, tree.kids));
    const groups = selfRack ? [] : racksUnder(root, locs, tree);
    const rackCount = groups.reduce((n, g) => n + g.racks.length, 0);
    const shownGroups = rackCount > 30 ? [] : groups;
    const path = root ? tree.pathOf(root) : [];

    return (
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            <button className={`inline-flex items-center gap-1 ${root ? 'text-slate-500 hover:text-slate-900' : 'font-semibold text-slate-900'}`} onClick={() => setSelectedId(null)}>
              <Building2 className="h-4 w-4" />{facility?.name ?? 'Facility'}
            </button>
            {path.map((p) => (
              <React.Fragment key={p.id}>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                <button className={p.id === root?.id ? 'font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-900'} onClick={() => setSelectedId(p.id)}>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{levelLabel(template, levelOf(p))} </span>
                  <span className="font-mono">{p.code}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>
          <AddButtons parent={root} />
        </div>

        <div className="space-y-5 p-4">
          {locs.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
              <Warehouse className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">Draw your warehouse</h3>
              <ol className="mx-auto mt-3 max-w-md space-y-1.5 text-left text-sm text-slate-600">
                <li><strong>1.</strong> Choose its <strong>structure</strong> — how many levels it has and what you call them (building, floor, zone, aisle, rack, shelf, bin…).</li>
                <li><strong>2.</strong> Add the big areas top-down — a building, its floors, the zones on each floor.</li>
                <li><strong>3.</strong> <strong>Build racks</strong> in each aisle: rows × columns, with the inside size of a slot, so the volume works itself out.</li>
                <li><strong>4.</strong> Put stock away. Incoming goods are then offered the slots they fit.</li>
              </ol>
              <div className="mt-4 flex justify-center gap-2">
                {canStructure && meta?.modelAvailable && <Btn variant="outline" onClick={() => setStructDlg(true)}><Settings2 className="mr-1 h-4 w-4" />Choose structure</Btn>}
                <AddButtons parent={null} />
              </div>
            </div>
          )}

          {selfRack && (
            <RackElevation view={selfRack} selectedId={selectedId} onSelect={(s) => setSelectedId(s.id)} />
          )}

          {childAreas.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {root ? `Inside ${root.code}` : 'Areas'}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {childAreas.map((a) => {
                  const r = rollup(a);
                  const ratio = r.volume ? r.usedVolume / r.volume : r.slots ? r.inUse / r.slots : null;
                  return (
                    <button key={a.id} onClick={() => setSelectedId(a.id)}
                      className="group rounded-lg border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{levelLabel(template, levelOf(a))}</span>
                        {a.status !== 'active' && <span className="rounded bg-rose-100 px-1 text-[9px] text-rose-700">{a.status}</span>}
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{a.code}</div>
                      {a.name && <div className="truncate text-xs text-slate-500">{a.name}</div>}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full ${FILL_BAR(ratio)}`} style={{ width: `${Math.round(Math.min(1, ratio ?? 0) * 100)}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                        <span>{r.slots} slot{r.slots === 1 ? '' : 's'}</span>
                        <span>{r.units.toLocaleString('en-IN')} units</span>
                      </div>
                      {sizeLabel(a) && <div className="mt-0.5 text-[10px] text-slate-400">{sizeLabel(a)}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shownGroups.map((g) => (
            <div key={g.parent?.id ?? 'top'}>
              {/* the aisle: racks stand along it */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {g.parent ? <>{levelLabel(template, levelOf(g.parent))} <span className="font-mono normal-case text-slate-600">{g.parent.code}</span></> : 'Racks'}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] text-slate-400">{g.racks.length} rack{g.racks.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex flex-wrap gap-4">
                {g.racks.map((rv) => (
                  <RackElevation key={rv.rack.id} view={rv} compact selectedId={selectedId}
                    onSelect={(s) => setSelectedId(s.id)} onSelectRack={(r) => setSelectedId(r.id)} />
                ))}
              </div>
            </div>
          ))}
          {rackCount > 30 && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {rackCount} racks here — open a {levelLabel(template, template.levels[1]?.level_code ?? 'zone').toLowerCase()} to see its racks drawn.
            </p>
          )}
          {(selfRack || shownGroups.length > 0) && <FillLegend />}
          {root && !selfRack && !childAreas.length && !shownGroups.length && (
            <p className="py-8 text-center text-sm text-slate-500">Nothing inside {root.code} yet.</p>
          )}
        </div>
      </div>
    );
  };

  const Detail: React.FC = () => {
    if (!selected) {
      return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Facility</div>
          <div className="text-base font-semibold text-slate-900">{facility?.name ?? '—'} <span className="font-mono text-xs text-slate-400">{facility?.code}</span></div>
          {facility && <div className="text-xs text-slate-500">{[facility.city, facility.state].filter(Boolean).join(', ')}{facility.gstin ? ` · GSTIN ${facility.gstin}` : ''}</div>}
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Storage slots</dt><dd className="font-semibold">{stats.slots}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">In use</dt><dd className="font-semibold">{stats.inUse}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Usable volume</dt><dd className="font-semibold">{stats.volume ? litres(stats.volume, 0) : '—'}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Measured slots</dt><dd className="font-semibold">{stats.measured}/{stats.slots}</dd></div>
          </dl>
          <p className="flex gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
            <Info className="h-4 w-4 shrink-0 text-slate-400" />
            Click any area to step into it, any rack to see it face-on, any slot to see what is on it.
          </p>
        </div>
      );
    }
    const storage = isStorage(selected);
    const r = rollup(selected);
    const allSlotIds = [selected, ...tree.descendants(selected.id)].filter(isStorage).map((s) => s.id);
    const Meter = ({ label, used, max, fmt }: { label: string; used: number; max: number | null; fmt: (n: number) => string }) => {
      if (max == null) return null;
      const p = Math.min(1, max > 0 ? used / max : 0);
      return (
        <div>
          <div className="flex justify-between text-[11px] text-slate-500"><span>{label}</span><span className="tabular-nums">{fmt(used)} / {fmt(max)}</span></div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${FILL_BAR(p)}`} style={{ width: `${Math.round(p * 100)}%` }} /></div>
        </div>
      );
    };
    const otherSlots = locs.filter((l) => isStorage(l) && l.id !== selected.id && l.status === 'active');
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{levelLabel(template, levelOf(selected))}{storage ? ' · storage slot' : ''}</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-slate-900">{selected.code}</span>
            {selected.status !== 'active' && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700">{selected.status}</span>}
          </div>
          {selected.name && <div className="text-xs text-slate-500">{selected.name}</div>}
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">{tree.pathOf(selected).map((p) => p.code).join(' › ')}</div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div><dt className="text-slate-400">Storage type</dt><dd className="text-slate-800">{meta?.storageTypes.find((t) => t.code === selected.storage_type)?.label ?? '—'}</dd></div>
          <div><dt className="text-slate-400">Inside size</dt><dd className="text-slate-800">{sizeLabel(selected) ?? <span className="text-amber-700">not measured</span>}</dd></div>
          <div><dt className="text-slate-400">Volume</dt><dd className="text-slate-800">{selected.max_volume_ml != null ? <>{litres(selected.max_volume_ml)} <span className="text-slate-400">{selected.volume_from_dims ? `from size × ${selected.usable_pct ?? 100}%` : 'typed'}</span></> : '—'}</dd></div>
          {storage
            ? <div><dt className="text-slate-400">Position</dt><dd className="text-slate-800">{selected.grid_row ? `row ${selected.grid_row}, col ${selected.grid_col}` : '—'}{selected.pick_sequence ? ` · pick #${selected.pick_sequence}` : ''}</dd></div>
            : <div><dt className="text-slate-400">Holds</dt><dd className="text-slate-800">{r.slots} slots · {r.units.toLocaleString('en-IN')} units</dd></div>}
        </dl>

        {storage && (
          <div className="space-y-2">
            <Meter label="Units" used={num(selected.current_units)} max={selected.max_units} fmt={(n) => String(n)} />
            <Meter label="Volume" used={num(selected.used_volume_ml)} max={selected.max_volume_ml} fmt={(n) => litres(n)} />
            <Meter label="Weight" used={num(selected.used_weight_g)} max={selected.max_weight_g} fmt={(n) => kg(n)} />
            {selected.max_units == null && selected.max_volume_ml == null && selected.max_weight_g == null && (
              <div className="text-[11px] text-slate-400">No limit set — putaway will place anything here.</div>
            )}
            {num(selected.unsized_units) > 0 && (
              <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{selected.unsized_units} unit(s) here have no measured pack size, so the volume shown is a floor, not a total.</div>
            )}
          </div>
        )}
        {!storage && r.volume > 0 && <Meter label="Volume in use" used={r.usedVolume} max={r.volume} fmt={(n) => litres(n, 0)} />}

        {storage && (
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-700">On this slot</div>
            {binRows == null && <div className="text-xs text-slate-400">Loading…</div>}
            {binRows?.length === 0 && <div className="rounded bg-slate-50 px-2 py-3 text-center text-xs text-slate-500">Empty</div>}
            {binRows?.map((row: any, i: number) => {
              const k = row.variation_id + (row.batch_id ?? '');
              return (
                <div key={i} className="border-b border-slate-100 py-1.5 text-xs last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="truncate"><span className="font-mono">{row.sku}</span> <span className="text-slate-500">{row.product_name ?? ''}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">×{row.qty}</span>
                  </div>
                  {row.batch_number && <div className="text-[11px] text-slate-500">lot {row.batch_number}{row.expiry_date ? ` · exp ${String(row.expiry_date).slice(0, 10)}` : ''}</div>}
                  {canEdit && (
                    <div className="mt-1 flex gap-1">
                      <select className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11px]" value={moveTo[k] ?? ''}
                              onChange={(e) => setMoveTo({ ...moveTo, [k]: e.target.value })}>
                        <option value="">Move to…</option>
                        {otherSlots.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                      </select>
                      <button className="rounded border border-slate-300 px-2 text-[11px] hover:bg-slate-50" onClick={() => moveRow(row)}>Move</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {canEdit && <Btn size="sm" variant="outline" onClick={() => setNodeDlg({ mode: 'edit', parent: selected.parent_id ? tree.byId.get(selected.parent_id) ?? null : null, node: selected })}>Edit</Btn>}
          <Btn size="sm" variant="outline" onClick={() => printLabels(allSlotIds, 'slots')}><Printer className="mr-1 h-3.5 w-3.5" />{storage ? 'Label' : `Labels (${allSlotIds.length})`}</Btn>
          {canEdit && <Btn size="sm" variant="outline" onClick={() => toggleBlock(selected)}>{selected.status === 'active' ? 'Block' : 'Unblock'}</Btn>}
          {canEdit && <Btn size="sm" variant="dangerOutline" onClick={() => remove(selected)}>Delete</Btn>}
        </div>
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        icon={Warehouse}
        title="Warehouse layout"
        description="Your warehouse as you walk it — areas you step into, racks drawn face-on, and every slot sized so putaway knows what fits."
        actions={
          <SelectInput value={whId} onChange={(e) => setWhId(e.target.value)} className="min-w-[14rem]">
            {warehouses.map((w: any) => <option key={w.id ?? w._id} value={w.id ?? w._id}>{w.name} ({w.code})</option>)}
          </SelectInput>
        }
      />
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      {meta && !meta.modelAvailable && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{meta.reason ?? 'The new warehouse structure is not on this store yet.'} Buildings, floors, walls, sizes and racks-by-rows-and-columns switch on once it is.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-slate-500">Structure</span>
          <span className="font-semibold text-slate-900">{template.name}</span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {template.levels.map((l, i) => (
              <React.Fragment key={l.level_code}>
                {i > 0 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                <span className={`rounded px-1.5 py-0.5 ${l.default_node_role === 'storage' ? 'bg-emerald-50 font-medium text-emerald-700' : 'bg-slate-100'}`}>{l.label}</span>
              </React.Fragment>
            ))}
          </span>
        </span>
        {canStructure && meta?.modelAvailable && (
          <Btn size="sm" variant="outline" onClick={() => setStructDlg(true)}><Settings2 className="mr-1 h-3.5 w-3.5" />Change structure</Btn>
        )}
      </div>

      <StatGrid>
        <StatCard label="Storage slots" value={stats.slots} icon={Layers} sub={`${stats.inUse} in use · ${locs.length - stats.slots} areas`} />
        <StatCard label="Usable volume" value={stats.volume ? litres(stats.volume, 0) : '—'} icon={Ruler}
          sub={!stats.volume ? `${stats.measured} of ${stats.slots} slots measured`
            : stats.unsized ? `${Math.round((stats.usedVolume / stats.volume) * 100)}%+ in use — ${stats.unsized} units have no size, so this is a floor`
            : `${Math.round((stats.usedVolume / stats.volume) * 100)}% in use`}
          tone={stats.slots && stats.measured < stats.slots ? 'warn' : 'default'} />
        <StatCard label="Units on shelves" value={stats.units.toLocaleString('en-IN')} icon={Boxes}
          sub={stats.unsized ? `${stats.unsized} not measured yet — sizes go in the inventory sheet` : 'every unit measured'} tone={stats.unsized ? 'warn' : 'default'} />
        <StatCard label="Full slots" value={stats.full} icon={AlertTriangle} tone={stats.full ? 'bad' : 'default'} sub="at or over a limit" />
        <StatCard label="Blocked" value={stats.blocked} tone={stats.blocked ? 'warn' : 'default'} sub="not used for putaway" />
      </StatGrid>

      <TabBar tabs={[{ key: 'layout', label: 'Layout' }, { key: 'ops', label: 'Putaway & stock' }]} active={tab} onChange={(k) => setTab(k as any)} />

      {tab === 'layout' && (
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a code or name"
                       className="w-full rounded-md border border-slate-300 py-1.5 pl-7 pr-2 text-sm" />
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto p-1.5">
              <button onClick={() => setSelectedId(null)} className={`mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm ${!selectedId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                <Building2 className="h-4 w-4" /><span className="truncate font-medium">{facility?.name ?? 'Facility'}</span>
              </button>
              {(tree.kids.get(null) ?? []).map((l) => <TreeRow key={l.id} l={l} depth={0} />)}
              {visible && visible.size === 0 && <div className="px-2 py-6 text-center text-xs text-slate-500">Nothing matches “{filter}”.</div>}
            </div>
          </div>
          <FloorView />
          <Detail />
        </div>
      )}

      {tab === 'ops' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Putaway — where should it go?</h2>
              <p className="mb-2 text-xs text-slate-500">Scores every slot that is allowed and has room; capacity is checked again the moment you confirm.</p>
              <div className="flex gap-2">
                <input placeholder="SKU" value={pa.sku} onChange={(e) => setPa({ ...pa, sku: e.target.value })} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm" />
                <input type="number" min={1} value={pa.qty} onChange={(e) => setPa({ ...pa, qty: e.target.value })} className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <Btn onClick={suggest}>Suggest</Btn>
              </div>
              {paSugg && (
                <div className="mt-3 space-y-2">
                  {(paSugg.suggestions ?? []).length === 0 && <div className="text-sm text-slate-500">No allowed slot has room — add slots or free space.</div>}
                  {(paSugg.suggestions ?? []).map((s: any) => (
                    <div key={s.locationId} className="rounded-md border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold">{s.code}</span>
                        {canEdit && <Btn size="sm" onClick={() => confirmPutaway(s.locationId)}>Put here</Btn>}
                      </div>
                      <ul className="mt-1 list-inside list-disc text-xs text-slate-500">{(s.reasons ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Find stock on the shelves</h2>
              <div className="flex gap-2">
                <input placeholder="SKU or slot code" value={findQ} onChange={(e) => setFindQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()}
                       className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm" />
                <Btn onClick={find}>Find</Btn>
              </div>
              {findRows && (
                <div className="mt-2 max-h-60 overflow-y-auto text-xs">
                  {findRows.length === 0 && <div className="py-2 text-slate-500">Nothing on any shelf matches.</div>}
                  {findRows.map((r: any, i: number) => (
                    <button key={i} onClick={() => { setTab('layout'); setSelectedId(r.location_id); }} className="flex w-full justify-between border-b border-slate-100 py-1.5 text-left hover:bg-slate-50">
                      <span className="font-mono">{r.bin_code}</span>
                      <span>{r.sku} ×{r.qty}{r.batch_number ? ` · ${r.batch_number}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Replenish pick faces</h2>
              {replen == null && <div className="text-xs text-slate-400">Not available.</div>}
              {replen?.length === 0 && <div className="rounded bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Every pick face is above its minimum.</div>}
              {replen?.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs">
                  <span><span className="font-mono">{r.sku}</span>: {r.from_bin_code} → {r.to_bin_code} <span className="text-slate-500">({r.total}/{r.min_units} min) ×{r.suggested_qty}</span></span>
                  {canEdit && <Btn size="sm" onClick={() => applyMove(r, 'replenishment')}>Apply</Btn>}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Re-slotting</h2>
                <span className="text-[11px] text-slate-400">fast movers near the front, slow movers to bulk</span>
              </div>
              {reslot == null && <div className="text-xs text-slate-400">Not available.</div>}
              {reslot?.length === 0 && <div className="rounded bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Nothing to improve — fast movers are already well placed.</div>}
              {reslot?.map((r: any, i: number) => (
                <div key={i} className="border-b border-slate-100 py-2 last:border-0">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${r.velocity_class === 'A' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.velocity_class}</span>
                    <p className="flex-1 text-sm text-slate-700">{r.reason}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500"><span className="font-mono">{r.sku}</span>: {r.from_bin} → {r.to_bin} ×{r.qty} · picked {r.picks_90d}× in 90d</span>
                    {canEdit && <Btn size="sm" onClick={() => applyMove(r, 'reslotting')}>Apply</Btn>}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
              <Package className="mb-1 h-4 w-4 text-slate-400" />
              Receiving, picking, packing and counting are done on the floor in the <strong>Growcord WMS</strong> app (wms.gc.mw) — on a phone or a scanner. This page is where the warehouse is drawn and managed.
            </div>
          </div>
        </div>
      )}

      {nodeDlg && meta && (
        <NodeDialog target={nodeDlg} warehouseId={whId} template={template} storageTypes={meta.storageTypes} modelAvailable={meta.modelAvailable}
          onClose={() => setNodeDlg(null)} onSaved={(m, id) => { setNodeDlg(null); refresh(m, id); }} />
      )}
      {rackDlg && meta && (
        <RackBuilderDialog parent={rackDlg.parent} warehouseId={whId} template={template} storageTypes={meta.storageTypes} nextSeq={stats.nextSeq}
          onClose={() => setRackDlg(null)} onSaved={(m, id) => { setRackDlg(null); refresh(m, id); }} />
      )}
      {structDlg && meta && (
        <StructureDialog warehouseId={whId} current={meta.template} templates={meta.templates}
          onClose={() => setStructDlg(false)} onSaved={(m) => { setStructDlg(false); refresh(m); }} />
      )}
    </Page>
  );
};

export default WarehouseLayout;
