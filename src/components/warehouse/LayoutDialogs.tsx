import React, { useEffect, useMemo, useState } from 'react';
import { X, Ruler, Info, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../../services/api';
import { Btn } from '../erp';
import {
  type Loc, type LevelTemplate, type StorageType, type NodeRole,
  childLevels, levelOf, levelLabel, isStorage, cmToMm, mmToCm, volumeFromCm, litres, slotCode, apiError, num,
} from './layoutModel';

// ── shell ────────────────────────────────────────────────────────────────────
export const Drawer: React.FC<{ title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> =
  ({ title, subtitle, onClose, children, footer, wide }) => (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={onClose} />
      <div className={`relative flex h-full w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} flex-col bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );

const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span className="mb-1 block text-xs font-medium text-slate-700">
    {children}{hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
  </span>
);
const input = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
const Err: React.FC<{ msg: string }> = ({ msg }) => msg ? <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</div> : null;

/** Inside size + usable % → live volume. The one place the screen does this sum. */
const SizeBlock: React.FC<{
  w: string; d: string; h: string; pct: string; setW: (v: string) => void; setD: (v: string) => void; setH: (v: string) => void; setPct: (v: string) => void;
  typed: string; setTyped: (v: string) => void; typing: boolean; setTyping: (b: boolean) => void; hint?: string;
}> = (p) => {
  const vol = volumeFromCm(p.w, p.d, p.h, p.pct);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Ruler className="h-3.5 w-3.5" />Inside size {p.hint && <span className="font-normal text-slate-400">{p.hint}</span>}</div>
      <div className="grid grid-cols-4 gap-2">
        <label><Label>Width cm</Label><input className={input} inputMode="decimal" value={p.w} onChange={(e) => p.setW(e.target.value)} placeholder="40" /></label>
        <label><Label>Depth cm</Label><input className={input} inputMode="decimal" value={p.d} onChange={(e) => p.setD(e.target.value)} placeholder="50" /></label>
        <label><Label>Height cm</Label><input className={input} inputMode="decimal" value={p.h} onChange={(e) => p.setH(e.target.value)} placeholder="30" /></label>
        <label><Label hint="fillable">Usable %</Label><input className={input} inputMode="numeric" value={p.pct} onChange={(e) => p.setPct(e.target.value)} placeholder="85" /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        {!p.typing ? (
          <span className={vol ? 'font-medium text-slate-900' : 'text-slate-400'}>
            {vol ? <>Holds <strong>{litres(vol)}</strong> — worked out from the size</> : 'Enter all three sides to work out the volume'}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <input className={`${input} w-28`} inputMode="decimal" value={p.typed} onChange={(e) => p.setTyped(e.target.value)} placeholder="litres" />
            <span className="text-slate-500">litres, typed by hand</span>
          </span>
        )}
        <button type="button" className="text-xs text-slate-500 underline hover:text-slate-800" onClick={() => p.setTyping(!p.typing)}>
          {p.typing ? 'work it out from the size instead' : 'type the volume by hand'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
        Usable % is how much of the space can really be filled — boxes never pack a shelf solid. 85% is a common figure. Putaway uses this volume to decide what fits.
      </p>
    </div>
  );
};

// ── add / edit / add several ─────────────────────────────────────────────────
export interface NodeTarget { mode: 'create' | 'edit' | 'several'; parent: Loc | null; node?: Loc; level?: string }

export const NodeDialog: React.FC<{
  target: NodeTarget; warehouseId: string; template: LevelTemplate; storageTypes: StorageType[]; modelAvailable: boolean;
  onClose: () => void; onSaved: (msg: string, id?: string) => void;
}> = ({ target, warehouseId, template, storageTypes, modelAvailable, onClose, onSaved }) => {
  const { mode, parent, node } = target;
  const allowed = useMemo(() => (mode === 'edit' && node
    ? template.levels
    : childLevels(template, parent)), [mode, node, template, parent]);
  const [level, setLevel] = useState<string>(node ? levelOf(node) : target.level ?? allowed[0]?.level_code ?? '');
  const levelDef = template.levels.find((l) => l.level_code === level);
  const [role, setRole] = useState<NodeRole>((node?.node_role as NodeRole) ?? levelDef?.default_node_role ?? 'area');
  useEffect(() => { if (mode !== 'edit') setRole(levelDef?.default_node_role ?? 'area'); }, [level]); // eslint-disable-line
  const [code, setCode] = useState(node?.code ?? '');
  const [name, setName] = useState(node?.name ?? '');
  const [storageType, setStorageType] = useState(node?.storage_type ?? '');
  const [w, setW] = useState(mmToCm(node?.w_mm)); const [d, setD] = useState(mmToCm(node?.d_mm)); const [h, setH] = useState(mmToCm(node?.h_mm));
  const [pct, setPct] = useState(String(node?.usable_pct ?? (mode === 'edit' ? 100 : 85)));
  const [typing, setTyping] = useState(!!node && node.volume_from_dims === false && node.max_volume_ml != null);
  const [typed, setTyped] = useState(node?.max_volume_ml != null ? String(num(node.max_volume_ml) / 1000) : '');
  const [maxUnits, setMaxUnits] = useState(node?.max_units != null ? String(node.max_units) : '');
  const [maxKg, setMaxKg] = useState(node?.max_weight_g != null ? String(num(node.max_weight_g) / 1000) : '');
  const [maxPallets, setMaxPallets] = useState(node?.max_pallets != null ? String(node.max_pallets) : '');
  // Read by replenishment since migration 035 and written by nothing until now,
  // so no suggestion could ever fire (W1.4.2).
  const [minUnits, setMinUnits] = useState(node?.min_units != null ? String(node.min_units) : '');
  const [row, setRow] = useState(node?.grid_row != null ? String(node.grid_row) : '');
  const [col, setCol] = useState(node?.grid_col != null ? String(node.grid_col) : '');
  const [pickable, setPickable] = useState(node?.pickable ?? true);
  // several
  const [count, setCount] = useState('4'); const [startAt, setStartAt] = useState('1'); const [pad, setPad] = useState('2');
  const [prefix, setPrefix] = useState(parent ? `${parent.code}-` : '');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const storage = role === 'storage';
  const st = storageTypes.find((t) => t.code === storageType);

  const preview = useMemo(() => {
    const n = Math.min(500, Math.max(1, parseInt(count) || 1)); const s = Math.max(0, parseInt(startAt) || 1); const p = Math.min(6, Math.max(1, parseInt(pad) || 2));
    const codes = Array.from({ length: Math.min(n, 6) }, (_, i) => `${prefix}${String(s + i).padStart(p, '0')}`);
    return { n, codes, last: `${prefix}${String(s + n - 1).padStart(p, '0')}` };
  }, [count, startAt, pad, prefix]);

  const body = () => {
    const b: any = { name: name.trim() || null };
    if (maxUnits.trim()) b.maxUnits = Math.max(1, parseInt(maxUnits)); else if (mode === 'edit') b.maxUnits = null;
    if (maxKg.trim()) b.maxWeightG = Math.round(Number(maxKg) * 1000); else if (mode === 'edit') b.maxWeightG = null;
    // 0 is a real threshold here ("tell me the moment it is empty"), unlike a
    // capacity of 0, so it is not clamped to 1.
    if (minUnits.trim()) b.minUnits = Math.max(0, parseInt(minUnits)); else if (mode === 'edit') b.minUnits = null;
    if (!modelAvailable) {
      if (typed.trim()) b.maxVolumeMl = Math.round(Number(typed) * 1000); else if (mode === 'edit') b.maxVolumeMl = null;
      return b;
    }
    Object.assign(b, {
      nodeRole: role, storageType: storageType || null,
      widthMm: cmToMm(w), depthMm: cmToMm(d), heightMm: cmToMm(h), usablePct: parseInt(pct) || 100,
      maxPallets: maxPallets.trim() ? parseInt(maxPallets) : null,
      gridRow: storage && row.trim() ? parseInt(row) : null, gridCol: storage && col.trim() ? parseInt(col) : null,
      pickable: storage ? pickable : false,
    });
    if (typing) b.maxVolumeMl = typed.trim() ? Math.round(Number(typed) * 1000) : null;
    else if (mode === 'edit' && node?.volume_from_dims === false) b.maxVolumeMl = null; // back to "work it out"
    return b;
  };

  const save = async () => {
    setErr('');
    if (mode !== 'several' && !code.trim()) { setErr('Give it a code — what is painted or written on it.'); return; }
    if (!level) { setErr('Choose which level this is.'); return; }
    setBusy(true);
    try {
      const lv = modelAvailable ? { levelCode: level } : { kind: level };
      if (mode === 'create') {
        const r = await api.post('/wms/locations', { warehouseId, parentId: parent?.id ?? null, code: code.trim(), ...lv, ...body() });
        onSaved(`${levelLabel(template, level)} ${code.trim()} added`, (r.data?.data ?? r.data)?.id);
      } else if (mode === 'several') {
        const r = await api.post('/wms/locations/generate', {
          warehouseId, parentId: parent?.id ?? null, ...lv, prefix, count: preview.n, startAt: parseInt(startAt) || 1, pad: parseInt(pad) || 2, ...body(),
        });
        const out = r.data?.data ?? r.data;
        onSaved(`${out.created} ${levelLabel(template, level).toLowerCase()}${out.created === 1 ? '' : 's'} added${out.skipped?.length ? ` · ${out.skipped.length} already existed` : ''}`);
      } else if (node) {
        const b = body(); b.code = code.trim(); if (modelAvailable && level !== levelOf(node)) b.levelCode = level;
        await api.patch(`/wms/locations/${node.id}`, b);
        onSaved(`${node.code} saved`, node.id);
      }
    } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  const title = mode === 'edit' ? `Edit ${levelLabel(template, levelOf(node!))} ${node!.code}` : mode === 'several' ? 'Add several at once' : `Add ${levelLabel(template, level)}`;
  return (
    <Drawer title={title} onClose={onClose}
      subtitle={parent ? <>Inside <span className="font-mono">{parent.code}</span> ({levelLabel(template, levelOf(parent))})</> : 'At the top of this facility'}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'several' ? `Add ${preview.n}` : 'Save'}</Btn></>}>
      <Err msg={err} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>Level</Label>
            <select className={input} value={level} onChange={(e) => setLevel(e.target.value)} disabled={mode === 'edit' && !modelAvailable}>
              {allowed.map((l) => <option key={l.level_code} value={l.level_code}>{l.label}</option>)}
            </select>
          </label>
          {modelAvailable && (
            <label>
              <Label hint="what it is for">Role</Label>
              <select className={input} value={role} onChange={(e) => setRole(e.target.value as NodeRole)}>
                <option value="area">Area — holds other locations</option>
                <option value="storage">Storage slot — holds stock</option>
                <option value="staging">Staging — packing / QC floor, never picked</option>
                <option value="dock">Dock — goods in / out door</option>
              </select>
            </label>
          )}
        </div>

        {mode === 'several' ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-5 gap-2">
              <label className="col-span-2"><Label>Code starts with</Label><input className={`${input} font-mono`} value={prefix} onChange={(e) => setPrefix(e.target.value)} /></label>
              <label><Label>How many</Label><input className={input} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></label>
              <label><Label>Start at</Label><input className={input} inputMode="numeric" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
              <label><Label hint="1 → 01">Digits</Label><input className={input} inputMode="numeric" value={pad} onChange={(e) => setPad(e.target.value)} /></label>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Makes <span className="font-mono text-slate-800">{preview.codes.join(', ')}{preview.n > 6 ? ` … ${preview.last}` : ''}</span>. Codes that already exist are skipped, so running it again extends the run.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label><Label hint="as painted on it">Code</Label><input className={`${input} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. B1, F2, A-07" autoFocus /></label>
            <label><Label hint="optional">Name</Label><input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cold room, Ground floor" /></label>
          </div>
        )}

        {modelAvailable && (
          <label className="block">
            <Label hint="what kind of storage it is">Storage type</Label>
            <select className={input} value={storageType} onChange={(e) => setStorageType(e.target.value)}>
              <option value="">— not specified —</option>
              {storageTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            {st && <span className="mt-1 block text-[11px] text-slate-500">{st.description}</span>}
          </label>
        )}

        {modelAvailable ? (
          <SizeBlock w={w} d={d} h={h} pct={pct} setW={setW} setD={setD} setH={setH} setPct={setPct}
            typed={typed} setTyped={setTyped} typing={typing} setTyping={setTyping}
            hint={storage ? '— of the slot' : '— footprint, for the floor map'} />
        ) : (
          <label className="block"><Label hint="litres, optional">Volume limit</Label><input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
        )}

        {(storage || !modelAvailable) && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label><Label hint="optional">Max units</Label><input className={input} inputMode="numeric" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} /></label>
              <label><Label hint="load rating">Max weight kg</Label><input className={input} inputMode="decimal" value={maxKg} onChange={(e) => setMaxKg(e.target.value)} /></label>
              {modelAvailable && st?.capacity === 'pallets' && (
                <label><Label>Max pallets</Label><input className={input} inputMode="numeric" value={maxPallets} onChange={(e) => setMaxPallets(e.target.value)} /></label>
              )}
            </div>
            <label className="block">
              <Label hint="refill below this">Min units</Label>
              <input className={input} inputMode="numeric" value={minUnits} onChange={(e) => setMinUnits(e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-500">
                When this slot drops below this many pieces it appears on the refill list. Leave it
                blank and it never will.
              </p>
            </label>
          </>
        )}

        {modelAvailable && storage && (
          <div className="grid grid-cols-3 items-end gap-3">
            <label><Label hint="1 = bottom">Row</Label><input className={input} inputMode="numeric" value={row} onChange={(e) => setRow(e.target.value)} /></label>
            <label><Label hint="1 = left">Column</Label><input className={input} inputMode="numeric" value={col} onChange={(e) => setCol(e.target.value)} /></label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700"><input type="checkbox" checked={pickable} onChange={(e) => setPickable(e.target.checked)} />Pickers may take from it</label>
          </div>
        )}
        {!modelAvailable && (
          <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"><Info className="h-4 w-4 shrink-0" />This store's database is on the classic five levels, so sizes, rows and columns cannot be saved yet.</p>
        )}
      </div>
    </Drawer>
  );
};

// ── rack builder ─────────────────────────────────────────────────────────────
export const RackBuilderDialog: React.FC<{
  parent: Loc | null; warehouseId: string; template: LevelTemplate; storageTypes: StorageType[]; nextSeq: number;
  onClose: () => void; onSaved: (msg: string, id?: string) => void;
}> = ({ parent, warehouseId, template, storageTypes, nextSeq, onClose, onSaved }) => {
  const slotLevel = template.levels.find((l) => l.default_node_role === 'storage') ?? template.levels[template.levels.length - 1];
  const above = template.levels.filter((l) => l.position < slotLevel.position);
  const [withRows, setWithRows] = useState(above.length >= 2);
  const rowLevel = withRows ? above[above.length - 1] : null;
  const rackLevel = withRows ? above[above.length - 2] : above[above.length - 1];
  const [rackCode, setRackCode] = useState(''); const [rackName, setRackName] = useState('');
  const [rows, setRows] = useState('4'); const [cols, setCols] = useState('6');
  const [pattern, setPattern] = useState('{rack}-{row}-{col}');
  const [w, setW] = useState('40'); const [d, setD] = useState('50'); const [h, setH] = useState('30'); const [pct, setPct] = useState('85');
  const [typing, setTyping] = useState(false); const [typed, setTyped] = useState('');
  const [maxUnits, setMaxUnits] = useState(''); const [maxKg, setMaxKg] = useState('');
  const [storageType, setStorageType] = useState('bin_shelf');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const R = Math.min(50, Math.max(1, parseInt(rows) || 1)); const C = Math.min(100, Math.max(1, parseInt(cols) || 1));
  const vol = volumeFromCm(w, d, h, pct);
  const code = rackCode.trim() || 'R01';

  const save = async () => {
    setErr('');
    if (!rackCode.trim()) { setErr('Give the rack its code — what is painted on it.'); return; }
    if (!rackLevel) { setErr('This structure has no level above the storage slot to be the rack.'); return; }
    setBusy(true);
    try {
      const r = await api.post('/wms/locations/build-rack', {
        warehouseId, parentId: parent?.id ?? null, rackCode: rackCode.trim(), rackName: rackName.trim() || null,
        rackLevel: rackLevel.level_code, rowLevel: rowLevel?.level_code ?? null, rows: R, cols: C, codePattern: pattern,
        slot: {
          widthMm: cmToMm(w), depthMm: cmToMm(d), heightMm: cmToMm(h), usablePct: parseInt(pct) || 100,
          maxUnits: maxUnits.trim() ? parseInt(maxUnits) : null, maxWeightG: maxKg.trim() ? Math.round(Number(maxKg) * 1000) : null,
          storageType: storageType || null,
          maxVolumeMl: typing && typed.trim() ? Math.round(Number(typed) * 1000) : null,
        },
        rack: { widthMm: cmToMm(w) ? (cmToMm(w)! * C) : null, depthMm: cmToMm(d), heightMm: cmToMm(h) ? cmToMm(h)! * R : null },
        pickSequenceFrom: nextSeq,
      });
      const out = r.data?.data ?? r.data;
      onSaved(`${rackCode.trim()} built — ${out.created} slot${out.created === 1 ? '' : 's'}${out.rowsCreated ? ` on ${out.rowsCreated} ${rowLevel?.label.toLowerCase() ?? 'row'}s` : ''}${out.skipped?.length ? ` · ${out.skipped.length} already existed` : ''}`, out.rack?.id);
    } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Drawer wide title="Build a rack" onClose={onClose}
      subtitle={<>{parent ? <>Stands in <span className="font-mono">{parent.code}</span> · </> : null}Creates the {rackLevel?.label.toLowerCase()}{rowLevel ? `, its ${rowLevel.label.toLowerCase()}s` : ''} and every {slotLevel.label.toLowerCase()} in one go</>}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Building…' : `Build ${R * C} slots`}</Btn></>}>
      <Err msg={err} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label><Label hint="as painted">Rack code</Label><input className={`${input} font-mono`} value={rackCode} onChange={(e) => setRackCode(e.target.value)} placeholder="R01" autoFocus /></label>
            <label><Label hint="optional">Name</Label><input className={input} value={rackName} onChange={(e) => setRackName(e.target.value)} placeholder="Dilutions A–M" /></label>
            <label><Label hint="levels, bottom to top">Rows</Label><input className={input} inputMode="numeric" value={rows} onChange={(e) => setRows(e.target.value)} /></label>
            <label><Label hint="left to right">Columns</Label><input className={input} inputMode="numeric" value={cols} onChange={(e) => setCols(e.target.value)} /></label>
          </div>
          {above.length >= 2 && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={withRows} onChange={(e) => setWithRows(e.target.checked)} />
              Make each row its own {above[above.length - 1].label.toLowerCase()} ({rackLevel?.label} › {above[above.length - 1].label} › {slotLevel.label})
            </label>
          )}
          <label className="block"><Label hint="{rack} {row} {ROW} {col}">Slot code pattern</Label>
            <input className={`${input} font-mono`} value={pattern} onChange={(e) => setPattern(e.target.value)} />
          </label>
          <label className="block"><Label>Storage type</Label>
            <select className={input} value={storageType} onChange={(e) => setStorageType(e.target.value)}>
              <option value="">— not specified —</option>
              {storageTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </label>
          <SizeBlock w={w} d={d} h={h} pct={pct} setW={setW} setD={setD} setH={setH} setPct={setPct}
            typed={typed} setTyped={setTyped} typing={typing} setTyping={setTyping} hint="— of ONE slot" />
          <div className="grid grid-cols-2 gap-3">
            <label><Label hint="per slot, optional">Max units</Label><input className={input} inputMode="numeric" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} /></label>
            <label><Label hint="per slot, optional">Max weight kg</Label><input className={input} inputMode="decimal" value={maxKg} onChange={(e) => setMaxKg(e.target.value)} /></label>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-slate-700">Preview — as you will see it from the aisle</div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="inline-block border-x-4 border-slate-500 bg-white/70 px-1 pt-1">
              {Array.from({ length: Math.min(R, 8) }, (_, i) => Math.min(R, 8) - i).map((r) => (
                <div key={r} className="flex gap-1 border-b-[3px] border-orange-500/80 pb-0.5 pt-0.5">
                  {Array.from({ length: Math.min(C, 8) }, (_, j) => j + 1).map((c) => (
                    <div key={c} className="w-[62px] truncate rounded-sm border border-slate-300 bg-white px-1 py-1.5 font-mono text-[9px] text-slate-700" title={slotCode(pattern, code, r, c)}>
                      {slotCode(pattern, code, r, c)}
                    </div>
                  ))}
                  {C > 8 && <div className="self-center px-1 text-[10px] text-slate-400">+{C - 8}</div>}
                </div>
              ))}
            </div>
            <div className="h-1 w-full bg-slate-700" />
            {R > 8 && <div className="mt-1 text-[10px] text-slate-400">+{R - 8} more rows above</div>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Slots</dt><dd className="font-semibold">{R * C}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Usable volume, whole rack</dt><dd className="font-semibold">{vol ? litres(vol * R * C, 0) : '—'}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Rack footprint</dt><dd className="font-semibold">{Number(w) && Number(d) ? `${(Number(w) * C / 100).toFixed(2)} × ${(Number(d) / 100).toFixed(2)} m` : '—'}</dd></div>
            <div className="rounded-md bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">Pick path</dt><dd className="font-semibold">{nextSeq} → {nextSeq + R * C - 1}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">Pickers are routed up column 1, down column 2 and so on — the walk along the aisle. Re-running with the same rack code only adds slots that are missing.</p>
        </div>
      </div>
    </Drawer>
  );
};

// ── structure ────────────────────────────────────────────────────────────────
export const StructureDialog: React.FC<{
  warehouseId: string; current: LevelTemplate | null; templates: LevelTemplate[]; onClose: () => void; onSaved: (msg: string) => void;
}> = ({ warehouseId, current, templates, onClose, onSaved }) => {
  const [pick, setPick] = useState<string>(current?.id ?? templates[0]?.id ?? '');
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [levels, setLevels] = useState<Array<{ label: string; storage: boolean }>>([
    { label: 'Building', storage: false }, { label: 'Floor', storage: false }, { label: 'Room', storage: false },
    { label: 'Wall', storage: false }, { label: 'Shelf', storage: false }, { label: 'Bin', storage: true },
  ]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const move = (i: number, by: number) => setLevels((ls) => { const n = [...ls]; const j = i + by; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      let templateId = pick;
      if (custom) {
        if (!name.trim()) { setErr('Name your structure.'); setBusy(false); return; }
        const r = await api.post('/wms/layout/templates', {
          code: name.trim(), name: name.trim(),
          levels: levels.filter((l) => l.label.trim()).map((l) => ({ levelCode: l.label.trim(), label: l.label.trim(), role: l.storage ? 'storage' : 'area' })),
        });
        templateId = (r.data?.data ?? r.data).id;
      }
      await api.put(`/wms/layout/warehouses/${warehouseId}/template`, { templateId });
      onSaved('Structure updated');
    } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Drawer title="Warehouse structure" subtitle="The levels this facility is organised into, from the biggest to where stock sits"
      onClose={onClose} footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Use this structure'}</Btn></>}>
      <Err msg={err} />
      <div className="space-y-2">
        {templates.map((t) => (
          <label key={t.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${!custom && pick === t.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}>
            <input type="radio" name="tpl" checked={!custom && pick === t.id} onChange={() => { setCustom(false); setPick(t.id); }} className="mt-1" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{t.name}{current?.id === t.id && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">in use</span>}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{t.levels.map((l) => l.label).join(' › ')}</span>
              {t.description && <span className="mt-0.5 block text-[11px] text-slate-400">{t.description}</span>}
            </span>
          </label>
        ))}
        <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${custom ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'}`}>
          <input type="radio" name="tpl" checked={custom} onChange={() => setCustom(true)} className="mt-1" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-slate-900">Make my own</span>
            <span className="mt-0.5 block text-xs text-slate-600">Any levels, any depth — building, unit, floor, wall, bay, row, column…</span>
          </span>
        </label>
        {custom && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <label className="block"><Label>Name</Label><input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Belagavi godown" /></label>
            {levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
                <input className={input} value={l.label} onChange={(e) => setLevels((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-600" title="Stock is kept at this level">
                  <input type="radio" name="storage" checked={l.storage} onChange={() => setLevels((ls) => ls.map((x, j) => ({ ...x, storage: j === i })))} />holds stock
                </label>
                <button className="text-slate-400 hover:text-slate-700" onClick={() => move(i, -1)} aria-label="Up"><ArrowUp className="h-4 w-4" /></button>
                <button className="text-slate-400 hover:text-slate-700" onClick={() => move(i, 1)} aria-label="Down"><ArrowDown className="h-4 w-4" /></button>
                <button className="text-slate-400 hover:text-rose-600" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900" onClick={() => setLevels((ls) => [...ls, { label: '', storage: false }])}><Plus className="h-3.5 w-3.5" />Add a level</button>
            <p className="text-[11px] text-slate-500">Top of the list is the biggest area; the level that "holds stock" is where goods are actually put away. A facility that already has locations can only switch to a structure that still contains their levels.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export { isStorage };
