import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { Btn } from '../erp';

/**
 * Create / edit ONE warehouse location, and bulk-generate a run of them.
 *
 * The old builder could only ADD a node and then delete it — there was no way to
 * correct a code, a capacity or a flag, and capacity meant "Max units" alone
 * even though `max_weight_g` / `max_volume_ml` have been columns since migration
 * 034. This is the surface that finally reaches all three.
 *
 * UNITS: the API stores GRAMS and MILLILITRES; a person types KILOGRAMS and
 * LITRES. The conversion happens here, once, at the edge — nothing downstream
 * has to know (the same shape as money-in-minor-units elsewhere).
 */

export type LocKind = 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin';

export interface LocationRow {
  id: string; warehouse_id: string; parent_id: string | null;
  kind: LocKind; code: string; name: string | null;
  status: string; pickable: boolean; flags: Record<string, boolean>;
  max_units: number | null; max_weight_g: number | string | null; max_volume_ml: number | string | null;
  pick_sequence: number | null;
  current_units: number; sku_count: number;
  used_volume_ml?: number | string; used_weight_g?: number | string; unsized_units?: number;
  descendant_bins?: number;
}

export const FLAG_OPTIONS = [
  'pick_face', 'bulk', 'quarantine', 'damaged', 'returns', 'cold_chain', 'hazmat', 'overflow',
];

const G_PER_KG = 1000;
const ML_PER_L = 1000;
const toKg = (g: any) => (g == null || g === '' ? '' : String(Number(g) / G_PER_KG));
const toL = (ml: any) => (ml == null || ml === '' ? '' : String(Number(ml) / ML_PER_L));
const fromKg = (kg: string) => (kg.trim() === '' ? null : Math.round(Number(kg) * G_PER_KG));
const fromL = (l: string) => (l.trim() === '' ? null : Math.round(Number(l) * ML_PER_L));

const input =
  'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm shadow-sm ' +
  'focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:bg-gray-50';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> =
  ({ label, hint, children, className }) => (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-gray-500">{hint}</span>}
    </label>
  );

export interface EditorTarget {
  mode: 'create' | 'edit' | 'generate';
  kind: LocKind;
  parent: LocationRow | null;
  location?: LocationRow;
}

