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
import { ordersAPI, customersAPI, productsAPI, searchAPI } from '../services/api';
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
  sku?: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  /** Catalog price — an estimate; the server reprices authoritatively. */
  price: number;
  mrp?: number;
  unitPrice?: string;        // manual override (input as string)
  discountPercent?: string;  // manual line discount %
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
  const [address, setAddress] = useState({ fullName: '', mobileNumber: '', email: '', address: '', district: '', state: '', pincode: '' });

  // Products
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [pickingProduct, setPickingProduct] = useState<any | null>(null); // full product incl. variations
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

  const pickCustomer = (c: any) => {
    setCustomer(c);
    setCustomerResults([]);
    setCustomerSearch('');
    // Store-customer rows expose contact as `phone`; older shapes vary.
    setAddress(a => ({
      ...a,
      fullName: a.fullName || c.name || '',
      mobileNumber: a.mobileNumber || c.phone || c.phoneNumber || c.phone_number || '',
      email: a.email || c.email || '',
    }));
    // Prefill the address from the customer's saved addresses when available.
    const globalId = c.customerId ?? c.customer_id ?? c.id;
    if (globalId) {
      customersAPI.getById(String(globalId)).then((detail: any) => {
        const d = detail?.data ?? detail ?? {};
        const addr = (Array.isArray(d.addresses) ? d.addresses[0] : null)
          ?? d.defaultAddress ?? d.default_address ?? null;
        if (addr) {
          setAddress(a => ({
            ...a,
            address: a.address || addr.address || addr.line1 || '',
            district: a.district || addr.district || addr.city || '',
            state: a.state || addr.state || '',
            pincode: a.pincode || addr.pincode || '',
          }));
        }
      }).catch(() => { /* optional prefill */ });
    }
  };

  // ── Product search ──
  useEffect(() => {
    if (productSearch.trim().length < 3) { setProductResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await searchAPI.query('product', productSearch.trim(), 8);
      setProductResults(results);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [productSearch]);

  const pickProduct = async (result: any) => {
    setProductResults([]);
    setProductSearch('');
    try {
      const p = await productsAPI.getById(result.id);
      const prod = p?.data ?? p;
      const variations: any[] = prod?.variations ?? [];
      if (variations.length > 0) {
        setPickingProduct(prod);   // needs a variation choice
      } else {
        addLine(prod, null);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load the product' });
    }
  };

  const addLine = (prod: any, variation: any | null) => {
    const price = Number(variation?.salePrice ?? variation?.sale_price ?? variation?.sellingPrice ?? variation?.selling_price
      ?? prod?.salePrice ?? prod?.sale_price ?? prod?.sellingPrice ?? prod?.selling_price ?? 0);
    const mrp = Number(variation?.mrp ?? prod?.mrp ?? 0);
    const attrs = variation?.attributes ?? {};
    setLines(ls => [...ls, {
      productId: prod.id ?? prod._id,
      variationId: variation?.id ?? variation?._id ?? undefined,
      sku: variation?.sku ?? prod?.sku ?? undefined,
      name: prod.title ?? prod.name ?? 'Product',
      variantLabel: Object.values(attrs).filter(Boolean).join(' · ') || undefined,
      quantity: 1,
      price: price || mrp,
      mrp: mrp || undefined,
    }]);
    setPickingProduct(null);
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
                <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/40">
                  <div className="text-sm">
                    <span className="font-semibold">{customer.name || 'Customer'}</span>
                    <span className="text-muted-foreground ml-2">{customer.phone || customer.phoneNumber || customer.phone_number} {customer.email ? `· ${customer.email}` : ''}</span>
                    {(customer.isB2b ?? customer.is_b2b) && <Badge className="ml-2 bg-blue-500/15 text-blue-700 border-blue-200">B2B{(customer.b2bTier ?? customer.b2b_tier) ? ` · ${customer.b2bTier ?? customer.b2b_tier}` : ''}</Badge>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Change</Button>
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
                <Input placeholder="Pincode" value={address.pincode} onChange={(e) => setAddress(a => ({ ...a, pincode: e.target.value }))} />
                <Input className="sm:col-span-2" placeholder="Address" value={address.address} onChange={(e) => setAddress(a => ({ ...a, address: e.target.value }))} />
                <Input placeholder="City / District" value={address.district} onChange={(e) => setAddress(a => ({ ...a, district: e.target.value }))} />
                <Input placeholder="State (drives CGST/SGST vs IGST)" value={address.state} onChange={(e) => setAddress(a => ({ ...a, state: e.target.value }))} />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b"><CardTitle className="text-lg">Items</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="relative">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                  <Input className="pl-9" placeholder="Search products to add (min 3 chars)"
                    value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                </div>
                {productResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full border rounded-md bg-background shadow-lg max-h-64 overflow-y-auto">
                    {productResults.map((r: any) => (
                      <button key={r.id} type="button" onClick={() => pickProduct(r)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                        <span className="font-medium">{r.label}</span>
                        {r.sublabel && <span className="text-muted-foreground text-xs ml-2">{r.sublabel}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Variation picker */}
              {pickingProduct && (
                <div className="border rounded-md p-3 bg-blue-50/50">
                  <p className="text-sm font-semibold mb-2">Pick a variation of {pickingProduct.title ?? pickingProduct.name}:</p>
                  <div className="flex flex-wrap gap-2">
                    {(pickingProduct.variations ?? []).map((v: any) => (
                      <Button key={v.id ?? v._id} size="sm" variant="outline" onClick={() => addLine(pickingProduct, v)}>
                        {Object.values(v.attributes ?? {}).filter(Boolean).join(' · ') || v.sku || 'Variant'}
                        <span className="ml-1.5 text-muted-foreground">{money(Number(v.salePrice ?? v.sale_price ?? v.sellingPrice ?? v.selling_price ?? v.mrp ?? 0))}</span>
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setPickingProduct(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No items yet — search above to add products.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((l, idx) => (
                    <div key={idx} className="border rounded-md p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{l.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[l.variantLabel, l.sku ? `SKU ${l.sku}` : null, `Catalog ${money(l.price)}`].filter(Boolean).join(' · ')}
                            {l.mrp && l.mrp > l.price ? ` · MRP ${money(l.mrp)}` : ''}
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
                          <label className="text-[11px] text-muted-foreground">Unit price override (₹)</label>
                          <Input type="number" min={0} placeholder="auto" value={l.unitPrice ?? ''}
                            onChange={(e) => updateLine(idx, { unitPrice: e.target.value, discountPercent: '' })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Line discount %</label>
                          <Input type="number" min={0} max={100} placeholder="0" value={l.discountPercent ?? ''}
                            onChange={(e) => updateLine(idx, { discountPercent: e.target.value, unitPrice: '' })} />
                        </div>
                        <div className="flex items-end justify-end">
                          <span className="font-bold text-sm">{money(lineEffective(l) * l.quantity)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
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
                  <label className="text-[11px] text-muted-foreground">Order discount (₹)</label>
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
