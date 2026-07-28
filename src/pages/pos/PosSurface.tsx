import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import ScanInput, { scanFeedback } from '../scanner/ScanInput';

/**
 * POS (counter sales) — full-screen surface, slice 1.
 *
 * Scan or search → cart → server-side pricing (/checkout/calculate — client
 * prices are never trusted) → Charge posts a manual order (paymentMethod
 * prepaid, shipping 0 — it's a counter sale) → printable 80mm receipt.
 * Works with the same keyboard-wedge scanners as the warehouse scanner.
 */

interface CartLine { variationId: string; productId: string; sku: string; name: string; qty: number }

const PosSurface: React.FC = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [calc, setCalc] = useState<any | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [payMethod, setPayMethod] = useState<'cash' | 'upi'>('cash');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);
  const calcSeq = useRef(0);
  const [session, setSession] = useState<any | null | undefined>(undefined); // undefined = loading
  const [floatRupees, setFloatRupees] = useState('1000');
  const [closing, setClosing] = useState(false);
  const [countedRupees, setCountedRupees] = useState('');
  const [closeResult, setCloseResult] = useState<any | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // ── Multi-outlet (048): a store with outlets picks one on the drawer screen;
  //    it is remembered per device. Warehouse-only stores have no outlets → no
  //    picker, everything works exactly as before (outletId stays null).
  const [outlets, setOutlets] = useState<any[]>([]);
  const [outletId, setOutletId] = useState<string | null>(() => localStorage.getItem('pos_outlet_id') || null);

  // ── Return / refund flow (find receipt → pick lines → done) ─────────────────
  const [returnMode, setReturnMode] = useState(false);
  const [returnStep, setReturnStep] = useState<'find' | 'pick' | 'done'>('find');
  const [returnNumber, setReturnNumber] = useState('');
  const [returnSale, setReturnSale] = useState<any | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnMethod, setReturnMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [returnResult, setReturnResult] = useState<any | null>(null);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMsg, setReturnMsg] = useState('');

  const startReturn = () => {
    setReturnMode(true); setReturnStep('find'); setReturnNumber('');
    setReturnSale(null); setReturnQty({}); setReturnReason(''); setReturnMethod('cash');
    setReturnResult(null); setReturnMsg('');
  };
  const exitReturn = () => { setReturnMode(false); setReturnMsg(''); loadSession(); };

  const findSale = async () => {
    const num = returnNumber.trim();
    if (!num) { setReturnMsg('Type or scan the receipt number'); return; }
    setReturnMsg('');
    try {
      const res = await api.get(`/pos/receipts/${encodeURIComponent(num)}`);
      const sale = res.data;
      if (!sale?.items?.length) { setReturnMsg('That sale has no returnable lines'); return; }
      scanFeedback(true);
      setReturnSale(sale); setReturnQty({}); setReturnMethod(sale.payment_method ?? 'cash');
      setReturnStep('pick');
    } catch (e: any) {
      scanFeedback(false);
      setReturnMsg(e?.response?.data?.message ?? 'No sale found for that receipt number');
    }
  };

  const setReturnLineQty = (variationId: string, qty: number, max: number) => {
    const q = Math.max(0, Math.min(qty, max));
    setReturnQty((m) => ({ ...m, [variationId]: q }));
  };

  const returnTotal = (): number =>
    (returnSale?.items ?? []).reduce(
      (s: number, it: any) => s + (returnQty[it.variation_id] ?? 0) * Number(it.unit_price), 0);

  const submitRefund = async () => {
    if (returnBusy) return;
    const items = (returnSale?.items ?? [])
      .filter((it: any) => (returnQty[it.variation_id] ?? 0) > 0)
      .map((it: any) => ({ variationId: it.variation_id, qty: returnQty[it.variation_id] }));
    if (!items.length) { setReturnMsg('Pick at least one item to return'); return; }
    if (!returnReason.trim()) { setReturnMsg('Enter a reason for the return'); return; }
    setReturnBusy(true); setReturnMsg('');
    try {
      const res = await api.post('/pos/refunds', {
        receiptNumber: returnSale.receipt_number,
        method: returnMethod, reason: returnReason.trim(), items,
        outletId: outletId ?? undefined,
      }, { headers: { 'X-Idempotency-Key': crypto.randomUUID() } });
      const refund = res.data;
      scanFeedback(true);
      setReturnResult({
        refund, method: returnMethod, reason: returnReason.trim(),
        lines: (returnSale.items as any[])
          .filter((it) => (returnQty[it.variation_id] ?? 0) > 0)
          .map((it) => ({ name: it.product_name ?? it.sku, sku: it.sku, qty: returnQty[it.variation_id], unit_price: Number(it.unit_price) })),
      });
      setReturnStep('done');
      loadSession();
    } catch (e: any) {
      scanFeedback(false);
      setReturnMsg(e?.response?.data?.message ?? e.message);
    } finally { setReturnBusy(false); }
  };

  const loadSession = (oid: string | null = outletId) =>
    api.get('/pos/session', { params: oid ? { outletId: oid } : {} })
      .then((res) => setSession(res.data ?? null)).catch(() => setSession(null));
  useEffect(() => {
    api.get('/pos/outlets')
      .then((r) => setOutlets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOutlets([]))
      .finally(() => loadSession());
  }, []);

  /** Pick the outlet on the drawer screen (remembered per device). */
  const pickOutlet = (oid: string | null) => {
    setOutletId(oid);
    if (oid) localStorage.setItem('pos_outlet_id', oid); else localStorage.removeItem('pos_outlet_id');
    loadSession(oid);
  };
  const outletName = (id: string | null) => outlets.find((o) => o.id === id)?.name ?? null;

  const openDrawer = async () => {
    setMsg('');
    if (outlets.length > 0 && !outletId) { setMsg('Pick which shop counter this drawer is for.'); return; }
    try {
      await api.post('/pos/session/open', {
        openingFloatMinor: Math.round((parseFloat(floatRupees) || 0) * 100),
        outletId: outletId ?? undefined,
      });
      loadSession();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const closeDrawer = async () => {
    setMsg('');
    try {
      const res = await api.post('/pos/session/close', {
        countedCashMinor: Math.round((parseFloat(countedRupees) || 0) * 100),
        outletId: outletId ?? undefined,
      });
      setCloseResult(res.data); setClosing(false); setCountedRupees('');
      loadSession();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  /** Known customer? Phone lookup attaches their id so B2B pricing applies. */
  const lookupCustomer = async () => {
    const phone = customer.phone.trim();
    setCustomerId(null);
    if (phone.length < 10) return;
    try {
      const res = await api.get('/customers', { params: { search: phone, limit: 1 } });
      const rows = res.data?.customers ?? res.data?.rows ?? (Array.isArray(res.data) ? res.data : []);
      const hit = rows[0];
      if (hit && String(hit.phone ?? hit.phone_number ?? '').includes(phone.slice(-10))) {
        setCustomerId(hit.id ?? hit._id ?? null);
        if (!customer.name.trim() && (hit.name || hit.full_name)) {
          setCustomer((c) => ({ ...c, name: hit.name ?? hit.full_name }));
        }
      }
    } catch { /* anonymous sale is fine */ }
  };

  const addLine = (variationId: string, productId: string, sku: string, name: string) => {
    scanFeedback(true);
    setResults([]);
    setCart((c) => {
      const hit = c.find((l) => l.variationId === variationId);
      if (hit) return c.map((l) => (l.variationId === variationId ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { variationId, productId, sku, name, qty: 1 }];
    });
  };

  // ── real-time search: the SAME multi-field engine as the storefront
  //    (name / brand / category / tags / SKU + synonyms), one card per
  //    variation with the canonical price. Debounced as-you-type; Enter (a
  //    scanner gun) still resolves the exact barcode instantly.
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearch = (q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const res = await api.get('/products', {
          params: { search: term, expand: 'variations', limit: 8 },
        });
        const rows = Array.isArray(res.data) ? res.data : res.data?.products ?? [];
        if (seq === searchSeq.current) setResults(rows);
      } catch { /* keep last results */ }
    }, 250);
  };

  const onScan = async (code: string) => {
    setMsg('');
    try {
      const res = await api.get(`/wms/scan/${encodeURIComponent(code)}`);
      if (res.data?.type === 'variation') {
        setResults([]);
        addLine(res.data.variation_id, res.data.product_id, res.data.sku, res.data.product_name ?? res.data.sku);
        return;
      }
    } catch { /* not an exact code — the live results are already on screen */ }
    if (!results.length) { scanFeedback(false); setMsg(`Nothing matches "${code}"`); }
  };

  // Server-side pricing on every cart change (client never computes money).
  useEffect(() => {
    if (!cart.length) { setCalc(null); return; }
    const seq = ++calcSeq.current;
    api.post('/checkout/calculate', {
      items: cart.map((l) => ({ productId: l.productId, variationId: l.variationId, quantity: l.qty })),
      paymentMethod: 'prepaid',
    }).then((res) => { if (seq === calcSeq.current) setCalc(res.data); })
      .catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  }, [cart]);

  const priceFor = (variationId: string): number | null => {
    const it = (calc?.items ?? []).find((i: any) => (i.variation_id ?? i.variationId) === variationId);
    return it ? Number(it.price) : null;
  };

  const setQty = (variationId: string, qty: number) => {
    if (qty <= 0) setCart((c) => c.filter((l) => l.variationId !== variationId));
    else setCart((c) => c.map((l) => (l.variationId === variationId ? { ...l, qty } : l)));
  };

  const charge = async () => {
    if (!cart.length || busy) return;
    setBusy(true); setMsg('');
    try {
      const res = await api.post('/orders/manual', {
        items: cart.map((l) => ({ productId: l.productId, variationId: l.variationId, quantity: l.qty })),
        shippingAddress: {
          fullName: customer.name.trim() || 'Walk-in Customer',
          mobileNumber: customer.phone.trim() || '9999999999',
        },
        customerId: customerId ?? undefined,
        paymentMethod: 'prepaid',
        shippingCost: 0,
        note: `POS sale — paid by ${payMethod.toUpperCase()}`,
      });
      const order = res.data?.order ?? res.data;
      // Drawer receipt with a gapless RCP number (idempotency-keyed).
      let rcp: any = null;
      try {
        const total = Number(order?.total ?? order?.total_amount ?? calc?.subtotal ?? 0);
        const rres = await api.post('/pos/receipts', {
          orderId: order?.id ?? null, paymentMethod: payMethod,
          amountMinor: Math.round(total * 100),
          // Outlet sale: the shelf being sold from + the lines to drain from it.
          outletId: outletId ?? undefined,
          lines: cart.map((l) => ({ variationId: l.variationId, productId: l.productId, qty: l.qty })),
        }, { headers: { 'X-Idempotency-Key': crypto.randomUUID() } });
        rcp = rres.data;
      } catch { /* receipt shows a pending note below */ }
      scanFeedback(true);
      setReceipt({ order, rcp, lines: cart.map((l) => ({ ...l, price: priceFor(l.variationId) })), payMethod });
      setCart([]); setCalc(null); setCustomer({ name: '', phone: '' }); setCustomerId(null);
      loadSession();
    } catch (e: any) {
      scanFeedback(false);
      setMsg(e?.response?.data?.message ?? e.message);
    } finally { setBusy(false); }
  };

  if (receipt) {
    const total = receipt.order?.total ?? receipt.order?.total_amount ?? null;
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <style>{`@media print { body * { visibility: hidden; } #pos-receipt, #pos-receipt * { visibility: visible; } #pos-receipt { position: absolute; left: 0; top: 0; width: 80mm; } }`}</style>
        <div id="pos-receipt" className="mx-auto max-w-xs rounded-lg border bg-white p-4 font-mono text-xs shadow-sm">
          <div className="text-center text-sm font-bold">SALE RECEIPT</div>
          {receipt.rcp?.receipt_number
            ? <div className="text-center text-[11px] font-bold">{receipt.rcp.receipt_number}</div>
            : <div className="text-center text-[10px] text-amber-700">receipt no. pending — drawer session?</div>}
          <div className="text-center text-[11px]">{receipt.order?.order_number ?? receipt.order?.orderNumber ?? ''}</div>
          <div className="my-2 border-t border-dashed" />
          {receipt.lines.map((l: any) => (
            <div key={l.variationId} className="flex justify-between gap-2">
              <span className="truncate">{l.name} ×{l.qty}</span>
              <span>{l.price != null ? `₹${(l.price * l.qty).toFixed(2)}` : ''}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed" />
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span><span>{total != null ? `₹${Number(total).toFixed(2)}` : '—'}</span>
          </div>
          <div className="mt-1 text-center text-[10px]">Paid by {receipt.payMethod.toUpperCase()} · prices incl. GST</div>
        </div>
        <div className="mx-auto mt-4 flex max-w-xs gap-2">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-gray-900 py-3 font-semibold text-white">Print</button>
          <button onClick={() => setReceipt(null)} className="flex-1 rounded-lg border-2 py-3 font-semibold">New sale</button>
        </div>
      </div>
    );
  }

  // ── drawer session gate ────────────────────────────────────────────────────
  if (session === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">Loading…</div>;
  }
  if (session === null) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-100">
        <header className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-base font-semibold"><Store className="h-5 w-5 text-gray-300" /> Point of Sale</span>
          <button onClick={() => navigate('/')} className="rounded border border-white/20 hover:bg-white/10 px-3 py-1 text-sm">Exit</button>
        </header>
        <main className="mx-auto w-full max-w-sm flex-1 space-y-4 p-6">
          {closeResult && (
            <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
              <div className="font-bold">Drawer closed</div>
              <div>Expected cash: ₹{(Number(closeResult.expected_cash_minor) / 100).toFixed(2)}</div>
              <div>Counted: ₹{(Number(closeResult.counted_cash_minor) / 100).toFixed(2)}</div>
              <div className={Number(closeResult.variance_minor) === 0 ? 'text-green-700' : 'text-red-700'}>
                Variance: ₹{(Number(closeResult.variance_minor) / 100).toFixed(2)}
              </div>
            </div>
          )}
          <h2 className="text-lg font-bold">Open the drawer to start selling</h2>
          {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
          {outlets.length > 0 && (
            <div className="space-y-1">
              <label className="block text-sm text-gray-600">Which shop counter is this drawer for?</label>
              <select value={outletId ?? ''} onChange={(e) => pickOutlet(e.target.value || null)}
                      className="w-full rounded-lg border-2 px-3 py-3 text-lg font-semibold">
                <option value="">Select an outlet…</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}{o.code ? ` (${o.code})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <label className="block text-sm text-gray-600">Opening cash float (₹)</label>
          <input type="number" min={0} value={floatRupees} onChange={(e) => setFloatRupees(e.target.value)}
                 className="w-full rounded-lg border-2 px-3 py-3 text-center text-2xl font-bold" />
          <button onClick={openDrawer} className="w-full rounded-lg bg-gray-900 py-4 text-lg font-bold text-white">
            Open drawer
          </button>
        </main>
      </div>
    );
  }

  // ── Return / refund flow ────────────────────────────────────────────────────
  if (returnMode) {
    const total = returnTotal();
    return (
      <div className="flex min-h-screen flex-col bg-gray-100">
        <header className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-base font-semibold"><RotateCcw className="h-5 w-5 text-gray-300" /> Return / Refund</span>
          <button onClick={exitReturn} className="rounded border border-white/20 hover:bg-white/10 px-3 py-1 text-sm">
            {returnStep === 'done' ? 'Done' : 'Cancel'}
          </button>
        </header>

        {/* Step 1 — find the sale by receipt number */}
        {returnStep === 'find' && (
          <main className="mx-auto w-full max-w-sm flex-1 space-y-4 p-6">
            <h2 className="text-lg font-bold">Scan or type the receipt number</h2>
            <p className="text-sm text-gray-500">It's printed at the top of the customer's receipt (e.g. RCP/26-27/00001).</p>
            {returnMsg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{returnMsg}</div>}
            <input autoFocus value={returnNumber} onChange={(e) => setReturnNumber(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') findSale(); }}
                   placeholder="RCP/…"
                   className="w-full rounded-lg border-2 px-3 py-3 text-center text-xl font-bold" />
            <button onClick={findSale} className="w-full rounded-lg bg-gray-900 py-4 text-lg font-bold text-white">
              Find sale
            </button>
          </main>
        )}

        {/* Step 2 — pick what is coming back */}
        {returnStep === 'pick' && returnSale && (
          <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">What's coming back?</h2>
              <span className="font-mono text-xs text-gray-500">{returnSale.receipt_number}</span>
            </div>
            {Number(returnSale.refunded_minor) > 0 && (
              <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Already refunded on this sale: ₹{(Number(returnSale.refunded_minor) / 100).toFixed(2)} ·
                still refundable ₹{(Number(returnSale.refundable_minor) / 100).toFixed(2)}
              </div>
            )}
            {returnMsg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{returnMsg}</div>}
            {returnSale.items.map((it: any) => {
              const max = it.returnable_qty;
              const q = returnQty[it.variation_id] ?? 0;
              return (
                <div key={it.variation_id} className={`rounded-xl border bg-white p-3 shadow-sm ${max <= 0 ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{it.product_name}</div>
                      <div className="font-mono text-xs text-gray-500">
                        {it.sku} · ₹{Number(it.unit_price).toFixed(2)} · bought {it.quantity}
                        {it.refunded_qty > 0 ? ` · returned ${it.refunded_qty}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button disabled={max <= 0} onClick={() => setReturnLineQty(it.variation_id, q - 1, max)}
                              className="h-11 w-11 rounded-lg border-2 text-xl font-bold disabled:opacity-40">−</button>
                      <span className="w-8 text-center text-lg font-bold">{q}</span>
                      <button disabled={max <= 0} onClick={() => setReturnLineQty(it.variation_id, q + 1, max)}
                              className="h-11 w-11 rounded-lg border-2 text-xl font-bold disabled:opacity-40">+</button>
                    </div>
                    <div className="w-20 text-right font-bold">{q > 0 ? `₹${(q * Number(it.unit_price)).toFixed(2)}` : ''}</div>
                  </div>
                </div>
              );
            })}
            <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex justify-between text-lg font-bold">
                <span>Refund total</span><span>₹{total.toFixed(2)}</span>
              </div>
              <input placeholder="Reason for return (required)" value={returnReason}
                     onChange={(e) => setReturnReason(e.target.value)}
                     className="w-full rounded-lg border-2 px-3 py-2" />
              <div className="flex gap-2">
                {(['cash', 'upi', 'card'] as const).map((m) => (
                  <button key={m} onClick={() => setReturnMethod(m)}
                          className={`flex-1 rounded-lg border-2 py-3 font-semibold uppercase ${returnMethod === m ? 'border-gray-900 bg-gray-900 text-white' : ''}`}>
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={submitRefund} disabled={returnBusy || total <= 0}
                      className="w-full rounded-lg bg-red-600 py-4 text-lg font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {returnBusy ? 'Refunding…' : `Refund ₹${total.toFixed(2)} by ${returnMethod.toUpperCase()}`}
              </button>
            </div>
          </main>
        )}

        {/* Step 3 — done: printable credit note */}
        {returnStep === 'done' && returnResult && (
          <main className="flex-1 p-4">
            <style>{`@media print { body * { visibility: hidden; } #pos-receipt, #pos-receipt * { visibility: visible; } #pos-receipt { position: absolute; left: 0; top: 0; width: 80mm; } }`}</style>
            <div id="pos-receipt" className="mx-auto max-w-xs rounded-lg border bg-white p-4 font-mono text-xs shadow-sm">
              <div className="text-center text-sm font-bold">REFUND / CREDIT NOTE</div>
              <div className="text-center text-lg font-bold">{returnResult.refund?.refund_number}</div>
              <div className="my-2 border-t border-dashed" />
              {returnResult.lines.map((l: any, i: number) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{l.name} ×{l.qty}</span>
                  <span>₹{(l.unit_price * l.qty).toFixed(2)}</span>
                </div>
              ))}
              <div className="my-2 border-t border-dashed" />
              <div className="flex justify-between text-sm font-bold">
                <span>REFUNDED</span><span>₹{(Number(returnResult.refund?.amount_minor) / 100).toFixed(2)}</span>
              </div>
              <div className="mt-1 text-center text-[10px]">Paid back by {returnResult.method.toUpperCase()} · {returnResult.reason}</div>
            </div>
            <div className="mx-auto mt-4 flex max-w-xs gap-2">
              <button onClick={() => window.print()} className="flex-1 rounded-lg bg-gray-900 py-3 font-semibold text-white">Print</button>
              <button onClick={startReturn} className="flex-1 rounded-lg border-2 py-3 font-semibold">Another return</button>
              <button onClick={exitReturn} className="flex-1 rounded-lg border-2 py-3 font-semibold">Back to sale</button>
            </div>
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Store className="h-5 w-5 text-gray-300" /> Point of Sale
          {(session.outlet_name || outletName(outletId)) && (
            <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-medium">{session.outlet_name || outletName(outletId)}</span>
          )}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span>{session.receipt_count} sale(s) · cash ₹{(Number(session.cash_minor) / 100).toFixed(0)}</span>
          <button onClick={startReturn} className="rounded border border-white/20 hover:bg-white/10 px-2 py-1">Return</button>
          <button onClick={() => setClosing((v) => !v)} className="rounded border border-white/20 hover:bg-white/10 px-2 py-1">Close drawer</button>
          <button onClick={() => navigate('/')} className="rounded border border-white/20 hover:bg-white/10 px-2 py-1">Exit</button>
        </span>
      </header>
      {closing && (
        <div className="border-b bg-amber-50 px-4 py-3">
          <div className="mx-auto flex max-w-xl items-center gap-2 text-sm">
            <span>Expected cash ₹{(Number(session.expected_cash_now_minor) / 100).toFixed(2)} — counted:</span>
            <input type="number" min={0} value={countedRupees} onChange={(e) => setCountedRupees(e.target.value)}
                   className="w-28 rounded border-2 px-2 py-1 text-right font-bold" />
            <button onClick={closeDrawer} className="rounded bg-gray-900 px-3 py-1 font-semibold text-white">Close</button>
            <button onClick={() => setClosing(false)} className="rounded border px-3 py-1">Cancel</button>
          </div>
        </div>
      )}
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Scan or search products</h2>
          <ScanInput placeholder="Scan barcode / search name, brand, SKU…"
                     onScan={onScan} onQueryChange={liveSearch} />
          {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {results.map((r: any) => {
              const vid = r.variation_id ?? r.id;
              const pid = r.product_id ?? r.id;
              const price = r.final_price ?? r.sale_price ?? r.selling_price ?? r.price;
              const oos = r.in_stock === false || Number(r.stock ?? 1) <= 0;
              return (
                <button key={vid} onClick={() => addLine(vid, pid, r.sku ?? '', r.name)}
                        disabled={oos}
                        className={`block w-full rounded-xl border-2 bg-white p-3 text-left shadow-sm active:border-gray-900 ${oos ? 'opacity-45' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="truncate font-mono text-xs text-gray-500">
                        {[r.sku, r.brand_name].filter(Boolean).join('  ·  ')}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {price != null && <div className="font-bold">₹{Number(price).toFixed(2)}</div>}
                      <div className={`text-[11px] ${oos ? 'text-red-600' : 'text-gray-400'}`}>
                        {oos ? 'out of stock' : `stock ${r.stock ?? '—'}`}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold">Cart</h2>
          {cart.length === 0 && <div className="rounded-xl bg-white p-6 text-center text-gray-500 shadow-sm">Scan something to start the sale.</div>}
          {cart.map((l) => {
            const p = priceFor(l.variationId);
            return (
              <div key={l.variationId} className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{l.name}</div>
                    <div className="font-mono text-xs text-gray-500">{l.sku}{p != null ? ` · ₹${p.toFixed(2)}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.variationId, l.qty - 1)} className="h-10 w-10 rounded-lg border-2 text-lg font-bold">−</button>
                    <span className="w-8 text-center text-lg font-bold">{l.qty}</span>
                    <button onClick={() => setQty(l.variationId, l.qty + 1)} className="h-10 w-10 rounded-lg border-2 text-lg font-bold">+</button>
                  </div>
                  <div className="w-20 text-right font-bold">{p != null ? `₹${(p * l.qty).toFixed(2)}` : '…'}</div>
                </div>
              </div>
            );
          })}
          {cart.length > 0 && (
            <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex justify-between text-lg font-bold">
                <span>Total (incl. GST)</span>
                <span>{calc?.subtotal != null ? `₹${Number(calc.subtotal).toFixed(2)}` : '…'}</span>
              </div>
              <div className="flex gap-2">
                <input placeholder="Customer name (optional)" value={customer.name}
                       onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                       className="min-w-0 flex-1 rounded-lg border-2 px-3 py-2" />
                <input placeholder="Phone (optional)" value={customer.phone}
                       onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                       onBlur={lookupCustomer}
                       className={`w-36 rounded-lg border-2 px-3 py-2 ${customerId ? 'border-emerald-500' : ''}`} />
              </div>
              <div className="flex gap-2">
                {(['cash', 'upi'] as const).map((m) => (
                  <button key={m} onClick={() => setPayMethod(m)}
                          className={`flex-1 rounded-lg border-2 py-3 font-semibold uppercase ${payMethod === m ? 'border-gray-900 bg-gray-900 text-white' : ''}`}>
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={charge} disabled={busy}
                      className="w-full rounded-lg bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? 'Charging…' : 'Charge'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PosSurface;
