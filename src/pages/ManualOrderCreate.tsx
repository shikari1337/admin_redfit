/**
 * NEW ORDER / INVOICE — the desk's composer.
 *
 * ── The one rule ──
 * The browser never works out what anything costs. Every figure on this screen
 * — each line's rate, its MRP, its HSN, its GST rate, the lot it will ship
 * from, the discount, delivery, COD and the total — is the answer to
 * `POST /orders/manual/preview`, which runs the SAME `priceStaffOrder` that
 * `POST /orders/manual` runs when Create is pressed. A composer that quotes a
 * rate the create path then recomputes differently is the "shown is not
 * charged" bug this codebase has already paid for once
 * (docs/CHECKOUT_LOGIC.md §0).
 *
 * ── What changed, and why ──
 * The old screen showed a catalogue price it had multiplied itself, had no HSN,
 * no GST, no batch, no way to load a sheet of sixty lines, and decided silently
 * whether a walk-in became a customer. Each of those is now on the screen and
 * comes from the server.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Loader2, Plus, Search, ExternalLink, AlertTriangle, Receipt,
} from 'lucide-react';
import {
  ordersAPI, productsAPI, salesAPI,
  type ManualOrderPreview,
} from '../services/api';
import { usePincodeLookup } from '../hooks/usePincodeLookup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '../contexts/AuthContext';
import InfoTip from '../components/common/InfoTip';
import CustomerPicker, { type AccountChoice, type PickedCustomer } from '../components/sales/CustomerPicker';
import OrderLinesTable, { type BasketLine } from '../components/sales/OrderLinesTable';
import BulkAddFromSheet from '../components/sales/BulkAddFromSheet';

const money = (n: number | string | null | undefined) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A labelled field — one shape for every input on this page. */
const Field: React.FC<{
  label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode;
}> = ({ label, hint, required, className = '', children }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
      {label}{required && <span className="text-bad">*</span>}
      {hint && <InfoTip text={hint} />}
    </span>
    {children}
  </label>
);

const emptyAddress = {
  fullName: '', mobileNumber: '', email: '',
  address: '', district: '', state: '', pincode: '',
};

