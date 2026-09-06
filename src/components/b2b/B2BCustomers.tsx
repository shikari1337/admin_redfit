import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { b2bAPI, productsAPI, customersAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, ArrowLeft, ExternalLink, Loader2, Save, Ban, CheckCircle2, Plus, Search, User } from 'lucide-react';
import { localeDate } from '../../utils/date';

// The admin axios interceptor unwraps { success, data } → the array/object AND
// adds camelCase aliases for snake_case keys, so a row exposes both id/entity_id
// and entityId. We read the camel alias first, snake as fallback (same helpers
// as B2BPriceLists.tsx).
const asArray = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? []);
const rid = (x: any): string => String(x?.id ?? x?._id ?? '');

interface B2BCustomerRow {
  customer_id: string;
  company_name: string;
  b2b_tier?: string | null;
  gstin?: string | null;
  credit_limit?: number | string | null;
  credit_days?: number | string | null;
  total_spent?: number | string | null;
  order_count?: number | string | null;
  price_list_id?: string | null;
}

interface PriceListOption { id: string; name: string; }

interface Contract {
  id: string;
  product_id: string;
  variation_id?: string | null;
  unit_price: number | string;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
}

const money = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * The roster of a store's approved B2B customers — the piece the flat
 * "B2B active" row in B2BApplications.tsx never had: reassign a tier after
 * initial approval, pin a price list, edit credit terms, suspend/reactivate,
 * and see negotiated (P1) contracts. Full customer PII + order history lives
 * on the separate /customers/:id page (UserDetail) — this links out to it
 * rather than duplicating it, per the store→customer privacy boundary
 * (b2b.ts never reads public.customers directly; company_name/gstin/phone
 * here are only what the customer gave THIS store).
 */
