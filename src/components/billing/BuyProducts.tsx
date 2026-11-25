/**
 * Billing: Buy Growcord products (BUY-1, owner 25 Nov 2026: "also only for admin in billing add
 * option to Product"). Shown only to a store admin (billing.manage); the Billing page decides.
 *
 * Nothing is asked for until this section scrolls into view; each product's plans are asked for
 * when that product's card does. Buying: the phone Growcord should call, then the server prices
 * the plan with GST and opens a Razorpay order (POST /billing/purchases), the amount is shown, and
 * Razorpay Checkout (the Billing page's own loader) takes the payment; its signed answer is checked
 * by POST /public/purchases/{id}/verify. "Your purchases" is GET /billing/purchases.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Loader2, ShoppingBag, X } from 'lucide-react';
import { Btn, Chip, Field, SectionCard, StatusChip } from '@/components/erp';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PhoneInput, { DEFAULT_DIAL } from '@/components/PhoneInput';
import { useInView } from '@/components/panelAnalytics/useInView';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI, errorText } from '@/services/api';
import { fmtCurrencyMinor } from '@/lib/money';
import { formatDay } from '@/utils/date';

interface Product { code: string; name: string; tagline?: string | null; host?: string | null }
/** OfferView (platform views/catalog.rs): `price_minor` is before GST; null when the plan has no fixed price. */
interface Plan {
  id: string; name: string; tagline?: string | null;
  price_minor: number | null; currency: string; interval: string | null;
  commission_percent?: unknown; features: string[]; cta: string;
}
/** StorePurchaseView (platform api/purchases.rs). */
interface Purchase {
  id: string; status: string; product_code: string; plan_name: string | null; interval: string | null;
  currency: string; subtotal_minor: number; tax_minor: number; amount_minor: number;
  paid_at: string | null; onboarding_sent_at: string | null; created_at: string | null;
}
/** PurchaseStartedView: the server's price, GST and the Razorpay order. */
interface Started {
  purchase_id: string;
  razorpay: { key_id: string; order_id: string; amount_minor: number; currency: string };
  subtotal_minor: number; tax_minor: number; tax_rate: number | string | null; amount_minor: number;
}

const money = (minor: number | null | undefined, currency?: string | null) => fmtCurrencyMinor(minor ?? 0, currency || 'INR', 'en-IN');
const INTERVAL: Record<string, string> = { month: 'a month', year: 'a year', once: 'one time', usage: 'by use' };
const intervalText = (i: string | null | undefined) => (i ? INTERVAL[i] ?? i : '');
const PURCHASE_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'blue' | 'neutral' }> = {
  pending: { label: 'Not paid', tone: 'amber' },
  paid: { label: 'Paid, being set up', tone: 'blue' },
  onboarding_sent: { label: 'Set up', tone: 'green' },
};
const PAID_TEXT = 'Payment received. Growcord will set it up and e-mail you.';

const list = <T,>(d: unknown, key?: string): T[] => {
  if (Array.isArray(d)) return d as T[];
  const v = key && d && typeof d === 'object' ? (d as Record<string, unknown>)[key] : undefined;
  return Array.isArray(v) ? (v as T[]) : [];
};