const ManualOrderCreate: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasPerm } = useAuth();
  const canCreate = hasPerm('orders.manage');

  // ── Customer ──
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [accountChoice, setAccountChoice] = useState<AccountChoice>('create');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState({ ...emptyAddress });

  // City/District + State from the pincode — the same India Post lookup the
  // storefront's checkout uses. A value staff typed by hand is never
  // overwritten; a corrected pincode re-fills, because we track what WE last set.
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

  // ── Lines ──
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // ── Order-level ──
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'prepaid'>('cod');
  const [orderDiscount, setOrderDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [notes, setNotes] = useState('');
  const [poRef, setPoRef] = useState('');
  const [hold, setHold] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any | null>(null);

  // ── The server's answer ──
  const [preview, setPreview] = useState<ManualOrderPreview | null>(null);
  const [pricing, setPricing] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  /** Guards an out-of-order response: only the newest request may write. */
  const previewSeq = useRef(0);

  const pickCustomer = (c: PickedCustomer) => {
    setCustomer(c);
    const book = c.addresses.find((a: any) => a.is_default ?? a.isDefault) ?? c.addresses[0] ?? c.lastOrderAddress ?? null;
    setAddress({
      fullName: book?.full_name ?? book?.fullName ?? c.name ?? '',
      mobileNumber: book?.mobile ?? book?.mobile_number ?? book?.mobileNumber ?? c.phone ?? '',
      email: c.email ?? book?.email ?? '',
      address: [book?.line1 ?? book?.address ?? '', book?.line2 ?? '', book?.landmark ?? ''].filter(Boolean).join(', '),
      district: book?.district ?? book?.city ?? '',
      state: book?.state ?? '',
      pincode: book?.pincode ?? '',
    });
    if (c.gstin) setGstin(String(c.gstin));
  };

  const useSavedAddress = (a: any) => setAddress((prev) => ({
    ...prev,
    fullName: a.full_name ?? a.fullName ?? prev.fullName,
    mobileNumber: a.mobile ?? a.mobile_number ?? a.mobileNumber ?? prev.mobileNumber,
    address: [a.line1 ?? '', a.line2 ?? '', a.landmark ?? ''].filter(Boolean).join(', '),
    district: a.district ?? a.city ?? '',
    state: a.state ?? '',
    pincode: a.pincode ?? '',
  }));

  // ── Product search, at SKU (variation) level ──
  // Searching PRODUCTS returns the remedy family; a line bound to the parent
  // prints the short family name and a generated `P-…` SKU on the invoice.
  useEffect(() => {
    if (productSearch.trim().length < 3) { setProductResults([]); setSearching(false); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try { setProductResults(await productsAPI.searchVariations(productSearch.trim(), 12)); }
      catch { setProductResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [productSearch]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setProductResults([]);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const addLine = (v: any) => {
    const productId = v.productId ?? v.product_id;
    if (!productId) {
      toast({ variant: 'destructive', title: 'Could not add', description: 'That row has no product behind it.' });
      return;
    }
    const variationId = v.isVariation === false || v.is_variation === false
      ? undefined : (v.variationId ?? v.variation_id ?? v.id);
    const existing = lines.findIndex((l) => l.productId === productId && l.variationId === variationId);
    if (existing >= 0) {
      // The same pack twice is one line with a bigger quantity — an invoice
      // cannot show one pack on two rows.
      setLines((ls) => ls.map((l, i) => (i === existing ? { ...l, quantity: l.quantity + 1 } : l)));
    } else {
      setLines((ls) => [...ls, {
        productId, variationId,
        sku: v.sku ?? undefined,
        name: v.name ?? v.title ?? 'Product',
        price: Number(v.salePrice ?? v.sale_price ?? v.sellingPrice ?? v.selling_price ?? v.mrp ?? 0),
        mrp: v.mrp != null ? Number(v.mrp) : undefined,
        stock: v.stock != null ? Number(v.stock) : undefined,
        attributes: v.attributes ?? {},
        quantity: 1,
      }]);
    }
    setProductResults([]); setProductSearch('');
  };

  const changeLine = useCallback((idx: number, patch: Partial<BasketLine>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }, []);
  const removeLine = useCallback((idx: number) => {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }, []);
  const addSheetLines = useCallback((incoming: BasketLine[]) => {
    setLines((ls) => {
      const next = [...ls];
      for (const add of incoming) {
        const at = next.findIndex((l) => l.productId === add.productId && l.variationId === add.variationId);
        if (at >= 0) next[at] = { ...next[at], quantity: next[at].quantity + add.quantity };
        else next.push(add);
      }
      return next;
    });
    toast({ title: `${incoming.length} line${incoming.length === 1 ? '' : 's'} added`, description: 'Re-pricing with the price book…' });
  }, [toast]);

  /** The body BOTH the preview and the create send — one shape, never two. */
  const buildPayload = useCallback(() => ({
    customerId: customer?.id ?? undefined,
    items: lines.map((l) => ({
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
    notes: [poRef.trim() ? `PO Ref: ${poRef.trim()}` : '', notes.trim()].filter(Boolean).join(' · ') || undefined,
    hold,
  }), [customer, lines, address, gstin, paymentMethod, orderDiscount, discountReason, shippingCost, notes, poRef, hold]);

  /** Everything the price depends on, as one string — the debounce's trigger. */
  const priceKey = useMemo(() => JSON.stringify({
    c: customer?.id ?? null,
    i: lines.map((l) => [l.productId, l.variationId, l.quantity, l.unitPrice ?? '', l.discountPercent ?? '']),
    s: address.state, p: address.pincode,
    m: paymentMethod, d: orderDiscount, sh: shippingCost, g: gstin.trim(),
  }), [customer, lines, address.state, address.pincode, paymentMethod, orderDiscount, shippingCost, gstin]);

  useEffect(() => {
    if (!lines.length) { setPreview(null); setPriceError(null); setPricing(false); return; }
    const seq = ++previewSeq.current;
    setPricing(true);
    const t = setTimeout(async () => {
      try {
        const p = await salesAPI.previewManualOrder(buildPayload());
        if (seq !== previewSeq.current) return;      // a newer basket is already in flight
        setPreview(p); setPriceError(null);
      } catch (e: any) {
        if (seq !== previewSeq.current) return;
        // A stale total read as current is the dangerous state, so it is cleared.
        setPreview(null);
        setPriceError(e?.response?.data?.message ?? 'The price could not be worked out for this basket.');
      } finally {
        if (seq === previewSeq.current) setPricing(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // buildPayload changes with every keystroke in Notes; priceKey is what
    // actually moves the money, so only it may trigger a re-price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const canSubmit = canCreate && !!lines.length && !!address.fullName.trim() && !!address.mobileNumber.trim()
    && !!preview && !pricing && !priceError;

  const handleCreate = async () => {
    if (!lines.length) { toast({ variant: 'destructive', title: 'Nothing to invoice', description: 'Add at least one pack.' }); return; }
    if (!address.fullName.trim() || !address.mobileNumber.trim()) {
      toast({ variant: 'destructive', title: 'Customer details', description: 'A name and a phone number are needed.' }); return;
    }
    setCreating(true);
    try {
      const payload: Record<string, any> = buildPayload();
      // The explicit choice. "No account" means the order is deliberately not
      // attached to anybody, so the phone is not used to find-or-create one.
      if (!customer && accountChoice === 'guest') {
        payload.shippingAddress = { ...address, mobileNumber: address.mobileNumber, noAccount: true };
        payload.customerId = undefined;
      }
      const r: any = await ordersAPI.createManual(payload as any);
      const order = r?.data ?? r;
      setCreated(order);
      toast({ title: 'Order created', description: `#${order.orderId ?? order.order_id}` });
    } catch (error: any) {
      toast({
        variant: 'destructive', title: 'Not created',
        description: error?.response?.data?.message || 'The order could not be created.',
      });
    } finally { setCreating(false); }
  };

  // ── Created ──
  if (created) {
    const payLink = created.payLink;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader className="border-b border-line pb-3">
            <CardTitle className="text-xl">Order #{created.orderId ?? created.order_id} created</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-ink-soft">
              Total <span className="font-bold tabular-nums text-ink">{money(created.total)}</span> ·{' '}
              {created.paymentMethod === 'cod' ? 'Cash on delivery' : 'Prepaid'}
              {created.orderStatus === 'on_hold' && ' · On hold'}
            </p>
            {payLink && (
              <div className="rounded-md border border-line bg-surface-2 p-3">
                <p className="mb-1 text-sm font-semibold text-ink">Review &amp; pay link</p>
                <p className="break-all font-mono text-xs text-ink-soft">{payLink}</p>
                <Button size="sm" variant="outline" className="mt-2"
                  onClick={() => { navigator.clipboard.writeText(payLink); toast({ title: 'Copied' }); }}>
                  <Copy className="mr-1.5 h-3 w-3" /> Copy link
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/orders/${created.id ?? created._id}`)}>Open the order</Button>
              <Button variant="outline" onClick={() => {
                setCreated(null); setLines([]); setPreview(null);
                setNotes(''); setPoRef(''); setOrderDiscount(''); setDiscountReason('');
              }}>
                Write another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const gst = preview?.gst;
  const gstRows: Array<{ label: string; amount: number }> = [];
  if (gst?.taxType === 'IGST') gstRows.push({ label: 'IGST', amount: Number(gst.igst) || 0 });
  else if (gst?.taxType) {
    gstRows.push({ label: 'CGST', amount: Number(gst.cgst) || 0 });
    gstRows.push({ label: 'SGST', amount: Number(gst.sgst) || 0 });
  }

  return (
    <div className="space-y-4">
      {/* Header — title, purpose, one primary action */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" className="-ml-3 mb-1 h-7 text-ink-soft" asChild>
            <Link to="/orders"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Orders</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            <Receipt className="h-5 w-5 text-ink-soft" /> New order
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Key in a phone, counter or WhatsApp order. Every price is the server's — wholesale tiers,
            batch prices and GST apply exactly as they do on the website.
          </p>
        </div>
        <Button size="lg" onClick={handleCreate} disabled={!canSubmit || creating}>
          {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          {creating ? 'Creating…' : `Create order${preview ? ` · ${money(preview.total)}` : ''}`}
        </Button>
      </div>

      {!canCreate && (
        <p className="flex items-center gap-1.5 rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          <AlertTriangle className="h-4 w-4" /> You can look, but creating an order needs the “Manage orders” permission.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Customer */}
          <Card>
            <CardHeader className="border-b border-line pb-2.5">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <CustomerPicker
                customer={customer}
                onPick={pickCustomer}
                onClear={() => { setCustomer(null); setGstin(''); }}
                accountChoice={accountChoice}
                onAccountChoice={setAccountChoice}
                newPhone={address.mobileNumber.trim() || undefined}
                onUseAddress={useSavedAddress}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Full name" required>
                  <Input value={address.fullName} onChange={(e) => setAddress((a) => ({ ...a, fullName: e.target.value }))} />
                </Field>
                <Field label="Phone" required hint="Also how an existing account is recognised, so the order lands on the right customer.">
                  <Input value={address.mobileNumber} inputMode="tel"
                    onChange={(e) => setAddress((a) => ({ ...a, mobileNumber: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={address.email} onChange={(e) => setAddress((a) => ({ ...a, email: e.target.value }))} />
                </Field>
                <Field label="Pincode" hint="Fills in the city and the state from India Post.">
                  <div className="relative">
                    <Input value={address.pincode} inputMode="numeric"
                      onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
                    {pincodeLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-mute" />
                    )}
                  </div>
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Input value={address.address} onChange={(e) => setAddress((a) => ({ ...a, address: e.target.value }))} />
                </Field>
                <Field label="City / district">
                  <Input value={address.district} onChange={(e) => setAddress((a) => ({ ...a, district: e.target.value }))} />
                </Field>
                <Field label="State" hint="Decides CGST + SGST versus IGST on this invoice.">
                  <Input value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} />
                </Field>
                <Field label="Customer GSTIN" className="sm:col-span-2"
                  hint="Printed on the tax invoice. Filled in from the customer's wholesale profile when they have one.">
                  <Input value={gstin} className="font-mono uppercase"
                    onChange={(e) => setGstin(e.target.value.toUpperCase())} />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-line pb-2.5">
              <CardTitle className="text-base">Items</CardTitle>
              <BulkAddFromSheet onAdd={addSheetLines} />
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="relative" ref={searchBoxRef}>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
                <Input className="pl-9" value={productSearch}
                  aria-label="Find a pack"
                  placeholder="Find a pack — SKU or name, e.g. 641536 or “aspidosperma q 30 ml sbl”"
                  onChange={(e) => setProductSearch(e.target.value)} />
                {searching && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-mute" />}
                {productSearch.trim().length >= 3 && (searching || productResults.length > 0) && (
                  <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface-raised shadow-lg">
                    {searching && productResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-ink-soft">Searching…</div>
                    )}
                    {productResults.map((r: any) => {
                      const price = Number(r.salePrice ?? r.sale_price ?? r.sellingPrice ?? r.selling_price ?? r.mrp ?? 0);
                      const stock = r.stock != null ? Number(r.stock) : null;
                      return (
                        <button key={r.id} type="button" onClick={() => addLine(r)}
                          className="w-full border-b border-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-brand-soft">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-medium text-ink">{r.name ?? r.title}</span>
                            <span className="whitespace-nowrap text-xs tabular-nums text-ink">{money(price)}</span>
                          </div>
                          <div className="text-xs text-ink-soft">
                            <span className="font-mono">SKU {r.sku ?? '—'}</span>
                            {stock != null && (
                              <span className={stock > 0 ? 'ml-2 text-good-ink' : 'ml-2 text-bad-ink'}>
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
                <div className="rounded-md border border-dashed border-line py-8 text-center">
                  <p className="text-sm font-medium text-ink">No packs yet</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Search above, or use <span className="font-medium">Add from Excel</span> for a sheet the customer sent.
                  </p>
                </div>
              ) : (
                <OrderLinesTable
                  lines={lines} priced={preview?.items ?? null} stale={pricing}
                  onChange={changeLine} onRemove={removeLine}
                  showTax={!!gst?.taxType}
                />
              )}
              {lines.length > 0 && (
                <p className="text-[11px] leading-snug text-ink-soft">
                  <span className="font-medium">Rate</span> is what the price book resolved for this customer — a running
                  offer, a batch price or their wholesale tier is already in it.
                  <span className="ml-1 font-medium">Disc %</span> takes more off that rate;
                  <span className="ml-1 font-medium">Set rate</span> names the figure outright. Either one is recorded on the
                  order as a manual price.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-line pb-2.5">
              <CardTitle className="text-base">Payment &amp; delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <Field label="Payment method">
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'cod' | 'prepaid')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cod">Cash on delivery</SelectItem>
                    <SelectItem value="prepaid">Prepaid — send a pay link</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Order discount ₹" hint="Off the whole order, on top of anything already in the line rates.">
                  <Input type="number" min={0} placeholder="0" className="tabular-nums"
                    value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} />
                </Field>
                <Field label="Delivery ₹" hint="Blank lets the store's own delivery rules decide.">
                  <Input type="number" min={0} placeholder="auto" className="tabular-nums"
                    value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
                </Field>
              </div>
              {/* Contextual: a reason is only a question once there is a discount. */}
              {parseFloat(orderDiscount) > 0 && (
                <Field label="Why the discount" hint="Recorded on the order and shown on the invoice's discount line.">
                  <Input value={discountReason} placeholder="e.g. Festival offer agreed on call"
                    onChange={(e) => setDiscountReason(e.target.value)} />
                </Field>
              )}
              <Field label="Customer's PO / reference" hint="Their own order number. Kept on the order so it can be quoted back.">
                <Input value={poRef} onChange={(e) => setPoRef(e.target.value)} />
              </Field>
              <Field label="Internal note" hint="Staff only — never shown to the customer.">
                <Input value={notes} placeholder="e.g. Phone order taken by Priya"
                  onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-sm text-ink">
                <Checkbox checked={hold} onCheckedChange={(c: boolean | 'indeterminate') => setHold(c as boolean)} />
                <span>Put on hold</span>
                <InfoTip text="The order is created but does not go to the warehouse until somebody releases it." />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-line pb-2.5">
              <CardTitle className="text-base">Summary</CardTitle>
              {pricing && <span className="flex items-center gap-1 text-xs text-ink-soft"><Loader2 className="h-3 w-3 animate-spin" /> pricing…</span>}
            </CardHeader>
            <CardContent className="pt-3 text-sm">
              {priceError && (
                <p className="mb-2 flex items-start gap-1.5 rounded-md border border-bad bg-bad-bg px-2.5 py-2 text-xs text-bad-ink">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {priceError}
                </p>
              )}
              {!preview ? (
                <p className="py-4 text-center text-xs text-ink-soft">
                  {lines.length ? 'Working the price out…' : 'Add a pack and the server will price the order.'}
                </p>
              ) : (
                <dl className="space-y-1.5">
                  <Row label="Items value" value={money(preview.subtotal)} />
                  {preview.discount > 0 && <Row label="Order discount" value={`− ${money(preview.discount)}`} good />}
                  {preview.shipping_cost > 0 && <Row label="Delivery" value={money(preview.shipping_cost)} />}
                  {preview.cod_fee > 0 && <Row label="Cash-on-delivery fee" value={money(preview.cod_fee)} />}
                  {gstRows.map((g) => <Row key={g.label} label={g.label} value={money(g.amount)} />)}
                  {!gst?.taxType && (
                    <p className="pt-1 text-[11px] text-ink-soft">
                      GST is switched off for this store, so nothing is added for tax.
                    </p>
                  )}
                  <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
                    <span className="font-semibold text-ink">Order total</span>
                    <span className="text-lg font-bold tabular-nums text-ink">{money(preview.total)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    <Badge variant="outline" className={preview.scope === 'b2b'
                      ? 'border-info bg-info-bg text-info-ink' : 'border-line text-ink-soft'}>
                      {preview.scope === 'b2b' ? 'Wholesale prices' : 'Retail prices'}
                    </Badge>
                    {preview.place_of_supply && (
                      <Badge variant="outline" className="border-line text-ink-soft">
                        Place of supply: {preview.place_of_supply}
                      </Badge>
                    )}
                    {preview.commission?.tier && (
                      <Badge variant="outline" className="border-line text-ink-soft">
                        Bills at the {preview.commission.tier} rate
                      </Badge>
                    )}
                  </div>
                  {preview.commission?.reason && (
                    <p className="pt-1 text-[11px] leading-snug text-ink-soft">{preview.commission.reason}</p>
                  )}
                  {preview.b2b?.is_b2b && preview.b2b.meets_min_order === false && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-warn bg-warn-bg px-2.5 py-2 text-[11px] text-warn-ink">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      This wholesale account's minimum is {money(preview.b2b.min_order_value)} — until the order reaches it,
                      retail prices apply. {money(preview.b2b.amount_to_min_order)} to go.
                    </p>
                  )}
                </dl>
              )}
              <p className="mt-3 text-[11px] leading-snug text-ink-soft">
                Every figure here is the server's, from the same calculation the order itself will use.
              </p>
              <Button className="mt-3 w-full" onClick={handleCreate} disabled={!canSubmit || creating}>
                {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                {creating ? 'Creating…' : 'Create order'}
              </Button>
              <Button variant="ghost" className="mt-1 w-full text-xs text-ink-soft" asChild>
                <Link to="/settings/invoice">
                  Invoice template, licences and GSTIN <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; good?: boolean }> = ({ label, value, good }) => (
  <div className="flex items-baseline justify-between">
    <dt className="text-ink-soft">{label}</dt>
    <dd className={`tabular-nums ${good ? 'text-good-ink' : 'text-ink'}`}>{value}</dd>
  </div>
);

export default ManualOrderCreate;