const LocationEditor: React.FC<{
  target: EditorTarget | null;
  warehouseId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: {
    create: (body: any) => Promise<any>;
    update: (id: string, body: any) => Promise<any>;
    generate: (body: any) => Promise<any>;
  };
}> = ({ target, warehouseId, canEdit, onClose, onSaved, api }) => {
  const [f, setF] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    const l = target.location;
    setF({
      code: l?.code ?? (target.parent ? `${target.parent.code}-` : ''),
      name: l?.name ?? '',
      maxUnits: l?.max_units != null ? String(l.max_units) : '',
      maxWeightKg: toKg(l?.max_weight_g),
      maxVolumeL: toL(l?.max_volume_ml),
      pickSequence: l?.pick_sequence != null ? String(l.pick_sequence) : '',
      // generate-only
      prefix: target.parent ? `${target.parent.code}-` : '',
      count: '12', startAt: '1', pad: '2', pickSequenceFrom: '',
    });
    setFlags(Object.keys(l?.flags ?? {}).filter((k) => (l!.flags as any)[k]));
    setError('');
  }, [target]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const val = (k: string) => f[k] ?? '';

  // A run of codes, shown before anything is created — the whole reason bulk
  // generation is safe to offer.
  const preview = useMemo(() => {
    if (target?.mode !== 'generate') return [];
    const n = Math.min(500, Math.max(1, parseInt(val('count'), 10) || 0));
    const from = Math.max(0, parseInt(val('startAt'), 10) || 1);
    const pad = Math.min(6, Math.max(1, parseInt(val('pad'), 10) || 2));
    const out: string[] = [];
    for (let i = 0; i < Math.min(n, 4); i++) out.push(`${val('prefix')}${String(from + i).padStart(pad, '0')}`);
    if (n > 4) out.push('…', `${val('prefix')}${String(from + n - 1).padStart(pad, '0')}`);
    return out;
  }, [target, f]);

  if (!target) return null;
  const isBin = target.kind === 'bin';
  const title = target.mode === 'edit' ? `Edit ${target.location?.kind} ${target.location?.code}`
    : target.mode === 'generate' ? `Generate ${target.kind}s`
    : `New ${target.kind}`;

  const capacityBody = () => ({
    maxUnits: val('maxUnits').trim() === '' ? null : Math.max(1, parseInt(val('maxUnits'), 10)),
    maxWeightG: fromKg(val('maxWeightKg')),
    maxVolumeMl: fromL(val('maxVolumeL')),
  });

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      if (target.mode === 'edit') {
        await api.update(target.location!.id, {
          code: val('code').trim(), name: val('name').trim() || null,
          flags: Object.fromEntries(FLAG_OPTIONS.map((k) => [k, flags.includes(k)])),
          pickSequence: val('pickSequence').trim() === '' ? undefined : parseInt(val('pickSequence'), 10),
          ...capacityBody(),
        });
        onSaved('Location updated.');
      } else if (target.mode === 'generate') {
        const res = await api.generate({
          warehouseId, parentId: target.parent?.id ?? null, kind: target.kind,
          prefix: val('prefix'),
          count: Math.min(500, Math.max(1, parseInt(val('count'), 10) || 1)),
          startAt: parseInt(val('startAt'), 10) || 1,
          pad: parseInt(val('pad'), 10) || 2,
          flags: Object.fromEntries(FLAG_OPTIONS.map((k) => [k, flags.includes(k)])),
          pickSequenceFrom: val('pickSequenceFrom').trim() === '' ? undefined : parseInt(val('pickSequenceFrom'), 10),
          ...capacityBody(),
        });
        const d = res?.data ?? res;
        onSaved(`${d?.created ?? 0} created${d?.skipped?.length ? `, ${d.skipped.length} already existed` : ''}.`);
      } else {
        if (!val('code').trim()) { setError('A code is required.'); setBusy(false); return; }
        await api.create({
          warehouseId, parentId: target.parent?.id ?? null, kind: target.kind,
          code: val('code').trim(), name: val('name').trim() || null,
          flags: Object.fromEntries(FLAG_OPTIONS.map((k) => [k, flags.includes(k)])),
          pickSequence: val('pickSequence').trim() === '' ? null : parseInt(val('pickSequence'), 10),
          ...capacityBody(),
        });
        onSaved('Location created.');
      }
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? 'Could not save.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
            {target.parent && (
              <div className="mt-0.5 text-xs text-gray-500">
                under <span className="font-mono">{target.parent.code}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4">
          {!canEdit && (
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              You can view the layout but not change it — editing needs the “adjust inventory” permission.
            </div>
          )}

          {target.mode === 'generate' ? (
            <section>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">How many</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code prefix" hint="Numbers are appended to this.">
                  <input className={input} value={val('prefix')} onChange={set('prefix')} disabled={!canEdit} />
                </Field>
                <Field label={`How many ${target.kind}s`} hint="Up to 500 at a time.">
                  <input className={input} type="number" min={1} max={500} value={val('count')} onChange={set('count')} disabled={!canEdit} />
                </Field>
                <Field label="Start numbering at">
                  <input className={input} type="number" min={0} value={val('startAt')} onChange={set('startAt')} disabled={!canEdit} />
                </Field>
                <Field label="Digits" hint="2 ⇒ 01, 02 …">
                  <input className={input} type="number" min={1} max={6} value={val('pad')} onChange={set('pad')} disabled={!canEdit} />
                </Field>
              </div>
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-medium text-gray-600">Will create</div>
                <div className="mt-1 font-mono text-xs text-gray-800">{preview.join('  ') || '—'}</div>
                <div className="mt-1 text-[11px] text-gray-500">
                  A code that already exists is skipped, so you can re-run this to extend a rack.
                </div>
              </div>
              <Field className="mt-3" label="Pick sequence starts at"
                hint="Optional. The order a picker walks these — left blank, they have none.">
                <input className={input} type="number" value={val('pickSequenceFrom')} onChange={set('pickSequenceFrom')} disabled={!canEdit} />
              </Field>
            </section>
          ) : (
            <section>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Identity</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code" hint="Unique in this warehouse.">
                  <input className={input} value={val('code')} onChange={set('code')} disabled={!canEdit} />
                </Field>
                <Field label="Name" hint="Optional, for humans.">
                  <input className={input} value={val('name')} onChange={set('name')} disabled={!canEdit} />
                </Field>
                {isBin && (
                  <Field label="Pick sequence" hint="Lower is walked first.">
                    <input className={input} type="number" value={val('pickSequence')} onChange={set('pickSequence')} disabled={!canEdit} />
                  </Field>
                )}
              </div>
            </section>
          )}

          {/* ── Capacity: all three limits, in human units ─────────────── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Capacity</h3>
            <p className="mb-2.5 mt-1 text-[11px] leading-snug text-gray-500">
              How much this location can hold. Leave a box empty for “no limit”. Putaway checks
              every limit you set and refuses the one that would be broken.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Max units">
                <input className={input} type="number" min={1} value={val('maxUnits')} onChange={set('maxUnits')} disabled={!canEdit} placeholder="—" />
              </Field>
              <Field label="Max weight (kg)">
                <input className={input} type="number" min={0} step="0.1" value={val('maxWeightKg')} onChange={set('maxWeightKg')} disabled={!canEdit} placeholder="—" />
              </Field>
              <Field label="Max volume (L)">
                <input className={input} type="number" min={0} step="0.1" value={val('maxVolumeL')} onChange={set('maxVolumeL')} disabled={!canEdit} placeholder="—" />
              </Field>
            </div>
            <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                A weight or volume limit can only be checked for products whose <strong>pack size is
                filled in</strong>. Stock with no size on record is refused from a location that has one,
                rather than being let in unmeasured. Sizes are set per SKU on the Inventory sheet
                (Length / Breadth / Height / Weight).
              </span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">What it is used for</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-700">
              {FLAG_OPTIONS.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={flags.includes(k)} disabled={!canEdit}
                    onChange={(e) => setFlags(e.target.checked ? [...flags, k] : flags.filter((x) => x !== k))} />
                  {k.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-500">
              Flags are inherited down the tree — a bin inside a <span className="font-mono">cold_chain</span>{' '}
              zone counts as cold chain without being ticked itself.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 space-y-2 border-t border-gray-200 bg-white px-5 py-3">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={submit} disabled={!canEdit || busy}>
              {busy ? 'Saving…' : target.mode === 'generate' ? 'Generate' : target.mode === 'edit' ? 'Save' : 'Create'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationEditor;
