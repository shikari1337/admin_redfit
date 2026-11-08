/**
 * CAT-12 (lane META-15B): the channel config keys META-1 and META-9C added to the Facebook catalog channel, edited through
 * the channel's existing PATCH like the rest of the Sync settings: `category_map` (store category to Google and Facebook
 * product category), `attribute_fields` (which store attributes fill Meta's variant fields, picked from the summary's
 * `attributes`), `batch_size`, `auto_map`, `margin_bands` and `stock_bands` (the edges custom labels use), the feed
 * fallback (`feed_fallback`, `feed_fallback_hours`, `feed_fallback_interval`), `diagnostics` and the country and language
 * versions (`localized`). An empty field leaves the key out of the config, so the server's seeded value applies; the
 * summary's `config_defaults` says what that value is.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { metaApi, type CatalogSummary, type StoreCategory } from '@/lib/v2/areas/meta';
import type { MetaCtx } from './useMetaCtx';
import { Section, plural, useLoad, writeError } from './common';

/** Meta's variant fields, only while the summary does not list them (`variant_fields`). */
const VARIANT_FIELDS_FALLBACK = ['size', 'color', 'material', 'pattern', 'gender', 'age_group'];
/** The schedules Meta takes for a feed and the content modes the server reads (META-9C `ExtrasConfig`); the summary lists no options. */
const INTERVALS_FALLBACK = [{ key: 'HOURLY', label: 'Every hour' }, { key: 'DAILY', label: 'Every day' }, { key: 'WEEKLY', label: 'Every week' }];
const CONTENT_MODES_FALLBACK = [{ key: 'claim_free', label: 'Claim free texts (written for ads and feeds)' }, { key: 'full', label: 'Full product texts' }];

interface Form {
  batch_size: string;
  auto_map: boolean | null;
  margin_bands: string;
  stock_bands: string;
  attribute_fields: Record<string, string>;
  category_map: Array<{ category_id: string; google: string; facebook: string }>;
  feed_fallback: boolean | null;
  feed_fallback_hours: string;
  feed_fallback_interval: string;
  diagnostics: boolean | null;
  localized_countries: boolean | null;
  localized_languages: string;
  content_mode: string;
}

const list = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : '');
const nums = (t: string): number[] | null => {
  const parts = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = parts.map(Number);
  return out.every((n) => Number.isFinite(n)) ? out : null;
};
const slugs = (t: string): string[] => t.split(',').map((x) => x.trim()).filter(Boolean);
const bandText = (edges: number[] | undefined, unit: string) => {
  if (!edges?.length) return '';
  const e = [...edges].sort((a, b) => a - b);
  const parts = [`up to ${e[0]}${unit}`];
  for (let i = 1; i < e.length; i++) parts.push(`${e[i - 1]} to ${e[i]}${unit}`);
  parts.push(`above ${e[e.length - 1]}${unit}`);
  return parts.join(', ');
};

