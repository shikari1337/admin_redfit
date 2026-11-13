import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Power, PowerOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  shippingZonesAPI, errorText,
  type ShippingMethodRow, type ShippingMethodInput, type ShippingRateConfig,
} from '../../services/api';
import { fmtRupees } from '../../lib/money';

/**
 * A zone's rates (MENU-1 shipments): the priced methods checkout reads when an order's address
 * falls in this zone (commerce `rate_for_method`). Three rules, the same three checkout knows:
 * a flat fee; a base plus a rate per kg (weight rounded up to the half kg); weight slabs, then a
 * rate for each kg past the last slab. A method is switched off, never deleted, so the history of
 * what a zone charged stays readable.
 */
interface Props {
  zoneId: string;
  zoneName: string;
  canManage: boolean;
}

type RuleType = ShippingRateConfig['type'];
const RULE_LABEL: Record<RuleType, string> = { flat: 'Flat fee', weight: 'Base + per kg', slab: 'Weight slabs' };

interface SlabForm { uptoGrams: string; rate: string }
interface MethodForm {
  id: string;
  name: string;
  type: RuleType;
  base: string;
  perKg: string;
  perExtraKg: string;
  slabs: SlabForm[];
  daysMin: string;
  daysMax: string;
  freeAbove: string;
  minOrder: string;
  maxWeightKg: string;
}

const emptyForm = (): MethodForm => ({
  id: '', name: '', type: 'flat', base: '', perKg: '', perExtraKg: '',
  slabs: [{ uptoGrams: '500', rate: '' }], daysMin: '', daysMax: '', freeAbove: '', minOrder: '', maxWeightKg: '',
});

const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
const num = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const ruleOf = (m: ShippingMethodRow): ShippingRateConfig => {
  const rc: any = m.rate_config && typeof m.rate_config === 'object' ? m.rate_config : {};
  const t = String((m as any).method_type ?? m.type ?? rc.type ?? '');
  const type: RuleType = t === 'weight' || t === 'slab' ? t : (Array.isArray(rc.slabs) && rc.slabs.length ? 'slab' : rc.perKg != null ? 'weight' : 'flat');
  return {
    type,
    base: rc.base != null ? Number(rc.base) : undefined,
    perKg: rc.perKg != null ? Number(rc.perKg) : undefined,
    perExtraKg: rc.perExtraKg != null ? Number(rc.perExtraKg) : undefined,
    slabs: Array.isArray(rc.slabs)
      ? rc.slabs.map((s: any) => ({ uptoGrams: Number(s?.uptoGrams), rate: Number(s?.rate) })).filter((s: any) => s.uptoGrams > 0)
      : [],
  };
};

/** The rule in words, as a person reads a rate card. */
export const describeRule = (rc: ShippingRateConfig): string => {
  if (rc.type === 'weight') return `${fmtRupees(rc.base ?? 0)} + ${fmtRupees(rc.perKg ?? 0)} per kg`;
  if (rc.type === 'slab') {
    const slabs = [...(rc.slabs ?? [])].sort((a, b) => a.uptoGrams - b.uptoGrams);
    if (!slabs.length) return 'No slabs set, so this method cannot price a parcel';
    const parts = slabs.map((s) => `up to ${s.uptoGrams >= 1000 ? `${s.uptoGrams / 1000} kg` : `${s.uptoGrams} g`}: ${fmtRupees(s.rate)}`);
    return `${parts.join(', ')}${rc.perExtraKg ? `, then ${fmtRupees(rc.perExtraKg)} per extra kg` : ''}`;
  }
  return fmtRupees(rc.base ?? 0);
};