export default function B2BCustomers() {
  const [customers, setCustomers] = useState<B2BCustomerRow[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeCustomer, setActiveCustomer] = useState<B2BCustomerRow | null>(null);
  const [isB2bActive, setIsB2bActive] = useState(true);
  const [form, setForm] = useState({ tier: '', creditLimit: '0', creditDays: '0', gstin: '', priceListId: '' });
  const [saving, setSaving] = useState(false);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  // ── Add B2B customer (staff-initiated — no storefront application needed) ──
  const [showAdd, setShowAdd] = useState(false);
  const [addCustomerSearch, setAddCustomerSearch] = useState('');
  const [addCustomerResults, setAddCustomerResults] = useState<any[]>([]);
  const [addPickedCustomer, setAddPickedCustomer] = useState<any | null>(null);
  const [addForm, setAddForm] = useState({
    phone: '', email: '', name: '',
    companyName: '', gstin: '', tier: '', creditLimit: '0', creditDays: '0', priceListId: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => { load(); loadRefs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Debounced existing-customer search — same idiom as ManualOrderCreate.tsx's
  // customer picker (350ms, min 3 chars, results dropdown).
  useEffect(() => {
    if (!showAdd || addPickedCustomer || addCustomerSearch.trim().length < 3) { setAddCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await customersAPI.getAll({ search: addCustomerSearch.trim(), limit: 8 });
        const list = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
        setAddCustomerResults(list);
      } catch { setAddCustomerResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [addCustomerSearch, showAdd, addPickedCustomer]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      setCustomers(asArray(await b2bAPI.getB2BCustomers()));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load B2B customers');
    } finally { setLoading(false); }
  };

  // Tiers + price lists to populate the reassign dropdowns; products to
  // resolve contract product_id → name. All optional — pickers degrade
  // gracefully if any of these calls fail.
  const loadRefs = async () => {
    try {
      const [lists, settings, prods] = await Promise.all([
        b2bAPI.getPriceLists().catch(() => []),
        b2bAPI.getSettings().catch(() => null),
        productsAPI.getAll({ limit: 1000 } as any).catch(() => []),
      ]);
      setPriceLists(asArray(lists));
      setTiers(Object.keys((settings as any)?.tiers ?? (settings as any)?.data?.tiers ?? {}));
      setProducts(asArray(prods));
    } catch { /* pickers optional */ }
  };

  const priceListName = (id?: string | null) => (id ? priceLists.find((l) => rid(l) === id)?.name ?? null : null);
  const productName = (id: string) => products.find((p) => rid(p) === id)?.name || id;

  const loadContracts = async (customerId: string) => {
    setContractsLoading(true);
    try {
      setContracts(asArray(await b2bAPI.getContracts(customerId)));
    } catch {
      setContracts([]);
    } finally { setContractsLoading(false); }
  };

  const openCustomer = (c: B2BCustomerRow) => {
    setActiveCustomer(c);
    setIsB2bActive(true); // GET /b2b/customers only ever returns is_b2b = TRUE rows
    setForm({
      tier: c.b2b_tier ?? '',
      creditLimit: String(c.credit_limit ?? 0),
      creditDays: String(c.credit_days ?? 0),
      gstin: c.gstin ?? '',
      priceListId: c.price_list_id ?? '',
    });
    setError(null);
    loadContracts(c.customer_id);
  };

  const openAddModal = () => {
    setAddPickedCustomer(null);
    setAddCustomerSearch('');
    setAddCustomerResults([]);
    setAddForm({ phone: '', email: '', name: '', companyName: '', gstin: '', tier: '', creditLimit: '0', creditDays: '0', priceListId: '' });
    setAddError(null);
    setShowAdd(true);
  };

  /** Picking a result prefills name/phone/email as a read-only display and stops
   *  the "new customer" fields from being sent — the existing customer's own
   *  registered identity is what gets promoted, not whatever was half-typed. */
  const pickAddCustomer = (c: any) => {
    setAddPickedCustomer(c);
    setAddCustomerResults([]);
    setAddCustomerSearch('');
    setAddForm((f) => ({
      ...f,
      name: c.name || f.name,
      phone: c.phone || c.phoneNumber || c.phone_number || f.phone,
      email: c.email || f.email,
    }));
  };

  const canSubmitAdd = !!addPickedCustomer || addForm.phone.replace(/\D/g, '').length >= 10;

  const submitAddCustomer = async () => {
    if (!canSubmitAdd) { setAddError('Pick an existing customer, or enter a valid phone number (10+ digits) for a new one.'); return; }
    setAddSaving(true); setAddError(null);
    try {
      const globalId = addPickedCustomer
        ? String(addPickedCustomer.customerId ?? addPickedCustomer.customer_id ?? addPickedCustomer.id ?? '')
        : '';
      const res = await b2bAPI.createCustomer({
        customerId: globalId || undefined,
        phone: globalId ? undefined : addForm.phone.trim(),
        email: addForm.email.trim() || undefined,
        name: addForm.name.trim() || undefined,
        companyName: addForm.companyName.trim() || undefined,
        gstin: addForm.gstin.trim() || undefined,
        tier: addForm.tier || undefined,
        credit_limit: Number(addForm.creditLimit) || 0,
        credit_days: Number(addForm.creditDays) || 0,
        price_list_id: addForm.priceListId || undefined,
      });
      // b2bAPI helpers return response.data, which the axios interceptor may
      // already have unwrapped to the inner `data` object — handle both shapes
      // (same defensive pattern as ManualOrderCreate.tsx's `r?.data ?? r`).
      const created = (res as any)?.data ?? res;
      setShowAdd(false);
      flash('B2B customer created.');
      load();
      // Nice-to-have: jump straight into the new account's detail view.
      if (created?.customerId) {
        openCustomer({
          customer_id: String(created.customerId),
          company_name: addForm.companyName.trim() || created.name || 'Business account',
          b2b_tier: created.profile?.b2b_tier ?? addForm.tier ?? null,
          gstin: created.profile?.gstin ?? addForm.gstin ?? null,
          credit_limit: created.profile?.credit_limit ?? (Number(addForm.creditLimit) || 0),
          credit_days: created.profile?.credit_days ?? (Number(addForm.creditDays) || 0),
          price_list_id: created.profile?.price_list_id ?? addForm.priceListId ?? null,
        });
      }
    } catch (err: any) {
      setAddError(err?.response?.data?.message || 'Failed to create B2B customer');
    } finally { setAddSaving(false); }
  };

  const persist = async (isB2bOverride: boolean) => {
    if (!activeCustomer) return null;
    return b2bAPI.updateCustomer(activeCustomer.customer_id, {
      is_b2b: isB2bOverride,
      b2b_tier: form.tier || null,
      gstin: form.gstin || null,
      credit_limit: Number(form.creditLimit) || 0,
      credit_days: Number(form.creditDays) || 0,
      price_list_id: form.priceListId || null,
    });
  };

  const saveCustomer = async () => {
    if (!activeCustomer) return;
    setSaving(true); setError(null);
    try {
      await persist(isB2bActive);
      flash('B2B profile updated.');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  // Suspend reverts the customer to retail pricing immediately (they also drop
  // out of the GET /b2b/customers roster, since that endpoint only lists
  // is_b2b = TRUE rows) — confirm before turning it off, same idiom as
  // B2BApplications.tsx's doReject (window.confirm before a destructive action).
  const toggleB2bStatus = async () => {
    if (!activeCustomer) return;
    if (isB2bActive) {
      const ok = window.confirm(
        `Suspend B2B status for ${activeCustomer.company_name}? They will immediately revert to retail pricing.`
      );
      if (!ok) return;
    }
    setSaving(true); setError(null);
    try {
      await persist(!isB2bActive);
      setIsB2bActive((v) => !v);
      flash(isB2bActive ? 'B2B status suspended — this customer now sees retail pricing.' : 'B2B status reactivated.');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update B2B status');
    } finally { setSaving(false); }
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (activeCustomer) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setActiveCustomer(null)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h2 className="text-xl font-bold flex items-center gap-2">
              {activeCustomer.company_name}
              {form.tier && <Badge variant="outline" className="capitalize">tier: {form.tier}</Badge>}
              {!isB2bActive && <Badge variant="destructive">Suspended</Badge>}
            </h2>
            <p className="text-sm text-muted-foreground">Customer ID: {activeCustomer.customer_id}</p>
          </div>
          <Link
            to={`/customers/${activeCustomer.customer_id}`}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0"
          >
            View full customer profile &amp; orders <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

        <div className="border rounded-md p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pricing tier</Label>
              <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                <option value="">— No tier (store default discount) —</option>
                {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {tiers.length === 0 && (
                <p className="text-xs text-amber-600">No tiers defined yet — add them in the “Plans &amp; Tiers” tab.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Pinned price list</Label>
              <select value={form.priceListId} onChange={(e) => setForm((f) => ({ ...f, priceListId: e.target.value }))}
                className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                <option value="">— none / resolve by tier —</option>
                {priceLists.map((l) => <option key={rid(l)} value={rid(l)}>{l.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Credit limit (₹)</Label>
                <Input type="number" min="0" value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Credit days</Label>
                <Input type="number" min="0" value={form.creditDays}
                  onChange={(e) => setForm((f) => ({ ...f, creditDays: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <Button onClick={saveCustomer} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
            {isB2bActive ? (
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
                onClick={toggleB2bStatus} disabled={saving}>
                <Ban className="mr-2 h-4 w-4" />Suspend B2B status
              </Button>
            ) : (
              <Button onClick={toggleB2bStatus} disabled={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Reactivate B2B status
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Negotiated contracts — P1 (highest priority)</h3>
            <p className="text-xs text-muted-foreground">Per-product prices agreed for this customer only; they win over every tier, slab, or price list.</p>
          </div>
          {contractsLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No negotiated contracts.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Product</TableHead><TableHead>Unit price</TableHead>
                  <TableHead>Valid from</TableHead><TableHead>Valid until</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{productName(c.product_id)}</TableCell>
                      <TableCell>{money(c.unit_price)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.valid_from ? localeDate(c.valid_from) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.valid_until ? localeDate(c.valid_until) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List overview ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Your approved B2B accounts. Click a row to reassign their tier, pin a price list, edit
          credit terms, or suspend their B2B status. For full customer details and order history,
          open their customer profile from the detail view.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={openAddModal}><Plus className="mr-1.5 h-3.5 w-3.5" />Add B2B customer</Button>
          <Button size="sm" variant="secondary" onClick={load}>Refresh</Button>
        </div>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No approved B2B customers yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Approve an application in the Applications tab to grant B2B pricing.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Price list</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Total spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.customer_id} className="cursor-pointer" onClick={() => openCustomer(c)}>
                  <TableCell className="font-medium">{c.company_name}</TableCell>
                  <TableCell>
                    {c.b2b_tier ? <Badge variant="outline" className="capitalize">{c.b2b_tier}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.gstin || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {Number(c.credit_limit) > 0 ? `${money(c.credit_limit)} / ${c.credit_days ?? 0}d` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {priceListName(c.price_list_id) ?? <span className="text-xs text-muted-foreground">resolve by tier</span>}
                  </TableCell>
                  <TableCell>{c.order_count ?? 0}</TableCell>
                  <TableCell>{money(c.total_spent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(o) => !o && setShowAdd(false)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add B2B customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Search for an existing customer to convert them to a B2B account, or fill in the
              details below for a brand-new one — e.g. a phone-order lead with no account yet.
            </p>

            {addPickedCustomer ? (
              <div className="border rounded-md px-3 py-2 bg-muted/40 flex items-center justify-between gap-2">
                <div className="text-sm min-w-0">
                  <span className="font-semibold">{addPickedCustomer.name || 'Customer'}</span>
                  <span className="text-muted-foreground ml-2">
                    {addPickedCustomer.phone || addPickedCustomer.phoneNumber || addPickedCustomer.phone_number}
                    {addPickedCustomer.email ? ` · ${addPickedCustomer.email}` : ''}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setAddPickedCustomer(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                  <Input
                    className="pl-9"
                    placeholder="Search existing customer by name / phone / email (or fill details below for a new one)"
                    value={addCustomerSearch}
                    onChange={(e) => setAddCustomerSearch(e.target.value)}
                  />
                </div>
                {addCustomerResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full border rounded-md bg-background shadow-lg max-h-56 overflow-y-auto">
                    {addCustomerResults.map((c: any) => (
                      <button key={c._id ?? c.id} type="button" onClick={() => pickAddCustomer(c)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{c.name || 'Unnamed'}</span>
                        <span className="text-muted-foreground text-xs">{c.phone || c.phoneNumber || c.phone_number} {c.email ? `· ${c.email}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!addPickedCustomer && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone *</Label>
                  <Input value={addForm.phone} placeholder="10-digit mobile number"
                    onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Email</Label>
                  <Input value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Company / practice name</Label>
                <Input value={addForm.companyName} placeholder="Defaults to the customer's name"
                  onChange={(e) => setAddForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Pricing tier</Label>
                <select value={addForm.tier} onChange={(e) => setAddForm((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                  <option value="">— No tier (store default discount) —</option>
                  {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Pinned price list</Label>
                <select value={addForm.priceListId} onChange={(e) => setAddForm((f) => ({ ...f, priceListId: e.target.value }))}
                  className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                  <option value="">— none / resolve by tier —</option>
                  {priceLists.map((l) => <option key={rid(l)} value={rid(l)}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>GSTIN</Label>
                <Input value={addForm.gstin} onChange={(e) => setAddForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-2">
                <Label>Credit limit (₹)</Label>
                <Input type="number" min="0" value={addForm.creditLimit}
                  onChange={(e) => setAddForm((f) => ({ ...f, creditLimit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Credit days</Label>
                <Input type="number" min="0" value={addForm.creditDays}
                  onChange={(e) => setAddForm((f) => ({ ...f, creditDays: e.target.value }))} />
              </div>
            </div>

            {addError && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{addError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={submitAddCustomer} disabled={addSaving || !canSubmitAdd}>
              {addSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create B2B customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
