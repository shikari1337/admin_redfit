import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { b2bAPI } from '../../services/api';
import { localeDate } from '../../utils/date';

/** A product×tier bulk slab → product_b2b_pricing (pricing P3 tier slab, or P4 any-tier when
 *  tierName is empty — price-list rules from B2B → Price Lists outrank BOTH). */
export interface B2BPricingTier {
  id?: string;
  tierName: string;           // '' = Any tier (generic slab → P3)
  variationId?: string | null; // null = whole product
  minQty: number;
  maxQty?: number;
  priceType: 'fixed' | 'percentage_off' | 'markup_on_cost';
  priceValue: number;
  isActive: boolean;
  validFrom?: string;
  validUntil?: string;
}

interface B2BContract {
  id: string;
  customer_id: string;
  company_name?: string;
  variation_id?: string | null;
  unit_price: number | string;
  valid_from?: string | null;
  valid_until?: string | null;
}

interface B2BCustomer {
  customer_id: string;
  company_name: string;
  b2b_tier?: string | null;
}

interface VariationOpt { id?: string; sku?: string; name?: string }

interface ProductB2BPricingProps {
  tiers: B2BPricingTier[];
  onChange: (tiers: B2BPricingTier[]) => void;
  /** Required for account prices — contracts are keyed by customer × product. */
  productId?: string;
  variations?: VariationOpt[];
}

const defaultTier = (): B2BPricingTier => ({
  tierName: '', minQty: 1, maxQty: undefined, priceType: 'fixed', priceValue: 0, isActive: true, variationId: null,
});

