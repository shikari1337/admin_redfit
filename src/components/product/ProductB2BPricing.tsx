import React, { useEffect, useState } from 'react';
import { b2bAPI } from '../../services/api';

/** A product×tier bulk slab → product_b2b_pricing (pricing P2, or P3 when tierName is empty). */
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

  // New-contract form
  const [cForm, setCForm] = useState({ customer_id: '', variation_id: '', unit_price: '', valid_until: '' });
  const [savingContract, setSavingContract] = useState(false);

  // Tier names come from store.settings.b2b.tiers — the SAME list the waterfall
  // matches against. Free text here would silently never match a customer.
  useEffect(() => {
    b2bAPI.getSettings().then((r) => setStoreTiers(Object.keys(r?.data?.tiers ?? {}))).catch(() => setStoreTiers([]));
    b2bAPI.getB2BCustomers().then((r) => setCustomers(r?.data ?? [])).catch(() => setCustomers([]));
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

  const add = () => onChange([...tiers, defaultTier()]);
  const remove = (idx: number) => onChange(tiers.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<B2BPricingTier>) => {
    const next = [...tiers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

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
        <p className="text-xs text-gray-500 mt-0.5">
          Prices for approved business customers. First match wins:
          <span className="font-semibold"> Account → Tier → Any-tier → tier % → store default → retail.</span>
        </p>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded">{err}</p>}

      {/* ── Account prices (P1 — highest priority) ── */}
      <div className="border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Account prices</h4>
            <p className="text-[11px] text-gray-500">Highest priority — overrides every tier and bulk rule for that account.</p>
          </div>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">P1</span>
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
                    {c.valid_until && <span className="text-gray-400">till {new Date(c.valid_until).toLocaleDateString()}</span>}
                    <button type="button" onClick={() => removeContract(c.id)} className="text-gray-300 hover:text-red-500">✕</button>
                  </div>
                ))}
              </div>
            )}

            {customers.length === 0 ? (
              <p className="text-[11px] text-amber-600 py-1">
                No approved B2B accounts yet — approve one in B2B → Applications.
              </p>
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

      {/* ── Tier / bulk slabs (P2 / P3) ── */}
      <div className="border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Tier &amp; bulk prices</h4>
            <p className="text-[11px] text-gray-500">Per tier, optionally per quantity band and variation.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">P2/P3</span>
            <button type="button" onClick={add} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              + Add
            </button>
          </div>
        </div>

        {storeTiers.length === 0 && (
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
                    <option value="markup_on_cost">Markup on Cost</option>
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
      </div>
    </div>
  );
};

export default ProductB2BPricing;
