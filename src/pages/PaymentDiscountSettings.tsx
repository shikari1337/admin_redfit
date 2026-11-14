import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Plus, Trash2, Percent, Loader2, Ban, Pencil, RotateCcw, X } from 'lucide-react';
import { api, paymentRulesAPI } from '../services/api';
import { payload as unwrapPayload } from '../lib/unwrap';
import { fmtRupees } from '@/lib/money';
import { paymentLabel } from '@/components/dashboard/shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSettingsSection } from '../hooks/useSettingsSection';

interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

interface PaymentRule {
  id: string;
  name: string;
  method: string;
  conditions: {
    minOrderValue?: number; maxOrderValue?: number; orderValueAbove?: number; excludePincodes?: string[];
    customerSegment?: string; system?: string; checkedAt?: string; [key: string]: unknown;
  };
  is_active: boolean;
  sort_order: number;
}

// Owner decision DEC-083: a rule switches off ONE payment method, and checkout judges it against the
// method the shopper picks. Two words always applied (growcord-rs checkout contract payment_rules
// COD, PREPAID): cash on delivery and every online way together. Every other method a rule may name
// comes from the store's own gateways (useStoreMethods), never from a list typed here.
const GROUP_METHODS: Array<{ value: string; label: string; short: string }> = [
  { value: 'cod', label: 'Cash on delivery', short: 'COD' },
  { value: 'prepaid', label: 'Every online payment (all gateways, UPI and bank transfer)', short: 'Every online payment' },
];
const isGroup = (method: string) => GROUP_METHODS.some((m) => m.value === method);
const methodShort = (method: string) => GROUP_METHODS.find((m) => m.value === method)?.short ?? paymentLabel(method);
/** A rule naming one method applies only once a person checked it: the server writes `conditions.checkedAt` when a
 *  rule is created or switched on (growcord-rs checkout contract payment_rules::applies). A rule saved before
 *  DEC-083 with upi, card, netbanking or wallet never applied at checkout, so it waits here until a person
 *  switches it on. */
const needsReview = (r: PaymentRule) => {
  const checked = r.conditions?.checkedAt;
  return !isGroup(r.method) && !(typeof checked === 'string' && checked.trim() !== '');
};
/** The condition keys this form edits. Every other key a rule carries (orderValueAbove, system) is sent back
 *  unchanged; checkedAt is the server's own and never sent. */
const FORM_CONDITION_KEYS = ['minOrderValue', 'maxOrderValue', 'excludePincodes', 'customerSegment', 'checkedAt'];
const emptyRuleForm = {
  id: '', name: '', method: 'cod', minOrderValue: '', maxOrderValue: '', excludePincodes: '', customerSegment: 'all', is_active: true,
  legacy: false, base: {} as Record<string, unknown>,
};

/** One method a rule may switch off on its own, with the gateways that present it. */
interface MethodOption { value: string; label: string; via: string[] }

/**
 * The methods the store's gateways present, for the rule editor (DEC-083): the gateways shoppers are offered
 * (GET /settings/payment-gateways, checkout /api/v2/checkout/gateways) and the methods each presents as the
 * store's markets declare them (GET /settings, commerce public settings `markets`, seeded with the India
 * market's gateways). Checkout judges a rule against the same declarations, so every option here can match.
 */
const useStoreMethods = () => {
  const [options, setOptions] = useState<MethodOption[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    (async () => {
      const [gw, pub] = await Promise.allSettled([api.get('/settings/payment-gateways'), api.get('/settings')]);
      if (!alive) return;
      const markets: any = pub.status === 'fulfilled' ? unwrapPayload<any>(pub.value)?.markets?.list : null;
      if (!Array.isArray(markets)) { setState('error'); return; }
      const rows: any[] = gw.status === 'fulfilled' ? unwrapPayload<any>(gw.value)?.gateways ?? [] : [];
      const offered = new Map<string, string>();
      for (const g of Array.isArray(rows) ? rows : []) {
        if (g && typeof g.id === 'string' && g.id.trim()) offered.set(g.id.trim().toLowerCase(), String(g.name || g.id));
      }
      // Gateways unreadable: every gateway the markets declare (the editor still offers real methods).
      const gatewaysKnown = gw.status === 'fulfilled';
      const byMethod = new Map<string, Set<string>>();
      for (const m of markets) {
        if (!m || m.enabled === false) continue;
        for (const g of Array.isArray(m.paymentGateways) ? m.paymentGateways : []) {
          const code = String(g?.gateway ?? '').trim().toLowerCase();
          if (!code || code === 'cod' || (gatewaysKnown && !offered.has(code))) continue;
          for (const raw of Array.isArray(g?.methods) ? g.methods : []) {
            const word = String(raw ?? '').trim().toLowerCase();
            if (!word || isGroup(word)) continue;
            const via = byMethod.get(word) ?? new Set<string>();
            via.add(offered.get(code) ?? code);
            byMethod.set(word, via);
          }
        }
      }
      setOptions([...byMethod.entries()].map(([value, via]) => ({ value, label: paymentLabel(value), via: [...via] })));
      setState('ready');
    })().catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, []);
  return { options, state };
};