const CatalogAdvanced: React.FC<{ ctx: MetaCtx; summary: CatalogSummary | null }> = ({ ctx, summary }) => {
  const { toast } = useToast();
  const fb = ctx.fbChannel!;
  const catsQ = useLoad(() => metaApi.categories(), []);
  const defaults = summary?.config_defaults ?? null;
  const fields = summary?.variant_fields?.length ? summary.variant_fields : VARIANT_FIELDS_FALLBACK;
  const initial = useMemo<Form>(() => {
    const c = fb.config ?? {};
    const map = (c.category_map && typeof c.category_map === 'object' ? c.category_map : {}) as Record<string, any>;
    const attrs = (c.attribute_fields && typeof c.attribute_fields === 'object' ? c.attribute_fields : {}) as Record<string, unknown>;
    const loc = (c.localized && typeof c.localized === 'object' ? c.localized : {}) as Record<string, any>;
    return {
      feed_fallback: typeof c.feed_fallback === 'boolean' ? c.feed_fallback : null,
      feed_fallback_hours: c.feed_fallback_hours != null ? String(c.feed_fallback_hours) : '',
      feed_fallback_interval: typeof c.feed_fallback_interval === 'string' ? c.feed_fallback_interval : '',
      diagnostics: typeof c.diagnostics === 'boolean' ? c.diagnostics : null,
      localized_countries: typeof loc.countries === 'boolean' ? loc.countries : null,
      localized_languages: list(loc.languages),
      content_mode: typeof loc.content_mode === 'string' ? loc.content_mode : '',
      batch_size: c.batch_size != null ? String(c.batch_size) : '',
      auto_map: typeof c.auto_map === 'boolean' ? c.auto_map : null,
      margin_bands: list(c.margin_bands),
      stock_bands: list(c.stock_bands),
      attribute_fields: Object.fromEntries(fields.map((f) => [f, list(attrs[f])])),
      category_map: Object.entries(map).map(([category_id, v]) => ({ category_id, google: String(v?.google_product_category ?? ''), facebook: String(v?.fb_product_category ?? '') })),
    };
  }, [fb.config, fields]);
  const [form, setForm] = useState<Form>(initial);
  const [adding, setAdding] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const disabled = !ctx.can.catalog;
  const cats: StoreCategory[] = catsQ.data ?? [];
  const nameOf = (id: string) => cats.find((c) => c.id === id)?.name ?? id;
  const unmapped = cats.filter((c) => !form.category_map.some((m) => m.category_id === c.id));
  const autoMap = form.auto_map ?? defaults?.auto_map ?? true;
  const attributes = summary?.attributes ?? [];
  const attrLabel = (slug: string) => attributes.find((a) => a.key === slug)?.label ?? slug;
  const fallbackOn = form.feed_fallback ?? defaults?.feed_fallback ?? true;
  const diagnosticsOn = form.diagnostics ?? defaults?.diagnostics ?? true;
  const countriesOn = form.localized_countries ?? defaults?.localized?.countries ?? true;
  const setSlugs = (f: string, next: string[]) => setForm({ ...form, attribute_fields: { ...form.attribute_fields, [f]: next.join(', ') } });

  const problem = (): string => {
    if (form.batch_size.trim() && !(Number(form.batch_size) > 0 && Number.isInteger(Number(form.batch_size)))) return 'Products per request must be a whole number above zero.';
    if (form.batch_size.trim() && defaults?.batch_max && Number(form.batch_size) > defaults.batch_max) return `Products per request can be at most ${defaults.batch_max}.`;
    if (form.margin_bands.trim() && !nums(form.margin_bands)) return 'Margin bands are whole percents, for example 20, 40.';
    if (form.stock_bands.trim() && !nums(form.stock_bands)) return 'Stock bands are units, for example 0, 10.';
    if (form.feed_fallback_hours.trim() && !(Number.isInteger(Number(form.feed_fallback_hours)) && Number(form.feed_fallback_hours) >= 1)) return 'The fallback wait is a whole number of hours, at least 1.';
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) { toast({ title: 'Not saved', description: p, variant: 'destructive' }); return; }
    const next: Record<string, any> = { ...(fb.config ?? {}) };
    const put = (k: string, v: unknown) => { if (v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)) delete next[k]; else next[k] = v; };
    put('batch_size', form.batch_size.trim() ? Number(form.batch_size) : null);
    put('auto_map', form.auto_map);
    put('margin_bands', nums(form.margin_bands));
    put('stock_bands', nums(form.stock_bands));
    put('attribute_fields', Object.fromEntries(Object.entries(form.attribute_fields).map(([k, v]) => [k, slugs(v)]).filter(([, v]) => (v as string[]).length)));
    put('feed_fallback', form.feed_fallback);
    put('feed_fallback_hours', form.feed_fallback_hours.trim() ? Number(form.feed_fallback_hours) : null);
    put('feed_fallback_interval', form.feed_fallback_interval || null);
    put('diagnostics', form.diagnostics);
    put('localized', Object.fromEntries(Object.entries({
      countries: form.localized_countries, languages: slugs(form.localized_languages), content_mode: form.content_mode || null,
    }).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))));
    put('category_map', Object.fromEntries(form.category_map.filter((m) => m.google.trim() || m.facebook.trim()).map((m) => [m.category_id, {
      ...(m.google.trim() ? { google_product_category: m.google.trim() } : {}), ...(m.facebook.trim() ? { fb_product_category: m.facebook.trim() } : {}),
    }])));
    setSaving(true);
    try {
      await metaApi.saveChannelConfig(fb.id, next);
      toast({ title: 'Saved', description: 'They apply from the next change; use Sync now to resend everything.' });
      await Promise.all([ctx.reloadChannels(), ctx.reloadSummary()]);
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The settings were not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Section title="Product details and sending" hint="How store data fills Meta's fields, and how products are sent. Empty fields use the seeded value shown."
      actions={!disabled && <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <Label>Meta's variant fields</Label>
            <p className="text-xs text-gray-500">The store attributes that fill each of Meta's fields, tried in order. None picked: the seeded ones shown in grey.</p>
            <div className="mt-2 space-y-2">
              {fields.map((f) => {
                const picked = slugs(form.attribute_fields[f] ?? '');
                const left = attributes.filter((a) => !picked.includes(a.key));
                return (
                  <div key={f} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2">
                    <Label htmlFor={`cat-attr-${f}`} className="pt-1.5 text-xs font-normal text-gray-700">{f.replace(/_/g, ' ')}</Label>
                    {attributes.length ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {picked.map((slug) => (
                          <span key={slug} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs">
                            {attrLabel(slug)}
                            {!disabled && <button type="button" aria-label={`Remove ${attrLabel(slug)} from ${f}`} onClick={() => setSlugs(f, picked.filter((x) => x !== slug))} className="text-gray-400 hover:text-gray-800"><Trash2 className="h-3 w-3" /></button>}
                          </span>
                        ))}
                        {!picked.length && <span className="text-xs text-gray-400">{(defaults?.attribute_fields?.[f] ?? []).map(attrLabel).join(', ') || 'Not filled'}</span>}
                        {!disabled && left.length > 0 && (
                          <select id={`cat-attr-${f}`} aria-label={`Add an attribute to ${f}`} value="" onChange={(e) => e.target.value && setSlugs(f, [...picked, e.target.value])}
                            className="h-7 rounded-md border bg-white px-1.5 text-xs">
                            <option value="">Add</option>
                            {left.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      <Input id={`cat-attr-${f}`} className="h-8 text-sm" value={form.attribute_fields[f] ?? ''} disabled={disabled}
                        placeholder={list(defaults?.attribute_fields?.[f]) || 'Not filled'}
                        onChange={(e) => setForm({ ...form, attribute_fields: { ...form.attribute_fields, [f]: e.target.value } })} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cat-margin">Margin bands (percent)</Label>
              <Input id="cat-margin" className="mt-1" value={form.margin_bands} disabled={disabled} placeholder={list(defaults?.margin_bands) || '20, 40'} onChange={(e) => setForm({ ...form, margin_bands: e.target.value })} />
              <p className="mt-1 text-xs text-gray-500">{bandText(nums(form.margin_bands) ?? defaults?.margin_bands, '%') || 'The edges a margin band custom label uses.'}</p>
            </div>
            <div>
              <Label htmlFor="cat-stock">Stock bands (units)</Label>
              <Input id="cat-stock" className="mt-1" value={form.stock_bands} disabled={disabled} placeholder={list(defaults?.stock_bands) || '0, 10'} onChange={(e) => setForm({ ...form, stock_bands: e.target.value })} />
              <p className="mt-1 text-xs text-gray-500">{bandText(nums(form.stock_bands) ?? defaults?.stock_bands, ' units') || 'The edges a stock band custom label uses.'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cat-batch">Products per request</Label>
              <Input id="cat-batch" className="mt-1" inputMode="numeric" value={form.batch_size} disabled={disabled} placeholder={defaults?.batch_size != null ? String(defaults.batch_size) : 'Seeded value'} onChange={(e) => setForm({ ...form, batch_size: e.target.value })} />
              <p className="mt-1 text-xs text-gray-500">{defaults?.batch_max ? `At most ${defaults.batch_max}. ` : ''}Lower it only if Meta times out.</p>
            </div>
            <label className="flex items-start gap-3 pt-5 text-sm">
              <Switch checked={autoMap} disabled={disabled} onCheckedChange={(v) => setForm({ ...form, auto_map: v })} className="mt-0.5" />
              <span><span className="font-medium">Add new products by themselves</span><span className="block text-xs text-gray-600">New active SKUs join the catalog before each pass.</span></span>
            </label>
          </div>
          <div className="space-y-3 rounded-md border bg-gray-50 p-3">
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={fallbackOn} disabled={disabled} onCheckedChange={(v) => setForm({ ...form, feed_fallback: v })} className="mt-0.5" />
              <span><span className="font-medium">Fall back to a feed when sending fails</span><span className="block text-xs text-gray-600">Meta is given the hosted feed to fetch when the API push keeps failing.</span></span>
            </label>
            {fallbackOn && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cat-fb-hours">After failing for (hours)</Label>
                  <Input id="cat-fb-hours" className="mt-1" inputMode="numeric" value={form.feed_fallback_hours} disabled={disabled} placeholder={defaults?.feed_fallback_hours != null ? String(defaults.feed_fallback_hours) : ''} onChange={(e) => setForm({ ...form, feed_fallback_hours: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cat-fb-int">Meta fetches it</Label>
                  <select id="cat-fb-int" value={form.feed_fallback_interval} disabled={disabled} onChange={(e) => setForm({ ...form, feed_fallback_interval: e.target.value })} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                    <option value="">Seeded: {INTERVALS_FALLBACK.find((x) => x.key === defaults?.feed_fallback_interval)?.label ?? defaults?.feed_fallback_interval ?? 'server default'}</option>
                    {INTERVALS_FALLBACK.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={diagnosticsOn} disabled={disabled} onCheckedChange={(v) => setForm({ ...form, diagnostics: v })} className="mt-0.5" />
              <span><span className="font-medium">Read Meta's diagnostics every night</span><span className="block text-xs text-gray-600">Shown in Catalog health and on each product.</span></span>
            </label>
          </div>
          <div className="space-y-3 rounded-md border bg-gray-50 p-3">
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={countriesOn} disabled={disabled} onCheckedChange={(v) => setForm({ ...form, localized_countries: v })} className="mt-0.5" />
              <span><span className="font-medium">Country prices for international markets</span><span className="block text-xs text-gray-600">Each market's own prices go to Meta as country versions of the products.</span></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cat-langs">Languages</Label>
                <Input id="cat-langs" className="mt-1" value={form.localized_languages} disabled={disabled} placeholder={list(defaults?.localized?.languages) || 'None, for example hi_IN'} onChange={(e) => setForm({ ...form, localized_languages: e.target.value })} />
                <p className="mt-1 text-xs text-gray-500">Content locales whose approved texts become language versions.</p>
              </div>
              <div>
                <Label htmlFor="cat-mode">Texts used</Label>
                <select id="cat-mode" value={form.content_mode} disabled={disabled} onChange={(e) => setForm({ ...form, content_mode: e.target.value })} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                  <option value="">Seeded: {CONTENT_MODES_FALLBACK.find((x) => x.key === defaults?.localized?.content_mode)?.label ?? defaults?.localized?.content_mode ?? 'server default'}</option>
                  {CONTENT_MODES_FALLBACK.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div>
          <Label>Product categories on Google and Facebook</Label>
          <p className="text-xs text-gray-500">For each store category, the category number or path from Google's and Facebook's product category lists. A product takes its deepest mapped category.</p>
          {catsQ.error && !catsQ.data ? <p className="mt-2 text-sm text-red-700">Could not load your categories.</p> : (
            <>
              {!form.category_map.length ? <p className="mt-2 text-sm text-gray-600">No category is mapped yet.</p> : (
                <ul className="mt-2 space-y-2">
                  {form.category_map.map((m, i) => (
                    <li key={m.category_id} className="rounded-md border bg-white p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">{nameOf(m.category_id)}</span>
                        {!disabled && <button type="button" aria-label={`Remove ${nameOf(m.category_id)}`} onClick={() => setForm({ ...form, category_map: form.category_map.filter((_, j) => j !== i) })} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        <Input aria-label={`Google product category for ${nameOf(m.category_id)}`} className="h-8 text-sm" placeholder="Google, for example 491" value={m.google} disabled={disabled}
                          onChange={(e) => setForm({ ...form, category_map: form.category_map.map((x, j) => (j === i ? { ...x, google: e.target.value } : x)) })} />
                        <Input aria-label={`Facebook product category for ${nameOf(m.category_id)}`} className="h-8 text-sm" placeholder="Facebook" value={m.facebook} disabled={disabled}
                          onChange={(e) => setForm({ ...form, category_map: form.category_map.map((x, j) => (j === i ? { ...x, facebook: e.target.value } : x)) })} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!disabled && unmapped.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select aria-label="Category to map" value={adding} onChange={(e) => setAdding(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm">
                    <option value="">Pick a category ({plural(unmapped.length, 'left', 'left')})</option>
                    {unmapped.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" disabled={!adding} onClick={() => { setForm({ ...form, category_map: [...form.category_map, { category_id: adding, google: '', facebook: '' }] }); setAdding(''); }}><Plus /> Map it</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
};

export default CatalogAdvanced;
