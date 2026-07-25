import { useState, useEffect } from 'react';
import { b2bAPI, productsAPI, categoriesAPI } from '../../services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit, Plus, Trash2, ArrowLeft, Loader2, Layers } from 'lucide-react';

// The admin axios interceptor unwraps { success, data } → the array/object AND
// adds camelCase aliases for snake_case keys, so a row exposes both id/entity_id
// and entityId. We read the camel alias first, snake as fallback.
const asArray = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? []);
const rid = (x: any): string => String(x?.id ?? x?._id ?? '');

interface PriceList {
  id: string; name: string; description?: string;
  tier_name?: string | null; tierName?: string | null;
  currency?: string; is_default?: boolean; isDefault?: boolean; is_active?: boolean; isActive?: boolean;
}
interface PricingSlab { minQty: string; maxQty: string; price: string; }
interface DiscountSlab { minQty: string; discountPct: string; }

export default function B2BPriceLists() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tiers, setTiers] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const [activeList, setActiveList] = useState<PriceList | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [moqRules, setMoqRules] = useState<any[]>([]);

  // ── List modal ──
  const [showListModal, setShowListModal] = useState(false);
  const [editList, setEditList] = useState<PriceList | null>(null);
  const [listForm, setListForm] = useState({ name: '', description: '', tier: '', currency: 'INR', isDefault: false, isActive: true });

  // ── Rule modal ──
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editRule, setEditRule] = useState<any | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    ruleType: 'global' | 'category' | 'product' | 'variant';
    entityId: string; flatPrice: string; flatDiscountPct: string;
    pricingSlabs: PricingSlab[]; discountSlabs: DiscountSlab[]; isActive: boolean;
  }>({ ruleType: 'global', entityId: '', flatPrice: '', flatDiscountPct: '', pricingSlabs: [], discountSlabs: [], isActive: true });

  // ── MOQ modal ──
  const [showMoqModal, setShowMoqModal] = useState(false);
  const [editMoq, setEditMoq] = useState<any | null>(null);
  const [moqForm, setMoqForm] = useState<{
    ruleType: 'global' | 'category' | 'product';
    entityId: string; minQty: string; maxQty: string; minOrderValue: string; incrementQty: string; isActive: boolean;
  }>({ ruleType: 'global', entityId: '', minQty: '1', maxQty: '', minOrderValue: '', incrementQty: '1', isActive: true });

  useEffect(() => { loadLists(); loadEntities(); }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const loadLists = async () => {
    setLoading(true); setError(null);
    try {
      setLists(asArray(await b2bAPI.getPriceLists()));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load price lists');
    } finally { setLoading(false); }
  };

  const loadEntities = async () => {
    try {
      const [prods, cats, settings] = await Promise.all([
        productsAPI.getAll({ limit: 1000 } as any).catch(() => []),
        categoriesAPI.list().catch(() => []),
        b2bAPI.getSettings().catch(() => null),
      ]);
      setProducts(asArray(prods));
      setCategories(asArray(cats));
      setTiers(Object.keys((settings as any)?.tiers ?? (settings as any)?.data?.tiers ?? {}));
    } catch { /* pickers optional */ }
  };

  const loadListDetails = async (list: PriceList) => {
    setActiveList(list); setError(null); setLoading(true);
    try {
      const [pr, mq] = await Promise.all([
        b2bAPI.getPriceRules(list.id),
        b2bAPI.getMOQRules(list.id),
      ]);
      setRules(asArray(pr));
      setMoqRules(asArray(mq));
    } catch {
      setError('Failed to load rules for this list');
    } finally { setLoading(false); }
  };

  // ── List CRUD ──────────────────────────────────────────────────────────────
  const openListModal = (list?: PriceList) => {
    if (list) {
      setEditList(list);
      setListForm({
        name: list.name, description: list.description || '',
        tier: (list.tierName ?? list.tier_name) || '', currency: list.currency || 'INR',
        isDefault: !!(list.isDefault ?? list.is_default), isActive: (list.isActive ?? list.is_active) !== false,
      });
    } else {
      setEditList(null);
      setListForm({ name: '', description: '', tier: '', currency: 'INR', isDefault: false, isActive: true });
    }
    setShowListModal(true);
  };

  const saveList = async () => {
    if (!listForm.name.trim()) return setError('Name is required');
    const payload = {
      name: listForm.name.trim(), description: listForm.description || null,
      tier_name: listForm.tier || null, currency: listForm.currency,
      is_default: listForm.isDefault, is_active: listForm.isActive,
    };
    try {
      if (editList) { await b2bAPI.updatePriceList(editList.id, payload); flash('Price list updated'); }
      else { await b2bAPI.createPriceList(payload); flash('Price list created'); }
      setShowListModal(false);
      loadLists();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to save price list'); }
  };

  const deleteList = async (list: PriceList) => {
    if (!confirm(`Delete "${list.name}" and all its rules?`)) return;
    try {
      await b2bAPI.deletePriceList(list.id);
      if (activeList?.id === list.id) setActiveList(null);
      flash('Price list deleted');
      loadLists();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete'); }
  };

  // ── Price rule CRUD ────────────────────────────────────────────────────────
  const openRuleModal = (rule?: any) => {
    if (rule) {
      setEditRule(rule);
      const pslabs = (rule.pricingSlabs ?? rule.pricing_slabs ?? []) as any[];
      const dslabs = (rule.discountSlabs ?? rule.discount_slabs ?? []) as any[];
      setRuleForm({
        ruleType: (rule.ruleType ?? rule.rule_type) || 'global',
        entityId: (rule.entityId ?? rule.entity_id) || '',
        flatPrice: rule.flatPrice ?? rule.flat_price ?? '' ? String(rule.flatPrice ?? rule.flat_price) : '',
        flatDiscountPct: rule.flatDiscountPct ?? rule.flat_discount_pct ?? '' ? String(rule.flatDiscountPct ?? rule.flat_discount_pct) : '',
        pricingSlabs: pslabs.map((s) => ({ minQty: String(s.minQty ?? ''), maxQty: s.maxQty == null ? '' : String(s.maxQty), price: String(s.price ?? '') })),
        discountSlabs: dslabs.map((s) => ({ minQty: String(s.minQty ?? ''), discountPct: String(s.discountPct ?? '') })),
        isActive: (rule.isActive ?? rule.is_active) !== false,
      });
    } else {
      setEditRule(null);
      setRuleForm({ ruleType: 'global', entityId: '', flatPrice: '', flatDiscountPct: '', pricingSlabs: [], discountSlabs: [], isActive: true });
    }
    setShowRuleModal(true);
  };

  const saveRule = async () => {
    if (!activeList) return;
    if (ruleForm.ruleType !== 'global' && !ruleForm.entityId) return setError('Pick a product/category for this rule');
    const payload = {
      rule_type: ruleForm.ruleType,
      entity_id: ruleForm.ruleType === 'global' ? null : ruleForm.entityId,
      flat_price: ruleForm.flatPrice === '' ? null : Number(ruleForm.flatPrice),
      flat_discount_pct: ruleForm.flatDiscountPct === '' ? null : Number(ruleForm.flatDiscountPct),
      pricing_slabs: ruleForm.pricingSlabs.filter((s) => s.minQty !== '' && s.price !== '')
        .map((s) => ({ minQty: Number(s.minQty), maxQty: s.maxQty === '' ? null : Number(s.maxQty), price: Number(s.price) })),
      discount_slabs: ruleForm.discountSlabs.filter((s) => s.minQty !== '' && s.discountPct !== '')
        .map((s) => ({ minQty: Number(s.minQty), discountPct: Number(s.discountPct) })),
      is_active: ruleForm.isActive,
    };
    try {
      if (editRule) await b2bAPI.updatePriceRule(activeList.id, rid(editRule), payload);
      else await b2bAPI.createPriceRule(activeList.id, payload);
      setShowRuleModal(false);
      loadListDetails(activeList);
      flash('Rule saved');
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to save rule'); }
  };

  const deleteRule = async (rule: any) => {
    if (!activeList || !confirm('Delete this pricing rule?')) return;
    try { await b2bAPI.deletePriceRule(activeList.id, rid(rule)); loadListDetails(activeList); }
    catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete rule'); }
  };

  // ── MOQ rule CRUD ──────────────────────────────────────────────────────────
  const openMoqModal = (moq?: any) => {
    if (moq) {
      setEditMoq(moq);
      setMoqForm({
        ruleType: (moq.ruleType ?? moq.rule_type) || 'global',
        entityId: (moq.entityId ?? moq.entity_id) || '',
        minQty: String(moq.minQty ?? moq.min_qty ?? 1),
        maxQty: (moq.maxQty ?? moq.max_qty) == null ? '' : String(moq.maxQty ?? moq.max_qty),
        minOrderValue: (moq.minOrderValue ?? moq.min_order_value) == null ? '' : String(moq.minOrderValue ?? moq.min_order_value),
        incrementQty: String(moq.incrementQty ?? moq.increment_qty ?? 1),
        isActive: (moq.isActive ?? moq.is_active) !== false,
      });
    } else {
      setEditMoq(null);
      setMoqForm({ ruleType: 'global', entityId: '', minQty: '1', maxQty: '', minOrderValue: '', incrementQty: '1', isActive: true });
    }
    setShowMoqModal(true);
  };

  const saveMoq = async () => {
    if (!activeList) return;
    if (moqForm.ruleType !== 'global' && !moqForm.entityId) return setError('Pick a product/category for this MOQ rule');
    const payload = {
      rule_type: moqForm.ruleType,
      entity_id: moqForm.ruleType === 'global' ? null : moqForm.entityId,
      min_qty: Number(moqForm.minQty) || 0,
      max_qty: moqForm.maxQty === '' ? null : Number(moqForm.maxQty),
      min_order_value: moqForm.minOrderValue === '' ? null : Number(moqForm.minOrderValue),
      increment_qty: Math.max(1, Number(moqForm.incrementQty) || 1),
      is_active: moqForm.isActive,
    };
    try {
      if (editMoq) await b2bAPI.updateMOQRule(activeList.id, rid(editMoq), payload);
      else await b2bAPI.createMOQRule(activeList.id, payload);
      setShowMoqModal(false);
      loadListDetails(activeList);
      flash('MOQ rule saved');
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to save MOQ rule'); }
  };

  const deleteMoq = async (moq: any) => {
    if (!activeList || !confirm('Delete this MOQ rule?')) return;
    try { await b2bAPI.deleteMOQRule(activeList.id, rid(moq)); loadListDetails(activeList); }
    catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete MOQ rule'); }
  };

  const entityName = (type: string, id?: string) => {
    if (type === 'global') return 'Everything (all products)';
    if (type === 'category') return categories.find((c) => rid(c) === id)?.name || 'Category';
    return products.find((p) => rid(p) === id)?.name || (type === 'variant' ? 'Variation' : 'Product');
  };

  const ruleSummary = (rule: any) => {
    const p = (rule.pricingSlabs ?? rule.pricing_slabs ?? []) as any[];
    const d = (rule.discountSlabs ?? rule.discount_slabs ?? []) as any[];
    const fp = rule.flatPrice ?? rule.flat_price;
    const fd = rule.flatDiscountPct ?? rule.flat_discount_pct;
    const bits: string[] = [];
    if (p.length) bits.push(`${p.length} price slab${p.length > 1 ? 's' : ''}`);
    if (d.length) bits.push(`${d.length} discount slab${d.length > 1 ? 's' : ''}`);
    if (fp != null && fp !== '') bits.push(`₹${fp} flat`);
    if (fd != null && fd !== '') bits.push(`${fd}% off`);
    return bits.join(' · ') || '—';
  };

  // ── Detail view (rules + MOQ) ──────────────────────────────────────────────
  if (activeList) {
    const listTier = (activeList.tierName ?? activeList.tier_name);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setActiveList(null)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h2 className="text-xl font-bold flex items-center gap-2">{activeList.name}
              {(activeList.isDefault ?? activeList.is_default) && <Badge>Default</Badge>}
              {listTier && <Badge variant="outline" className="capitalize">tier: {listTier}</Badge>}
            </h2>
            {activeList.description && <p className="text-sm text-muted-foreground">{activeList.description}</p>}
          </div>
        </div>

        {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

        <Tabs defaultValue="pricing">
          <TabsList>
            <TabsTrigger value="pricing">Pricing Rules</TabsTrigger>
            <TabsTrigger value="moq">MOQ Rules</TabsTrigger>
          </TabsList>

          {/* Pricing rules */}
          <TabsContent value="pricing" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Most specific match wins: variation → product → category → everything.</p>
              <Button size="sm" onClick={() => openRuleModal()}><Plus className="h-4 w-4 mr-1" />Add pricing rule</Button>
            </div>
            {loading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              : rules.length === 0 ? <div className="text-center py-10 text-muted-foreground border border-dashed rounded-md">No pricing rules yet.</div>
              : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Scope</TableHead><TableHead>Applies to</TableHead><TableHead>Pricing</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rid(rule)}>
                          <TableCell><Badge variant="outline" className="capitalize">{rule.ruleType ?? rule.rule_type}</Badge></TableCell>
                          <TableCell className="font-medium">{entityName(rule.ruleType ?? rule.rule_type, rule.entityId ?? rule.entity_id)}</TableCell>
                          <TableCell className="text-sm">{ruleSummary(rule)}</TableCell>
                          <TableCell>{(rule.isActive ?? rule.is_active) !== false ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openRuleModal(rule)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRule(rule)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
          </TabsContent>

          {/* MOQ rules */}
          <TabsContent value="moq" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Minimum/maximum quantities, order value floor, and order-in-multiples-of (packs).</p>
              <Button size="sm" onClick={() => openMoqModal()}><Plus className="h-4 w-4 mr-1" />Add MOQ rule</Button>
            </div>
            {moqRules.length === 0 ? <div className="text-center py-10 text-muted-foreground border border-dashed rounded-md">No MOQ rules — B2B orders on this list have no minimum.</div>
              : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Scope</TableHead><TableHead>Applies to</TableHead><TableHead>Min</TableHead><TableHead>Max</TableHead>
                      <TableHead>Min value</TableHead><TableHead>Multiples of</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {moqRules.map((moq) => (
                        <TableRow key={rid(moq)}>
                          <TableCell><Badge variant="outline" className="capitalize">{moq.ruleType ?? moq.rule_type}</Badge></TableCell>
                          <TableCell className="font-medium">{entityName(moq.ruleType ?? moq.rule_type, moq.entityId ?? moq.entity_id)}</TableCell>
                          <TableCell>{moq.minQty ?? moq.min_qty}</TableCell>
                          <TableCell>{(moq.maxQty ?? moq.max_qty) ?? '—'}</TableCell>
                          <TableCell>{(moq.minOrderValue ?? moq.min_order_value) != null ? `₹${moq.minOrderValue ?? moq.min_order_value}` : '—'}</TableCell>
                          <TableCell>{moq.incrementQty ?? moq.increment_qty}</TableCell>
                          <TableCell>{(moq.isActive ?? moq.is_active) !== false ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openMoqModal(moq)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMoq(moq)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
          </TabsContent>
        </Tabs>

        {/* Pricing rule modal */}
        <Dialog open={showRuleModal} onOpenChange={setShowRuleModal}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editRule ? 'Edit' : 'Add'} pricing rule</DialogTitle>
              <DialogDescription>Set a price for a product, a category, or everything on this list.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Scope</Label>
                  <select value={ruleForm.ruleType} onChange={(e) => setRuleForm((f) => ({ ...f, ruleType: e.target.value as any, entityId: '' }))}
                    className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                    <option value="global">Everything</option>
                    <option value="category">Category</option>
                    <option value="product">Product</option>
                  </select>
                </div>
                {ruleForm.ruleType === 'category' && (
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <select value={ruleForm.entityId} onChange={(e) => setRuleForm((f) => ({ ...f, entityId: e.target.value }))}
                      className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                      <option value="">— select —</option>
                      {categories.map((c) => <option key={rid(c)} value={rid(c)}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {ruleForm.ruleType === 'product' && (
                  <div className="space-y-1">
                    <Label>Product</Label>
                    <input list="pl-products" value={ruleForm.entityId ? (products.find((p) => rid(p) === ruleForm.entityId)?.name ?? '') : ''}
                      onChange={(e) => { const p = products.find((x) => x.name === e.target.value); setRuleForm((f) => ({ ...f, entityId: p ? rid(p) : '' })); }}
                      placeholder="Type to search…" className="w-full h-9 px-2 border rounded-md text-sm bg-background" />
                    <datalist id="pl-products">{products.map((p) => <option key={rid(p)} value={p.name} />)}</datalist>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Flat price (₹)</Label>
                  <Input type="number" min="0" value={ruleForm.flatPrice} placeholder="e.g. 90"
                    onChange={(e) => setRuleForm((f) => ({ ...f, flatPrice: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Flat discount (%)</Label>
                  <Input type="number" min="0" max="100" value={ruleForm.flatDiscountPct} placeholder="e.g. 20"
                    onChange={(e) => setRuleForm((f) => ({ ...f, flatDiscountPct: e.target.value }))} /></div>
              </div>

              {/* Quantity price slabs */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label>Quantity price slabs (₹ per unit)</Label>
                  <Button variant="outline" size="sm" onClick={() => setRuleForm((f) => ({ ...f, pricingSlabs: [...f.pricingSlabs, { minQty: '', maxQty: '', price: '' }] }))}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Slab</Button>
                </div>
                {ruleForm.pricingSlabs.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Min qty" type="number" value={s.minQty} onChange={(e) => { const a = [...ruleForm.pricingSlabs]; a[i] = { ...a[i], minQty: e.target.value }; setRuleForm((f) => ({ ...f, pricingSlabs: a })); }} />
                    <Input placeholder="Max qty" type="number" value={s.maxQty} onChange={(e) => { const a = [...ruleForm.pricingSlabs]; a[i] = { ...a[i], maxQty: e.target.value }; setRuleForm((f) => ({ ...f, pricingSlabs: a })); }} />
                    <Input placeholder="₹ / unit" type="number" value={s.price} onChange={(e) => { const a = [...ruleForm.pricingSlabs]; a[i] = { ...a[i], price: e.target.value }; setRuleForm((f) => ({ ...f, pricingSlabs: a })); }} />
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRuleForm((f) => ({ ...f, pricingSlabs: f.pricingSlabs.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>

              {/* Quantity discount slabs */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label>Quantity discount slabs (% off)</Label>
                  <Button variant="outline" size="sm" onClick={() => setRuleForm((f) => ({ ...f, discountSlabs: [...f.discountSlabs, { minQty: '', discountPct: '' }] }))}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Slab</Button>
                </div>
                {ruleForm.discountSlabs.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Min qty" type="number" value={s.minQty} onChange={(e) => { const a = [...ruleForm.discountSlabs]; a[i] = { ...a[i], minQty: e.target.value }; setRuleForm((f) => ({ ...f, discountSlabs: a })); }} />
                    <Input placeholder="% off" type="number" value={s.discountPct} onChange={(e) => { const a = [...ruleForm.discountSlabs]; a[i] = { ...a[i], discountPct: e.target.value }; setRuleForm((f) => ({ ...f, discountSlabs: a })); }} />
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRuleForm((f) => ({ ...f, discountSlabs: f.discountSlabs.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={ruleForm.isActive} onChange={(e) => setRuleForm((f) => ({ ...f, isActive: e.target.checked }))} /> Active
              </label>
              <p className="text-xs text-muted-foreground">Priority within a rule: price slab → discount slab → flat price → flat discount. Never charged above MRP.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRuleModal(false)}>Cancel</Button>
              <Button onClick={saveRule}>Save rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MOQ rule modal */}
        <Dialog open={showMoqModal} onOpenChange={setShowMoqModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editMoq ? 'Edit' : 'Add'} MOQ rule</DialogTitle>
              <DialogDescription>Constrain order quantities for B2B customers on this list.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Scope</Label>
                  <select value={moqForm.ruleType} onChange={(e) => setMoqForm((f) => ({ ...f, ruleType: e.target.value as any, entityId: '' }))}
                    className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                    <option value="global">Whole order</option>
                    <option value="category">Category</option>
                    <option value="product">Product</option>
                  </select>
                </div>
                {moqForm.ruleType === 'category' && (
                  <div className="space-y-1"><Label>Category</Label>
                    <select value={moqForm.entityId} onChange={(e) => setMoqForm((f) => ({ ...f, entityId: e.target.value }))}
                      className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                      <option value="">— select —</option>
                      {categories.map((c) => <option key={rid(c)} value={rid(c)}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {moqForm.ruleType === 'product' && (
                  <div className="space-y-1"><Label>Product</Label>
                    <input list="moq-products" value={moqForm.entityId ? (products.find((p) => rid(p) === moqForm.entityId)?.name ?? '') : ''}
                      onChange={(e) => { const p = products.find((x) => x.name === e.target.value); setMoqForm((f) => ({ ...f, entityId: p ? rid(p) : '' })); }}
                      placeholder="Type to search…" className="w-full h-9 px-2 border rounded-md text-sm bg-background" />
                    <datalist id="moq-products">{products.map((p) => <option key={rid(p)} value={p.name} />)}</datalist>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Minimum qty</Label>
                  <Input type="number" min="0" value={moqForm.minQty} onChange={(e) => setMoqForm((f) => ({ ...f, minQty: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Maximum qty (optional)</Label>
                  <Input type="number" min="1" value={moqForm.maxQty} onChange={(e) => setMoqForm((f) => ({ ...f, maxQty: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Min order value ₹ (optional)</Label>
                  <Input type="number" min="0" value={moqForm.minOrderValue} onChange={(e) => setMoqForm((f) => ({ ...f, minOrderValue: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Order in multiples of</Label>
                  <Input type="number" min="1" value={moqForm.incrementQty} onChange={(e) => setMoqForm((f) => ({ ...f, incrementQty: e.target.value }))} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={moqForm.isActive} onChange={(e) => setMoqForm((f) => ({ ...f, isActive: e.target.checked }))} /> Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMoqModal(false)}>Cancel</Button>
              <Button onClick={saveMoq}>Save MOQ rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── List overview ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          A price list is a bundle of pricing rules + order limits for B2B customers. A customer uses the list
          pinned to them, else the list matching their tier, else the default list. Its prices sit just below
          a negotiated contract and above the store's generic tier discounts.
        </p>
        <Button onClick={() => openListModal()}><Plus className="h-4 w-4 mr-1" />New price list</Button>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

      {loading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No price lists yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create one, then add pricing + MOQ rules inside it.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Tier</TableHead><TableHead>Default</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lists.map((list) => (
                  <TableRow key={list.id} className="cursor-pointer" onClick={() => loadListDetails(list)}>
                    <TableCell>
                      <div className="font-medium">{list.name}</div>
                      {list.description && <div className="text-xs text-muted-foreground max-w-xs truncate">{list.description}</div>}
                    </TableCell>
                    <TableCell className="capitalize">{(list.tierName ?? list.tier_name) || '—'}</TableCell>
                    <TableCell>{(list.isDefault ?? list.is_default) ? <Badge>Default</Badge> : '—'}</TableCell>
                    <TableCell>{(list.isActive ?? list.is_active) !== false ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge> : <Badge variant="outline">Off</Badge>}</TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => loadListDetails(list)}>Manage rules</Button>
                      <Button variant="ghost" size="sm" onClick={() => openListModal(list)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteList(list)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      {/* List create/edit modal */}
      <Dialog open={showListModal} onOpenChange={setShowListModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editList ? 'Edit' : 'New'} price list</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1"><Label>Name</Label>
              <Input value={listForm.name} onChange={(e) => setListForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Distributor wholesale" /></div>
            <div className="space-y-1"><Label>Description</Label>
              <Input value={listForm.description} onChange={(e) => setListForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Applies to tier</Label>
                <select value={listForm.tier} onChange={(e) => setListForm((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                  <option value="">— any / via default —</option>
                  {tiers.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Currency</Label>
                <Input value={listForm.currency} maxLength={3} onChange={(e) => setListForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} /></div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={listForm.isDefault} onChange={(e) => setListForm((f) => ({ ...f, isDefault: e.target.checked }))} /> Default list
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={listForm.isActive} onChange={(e) => setListForm((f) => ({ ...f, isActive: e.target.checked }))} /> Active
              </label>
            </div>
            {tiers.length === 0 && <p className="text-xs text-amber-600">No tiers defined yet — add them in the “Plans &amp; Tiers” tab to target a list by tier.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListModal(false)}>Cancel</Button>
            <Button onClick={saveList}>{editList ? 'Save changes' : 'Create list'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
