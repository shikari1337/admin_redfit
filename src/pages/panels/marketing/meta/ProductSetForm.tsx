/**
 * A new product set from filters (the Catalog tab and the remarketing wizard both use it). Saved through the
 * Commerce product-set route on the store's facebook_catalog channel, the one home of product sets.
 * The filter shape is a CONTRACT QUESTION (the contract says only `{name, filter}`).
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { majorToMinor } from '@/lib/v2/money';
import { metaApi, type ProductSet, type ProductSetFilter, type StoreCategory } from '@/lib/v2/areas/meta';
import { money, writeError } from './common';

export interface SetDraft { name: string; category_ids: string[]; min: string; max: string; in_stock_only: boolean }
export const EMPTY_SET: SetDraft = { name: '', category_ids: [], min: '', max: '', in_stock_only: true };

export const filterOf = (d: SetDraft): ProductSetFilter => ({
  category_ids: d.category_ids.length ? d.category_ids : undefined,
  price_min_minor: d.min === '' ? null : majorToMinor(d.min),
  price_max_minor: d.max === '' ? null : majorToMinor(d.max),
  in_stock_only: d.in_stock_only,
});

/** "Mother Tinctures, Drops; 100 to 500 rupees; in stock only" for a saved set. */
export function filterText(f: ProductSet['filter'], categories: StoreCategory[]): string {
  const x = f as ProductSetFilter;
  const parts: string[] = [];
  if (x.category_ids?.length) parts.push(x.category_ids.map((id) => categories.find((c) => c.id === id)?.name ?? id).join(', '));
  const lo = x.price_min_minor, hi = x.price_max_minor;
  if (lo != null && hi != null) parts.push(`${money(lo)} to ${money(hi)}`);
  else if (lo != null) parts.push(`from ${money(lo)}`);
  else if (hi != null) parts.push(`up to ${money(hi)}`);
  if (x.in_stock_only) parts.push('in stock only');
  const text = parts.join('; ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'All products';
}

/** The fields only (the wizard saves the set itself on Next). */
export const SetFields: React.FC<{ value: SetDraft; onChange: (d: SetDraft) => void; categories: StoreCategory[] }> = ({ value, onChange, categories }) => {
  const toggle = (id: string) => onChange({ ...value, category_ids: value.category_ids.includes(id) ? value.category_ids.filter((x) => x !== id) : [...value.category_ids, id] });
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="ps-name">Set name</Label>
        <Input id="ps-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="For example: Mother tinctures in stock" />
      </div>
      <div>
        <Label>Categories <span className="font-normal text-gray-500">(none picked = all)</span></Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={value.category_ids.includes(c.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${value.category_ids.includes(c.id) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ps-min">Price from (rupees)</Label>
          <Input id="ps-min" inputMode="decimal" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} placeholder="Any" />
        </div>
        <div>
          <Label htmlFor="ps-max">Price up to (rupees)</Label>
          <Input id="ps-max" inputMode="decimal" value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })} placeholder="Any" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={value.in_stock_only} onCheckedChange={(v) => onChange({ ...value, in_stock_only: v })} /> Only products in stock
      </label>
    </div>
  );
};

/** Fields plus a Create button (the Catalog tab). */
const ProductSetForm: React.FC<{ channelId: string; categories: StoreCategory[]; onCreated: (s: ProductSet) => void; onCancel: () => void }> = ({ channelId, categories, onCreated, onCancel }) => {
  const [d, setD] = useState<SetDraft>(EMPTY_SET);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!d.name.trim()) { setError('Give the set a name.'); return; }
    setSaving(true); setError('');
    try {
      onCreated(await metaApi.createProductSet(channelId, d.name.trim(), filterOf(d)));
    } catch (e) { setError(writeError(e, 'The set was not saved.')); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-3 rounded-md border bg-gray-50 p-3">
      <SetFields value={d} onChange={setD} categories={categories} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Create set'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

export default ProductSetForm;
