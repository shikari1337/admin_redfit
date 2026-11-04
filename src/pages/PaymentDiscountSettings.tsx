import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Plus, Trash2, Percent, Loader2, Ban, Pencil, RotateCcw } from 'lucide-react';
import { api, paymentRulesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useSettingsSection } from '../hooks/useSettingsSection';

interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

interface PaymentRule {
  id: string;
  name: string;
  method: string;
  conditions: { minOrderValue?: number; maxOrderValue?: number; orderValueAbove?: number; excludePincodes?: string[]; customerSegment?: string; system?: string };
  is_active: boolean;
  sort_order: number;
}

const PAYMENT_METHODS = ['cod', 'prepaid', 'upi', 'card', 'netbanking', 'wallet'];
const emptyRuleForm = { id: '', name: '', method: 'cod', minOrderValue: '', maxOrderValue: '', excludePincodes: '', customerSegment: 'all', is_active: true };

const DEFAULT_FORM_DATA = {
  razorpayDiscountPercent: 2,
  quantityDiscounts: [
    { minQuantity: 5, discountPercent: 5 },
    { minQuantity: 10, discountPercent: 10 },
    { minQuantity: 20, discountPercent: 15 },
  ] as QuantityDiscount[],
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
  settings?: { cod?: Record<string, unknown> } | null;
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
          <>Not set here — follows {parent}{onOff(inherited)}.</>
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
            Until a prepaid order is delivered. A buyer — the same account or the same phone — whose earlier
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
                {inForce === undefined ? 'Unknown' : inForce ? 'On — COD turned off after a returned COD order' : 'Off'}
              </Badge>
              {source && <span className="text-muted-foreground">set by {LAYER_LABEL[source] ?? source}</span>}
            </div>
            <RtoLayerRow
              title="Organisation"
              hint={hasOrganisation ? 'Every store of the organisation, unless a store sets its own. Needs the organisation’s settings permission.' : 'This store has no Growcord Checkout organisation.'}
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
            <button type="button" onClick={() => setError(null)} className="opacity-60 hover:opacity-100">✕</button>
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

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const list = await paymentRulesAPI.getAll();
      setRules(Array.isArray(list) ? list : []);
    } catch { setRuleError('Failed to load payment rules'); }
    finally { setRulesLoading(false); }
  };

  const openCreateRule = () => { setRuleForm(emptyRuleForm); setShowRuleForm(true); };
  const openEditRule = (r: PaymentRule) => {
    setRuleForm({
      id: r.id, name: r.name, method: r.method,
      minOrderValue: r.conditions?.minOrderValue != null ? String(r.conditions.minOrderValue) : '',
      maxOrderValue: r.conditions?.maxOrderValue != null ? String(r.conditions.maxOrderValue) : '',
      excludePincodes: (r.conditions?.excludePincodes || []).join(', '),
      customerSegment: r.conditions?.customerSegment || 'all',
      is_active: r.is_active,
    });
    setShowRuleForm(true);
  };

  const saveRule = async () => {
    if (!ruleForm.name.trim()) { setRuleError('Rule name is required.'); return; }
    setSavingRule(true);
    setRuleError(null);
    try {
      const conditions: PaymentRule['conditions'] = {};
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
      setRuleError(err?.response?.data?.message || 'Failed to save rule');
    } finally {
      setSavingRule(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this payment rule?')) return;
    try {
      await paymentRulesAPI.delete(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch { setRuleError('Failed to delete rule'); }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const { formData, setFormData, loading, saving, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse: (settings) => ({
      razorpayDiscountPercent: settings.razorpayDiscountPercent ?? 2,
      quantityDiscounts: settings.quantityDiscounts || DEFAULT_FORM_DATA.quantityDiscounts,
      excludeBundledProductsFromQuantityDiscount: settings.excludeBundledProductsFromQuantityDiscount || false,
      b2bGatewayDiscountMode: settings.b2bGatewayDiscountMode || 'inherit',
      b2bRazorpayDiscountPercent: settings.b2bRazorpayDiscountPercent || 0,
    }),
    successMessage: 'Payment gateway discount settings saved successfully!',
  });

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
          Prepaid (gateway) discount, quantity discounts, and <strong>Payment Method Rules</strong> — restrict COD or online
          payment by order value, pincode or customer type (e.g. no COD above ₹2,000). COD on/off and its fee live under
          Settings → Shipping.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle>Razorpay Discount</CardTitle>
              <CardDescription>Percentage discount applied to prepaid orders</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Discount Percentage <span className="text-destructive">*</span>
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
                  placeholder="2"
                  className="w-32"
                />
                <span className="text-foreground font-medium">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This discount will be applied to prepaid orders (Razorpay payments). 
                The discount is calculated on the subtotal after quantity discounts.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                <strong>Server-enforced:</strong> checkout shows this discount AND the backend
                applies the same percentage when charging the order — shown always equals charged.
                COD orders never get the gateway discount.
              </p>
            </div>

            {/* B2B customers */}
            <div className="pt-5 border-t space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">B2B customers</p>
                <p className="text-xs text-muted-foreground">
                  What gateway discount approved B2B accounts get. Applies only while the B2B
                  module is enabled — otherwise every customer gets the general settings above.
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
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-t pt-6 mt-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Percent className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Quantity Discounts</CardTitle>
                <CardDescription>Configure automatic discounts based on total quantity</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  ...formData,
                  quantityDiscounts: [
                    ...formData.quantityDiscounts,
                    { minQuantity: 1, discountPercent: 0 },
                  ],
                });
              }}
              className="text-green-600 border-green-200 hover:bg-green-50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.quantityDiscounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No quantity discounts configured. Click "Add Tier" to add one.</p>
            ) : (
              <div className="space-y-4">
                {formData.quantityDiscounts.map((discount, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Minimum Quantity
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={discount.minQuantity}
                          onChange={(e) => {
                            const newDiscounts = [...formData.quantityDiscounts];
                            newDiscounts[index].minQuantity = parseInt(e.target.value) || 1;
                            setFormData({ ...formData, quantityDiscounts: newDiscounts });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Discount Percentage
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discount.discountPercent}
                            onChange={(e) => {
                              const newDiscounts = [...formData.quantityDiscounts];
                              newDiscounts[index].discountPercent = parseFloat(e.target.value) || 0;
                              setFormData({ ...formData, quantityDiscounts: newDiscounts });
                            }}
                          />
                          <span className="text-foreground font-medium">%</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newDiscounts = formData.quantityDiscounts.filter((_, i) => i !== index);
                        setFormData({ ...formData, quantityDiscounts: newDiscounts });
                      }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
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
                <strong>Note:</strong> Discounts are applied based on total quantity in cart. 
                Higher quantity thresholds should have higher discount percentages. 
                The system will apply the highest applicable discount.
                {formData.excludeBundledProductsFromQuantityDiscount && (
                  <span className="block mt-1">
                    <strong>Bundled products excluded:</strong> Only non-bundled items will count toward quantity discount thresholds.
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
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
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <CodAfterRtoCard />

      {/* Payment Method Rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <CardTitle>Payment Method Rules</CardTitle>
              <CardDescription>
                Restrict a payment method under specific conditions — e.g. <em>method COD, min order value 2000</em> blocks COD for
                every order of ₹2,000 or more. "Order value" is the items subtotal before discounts. A blocked method is hidden
                at checkout and refused at placement.
              </CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openCreateRule}><Plus className="mr-1.5 h-4 w-4" /> Add Rule</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ruleError && (
            <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{ruleError}</span>
              <button onClick={() => setRuleError(null)} className="opacity-60 hover:opacity-100">✕</button>
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
                  <Label className="text-xs">Method to restrict</Label>
                  <select
                    value={ruleForm.method} onChange={e => setRuleForm(f => ({ ...f, method: e.target.value }))}
                    className="w-full h-9 px-3 border border-input rounded-md bg-background text-sm"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
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
                  <Label className="text-xs">Block from order value ₹ (optional — this value and above)</Label>
                  <Input type="number" min="0" value={ruleForm.minOrderValue} onChange={e => setRuleForm(f => ({ ...f, minOrderValue: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Block up to order value ₹ (optional — this value and below)</Label>
                  <Input type="number" min="0" value={ruleForm.maxOrderValue} onChange={e => setRuleForm(f => ({ ...f, maxOrderValue: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Exclude pincodes (comma-separated, optional)</Label>
                  <Input value={ruleForm.excludePincodes} onChange={e => setRuleForm(f => ({ ...f, excludePincodes: e.target.value }))} placeholder="110001, 400001" className="h-9" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={ruleForm.is_active} onCheckedChange={c => setRuleForm(f => ({ ...f, is_active: c as boolean }))} />
                <span className="text-sm">Active</span>
              </div>
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
            <p className="text-sm text-muted-foreground text-center py-6">No payment rules configured — all methods are available unconditionally.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Name</TableHead><TableHead>Method</TableHead><TableHead>Conditions</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Badge variant="outline">{r.method.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.conditions?.customerSegment && r.conditions.customerSegment !== 'all' && (
                        <Badge variant="outline" className={`mr-1.5 text-[10px] ${r.conditions.customerSegment === 'b2b' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                          {r.conditions.customerSegment.toUpperCase()}
                        </Badge>
                      )}
                      {r.conditions?.minOrderValue != null && <span>Min ₹{r.conditions.minOrderValue} </span>}
                      {r.conditions?.maxOrderValue != null && <span>Max ₹{r.conditions.maxOrderValue} </span>}
                      {r.conditions?.orderValueAbove != null && <span>Above ₹{r.conditions.orderValueAbove} </span>}
                      {r.conditions?.system && (
                        <Badge variant="outline" className="ml-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">managed by Settings ▸ Cash on delivery</Badge>
                      )}
                      {r.conditions?.excludePincodes?.length ? <span>Excl. {r.conditions.excludePincodes.length} pincode(s)</span> : null}
                      {!r.conditions?.minOrderValue && !r.conditions?.maxOrderValue && r.conditions?.orderValueAbove == null && !r.conditions?.excludePincodes?.length && (!r.conditions?.customerSegment || r.conditions.customerSegment === 'all') && '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? 'default' : 'secondary'} className={r.is_active ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.conditions?.system ? (
                        <Link to="/settings?key=cod" className="text-xs text-primary underline">Edit in Settings</Link>
                      ) : (
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEditRule(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      {!r.conditions?.system && (
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRule(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800">
              <strong>Enforced at checkout:</strong> active rules block the restricted method at
              order placement (COD/prepaid), matching on order value, pincode and customer
              segment. B2B-only rules apply only while the B2B module is enabled.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentDiscountSettings;