const ZoneRates: React.FC<Props> = ({ zoneId, zoneName, canManage }) => {
  const [methods, setMethods] = useState<ShippingMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MethodForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMethods(await shippingZonesAPI.getMethods(zoneId));
    } catch (e) {
      setError(errorText(e, 'The rates of this zone could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (m: ShippingMethodRow) => {
    const rc = ruleOf(m);
    setForm({
      id: m.id,
      name: txt(m.name),
      type: rc.type,
      base: txt(rc.base),
      perKg: txt(rc.perKg),
      perExtraKg: txt(rc.perExtraKg),
      slabs: rc.slabs?.length ? rc.slabs.map((s) => ({ uptoGrams: txt(s.uptoGrams), rate: txt(s.rate) })) : [{ uptoGrams: '500', rate: '' }],
      daysMin: txt(m.estimated_days_min),
      daysMax: txt(m.estimated_days_max),
      freeAbove: txt(m.free_above),
      minOrder: txt(m.min_order),
      maxWeightKg: m.max_weight_grams ? String(Number(m.max_weight_grams) / 1000) : '',
    });
    setError(null);
  };

  const set = <K extends keyof MethodForm>(k: K, v: MethodForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setSlab = (i: number, k: keyof SlabForm, v: string) =>
    setForm((f) => (f ? { ...f, slabs: f.slabs.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } : f));

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { setError('Give the rate a name shoppers understand, for example Standard delivery.'); return; }
    const rc: ShippingRateConfig = { type: form.type };
    if (form.type === 'flat' || form.type === 'weight') {
      const base = num(form.base);
      if (base === undefined || base < 0) { setError('Enter the fee in rupees (0 or more).'); return; }
      rc.base = base;
    }
    if (form.type === 'weight') {
      const perKg = num(form.perKg);
      if (perKg === undefined || perKg < 0) { setError('Enter the rate per kg in rupees (0 or more).'); return; }
      rc.perKg = perKg;
    }
    if (form.type === 'slab') {
      const slabs = form.slabs
        .map((s) => ({ uptoGrams: Math.round(num(s.uptoGrams) ?? 0), rate: num(s.rate) }))
        .filter((s) => s.uptoGrams > 0);
      if (!slabs.length || slabs.some((s) => s.rate === undefined || (s.rate as number) < 0)) {
        setError('Every slab needs a weight in grams above 0 and a fee in rupees.'); return;
      }
      rc.slabs = slabs.sort((a, b) => a.uptoGrams - b.uptoGrams).map((s) => ({ uptoGrams: s.uptoGrams, rate: s.rate as number }));
      const extra = num(form.perExtraKg);
      if (extra !== undefined && extra > 0) rc.perExtraKg = extra;
    }
    const daysMin = num(form.daysMin);
    const daysMax = num(form.daysMax);
    if (daysMin !== undefined && daysMax !== undefined && daysMax < daysMin) { setError('The latest delivery day cannot be before the earliest.'); return; }
    const payload: ShippingMethodInput = { name: form.name.trim(), type: form.type, rate_config: rc };
    if (daysMin !== undefined) payload.estimated_days_min = Math.round(daysMin);
    if (daysMax !== undefined) payload.estimated_days_max = Math.round(daysMax);
    const freeAbove = num(form.freeAbove);
    if (freeAbove !== undefined) payload.free_above = freeAbove;
    const minOrder = num(form.minOrder);
    if (minOrder !== undefined) payload.min_order = minOrder;
    const maxKg = num(form.maxWeightKg);
    if (maxKg !== undefined && maxKg > 0) payload.max_weight_grams = Math.round(maxKg * 1000);

    setSaving(true);
    setError(null);
    try {
      if (form.id) await shippingZonesAPI.updateMethod(form.id, payload);
      else await shippingZonesAPI.createMethod(zoneId, { ...payload, is_active: true });
      setForm(null);
      await load();
    } catch (e) {
      setError(errorText(e, 'The rate could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (m: ShippingMethodRow) => {
    setTogglingId(m.id);
    setError(null);
    try {
      await shippingZonesAPI.updateMethod(m.id, { is_active: m.is_active === false });
      await load();
    } catch (e) {
      setError(errorText(e, 'The rate could not be changed.'));
    } finally {
      setTogglingId(null);
    }
  };

  const active = methods.filter((m) => m.is_active !== false).length;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Rates in {zoneName}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {loading ? 'Loading' : active === 0 ? 'No active rate, so this zone falls back to the flat fee' : `${active} active`}
          </span>
        </p>
        <p className="basis-full text-[11px] text-muted-foreground order-last">
          Checkout charges the cheapest active rate that fits the parcel&apos;s weight and the order value.
        </p>
        {canManage && !form && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setForm(emptyForm()); setError(null); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add rate
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>
      )}

      {form && (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name shoppers see</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Standard delivery" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">How it is priced</Label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value as RuleType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(RULE_LABEL) as RuleType[]).map((t) => <option key={t} value={t}>{RULE_LABEL[t]}</option>)}
              </select>
            </div>
          </div>

          {(form.type === 'flat' || form.type === 'weight') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{form.type === 'flat' ? 'Fee (₹)' : 'Base fee (₹)'}</Label>
                <Input type="number" min="0" step="0.01" value={form.base} onChange={(e) => set('base', e.target.value)} className="h-9" />
              </div>
              {form.type === 'weight' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Per kg (₹), weight rounded up to the half kg</Label>
                  <Input type="number" min="0" step="0.01" value={form.perKg} onChange={(e) => set('perKg', e.target.value)} className="h-9" />
                </div>
              )}
            </div>
          )}

          {form.type === 'slab' && (
            <div className="space-y-2">
              {form.slabs.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Up to (grams)</Label>
                    <Input type="number" min="1" step="1" value={s.uptoGrams} onChange={(e) => setSlab(i, 'uptoGrams', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fee (₹)</Label>
                    <Input type="number" min="0" step="0.01" value={s.rate} onChange={(e) => setSlab(i, 'rate', e.target.value)} className="h-9" />
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-9 w-9 p-0 text-destructive"
                    disabled={form.slabs.length <= 1}
                    onClick={() => set('slabs', form.slabs.filter((_, j) => j !== i))}
                    aria-label="Remove slab"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-end gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => set('slabs', [...form.slabs, { uptoGrams: '', rate: '' }])}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add slab
                </Button>
                <div className="space-y-1 w-full sm:w-56">
                  <Label className="text-xs">Each kg past the last slab (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={form.perExtraKg} onChange={(e) => set('perExtraKg', e.target.value)} placeholder="Leave empty to stop at the last slab" className="h-9" />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Delivery from (days)</Label>
              <Input type="number" min="0" step="1" value={form.daysMin} onChange={(e) => set('daysMin', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Delivery to (days)</Label>
              <Input type="number" min="0" step="1" value={form.daysMax} onChange={(e) => set('daysMax', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Free from (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.freeAbove} onChange={(e) => set('freeAbove', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Minimum order (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Heaviest parcel (kg)</Label>
              <Input type="number" min="0" step="0.1" value={form.maxWeightKg} onChange={(e) => set('maxWeightKg', e.target.value)} className="h-9" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Leave a box empty for no limit. Saved values stay as they are when a box is cleared on an existing rate.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {form.id ? 'Save rate' : 'Add rate'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setForm(null); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : methods.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No rate in this zone yet. Orders here pay the flat shipping fee until a rate is added.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {methods.map((m) => {
            const rc = ruleOf(m);
            const off = m.is_active === false;
            const days = m.estimated_days_min != null || m.estimated_days_max != null
              ? `${m.estimated_days_min ?? m.estimated_days_max}${m.estimated_days_max != null && m.estimated_days_max !== m.estimated_days_min ? ` to ${m.estimated_days_max}` : ''} days`
              : null;
            return (
              <li key={m.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 ${off ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium flex flex-wrap items-center gap-2">
                    {m.name || 'Unnamed rate'}
                    <Badge variant="secondary" className="text-[10px]">{RULE_LABEL[rc.type]}</Badge>
                    {off && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">
                    {describeRule(rc)}
                    {days ? `. ${days}` : ''}
                    {m.free_above != null && Number(m.free_above) > 0 ? `. Free from ${fmtRupees(m.free_above)}` : ''}
                    {m.min_order != null && Number(m.min_order) > 0 ? `. Orders from ${fmtRupees(m.min_order)}` : ''}
                    {m.max_weight_grams ? `. Up to ${Number(m.max_weight_grams) / 1000} kg` : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1.5 shrink-0">
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
                      disabled={togglingId === m.id}
                      onClick={() => toggle(m)}
                    >
                      {togglingId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : off ? <><Power className="h-3.5 w-3.5 mr-1" />Switch on</> : <><PowerOff className="h-3.5 w-3.5 mr-1" />Switch off</>}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ZoneRates;