/** One product and its plans; the plans are asked for when this card scrolls into view. */
function ProductCard({ product, onBuy, canAsk }: { product: Product; onBuy: (product: Product, plan: Plan) => void; canAsk: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inView || plans) return;
    let live = true;
    billingAPI.getProductPlans(product.code)
      .then((d) => { if (live) setPlans(list<Plan>(d, 'plans')); })
      .catch((e) => { if (live) setError(errorText(e, 'The plans could not be loaded.')); });
    return () => { live = false; };
  }, [inView, plans, product.code]);

  return (
    <div ref={ref} className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white p-4" data-buy-product={product.code}>
      <div className="font-semibold text-gray-900">{product.name}</div>
      {product.tagline && <p className="mt-0.5 text-sm text-gray-500">{product.tagline}</p>}
      <div className="mt-3 flex-1 space-y-3">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : !plans ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading the plans</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-gray-500">No plan to buy yet.</p>
        ) : plans.map((p) => {
          const buyable = p.cta === 'buy' && p.price_minor != null;
          const commission = typeof p.commission_percent === 'number' || typeof p.commission_percent === 'string' ? Number(p.commission_percent) : NaN;
          return (
            <div key={p.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3" data-buy-plan={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                  {p.tagline && <div className="text-xs text-gray-500">{p.tagline}</div>}
                </div>
                {p.price_minor != null && (
                  <div className="text-right">
                    <div className="text-base font-semibold tabular-nums text-gray-900">
                      {money(p.price_minor, p.currency)} <span className="text-xs font-normal text-gray-500">{intervalText(p.interval)}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">GST added at checkout</div>
                  </div>
                )}
              </div>
              {Number.isFinite(commission) && commission > 0 && (
                <p className="mt-1 text-xs text-gray-600">Plus {commission}% of sales as commission</p>
              )}
              {p.features.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-gray-700"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />{f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                {buyable ? (
                  <Btn size="sm" onClick={() => onBuy(product, p)}><ShoppingBag /> Buy</Btn>
                ) : p.cta === 'included' ? (
                  <span className="text-xs text-gray-600">Included</span>
                ) : p.cta === 'usage' ? (
                  <span className="text-xs text-gray-600">Pay as you use</span>
                ) : (
                  <span className="text-xs text-gray-600">
                    Not sold online.{' '}
                    {canAsk ? <Link to="/support" className="font-medium text-gray-900 underline">Ask Growcord</Link> : 'Ask Growcord.'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Buy: the phone Growcord should call, then the amount with GST from the server, then Pay. */
function BuyDialog({ product, plan, onClose, onPay }: {
  product: Product; plan: Plan;
  onClose: () => void;
  onPay: (started: Started, contact: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [started, setStarted] = useState<Started | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) { setError('Give the phone number Growcord should call.'); return; }
    setBusy(true);
    try {
      const d = (await billingAPI.startPurchase({ plan_id: plan.id, phone: phone.trim(), dial_code: dial })) as Started;
      if (!d?.purchase_id || !d?.razorpay?.order_id || !d?.razorpay?.key_id) throw new Error('The payment could not be started. Please try again.');
      setStarted(d);
    } catch (err) {
      setError(errorText(err, 'The payment could not be started. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const rate = started?.tax_rate != null && started.tax_rate !== '' ? Number(started.tax_rate) : NaN;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Buy {product.name}</DialogTitle>
          <DialogDescription>{plan.name}{plan.interval ? `, ${intervalText(plan.interval)}` : ''}</DialogDescription>
        </DialogHeader>
        {!started ? (
          <form className="space-y-4" onSubmit={start} data-buy-step="phone">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-gray-600">Plan price</span>
                <span className="font-semibold tabular-nums text-gray-900">{money(plan.price_minor, plan.currency)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">GST is added on top. You see the full amount before you pay.</p>
            </div>
            <Field label="Phone number Growcord should call (required)">
              <PhoneInput value={phone} dialCode={dial} required onChange={({ number, dialCode }) => { setPhone(number); setDial(dialCode); }} />
            </Field>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <Btn type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Btn>
              <Btn type="submit" disabled={busy || !phone.trim()}>{busy && <Loader2 className="animate-spin" />} See the amount</Btn>
            </div>
          </form>
        ) : (
          <div className="space-y-4" data-buy-step="confirm">
            <dl className="space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-600">Plan price</dt><dd className="tabular-nums">{money(started.subtotal_minor, started.razorpay.currency)}</dd></div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">GST{Number.isFinite(rate) ? ` (${rate}%)` : ''}</dt>
                <dd className="tabular-nums">{money(started.tax_minor, started.razorpay.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 text-base font-semibold">
                <dt>Total to pay</dt><dd className="tabular-nums">{money(started.amount_minor, started.razorpay.currency)}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500">You pay securely with Razorpay. Growcord calls you on {dial} {phone} to set it up.</p>
            <div className="flex justify-end gap-2">
              <Btn type="button" variant="outline" onClick={onClose}>Cancel</Btn>
              <Btn type="button" variant="success" onClick={() => onPay(started, `${dial}${phone}`)}>
                Pay {money(started.amount_minor, started.razorpay.currency)}
              </Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BuyProducts({ loadCheckout }: {
  /** The Billing page's Razorpay Checkout loader (one loader, not a second copy). */
  loadCheckout: () => Promise<boolean>;
}) {
  const { user, hasPerm } = useAuth();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [buying, setBuying] = useState<{ product: Product; plan: Plan } | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<string | null>(null);

  const loadPurchases = useCallback(async () => {
    try {
      setPurchases(list<Purchase>(await billingAPI.getPurchases()));
      setPurchasesError(null);
    } catch (e) {
      setPurchasesError(errorText(e, 'Your purchases could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    if (!inView) return;
    let live = true;
    billingAPI.getProducts()
      .then((d) => { if (live) setProducts(list<Product>(d, 'products')); })
      .catch((e) => { if (live) setProductsError(errorText(e, 'Growcord products could not be loaded.')); });
    void loadPurchases();
    return () => { live = false; };
  }, [inView, loadPurchases]);

  const names = useMemo(() => new Map((products ?? []).map((p) => [p.code, p.name])), [products]);

  const pay = async (started: Started, contact: string) => {
    const what = buying;
    setBuying(null);
    setError(null);
    setPaid(null);
    setPaying(true);
    const ready = await loadCheckout();
    if (!ready || !window.Razorpay) {
      setError('Could not load Razorpay Checkout. Check your connection and try again.');
      setPaying(false);
      void loadPurchases();
      return;
    }
    try {
      const widget = new window.Razorpay({
        key: started.razorpay.key_id,
        amount: started.razorpay.amount_minor,
        currency: started.razorpay.currency || 'INR',
        name: 'Growcord',
        description: what ? `${what.product.name}, ${what.plan.name}` : 'Growcord product',
        order_id: started.razorpay.order_id,
        prefill: { contact, email: user?.email || undefined },
        handler: async (payment: any) => {
          try {
            await billingAPI.verifyPurchase(started.purchase_id, {
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_signature: payment.razorpay_signature,
            });
            setPaid(PAID_TEXT);
          } catch (e) {
            setError(errorText(e, 'The payment was received but could not be recorded. Please contact Growcord support.'));
          } finally {
            setPaying(false);
            void loadPurchases();
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setError('The payment was not finished. You can buy again at any time.');
            void loadPurchases();
          },
        },
        theme: { color: '#1F3A5F' },
      });
      widget.on('payment.failed', () => {
        setError('The payment did not go through. You can try again.');
        setPaying(false);
      });
      widget.open();
    } catch (e) {
      setError(errorText(e, 'Razorpay Checkout could not be opened.'));
      setPaying(false);
    }
  };

  return (
    <div ref={ref} data-buy-products>
      <SectionCard
        title="Buy Growcord products"
        description="Add another Growcord product to your business. Prices are before GST; GST is added at checkout."
      >
        <div className="space-y-5">
          {paid && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
              <span className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0" />{paid}</span>
              <button type="button" onClick={() => setPaid(null)} aria-label="Dismiss"><X className="size-4" /></button>
            </div>
          )}
          {error && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="size-4" /></button>
            </div>
          )}
          {paying && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="size-4 animate-spin" /> Waiting for the payment</p>}

          {productsError ? (
            <p className="text-sm text-red-700">{productsError}</p>
          ) : !products ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading Growcord products</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-500">No Growcord product is on sale right now.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.code} product={p} canAsk={hasPerm('support.read')} onBuy={(product, plan) => { setError(null); setPaid(null); setBuying({ product, plan }); }} />
              ))}
            </div>
          )}

          <div data-your-purchases>
            <h3 className="text-sm font-semibold text-gray-900">Your purchases</h3>
            {purchasesError ? (
              <p className="mt-2 text-sm text-red-700">{purchasesError}</p>
            ) : !purchases ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading</p>
            ) : purchases.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">You have not bought a Growcord product here yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Amount with GST</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((r) => {
                      const s = PURCHASE_STATUS[r.status];
                      return (
                        <TableRow key={r.id} data-purchase-row>
                          <TableCell className="font-medium text-gray-900">{names.get(r.product_code) ?? r.product_code}</TableCell>
                          <TableCell className="text-sm text-gray-700">
                            {r.plan_name ?? 'Plan'}{r.interval ? <span className="text-gray-500"> ({intervalText(r.interval)})</span> : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{money(r.amount_minor, r.currency)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-gray-700">{formatDay(r.paid_at ?? r.created_at, '')}</TableCell>
                          <TableCell>
                            {s ? <StatusChip status={r.status} tone={s.tone} label={s.label} /> : <Chip>{r.status}</Chip>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {buying && (
        <BuyDialog
          product={buying.product} plan={buying.plan}
          onClose={() => { setBuying(null); void loadPurchases(); }}
          onPay={pay}
        />
      )}
    </div>
  );
}
