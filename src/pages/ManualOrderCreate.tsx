/**
 * Manual sales-order creation (phone orders, WhatsApp orders, B2B bookings).
 *
 * Prices are RESOLVED SERVER-SIDE through the same waterfall as checkout —
 * picking a B2B customer applies their tier/contract pricing automatically.
 * Per-line unit-price / discount% overrides are recorded as `manual` /
 * `manual_discount` price sources so the order shows how every price came to be.
 * After creation the admin gets a Shopify-style review-and-pay link to share.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPlus, FaTrash, FaSearch, FaCopy, FaUser } from 'react-icons/fa';
import { ordersAPI, customersAPI, productsAPI } from '../services/api';
import { usePincodeLookup } from '../hooks/usePincodeLookup';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Line {
  productId: string;
  variationId?: string;
  /** The store's OWN SKU (from the variation), not the parent's `P-…` placeholder. */
  sku?: string;
  /** FULL pack name — "ASPIDOSPERMA QUEBRACHO Q 30 ML SBL", what the invoice prints. */
  name: string;
  variantLabel?: string;
  quantity: number;
  /** Catalog price — an estimate; the server reprices authoritatively. */
  price: number;
  mrp?: number;
  stock?: number;
  unitPrice?: string;        // manual override (input as string)
  discountPercent?: string;  // additional line discount %
  b2b?: boolean;
}