// Not set = what checkout applies (commerce domain/orders/discounts.rs: no prepaid discount, no
// quantity tiers), so saving this page never switches a discount on that the owner did not set.
const DEFAULT_FORM_DATA = {
  razorpayDiscountPercent: 0,
  quantityDiscounts: [] as QuantityDiscount[],
  excludeBundledProductsFromQuantityDiscount: false,
  // B2B customers: inherit the general % / use a custom % / no gateway discount.
  // Applies only while the b2b module is enabled; otherwise everyone gets the
  // general settings.
  b2bGatewayDiscountMode: 'inherit' as 'inherit' | 'custom' | 'off',
  b2bRazorpayDiscountPercent: 0,
};

type FormData = typeof DEFAULT_FORM_DATA;

// ── Checkout setting `cod.block_after_rto` (growcord-rs apps/checkout/docs/SETTINGS.md) ─────────
// Layered: Growcord's default → the organisation → this store; the deeper layer wins. The backend
// answers the value in force and the layer it came from; each PUT replaces its layer whole, so the
// layer read is sent back with this one key changed (lib/v2/areas/payments.ts, checkout rows).

type Layer = Record<string, any> | null | undefined;
interface CheckoutSettingsView {
  settings?: { cod?: Record<string, unknown>; payments?: Record<string, unknown> } | null;
  sources?: Record<string, string> | null;
  store_layer?: Layer;
  merchant_layer?: Layer;
}

const RTO_KEY = 'block_after_rto';
const RTO_PATH = `cod.${RTO_KEY}`;
const LAYER_LABEL: Record<string, string> = { platform: "Growcord's default", merchant: 'the organisation', store: 'this store' };

/** The layer's own value, or undefined when the layer does not set it (it inherits). */
const ownValue = (layer: Layer): boolean | undefined => {
  const v = layer && typeof layer === 'object' ? (layer as any).cod?.[RTO_KEY] : undefined;
  return typeof v === 'boolean' ? v : undefined;
};

/** The layer with the key set to `value` (or removed: `undefined` = inherit), every other key kept. */
const withValue = (layer: Layer, value: boolean | undefined): Record<string, any> => {
  const base: Record<string, any> = layer && typeof layer === 'object' && !Array.isArray(layer) ? { ...layer } : {};
  const cod: Record<string, any> = base.cod && typeof base.cod === 'object' ? { ...base.cod } : {};
  if (value === undefined) delete cod[RTO_KEY];
  else cod[RTO_KEY] = value;
  if (Object.keys(cod).length) base.cod = cod;
  else delete base.cod;
  return base;
};

const errorOf = (e: any, fallback: string): string => e?.response?.data?.message || e?.message || fallback;
const onOff = (v: boolean | undefined) => (v === undefined ? '' : v ? ' (On)' : ' (Off)');