const inputCls = 'px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-400 w-full';
const money = (v: any) => Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const ProductB2BPricing: React.FC<ProductB2BPricingProps> = ({ tiers, onChange, productId, variations = [] }) => {
  const [storeTiers, setStoreTiers] = useState<string[]>([]);
  const [customers, setCustomers] = useState<B2BCustomer[]>([]);
  const [contracts, setContracts] = useState<B2BContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Permission honesty — 403 on b2b.read means "can't see", not "doesn't exist".
  const [tiersDenied, setTiersDenied] = useState(false);
  const [accountsDenied, setAccountsDenied] = useState(false);
  // Names of ACTIVE price lists whose rules target this product (they outrank the slabs here).
  const [plOverrides, setPlOverrides] = useState<string[]>([]);

  // New-contract form
  const [cForm, setCForm] = useState({ customer_id: '', variation_id: '', unit_price: '', valid_until: '' });
  const [savingContract, setSavingContract] = useState(false);

  // Tier names come from store.settings.b2b.tiers — the SAME list the waterfall
  // matches against. Free text here would silently never match a customer.
  useEffect(() => {
    // Interceptor unwraps {success,data} → r IS the settings object; tolerate both.
    b2bAPI.getSettings()
      .then((r) => setStoreTiers(Object.keys(r?.tiers ?? r?.data?.tiers ?? {})))
      .catch((e: any) => { setStoreTiers([]); if (e?.response?.status === 403) setTiersDenied(true); });
    b2bAPI.getB2BCustomers()
      .then((r) => setCustomers(r?.data ?? []))
      .catch((e: any) => { setCustomers([]); if (e?.response?.status === 403) setAccountsDenied(true); });
  }, []);

  const loadContracts = () => {
    if (!productId) return;
    setLoadingContracts(true);
    b2bAPI.getProductContracts(productId)
      .then((r) => setContracts(r?.data ?? []))
      .catch(() => setContracts([]))
      .finally(() => setLoadingContracts(false));
  };
  useEffect(loadContracts, [productId]);

  // Price-list rules (B2B → Price Lists) OUTRANK every slab on this card. Surface any
  // active rule targeting this product so merchants aren't surprised at checkout.
  // Best-effort: on 403 / any failure we say nothing (no error, no notice).
  const variationIdsKey = variations.map((v) => v.id).filter(Boolean).join(',');
  useEffect(() => {
    if (!productId) { setPlOverrides([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const lr: any = await b2bAPI.getPriceLists();
        const lists: any[] = Array.isArray(lr) ? lr : (lr?.data ?? []);
        const varIds = new Set(variationIdsKey ? variationIdsKey.split(',') : []);
        const hits: string[] = [];
        for (const list of lists.filter((l: any) => l?.is_active !== false)) {
          try {
            const rr: any = await b2bAPI.getPriceRules(list.id);
            const rules: any[] = Array.isArray(rr) ? rr : (rr?.data ?? []);
            const matches = rules.some((rule: any) => rule?.is_active !== false && (
              rule?.rule_type === 'global'
              || (rule?.rule_type === 'product' && rule?.entity_id === productId)
              || (rule?.rule_type === 'variant' && rule?.entity_id && varIds.has(rule.entity_id))
            ));
            if (matches) hits.push(list?.name || 'Unnamed list');
          } catch { /* rules unreadable for this list — skip it */ }
        }
        if (!cancelled) setPlOverrides(hits);
      } catch {
        if (!cancelled) setPlOverrides([]); // 403 or module off — show nothing
      }
    })();
    return () => { cancelled = true; };
  }, [productId, variationIdsKey]);

  const add = () => onChange([...tiers, defaultTier()]);
  const remove = (idx: number) => onChange(tiers.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<B2BPricingTier>) => {
    const next = [...tiers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  // ── Simple products: one flat wholesale price ────────────────────────────
  // With no variations, most merchants want ONE wholesale number, not a slab
  // matrix. The input below binds to a single GENERIC slab (any tier, whole
  // product, min qty 1, fixed price) — created on first type, updated in
  // place, removed when cleared. The full editor stays available under
  // "Advanced".
  const isSimple = variations.length === 0;
  const isGenericFlat = (t: B2BPricingTier) =>
    !t.tierName && (t.variationId == null || t.variationId === '') && Number(t.minQty) === 1 && t.priceType === 'fixed';
  let flatIdx = tiers.findIndex((t) => isGenericFlat(t) && !t.maxQty);
  if (flatIdx === -1) flatIdx = tiers.findIndex(isGenericFlat);
  const flatValue = flatIdx >= 0 ? tiers[flatIdx].priceValue : undefined;

  const setFlatPrice = (raw: string) => {
    if (raw === '') {
      if (flatIdx >= 0) onChange(tiers.filter((_, i) => i !== flatIdx));
      return;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    if (flatIdx >= 0) {
      const next = [...tiers];
      next[flatIdx] = { ...next[flatIdx], priceValue: num, isActive: true };
      onChange(next);
    } else {
      onChange([...tiers, { tierName: '', variationId: null, minQty: 1, priceType: 'fixed', priceValue: num, isActive: true }]);
    }
  };

  // Advanced slab editor: collapsed by default for simple products, but opens
  // itself when the product already carries slabs beyond the flat one.
  const hasAdvancedSlabs = tiers.some((_t, i) => i !== flatIdx);
  const [advToggled, setAdvToggled] = useState<boolean | null>(null);
  const advOpen = advToggled ?? hasAdvancedSlabs;

  const addContract = async () => {
    if (!productId) return;
    if (!cForm.customer_id || cForm.unit_price === '') { setErr('Pick an account and enter a price.'); return; }
    setSavingContract(true); setErr(null);
    try {
      await b2bAPI.createContract({
        customer_id: cForm.customer_id,
        product_id: productId,
        variation_id: cForm.variation_id || null,
        unit_price: Number(cForm.unit_price) || 0,
        valid_until: cForm.valid_until || null,
      });
      setCForm({ customer_id: '', variation_id: '', unit_price: '', valid_until: '' });
      loadContracts();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to save account price');
    } finally { setSavingContract(false); }
  };

  const removeContract = async (id: string) => {
    if (!window.confirm('Remove this account price?')) return;
    try { await b2bAPI.deleteContract(id); loadContracts(); }
    catch (e: any) { setErr(e?.response?.data?.message || 'Failed to remove'); }
  };

  const varLabel = (id?: string | null) => {
    if (!id) return 'All variations';
    const v = variations.find((x) => x.id === id);
    return v ? (v.name || v.sku || 'Variation') : 'Variation';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">B2B / Wholesale Pricing</h3>
        <p className="text-xs text-gray-500 mt-0.5">Prices for approved business customers. First match wins:</p>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-gray-600">
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">1</span> Account price (this card)</li>
          <li>
            <span className="font-bold bg-gray-100 text-gray-700 rounded px-1">2</span>{' '}
            <Link to="/b2b" className="text-blue-600 hover:underline">Price-list rules</Link>
            {' '}(B2B → Price Lists — override everything below)
          </li>
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">3</span> Tier slab (this card)</li>
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">4</span> Any-tier slab (this card)</li>
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">5</span> Store tier %</li>
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">6</span> Store default %</li>
          <li><span className="font-bold bg-gray-100 text-gray-700 rounded px-1">7</span> Retail</li>
          <li className="font-semibold text-gray-700">Never above MRP.</li>
        </ol>
        <p className="text-[11px] text-gray-500 mt-1">
          Saving these prices requires the <span className="font-semibold">b2b.manage</span> permission — rows are ignored otherwise.
        </p>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{err}</p>}

      {plOverrides.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
          A price-list rule ({plOverrides.map((n) => `'${n}'`).join(', ')}) also prices this product for
          customers on that list — it overrides the slabs below.{' '}
          <Link to="/b2b" className="font-semibold underline">Review price lists</Link>
        </p>
      )}

      {/* ── Simple product: flat wholesale price (binds to ONE generic slab) ── */}
      {isSimple && (
        <div className="border-2 border-blue-200 bg-blue-50/40 rounded-lg p-3">
          <label className="text-sm font-semibold text-gray-900 block">Wholesale price (₹)</label>
          <p className="text-[11px] text-gray-500 mb-2">
            One price for every approved B2B customer (any tier, from 1 unit). Clear it to remove.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">₹</span>
            <input
              type="number" step="0.01" min="0"
              className="w-40 px-2.5 py-2 border border-gray-300 rounded text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={flatValue ?? ''}
              onChange={(e) => setFlatPrice(e.target.value)}
              placeholder="e.g. 78.50"
            />
            {flatIdx >= 0 && tiers[flatIdx].maxQty != null && (
              <span className="text-[11px] text-amber-700">
                Note: this slab is capped at qty {tiers[flatIdx].maxQty} (edit under Advanced).
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Account prices (P1 — highest priority) ── */}
      <div className="border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Account prices</h4>
            <p className="text-[11px] text-gray-500">Highest priority — overrides every tier and bulk rule for that account.</p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">P1 · Account prices</span>
        </div>

        {!productId ? (
          <p className="text-xs text-gray-400 py-2">Save the product first to set account-specific prices.</p>
        ) : (
          <>
            {loadingContracts ? (
              <p className="text-xs text-gray-400 py-2">Loading…</p>
            ) : contracts.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {contracts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs bg-gray-50 px-2 py-1.5 rounded">
                    <span className="font-semibold text-gray-800 flex-1 truncate">{c.company_name}</span>
                    <span className="text-gray-500">{varLabel(c.variation_id)}</span>
                    <span className="font-bold text-emerald-700">₹{money(c.unit_price)}</span>
                    {c.valid_until && <span className="text-gray-400">till {localeDate(c.valid_until)}</span>}
                    <button type="button" onClick={() => removeContract(c.id)} className="text-gray-300 hover:text-red-500">✕</button>
                  </div>
                ))}
              </div>
            )}

            {customers.length === 0 ? (
              accountsDenied ? (
                <p className="text-[11px] text-gray-400 py-1">
                  Your role can’t read B2B accounts (needs b2b.read).
                </p>
              ) : (
                <p className="text-[11px] text-amber-600 py-1">
                  No approved B2B accounts yet — approve one in B2B → Applications.
                </p>
              )
            ) : (
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <label className="text-[11px] text-gray-500 block mb-0.5">Account</label>
                  <select className={inputCls} value={cForm.customer_id}
                    onChange={(e) => setCForm((f) => ({ ...f, customer_id: e.target.value }))}>
                    <option value="">Select account…</option>
                    {customers.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.company_name}{c.b2b_tier ? ` (${c.b2b_tier})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] text-gray-500 block mb-0.5">Variation</label>
                  <select className={inputCls} value={cForm.variation_id}
                    onChange={(e) => setCForm((f) => ({ ...f, variation_id: e.target.value }))}>
                    <option value="">All variations</option>
                    {variations.filter((v) => v.id).map((v) => (
                      <option key={v.id} value={v.id}>{v.name || v.sku}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-500 block mb-0.5">Price (₹)</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={cForm.unit_price}
                    onChange={(e) => setCForm((f) => ({ ...f, unit_price: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-500 block mb-0.5">Valid until</label>
                  <input type="date" className={inputCls} value={cForm.valid_until}
                    onChange={(e) => setCForm((f) => ({ ...f, valid_until: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={addContract} disabled={savingContract}
                    className="w-full px-2 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-60">
                    {savingContract ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1.5">Account prices save immediately (they aren’t part of the product save).</p>
          </>
        )}
      </div>

      {/* ── Tier / bulk slabs (P2 / P3) — collapsed behind "Advanced" for simple products ── */}
      <div className="border border-gray-200 rounded-lg p-3">
        {isSimple && (
          <button type="button" onClick={() => setAdvToggled(!advOpen)}
            className="w-full flex items-center justify-between text-left group"
            aria-expanded={advOpen}>
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide group-hover:text-gray-900">
              Advanced: tiers &amp; quantity slabs
            </span>
            <span className="text-gray-400 text-xs">{advOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
        )}
        {(!isSimple || advOpen) && (<div className={isSimple ? 'mt-3' : undefined}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Tier &amp; bulk prices</h4>
            <p className="text-[11px] text-gray-500">Per tier, optionally per quantity band and variation.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">P3–P4 · Tier &amp; bulk slabs</span>
            <button type="button" onClick={add} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              + Add
            </button>
          </div>
        </div>

        {tiersDenied ? (
          <p className="text-[11px] text-gray-400 mb-2">
            Your role can’t read B2B settings (needs b2b.read) — tier names unavailable.
          </p>
        ) : storeTiers.length === 0 && (
          <p className="text-[11px] text-amber-600 mb-2">
            No tiers defined — add them in B2B → Plans &amp; Tiers, or use “Any tier”.
          </p>
        )}

        {tiers.length === 0 && (
          <div className="text-center py-5 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-xs text-gray-400">No tier prices. Add one for wholesale / bulk pricing.</p>
          </div>
        )}

        <div className="space-y-3">
          {tiers.map((tier, idx) => (
            <div key={tier.id ?? idx} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
              <button type="button" onClick={() => remove(idx)}
                className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-sm">✕</button>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Tier</label>
                  {/* Must match a real tier — free text silently never matches. */}
                  <select className={inputCls} value={tier.tierName}
                    onChange={(e) => update(idx, { tierName: e.target.value })}>
                    <option value="">Any tier (all B2B)</option>
                    {storeTiers.map((t) => <option key={t} value={t}>{t}</option>)}
                    {tier.tierName && !storeTiers.includes(tier.tierName) && (
                      <option value={tier.tierName}>{tier.tierName} (unknown tier!)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Variation</label>
                  <select className={inputCls} value={tier.variationId ?? ''}
                    title="A slab with a variation applies ONLY to that pack; leave 'All variations' to price the whole product."
                    onChange={(e) => update(idx, { variationId: e.target.value || null })}>
                    <option value="">All variations</option>
                    {variations.filter((v) => v.id).map((v) => (
                      <option key={v.id} value={v.id}>{v.name || v.sku}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Price Type</label>
                  <select className={inputCls} value={tier.priceType}
                    onChange={(e) => update(idx, { priceType: e.target.value as B2BPricingTier['priceType'] })}>
                    <option value="fixed">Fixed Price (₹)</option>
                    <option value="percentage_off">% Off</option>
                    {/* Dead option — no cost_price exists anywhere; kept ONLY for rows that already use it. */}
                    {tier.priceType === 'markup_on_cost' && (
                      <option value="markup_on_cost">Markup on cost (no cost configured — prices ABOVE retail)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Min Qty</label>
                  <input type="number" min="1" className={inputCls} value={tier.minQty ?? ''}
                    onChange={e => { const v = e.target.value; update(idx, { minQty: (v === '' ? undefined : parseInt(v)) as any }); }}
                    onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) update(idx, { minQty: 1 }); }} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Max Qty</label>
                  <input type="number" min="1" className={inputCls} value={tier.maxQty || ''}
                    onChange={e => update(idx, { maxQty: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="∞ unlimited" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">
                    {tier.priceType === 'fixed' ? 'Price (₹)' : tier.priceType === 'percentage_off' ? 'Discount (%)' : 'Markup (%)'}
                  </label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={tier.priceValue ?? ''}
                    onChange={e => { const v = e.target.value; update(idx, { priceValue: (v === '' ? undefined : parseFloat(v)) as any }); }}
                    onBlur={e => { if (!e.target.value) update(idx, { priceValue: 0 }); }} />
                </div>
              </div>

              {tier.priceType === 'markup_on_cost' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
                  No cost price exists in this store, so this computes retail + {Number(tier.priceValue) || 0}%
                  (capped at MRP) — almost certainly not what you want. Switch to Fixed or % off retail.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Valid From (optional)</label>
                  <input type="date" className={inputCls} value={tier.validFrom || ''}
                    onChange={e => update(idx, { validFrom: e.target.value || undefined })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">Valid Until (optional)</label>
                  <input type="date" className={inputCls} value={tier.validUntil || ''}
                    onChange={e => update(idx, { validUntil: e.target.value || undefined })} />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={tier.isActive} onChange={e => update(idx, { isActive: e.target.checked })} className="sr-only peer" />
                  <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-0 after:left-0 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                </label>
                <span className="text-xs text-gray-500">{tier.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          ))}
        </div>
        </div>)}
      </div>
    </div>
  );
};

export default ProductB2BPricing;