const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ManualOrderCreate: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any | null>(null);
  /** Full profile from GET /customers/:id — address book, email, GSTIN. */
  const [customerDetail, setCustomerDetail] = useState<any | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState({ fullName: '', mobileNumber: '', email: '', address: '', district: '', state: '', pincode: '' });
  // Auto-fill City/District + State from the pincode — same India Post lookup
  // the storefront's checkout uses. Tracks the exact values WE last filled so
  // correcting a mistyped pincode re-fills correctly, but a value the staff
  // member actually edited by hand (no longer matching our last autofill) is
  // never overwritten.
  const { result: pincodeResult, loading: pincodeLoading } = usePincodeLookup(address.pincode);
  const lastAutofillRef = useRef<{ district: string; state: string } | null>(null);
  useEffect(() => {
    if (!pincodeResult) return;
    setAddress((a) => {
      const last = lastAutofillRef.current;
      const districtIsOurs = !a.district || a.district === last?.district;
      const stateIsOurs = !a.state || a.state === last?.state;
      const nextDistrict = districtIsOurs ? pincodeResult.district : a.district;
      const nextState = stateIsOurs ? pincodeResult.state : a.state;
      lastAutofillRef.current = { district: pincodeResult.district, state: pincodeResult.state };
      if (nextDistrict === a.district && nextState === a.state) return a;
      return { ...a, district: nextDistrict, state: nextState };
    });
  }, [pincodeResult]);

  // Products — searched at SKU (variation) level, see productsAPI.searchVariations
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const searchTimer = useRef<any>(null);

  // Order-level fields
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'prepaid'>('cod');
  const [orderDiscount, setOrderDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [notes, setNotes] = useState('');
  const [hold, setHold] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any | null>(null);

  // ── Customer search ──
  useEffect(() => {
    if (customerSearch.trim().length < 3) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await customersAPI.getAll({ search: customerSearch.trim(), limit: 8 });
        const list = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
        setCustomerResults(list);
      } catch { setCustomerResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [customerSearch]);

  /**
   * Pull EVERYTHING the store already holds about this customer into the form.
   *
   * The directory row only carries name/phone/email, so the saved address book,
   * the registered email and the GSTIN come from `GET /customers/:id` (they live
   * in the platform DB — customers and their addresses are global). A picked
   * customer overwrites the form: the operator chose this person, so their
   * registered details should replace whatever was half-typed, not lose to it.
   */
  const pickCustomer = (c: any) => {
    setCustomer(c);
    setCustomerResults([]);
    setCustomerSearch('');
    setPrefilling(true);
    // Store-customer rows expose contact as `phone`; older shapes vary.
    setAddress(a => ({
      ...a,
      fullName: c.name || a.fullName || '',
      mobileNumber: c.phone || c.phoneNumber || c.phone_number || a.mobileNumber || '',
      email: c.email || a.email || '',
    }));

    const globalId = c.customerId ?? c.customer_id ?? c.id;
    if (!globalId) { setPrefilling(false); return; }
    customersAPI.getById(String(globalId)).then((detail: any) => {
      const d = detail?.data ?? detail ?? {};
      setCustomerDetail(d);
      // Saved address book first (default address wins), then the address used on
      // this store's most recent order for a customer who checked out as a guest.
      const saved: any[] = Array.isArray(d.addresses) ? d.addresses : [];
      const book = saved.find((x: any) => x.is_default ?? x.isDefault) ?? saved[0] ?? null;
      const last = d.last_order_address ?? d.lastOrderAddress ?? null;
      const addr = book ?? last;
      setAddress(a => ({
        fullName: addr?.full_name ?? addr?.fullName ?? d.name ?? a.fullName ?? '',
        mobileNumber: addr?.mobile ?? addr?.mobile_number ?? addr?.mobileNumber ?? d.phone ?? a.mobileNumber ?? '',
        email: d.email ?? addr?.email ?? a.email ?? '',
        address: [addr?.line1 ?? addr?.address ?? '', addr?.line2 ?? '', addr?.landmark ?? '']
          .filter(Boolean).join(', ') || a.address || '',
        district: addr?.district ?? addr?.city ?? a.district ?? '',
        state: addr?.state ?? a.state ?? '',
        pincode: addr?.pincode ?? a.pincode ?? '',
      }));
      if (d.gstin) setGstin(String(d.gstin));
    }).catch(() => { /* optional prefill — the operator can still type it */ })
      .finally(() => setPrefilling(false));
  };

  /** Re-apply one of the customer's other saved addresses. */
  const applySavedAddress = (addr: any) => {
    setAddress(a => ({
      ...a,
      fullName: addr.full_name ?? addr.fullName ?? a.fullName,
      mobileNumber: addr.mobile ?? addr.mobile_number ?? addr.mobileNumber ?? a.mobileNumber,
      address: [addr.line1 ?? '', addr.line2 ?? '', addr.landmark ?? ''].filter(Boolean).join(', '),
      district: addr.district ?? '',
      state: addr.state ?? '',
      pincode: addr.pincode ?? '',
    }));
  };

  /**
   * Product search runs at SKU (variation) level.
   *
   * Searching PRODUCTS returned the remedy family ("Aspidosperma Quebracho",
   * 52 packs behind it) and the line ended up bound to the parent — so the
   * order, the invoice and the packing slip all showed the short family name and
   * the generated `P-ASPIDOSPERMA-QUEBRACHO` placeholder instead of the pack the
   * store actually stocks and ships. Searching variations means typing either
   * "aspidosperma q 30 ml sbl" or the SKU "641536" lands the exact row, and the
   * line carries the store's own SKU from the start.
   */
  useEffect(() => {
    if (productSearch.trim().length < 3) { setProductResults([]); setSearching(false); return; }
    clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        setProductResults(await productsAPI.searchVariations(productSearch.trim(), 12));
      } catch {
        setProductResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [productSearch]);

  const addLine = (v: any) => {
    const price = Number(v.salePrice ?? v.sale_price ?? v.sellingPrice ?? v.selling_price ?? v.mrp ?? 0);
    const mrp = Number(v.mrp ?? 0);
    const attrs = v.attributes ?? {};
    const productId = v.productId ?? v.product_id;
    const variationId = v.variationId ?? v.variation_id ?? v.id;
    if (!productId) {
      toast({ variant: 'destructive', title: 'Could not add', description: 'That row has no product reference' });
      return;
    }
    setLines(ls => [...ls, {
      productId,
      // A product with no variations lists as itself; only send a variationId
      // when the row really is one, so the server prices the right record.
      variationId: v.isVariation === false || v.is_variation === false ? undefined : variationId,
      sku: v.sku ?? undefined,
      name: v.name ?? v.title ?? 'Product',
      variantLabel: Object.entries(attrs)
        .filter(([, val]) => val != null && String(val).trim() !== '')
        .map(([, val]) => String(val)).join(' · ') || undefined,
      quantity: 1,
      price: price || mrp,
      mrp: mrp || undefined,
      stock: v.stock != null ? Number(v.stock) : undefined,
    }]);
    setProductResults([]);
    setProductSearch('');
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  // Estimated totals (server reprices authoritatively on create).
  const lineEffective = (l: Line): number => {
    const up = parseFloat(l.unitPrice ?? '');
    if (Number.isFinite(up) && l.unitPrice !== '') return up;
    const dp = parseFloat(l.discountPercent ?? '');
    if (Number.isFinite(dp) && dp > 0) return l.price * (1 - Math.min(dp, 100) / 100);
    return l.price;
  };
  const estSubtotal = lines.reduce((s, l) => s + lineEffective(l) * l.quantity, 0);
  const estDiscount = Math.min(parseFloat(orderDiscount) || 0, estSubtotal);

  const handleCreate = async () => {
    if (!lines.length) { toast({ variant: 'destructive', title: 'No items', description: 'Add at least one product' }); return; }
    if (!address.fullName.trim() || !address.mobileNumber.trim()) {
      toast({ variant: 'destructive', title: 'Customer details', description: 'Name and phone are required' }); return;
    }
    setCreating(true);
    try {
      const r = await ordersAPI.createManual({
        // The GLOBAL customer id (customer_id) — B2B pricing resolves on it;
        // the row's own `id` is only the per-store profile row.
        customerId: customer?.customerId ?? customer?.customer_id ?? customer?.id ?? undefined,
        items: lines.map(l => ({
          productId: l.productId,
          variationId: l.variationId,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice !== undefined && l.unitPrice !== '' ? parseFloat(l.unitPrice) : undefined,
          discountPercent: l.discountPercent !== undefined && l.discountPercent !== '' ? parseFloat(l.discountPercent) : undefined,
        })),
        shippingAddress: { ...address },
        gstin: gstin.trim() || undefined,
        paymentMethod,
        discount: parseFloat(orderDiscount) || undefined,
        discountReason: discountReason || undefined,
        shippingCost: shippingCost !== '' ? parseFloat(shippingCost) : undefined,
        notes: notes || undefined,
        hold,
      });
      const order = r?.data ?? r;
      setCreated(order);
      toast({ title: 'Order created', description: `#${order.orderId ?? order.order_id}` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Create failed', description: error?.response?.data?.message || 'Could not create the order' });
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    const payLink = created.payLink;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-xl">Order #{created.orderId ?? created.order_id} created</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Total <span className="font-bold text-foreground">{money(created.total)}</span> · {created.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid'}
              {created.orderStatus === 'on_hold' && ' · On hold'}
            </p>
            {payLink && (
              <div className="border rounded-md p-3 bg-muted/40">
                <p className="text-sm font-semibold mb-1">Review &amp; pay link (share with the customer)</p>
                <p className="text-xs font-mono break-all text-muted-foreground">{payLink}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => { navigator.clipboard.writeText(payLink); toast({ title: 'Copied' }); }}>
                  <FaCopy className="mr-1.5 h-3 w-3" /> Copy link
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/orders/${created.id ?? created._id}`)}>Open order</Button>
              <Button variant="outline" onClick={() => { setCreated(null); setLines([]); setNotes(''); setOrderDiscount(''); }}>
                Create another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" className="mb-2 -ml-3 text-muted-foreground" asChild>
          <Link to="/orders"><FaArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Orders</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Prices resolve server-side (B2B customers get their tier pricing). Overrides are recorded on the order.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b"><CardTitle className="text-lg">Customer</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-3">
              {customer ? (
                <div className="border rounded-md px-3 py-2 bg-muted/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm min-w-0">
                      <span className="font-semibold">{customerDetail?.name || customer.name || 'Customer'}</span>
                      <span className="text-muted-foreground ml-2">
                        {customerDetail?.phone || customer.phone || customer.phoneNumber || customer.phone_number}
                        {(customerDetail?.email || customer.email) ? ` · ${customerDetail?.email || customer.email}` : ''}
                      </span>
                      {(customer.isB2b ?? customer.is_b2b ?? customerDetail?.b2b?.is_b2b) && (
                        <Badge className="ml-2 bg-blue-500/15 text-blue-700 border-blue-200">
                          B2B{(customer.b2bTier ?? customer.b2b_tier ?? customerDetail?.b2b?.b2b_tier) ? ` · ${customer.b2bTier ?? customer.b2b_tier ?? customerDetail?.b2b?.b2b_tier}` : ''}
                        </Badge>
                      )}
                      {prefilling && <span className="text-xs text-muted-foreground ml-2">loading details…</span>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setCustomer(null); setCustomerDetail(null); }}>Change</Button>
                  </div>
                  {customerDetail && (
                    <p className="text-xs text-muted-foreground">
                      {customerDetail.order_count ?? 0} previous order(s)
                      {customerDetail.gstin ? ` · GSTIN ${customerDetail.gstin}` : ''}
                    </p>
                  )}
                  {/* Other saved addresses — one click to ship to a different one. */}
                  {Array.isArray(customerDetail?.addresses) && customerDetail.addresses.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-muted-foreground self-center">Saved addresses:</span>
                      {customerDetail.addresses.map((a: any) => (
                        <Button key={a.id} size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => applySavedAddress(a)}>
                          {a.label || a.district || a.pincode || 'Address'}
                          {(a.is_default ?? a.isDefault) ? ' ★' : ''}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                    <Input
                      className="pl-9"
                      placeholder="Search existing customer by name / phone / email (or fill details below for a new one)"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>
                  {customerResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full border rounded-md bg-background shadow-lg max-h-56 overflow-y-auto">
                      {customerResults.map((c: any) => (
                        <button key={c._id ?? c.id} type="button" onClick={() => pickCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2">
                          <FaUser className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{c.name || 'Unnamed'}</span>
                          <span className="text-muted-foreground text-xs">{c.phone || c.phoneNumber || c.phone_number} {c.email ? `· ${c.email}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Full name *" value={address.fullName} onChange={(e) => setAddress(a => ({ ...a, fullName: e.target.value }))} />
                <Input placeholder="Phone *" value={address.mobileNumber} onChange={(e) => setAddress(a => ({ ...a, mobileNumber: e.target.value }))} />
                <Input placeholder="Email" value={address.email} onChange={(e) => setAddress(a => ({ ...a, email: e.target.value }))} />
                <div className="relative">
                  <Input placeholder="Pincode" value={address.pincode}
                    onChange={(e) => setAddress(a => ({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
                  {pincodeLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      Looking up…
                    </span>
                  )}
                </div>
                <Input className="sm:col-span-2" placeholder="Address" value={address.address} onChange={(e) => setAddress(a => ({ ...a, address: e.target.value }))} />
                <Input placeholder="City / District (auto-fills from pincode)" value={address.district} onChange={(e) => setAddress(a => ({ ...a, district: e.target.value }))} />
                <Input placeholder="State — drives CGST/SGST vs IGST (auto-fills from pincode)" value={address.state} onChange={(e) => setAddress(a => ({ ...a, state: e.target.value }))} />
                {/* Prefilled from the customer's B2B profile; printed on the tax invoice. */}
                <Input className="sm:col-span-2" placeholder="Customer GSTIN (optional)" value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())} />
              </div>
              {!customer && address.mobileNumber.trim() && (
                <p className="text-xs text-muted-foreground mt-2">
                  No customer selected above — on create, this phone number will be matched to an
                  existing account if one already uses it, or a new customer account will be
                  created automatically so this order shows up on their profile.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b"><CardTitle className="text-lg">Items</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="relative">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                  <Input className="pl-9" placeholder="Search by SKU or full pack name — e.g. 641536, or “aspidosperma q 30 ml sbl” (min 3 chars)"
                    value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                </div>
                {productSearch.trim().length >= 3 && (searching || productResults.length > 0) && (
                  <div className="absolute z-20 mt-1 w-full border rounded-md bg-background shadow-lg max-h-72 overflow-y-auto">
                    {searching && productResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                    )}
                    {productResults.map((r: any) => {
                      const price = Number(r.salePrice ?? r.sale_price ?? r.sellingPrice ?? r.selling_price ?? r.mrp ?? 0);
                      const stock = r.stock != null ? Number(r.stock) : null;
                      return (
                        <button key={r.id} type="button" onClick={() => addLine(r)}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-medium">{r.name ?? r.title}</span>
                            <span className="text-xs whitespace-nowrap">{money(price)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-mono">SKU {r.sku ?? '—'}</span>
                            {stock != null && (
                              <span className={stock > 0 ? ' ml-2 text-green-700' : ' ml-2 text-red-600'}>
                                {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No items yet — search above to add packs.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((l, idx) => {
                    const eff = lineEffective(l);
                    const extraOff = l.price > 0 && eff < l.price ? l.price - eff : 0;
                    return (
                    <div key={idx} className="border rounded-md p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{l.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">SKU {l.sku ?? '—'}</span>
                            {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                            {l.stock != null ? ` · ${l.stock} in stock` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {l.mrp && l.mrp > l.price
                              ? <>MRP <span className="line-through">{money(l.mrp)}</span> → catalog price {money(l.price)}</>
                              : <>Catalog price {money(l.price)}</>}
                            {extraOff > 0 && (
                              <span className="text-green-700 font-medium"> → your price {money(eff)} (−{money(extraOff)}/unit)</span>
                            )}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7"
                          onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>
                          <FaTrash className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        <div>
                          <label className="text-[11px] text-muted-foreground">Qty</label>
                          <Input type="number" min={1} value={l.quantity}
                            onChange={(e) => updateLine(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Set unit price (₹)</label>
                          <Input type="number" min={0} placeholder="auto" value={l.unitPrice ?? ''}
                            onChange={(e) => updateLine(idx, { unitPrice: e.target.value, discountPercent: '' })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Extra discount %</label>
                          <Input type="number" min={0} max={100} placeholder="0" value={l.discountPercent ?? ''}
                            onChange={(e) => updateLine(idx, { discountPercent: e.target.value, unitPrice: '' })} />
                        </div>
                        <div className="flex items-end justify-end">
                          <span className="font-bold text-sm">{money(eff * l.quantity)}</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground">
                    The catalog price already includes any running offer or B2B tier price. To give
                    MORE off, use <span className="font-medium">Extra discount %</span> (taken off the
                    catalog price) or <span className="font-medium">Set unit price</span> to name the
                    figure outright — either one is recorded on the order as a manual price.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b"><CardTitle className="text-lg">Order Settings</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div>
                <label className="text-[11px] text-muted-foreground">Payment method</label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cod">Cash on Delivery</SelectItem>
                    <SelectItem value="prepaid">Prepaid (pay by link)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Extra order discount (₹)</label>
                  <Input type="number" min={0} placeholder="0" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Shipping (₹, blank = auto)</label>
                  <Input type="number" min={0} placeholder="auto" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
                </div>
              </div>
              {parseFloat(orderDiscount) > 0 && (
                <Input placeholder="Discount reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
              )}
              <div>
                <label className="text-[11px] text-muted-foreground">Notes (internal)</label>
                <Input placeholder="e.g. Phone order taken by Priya" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <Checkbox checked={hold} onCheckedChange={(c: boolean | "indeterminate") => setHold(c as boolean)} />
                <span>Create on hold (release later)</span>
              </label>

              <div className="border-t pt-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Est. subtotal</span><span className="font-semibold">{money(estSubtotal)}</span></div>
                {estDiscount > 0 && <div className="flex justify-between text-green-700"><span>Discount</span><span>-{money(estDiscount)}</span></div>}
                <p className="text-[11px] text-muted-foreground">
                  Final prices, GST and shipping are computed server-side on create — B2B tiers and tax rules apply automatically.
                </p>
              </div>

              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleCreate} disabled={creating || !lines.length}>
                <FaPlus className="mr-1.5 h-3 w-3" /> {creating ? 'Creating…' : 'Create Order'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ManualOrderCreate;