/** One layer's switch: its own value when it sets one, else the value it inherits (when known). */
const RtoLayerRow: React.FC<{
  title: string;
  hint: string;
  own: boolean | undefined;
  inherited: boolean | undefined;
  parent: string;
  busy: boolean;
  disabled?: boolean;
  onChange: (value: boolean | undefined) => void;
}> = ({ title, hint, own, inherited, parent, busy, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <p className="text-xs text-muted-foreground">
        {own === undefined ? (
          <>Not set here, follows {parent}{onOff(inherited)}.</>
        ) : (
          <>
            Set here.{' '}
            <button type="button" className="text-primary underline disabled:opacity-50" disabled={busy || disabled} onClick={() => onChange(undefined)}>
              Follow {parent} instead
            </button>
          </>
        )}
      </p>
    </div>
    <div className="flex items-center gap-2 pt-0.5">
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Switch checked={own ?? inherited ?? false} disabled={busy || disabled} onCheckedChange={(c) => onChange(c)} aria-label={title} />
    </div>
  </div>
);

/** "Turn off COD after a returned COD order (until a prepaid order is delivered)". */
const CodAfterRtoCard: React.FC = () => {
  const [view, setView] = useState<CheckoutSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'store' | 'organisation' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const r = await api.get('/checkout/merchant/settings');
      setView((r.data as CheckoutSettingsView) ?? null);
    } catch (e) {
      setView(null);
      setLoadError(errorOf(e, "This store's checkout settings could not be read."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (layer: 'store' | 'organisation', value: boolean | undefined) => {
    if (!view) return;
    setSaving(layer);
    setError(null);
    try {
      if (layer === 'store') {
        const r = await api.put('/checkout/merchant/settings', withValue(view.store_layer, value));
        setView((r.data as CheckoutSettingsView) ?? view);
      } else {
        await api.put('/checkout/merchant/settings/organisation', withValue(view.merchant_layer, value));
        await load();
      }
    } catch (e) {
      setError(errorOf(e, 'The change was not saved.'));
    } finally {
      setSaving(null);
    }
  };

  const inForceRaw = view?.settings?.cod?.[RTO_KEY];
  const inForce = typeof inForceRaw === 'boolean' ? inForceRaw : undefined;
  const source = view?.sources?.[RTO_PATH];
  const orgOwn = ownValue(view?.merchant_layer);
  const storeOwn = ownValue(view?.store_layer);
  // Growcord's default is known only while it is the value in force (the answer carries no platform layer).
  const platformValue = source === 'platform' ? inForce : undefined;
  const orgEffective = orgOwn ?? platformValue;
  const hasOrganisation = !!view?.merchant_layer && typeof view.merchant_layer === 'object';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
          <RotateCcw className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <CardTitle>Turn off COD after a returned COD order</CardTitle>
          <CardDescription>
            Until a prepaid order is delivered. A buyer (the same account or the same phone) whose earlier
            cash-on-delivery order was returned to origin (RTO) can only pay online; COD comes back once a later
            prepaid order of theirs is delivered. Online payment is never affected.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : loadError || !view ? (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-foreground">Read-only: the value in force could not be read here.</p>
            <p className="text-muted-foreground">{loadError}</p>
            <p className="text-muted-foreground">
              These switches work for a store set up for Growcord Checkout. Without your change the rule follows Growcord's default.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">In force for this store:</span>
              <Badge variant="outline" className={inForce ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-muted text-muted-foreground'}>
                {inForce === undefined ? 'Unknown' : inForce ? 'On: COD turned off after a returned COD order' : 'Off'}
              </Badge>
              {source && <span className="text-muted-foreground">set by {LAYER_LABEL[source] ?? source}</span>}
            </div>
            <RtoLayerRow
              title="Organisation"
              hint={hasOrganisation ? 'Every store of the organisation, unless a store sets its own. Needs the settings permission of the organisation.' : 'This store has no Growcord Checkout organisation.'}
              own={orgOwn}
              inherited={platformValue}
              parent={LAYER_LABEL.platform}
              busy={saving === 'organisation'}
              disabled={!hasOrganisation || saving !== null}
              onChange={(v) => save('organisation', v)}
            />
            <RtoLayerRow
              title="This store"
              hint="Overrides the organisation for this store only."
              own={storeOwn}
              inherited={orgEffective}
              parent={orgOwn === undefined ? LAYER_LABEL.platform : LAYER_LABEL.merchant}
              busy={saving === 'store'}
              disabled={saving !== null}
              onChange={(v) => save('store', v)}
            />
          </>
        )}
        {error && (
          <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Checkout settings `payments.part_prepayment` (basis `cod_fee`) and `payments.cod_fee_advance` ──────────────
// growcord-rs lane PAY-ADV-1: a cash-on-delivery buyer pays the COD convenience fee (the store's COD fee, set on
// Shipping settings) online at checkout, and the courier collects the rest. Written to THIS store's layer of the
// checkout settings (the same read and write as the card above); every word the shopper reads is here.

interface AdvanceForm {
  on: boolean;
  skipCode: boolean;
  storeCancel: boolean;
  customerCancel: boolean;
  refusedOrRto: boolean;
  returned: boolean;
  refundTo: 'gateway' | 'store_credit';
  feeLabel: string;
  payNowLabel: string;
  onDeliveryLabel: string;
  note: string;
  policy: string;
}

type RefundKey = 'storeCancel' | 'customerCancel' | 'refusedOrRto' | 'returned';

const advanceFormOf = (payments: any): AdvanceForm => {
  const a = payments?.cod_fee_advance ?? {};
  const r = a.refund ?? {};
  const w = a.wording ?? {};
  return {
    on: payments?.part_prepayment === true && (payments?.part_prepayment_basis ?? 'cod_fee') === 'cod_fee',
    skipCode: a.skip_cod_code !== false,
    storeCancel: r.store_cancel !== false,
    customerCancel: r.customer_cancel_before_dispatch !== false,
    refusedOrRto: r.refused_or_rto === true,
    returned: r.returned_after_delivery === true,
    refundTo: r.to === 'store_credit' ? 'store_credit' : 'gateway',
    feeLabel: String(w.fee_label ?? ''),
    payNowLabel: String(w.pay_now_label ?? ''),
    onDeliveryLabel: String(w.on_delivery_label ?? ''),
    note: String(w.note ?? ''),
    policy: String(w.policy ?? ''),
  };
};

/** The store layer with the advance keys set from the form, every other key kept. */
const withAdvance = (layer: Layer, f: AdvanceForm): Record<string, any> => {
  const base: Record<string, any> = layer && typeof layer === 'object' && !Array.isArray(layer) ? { ...layer } : {};
  const payments: Record<string, any> = base.payments && typeof base.payments === 'object' ? { ...base.payments } : {};
  payments.part_prepayment = f.on;
  if (f.on) payments.part_prepayment_basis = 'cod_fee';
  payments.cod_fee_advance = {
    ...(payments.cod_fee_advance && typeof payments.cod_fee_advance === 'object' ? payments.cod_fee_advance : {}),
    skip_cod_code: f.skipCode,
    refund: {
      store_cancel: f.storeCancel,
      customer_cancel_before_dispatch: f.customerCancel,
      refused_or_rto: f.refusedOrRto,
      returned_after_delivery: f.returned,
      to: f.refundTo,
    },
    wording: {
      fee_label: f.feeLabel.trim(),
      pay_now_label: f.payNowLabel.trim(),
      on_delivery_label: f.onDeliveryLabel.trim(),
      note: f.note.trim(),
      policy: f.policy.trim(),
    },
  };
  base.payments = payments;
  return base;
};

const SwitchRow: React.FC<{ title: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({ title, hint, checked, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    <Switch checked={checked} disabled={disabled} onCheckedChange={(c) => onChange(c)} aria-label={title} />
  </div>
);

/** "COD convenience fee paid online": on/off, the code, the refund policy and the words. */
const CodAdvanceCard: React.FC = () => {
  const [view, setView] = useState<CheckoutSettingsView | null>(null);
  const [form, setForm] = useState<AdvanceForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const r = await api.get('/checkout/merchant/settings');
      const v = (r.data as CheckoutSettingsView) ?? null;
      setView(v);
      setForm(advanceFormOf((v?.settings as any)?.payments));
    } catch (e) {
      setView(null);
      setLoadError(errorOf(e, "This store's checkout settings could not be read."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const set = <K extends keyof AdvanceForm>(k: K, v: AdvanceForm[K]) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  const save = async () => {
    if (!view || !form) return;
    const blank = (['feeLabel', 'payNowLabel', 'onDeliveryLabel', 'note', 'policy'] as const).find((k) => !form[k].trim());
    if (blank) {
      setError('Every line the shopper reads needs some words. Fill in the empty box, or reload to get the defaults back.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.put('/checkout/merchant/settings', withAdvance(view.store_layer, form));
      const v = (r.data as CheckoutSettingsView) ?? view;
      setView(v);
      setForm(advanceFormOf((v?.settings as any)?.payments));
      setSaved(true);
    } catch (e) {
      setError(errorOf(e, 'The change was not saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <CardTitle>COD convenience fee paid online</CardTitle>
          <CardDescription>
            A cash-on-delivery buyer pays the COD convenience fee (set on Shipping settings) online at checkout,
            and the courier collects the rest. It cuts orders that are placed and then refused at the door. Until
            the fee is paid, no order is placed.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : loadError || !view || !form ? (
          <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-foreground">Read-only: the value in force could not be read here.</p>
            <p className="text-muted-foreground">{loadError}</p>
          </div>
        ) : (
          <>
            <SwitchRow
              title="Take the COD convenience fee online at checkout"
              hint="Off: cash on delivery works as before (the buyer confirms with a code and pays everything at the door)."
              checked={form.on}
              disabled={saving}
              onChange={(v) => set('on', v)}
            />
            <SwitchRow
              title="Skip the COD code when the fee is paid"
              hint="Payment proves the buyer means it: the order is confirmed with no SMS code. Off: the code is still asked for after the payment."
              checked={form.skipCode}
              disabled={saving}
              onChange={(v) => set('skipCode', v)}
            />
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">When the paid fee is refunded</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {([
                  ['storeCancel', 'We cancel the order (any time before delivery)'],
                  ['customerCancel', 'The buyer cancels before the parcel is sent'],
                  ['refusedOrRto', 'The parcel is refused at the door or comes back (RTO)'],
                  ['returned', 'A delivered order is returned'],
                ] as Array<[RefundKey, string]>).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form[k]} disabled={saving} onCheckedChange={(c) => set(k, c === true)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
                <span className="text-muted-foreground">Refund it to</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={form.refundTo}
                  disabled={saving}
                  onChange={(e) => set('refundTo', e.target.value === 'store_credit' ? 'store_credit' : 'gateway')}
                >
                  <option value="gateway">The original online payment</option>
                  <option value="store_credit">The buyer's store credit</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Applied when an order is cancelled from the order page and no refund method is picked there. A
                refused or returned parcel keeps the fee by default; when ticked, refund it from the Refunds screen.
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium text-foreground">What the buyer reads at checkout</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name of the fee</Label>
                  <Input value={form.feeLabel} maxLength={60} disabled={saving} onChange={(e) => set('feeLabel', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Line paid now</Label>
                  <Input value={form.payNowLabel} maxLength={80} disabled={saving} onChange={(e) => set('payNowLabel', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Line paid on delivery</Label>
                  <Input value={form.onDeliveryLabel} maxLength={80} disabled={saving} onChange={(e) => set('onDeliveryLabel', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Note behind the info icon beside the fee</Label>
                <Textarea rows={3} value={form.note} maxLength={400} disabled={saving} onChange={(e) => set('note', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Refund policy (one short line under the note)</Label>
                <Textarea rows={2} value={form.policy} maxLength={240} disabled={saving} onChange={(e) => set('policy', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-emerald-700">Saved for this store.</span>}
              <Button type="button" onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        )}
        {error && (
          <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PaymentDiscountSettings: React.FC = () => {
  const navigate = useNavigate();

  // ── Payment method rules (restrict a method under given conditions) ────────
  const [rules, setRules] = useState<PaymentRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [discountNote, setDiscountNote] = useState<{ ok: boolean; text: string } | null>(null);
  /** The saved discounts, as checkout applies them (a tier below 1 piece or at 0% is skipped there). */
  const [savedDiscount, setSavedDiscount] = useState<{ percent: number; tiers: number }>({ percent: 0, tiers: 0 });
  const inForce = (percent: unknown, tiers: unknown) => ({
    percent: Math.min(100, Math.max(0, Number(percent) || 0)),
    tiers: (Array.isArray(tiers) ? tiers : []).filter((t: any) => Number(t?.minQuantity) >= 1 && Number(t?.discountPercent) > 0 && Number(t?.discountPercent) <= 100).length,
  });

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const list = await paymentRulesAPI.getAll();
      setRules(Array.isArray(list) ? list : []);
    } catch (e) { setRuleError(errorOf(e, 'The payment rules could not be read.')); }
    finally { setRulesLoading(false); }
  };

  const storeMethods = useStoreMethods();
  const offeredMethod = (method: string) => isGroup(method) || storeMethods.options.some((o) => o.value === method);

  const openCreateRule = () => { setRuleForm(emptyRuleForm); setShowRuleForm(true); };
  const openEditRule = (r: PaymentRule) => {
    const legacy = needsReview(r);
    setRuleForm({
      id: r.id, name: r.name, method: r.method,
      minOrderValue: r.conditions?.minOrderValue != null ? String(r.conditions.minOrderValue) : '',
      maxOrderValue: r.conditions?.maxOrderValue != null ? String(r.conditions.maxOrderValue) : '',
      excludePincodes: (r.conditions?.excludePincodes || []).join(', '),
      customerSegment: r.conditions?.customerSegment || 'all',
      // A rule that needs review has never applied: it starts unticked, so only a person's tick switches it on.
      is_active: legacy ? false : r.is_active,
      legacy,
      base: r.conditions && typeof r.conditions === 'object' ? { ...r.conditions } : {},
    });
    setShowRuleForm(true);
  };

  const saveRule = async () => {
    if (!ruleForm.name.trim()) { setRuleError('Rule name is required.'); return; }
    if (!ruleForm.method.trim()) { setRuleError('Pick the payment method this rule switches off.'); return; }
    const min = ruleForm.minOrderValue ? Number(ruleForm.minOrderValue) : null;
    const max = ruleForm.maxOrderValue ? Number(ruleForm.maxOrderValue) : null;
    if ((min !== null && !(min >= 0)) || (max !== null && !(max >= 0))) { setRuleError('Order values are amounts of at least 0.'); return; }
    if (min !== null && max !== null && max < min) { setRuleError('The upper order value is below the lower one, so the rule would never apply.'); return; }
    setSavingRule(true);
    setRuleError(null);
    try {
      // The rule's other conditions (orderValueAbove, system) are kept as they are; checkedAt is the server's.
      const conditions: PaymentRule['conditions'] = {};
      for (const [k, v] of Object.entries(ruleForm.base)) if (!FORM_CONDITION_KEYS.includes(k)) conditions[k] = v;
      if (ruleForm.minOrderValue) conditions.minOrderValue = parseFloat(ruleForm.minOrderValue);
      if (ruleForm.maxOrderValue) conditions.maxOrderValue = parseFloat(ruleForm.maxOrderValue);
      const pins = ruleForm.excludePincodes.split(',').map(p => p.trim()).filter(Boolean);
      if (pins.length) conditions.excludePincodes = pins;
      if (ruleForm.customerSegment && ruleForm.customerSegment !== 'all') conditions.customerSegment = ruleForm.customerSegment;
      const payload = { name: ruleForm.name.trim(), method: ruleForm.method, conditions, is_active: ruleForm.is_active };
      if (ruleForm.id) {
        const updated = await paymentRulesAPI.update(ruleForm.id, payload);
        setRules(prev => prev.map(r => r.id === ruleForm.id ? { ...r, ...updated } : r));
      } else {
        const created = await paymentRulesAPI.create({ ...payload, sort_order: rules.length });
        setRules(prev => [...prev, created]);
      }
      setShowRuleForm(false);
      setRuleForm(emptyRuleForm);
    } catch (err: any) {
      setRuleError(errorOf(err, 'The rule was not saved.'));
    } finally {
      setSavingRule(false);
    }
  };

  // A rule is never deleted on v2: it is switched off and its history stays (checkout resources.rs).
  // Switching on a rule that needs review is the person's check (DEC-083): from then on it applies at checkout.
  const setRuleActive = async (r: PaymentRule, active: boolean) => {
    if (!active && !confirm(`Switch off "${r.name}"? The method is offered again where this rule blocked it.`)) return;
    if (active && needsReview(r) && !confirm(`Check "${r.name}" and switch it on? It has never applied. From now on, ${methodShort(r.method)} is not offered at checkout for the orders it matches.`)) return;
    setRuleError(null);
    try {
      const updated = await paymentRulesAPI.update(r.id, { is_active: active });
      setRules(prev => prev.map(x => (x.id === r.id ? { ...x, ...(updated && typeof updated === 'object' ? updated : {}), is_active: active } : x)));
    } catch (e) { setRuleError(errorOf(e, 'The rule was not changed.')); }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const { formData, setFormData, loading, saving, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse: (settings) => ({
      razorpayDiscountPercent: Number(settings.razorpayDiscountPercent) || 0,
      quantityDiscounts: Array.isArray(settings.quantityDiscounts)
        ? settings.quantityDiscounts.map((t: any) => ({ minQuantity: Number(t?.minQuantity) || 1, discountPercent: Number(t?.discountPercent) || 0 }))
        : [],
      excludeBundledProductsFromQuantityDiscount: settings.excludeBundledProductsFromQuantityDiscount === true,
      b2bGatewayDiscountMode: settings.b2bGatewayDiscountMode || 'inherit',
      b2bRazorpayDiscountPercent: Number(settings.b2bRazorpayDiscountPercent) || 0,
    }),
    onLoadError: (e) => setDiscountNote({ ok: false, text: errorOf(e, 'The discount settings could not be read. What is shown below is not what checkout applies.') }),
    onLoaded: (settings) => setSavedDiscount(inForce(settings?.razorpayDiscountPercent, settings?.quantityDiscounts)),
    onSuccess: (f) => {
      setSavedDiscount(inForce(f.razorpayDiscountPercent, f.quantityDiscounts));
      setDiscountNote({ ok: true, text: 'Saved. Checkout applies these from the next quote.' });
    },
    onError: (e) => setDiscountNote({ ok: false, text: errorOf(e, 'The discounts were not saved.') }),
  });

  const setTier = (index: number, patch: Partial<QuantityDiscount>) =>
    setFormData((prev) => ({ ...prev, quantityDiscounts: prev.quantityDiscounts.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));
  // Checkout skips a tier below 1 piece or at 0% (domain/orders/discounts.rs parse_tiers).
  const ignoredTiers = formData.quantityDiscounts.filter((t) => !(t.minQuantity >= 1 && t.discountPercent > 0 && t.discountPercent <= 100)).length;

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="text-muted-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Payment Methods &amp; Discounts</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Prepaid discount, quantity discounts, and <strong>Payment Method Rules</strong>: switch off cash on delivery, every
          online payment, or one method such as UPI, card or bank transfer, by order value, PIN code or customer type (for
          example no COD from ₹2,000). COD on or off and the COD convenience fee live under Settings, Shipping; taking that fee
          online at checkout is set below.
        </p>
      </div>

      {/* In force now: what checkout applies, read from the saved settings. */}
      <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
        <Badge variant="outline" className="bg-background">
          Prepaid discount: {savedDiscount.percent > 0 ? `${savedDiscount.percent}%` : 'none'}
        </Badge>
        <Badge variant="outline" className="bg-background">
          Quantity tiers: {savedDiscount.tiers > 0 ? savedDiscount.tiers : 'none'}
        </Badge>
        <Badge variant="outline" className="bg-background">
          Active rules: {rulesLoading ? '...' : rules.filter((r) => r.is_active && !needsReview(r)).length}
        </Badge>
        {!rulesLoading && rules.some(needsReview) && (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
            Rules to review: {rules.filter(needsReview).length}
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle>Prepaid discount</CardTitle>
              <CardDescription>A percentage off every order paid online: any gateway, UPI or bank transfer. Never on cash on delivery.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Discount percentage <span className="text-muted-foreground font-normal">(0 = none)</span>
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.razorpayDiscountPercent}
                  onChange={(e) => handleChange('razorpayDiscountPercent', e.target.value)}
                  placeholder="0"
                  className="w-32"
                />
                <span className="text-foreground font-medium">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Taken off the items subtotal after any quantity discount, rounded to the rupee.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                <strong>Applied by the server:</strong> checkout shows this discount and charges exactly
                that amount. Cash on delivery orders never get it.
              </p>
            </div>

            {/* B2B customers */}
            <div className="pt-5 border-t space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">B2B customers</p>
                <p className="text-xs text-muted-foreground">
                  What gateway discount approved B2B accounts get. Applies only while the B2B
                  module is enabled; otherwise every customer gets the general settings above.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">B2B gateway discount</Label>
                  <select
                    value={formData.b2bGatewayDiscountMode}
                    onChange={(e) => setFormData(prev => ({ ...prev, b2bGatewayDiscountMode: e.target.value as any }))}
                    className="h-9 w-56 px-3 border border-input rounded-md bg-background text-sm"
                  >
                    <option value="inherit">Same as general ({formData.razorpayDiscountPercent}%)</option>
                    <option value="custom">Custom percentage for B2B</option>
                    <option value="off">No gateway discount for B2B</option>
                  </select>
                </div>
                {formData.b2bGatewayDiscountMode === 'custom' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">B2B discount %</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min="0" max="100" step="0.1" className="w-28 h-9"
                        value={formData.b2bRazorpayDiscountPercent}
                        onChange={(e) => setFormData(prev => ({ ...prev, b2bRazorpayDiscountPercent: parseFloat(e.target.value) || 0 }))}
                      />
                      <span className="text-foreground font-medium">%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quantity Discounts Section */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Percent className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Quantity discounts</CardTitle>
                <CardDescription>A percentage off when the cart holds at least this many pieces.</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormData((prev) => ({ ...prev, quantityDiscounts: [...prev.quantityDiscounts, { minQuantity: 1, discountPercent: 0 }] }))}
              className="text-green-600 border-green-200 hover:bg-green-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.quantityDiscounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No quantity discounts: every cart pays the item prices. Add a tier to start one.</p>
            ) : (
              <div className="space-y-4">
                {formData.quantityDiscounts.map((discount, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                    <div className="flex-1 grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          From pieces
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={discount.minQuantity}
                          onChange={(e) => setTier(index, { minQuantity: parseInt(e.target.value, 10) || 1 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Discount
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discount.discountPercent}
                            onChange={(e) => setTier(index, { discountPercent: parseFloat(e.target.value) || 0 })}
                          />
                          <span className="text-foreground font-medium">%</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFormData((prev) => ({ ...prev, quantityDiscounts: prev.quantityDiscounts.filter((_, i) => i !== index) }))}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label="Remove this tier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {ignoredTiers > 0 && (
              <p className="text-xs text-amber-700">
                {ignoredTiers === 1 ? 'One tier is' : `${ignoredTiers} tiers are`} skipped at checkout: a tier needs at least 1 piece and a discount above 0%.
              </p>
            )}

            <div className="pt-4 border-t space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.excludeBundledProductsFromQuantityDiscount}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, excludeBundledProductsFromQuantityDiscount: checked as boolean }))}
                />
                <span className="text-sm font-medium">Exclude bundled products from quantity discounts</span>
              </label>
              <p className="text-[10px] text-muted-foreground pl-6">
                When enabled, products purchased with quantity-based bundles will not count toward quantity discount thresholds. 
                This prevents double discounting since bundled products are already discounted.
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> the tier is chosen by the total pieces in the cart, and the highest tier the cart
                reaches applies. Give larger tiers larger discounts.
                {formData.excludeBundledProductsFromQuantityDiscount && (
                  <span className="block mt-1">
                    <strong>Bundled products excluded:</strong> Only non-bundled items will count toward quantity discount thresholds.
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
          {discountNote && (
            <span className={`mr-auto text-sm ${discountNote.ok ? 'text-emerald-700' : 'text-destructive'}`} role={discountNote.ok ? 'status' : 'alert'}>
              {discountNote.text}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/settings')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save discounts'}
          </Button>
        </div>
      </form>

      <CodAdvanceCard />

      <CodAfterRtoCard />

      {/* Payment Method Rules */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div className="min-w-0">
              <CardTitle>Payment Method Rules</CardTitle>
              <CardDescription>
                Switch off a payment method under conditions: <em>cash on delivery, from order value 2000</em> hides COD for every
                order of ₹2,000 or more; <em>UPI, only at PIN code 110001</em> hides UPI there while cards stay open. Order value is
                the items subtotal before discounts. A switched-off method is hidden at checkout and refused at placement and at
                payment; the first matching rule for a method decides.
              </CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openCreateRule}><Plus className="mr-1.5 h-4 w-4" /> Add rule</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ruleError && (
            <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{ruleError}</span>
              <button onClick={() => setRuleError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          )}

          {showRuleForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rule Name</Label>
                  <Input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="No COD above ₹5,000" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method to switch off</Label>
                  <select
                    value={ruleForm.method} onChange={e => setRuleForm(f => ({ ...f, method: e.target.value }))}
                    className="w-full h-9 px-3 border border-input rounded-md bg-background text-sm"
                  >
                    {GROUP_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    {storeMethods.options.length > 0 && (
                      <optgroup label="One method">
                        {storeMethods.options.map(o => (
                          <option key={o.value} value={o.value}>{o.label}{o.via.length ? ` (through ${o.via.join(', ')})` : ''}</option>
                        ))}
                      </optgroup>
                    )}
                    {ruleForm.method && !offeredMethod(ruleForm.method) && (
                      <option value={ruleForm.method}>{methodShort(ruleForm.method)} (no gateway of yours offers it now)</option>
                    )}
                  </select>
                  {storeMethods.state === 'loading' && <p className="text-[10px] text-muted-foreground">Reading the methods your gateways offer...</p>}
                  {storeMethods.state === 'error' && (
                    <p className="text-[10px] text-amber-700">Your gateways' methods could not be read: only cash on delivery and every online payment can be picked now.</p>
                  )}
                  {storeMethods.state === 'ready' && storeMethods.options.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">No online gateway is set up, so only cash on delivery and every online payment can be picked.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Applies to</Label>
                  <select
                    value={ruleForm.customerSegment} onChange={e => setRuleForm(f => ({ ...f, customerSegment: e.target.value }))}
                    className="w-full h-9 px-3 border border-input rounded-md bg-background text-sm"
                  >
                    <option value="all">All customers</option>
                    <option value="retail">Retail (non-B2B) only</option>
                    <option value="b2b">B2B accounts only</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">B2B-only rules are ignored while the B2B module is disabled.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Block from order value ₹ (optional, this value and above)</Label>
                  <Input type="number" min="0" value={ruleForm.minOrderValue} onChange={e => setRuleForm(f => ({ ...f, minOrderValue: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Block up to order value ₹ (optional, this value and below)</Label>
                  <Input type="number" min="0" value={ruleForm.maxOrderValue} onChange={e => setRuleForm(f => ({ ...f, maxOrderValue: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Only at these PIN codes (comma-separated, optional)</Label>
                  <Input value={ruleForm.excludePincodes} onChange={e => setRuleForm(f => ({ ...f, excludePincodes: e.target.value }))} placeholder="110001, 400001" className="h-9" inputMode="numeric" />
                  <p className="text-[10px] text-muted-foreground">Left empty, the rule applies at every PIN code. Filled in, it applies only when the delivery PIN code is one of these.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={ruleForm.is_active} onCheckedChange={c => setRuleForm(f => ({ ...f, is_active: c as boolean }))} />
                <span className="text-sm">Active</span>
              </div>
              {ruleForm.legacy && (
                <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  This rule was saved before rules could switch off one method, and it has never applied at checkout. Check the
                  method and conditions, then tick Active and save to start applying it. Saved without Active, it stays off.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={saveRule} disabled={savingRule}>
                  {savingRule && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {ruleForm.id ? 'Save' : 'Create'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowRuleForm(false); setRuleForm(emptyRuleForm); }}>Cancel</Button>
              </div>
            </div>
          )}

          {rulesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No payment rules: every method the store offers is open to every order.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Name</TableHead><TableHead>Method</TableHead><TableHead>Conditions</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{methodShort(r.method)}</Badge>
                      {!storeMethods.options.length || offeredMethod(r.method) ? null : (
                        <span className="mt-1 block text-[10px] text-muted-foreground">No gateway of yours offers it now</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.conditions?.customerSegment && r.conditions.customerSegment !== 'all' && (
                        <Badge variant="outline" className={`mr-1.5 text-[10px] ${r.conditions.customerSegment === 'b2b' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                          {r.conditions.customerSegment.toUpperCase()}
                        </Badge>
                      )}
                      {r.conditions?.minOrderValue != null && <span>From {fmtRupees(r.conditions.minOrderValue)} </span>}
                      {r.conditions?.maxOrderValue != null && <span>Up to {fmtRupees(r.conditions.maxOrderValue)} </span>}
                      {r.conditions?.orderValueAbove != null && <span>Above {fmtRupees(r.conditions.orderValueAbove)} </span>}
                      {r.conditions?.system && (
                        <Badge variant="outline" className="ml-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Set under Settings, Cash on delivery</Badge>
                      )}
                      {r.conditions?.excludePincodes?.length ? <span>At {r.conditions.excludePincodes.length} PIN code{r.conditions.excludePincodes.length === 1 ? '' : 's'}</span> : null}
                      {!r.conditions?.minOrderValue && !r.conditions?.maxOrderValue && r.conditions?.orderValueAbove == null && !r.conditions?.excludePincodes?.length && (!r.conditions?.customerSegment || r.conditions.customerSegment === 'all') && 'Any order'}
                    </TableCell>
                    <TableCell>
                      {needsReview(r) ? (
                        <>
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Needs review</Badge>
                          <span className="mt-1 block text-[10px] text-amber-700">Saved before rules worked per method; it has never applied.</span>
                        </>
                      ) : (
                        <Badge variant={r.is_active ? 'default' : 'secondary'} className={r.is_active ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                          {r.is_active ? 'Active' : 'Off'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.conditions?.system ? (
                        <Link to="/settings?key=cod" className="text-xs text-primary underline">Edit in Settings</Link>
                      ) : (
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEditRule(r)} aria-label={`Edit ${r.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      {!r.conditions?.system && (
                        needsReview(r) ? (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setRuleActive(r, true)} title="Start applying this rule at checkout">Check and switch on</Button>
                        ) : r.is_active ? (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setRuleActive(r, false)} title="Switch off (the rule and its history are kept)">Switch off</Button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setRuleActive(r, true)} title="Switch on">Switch on</Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800">
              <strong>Enforced at checkout:</strong> an active rule hides its method at checkout and refuses it at
              placement and at payment, matching on order value, PIN code and customer type. A gateway whose every
              method is switched off is hidden; inside the Razorpay window a switched-off method is hidden. Wholesale-only
              rules apply only while the B2B module is on. A rule is never deleted: switched off, it keeps its history.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentDiscountSettings;
