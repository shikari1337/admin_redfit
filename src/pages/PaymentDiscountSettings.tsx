import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Plus, Trash2, Percent, Loader2, Ban, Pencil } from 'lucide-react';
import api, { paymentRulesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface QuantityDiscount {
  minQuantity: number;
  discountPercent: number;
}

interface PaymentRule {
  id: string;
  name: string;
  method: string;
  conditions: { minOrderValue?: number; maxOrderValue?: number; excludePincodes?: string[] };
  is_active: boolean;
  sort_order: number;
}

const PAYMENT_METHODS = ['cod', 'prepaid', 'upi', 'card', 'netbanking', 'wallet'];
const emptyRuleForm = { id: '', name: '', method: 'cod', minOrderValue: '', maxOrderValue: '', excludePincodes: '', is_active: true };

const PaymentDiscountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razorpayDiscountPercent: 2,
    quantityDiscounts: [] as QuantityDiscount[],
    excludeBundledProductsFromQuantityDiscount: false,
  });

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
    fetchSettings();
    loadRules();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      const settings = response.data?.success && response.data?.data 
        ? response.data.data 
        : response.data?.data 
        ? response.data.data 
        : response.data;
      
      if (settings) {
        setFormData({
          razorpayDiscountPercent: settings.razorpayDiscountPercent || 2,
          quantityDiscounts: settings.quantityDiscounts || [
            { minQuantity: 5, discountPercent: 5 },
            { minQuantity: 10, discountPercent: 10 },
            { minQuantity: 20, discountPercent: 15 },
          ],
          excludeBundledProductsFromQuantityDiscount: settings.excludeBundledProductsFromQuantityDiscount || false,
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      setFormData({
        razorpayDiscountPercent: 2,
        quantityDiscounts: [
          { minQuantity: 5, discountPercent: 5 },
          { minQuantity: 10, discountPercent: 10 },
          { minQuantity: 20, discountPercent: 15 },
        ],
        excludeBundledProductsFromQuantityDiscount: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', formData);
      alert('Payment gateway discount settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
    <div className="max-w-4xl mx-auto space-y-6">
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Payment Gateway Discount</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure discount percentage for prepaid orders</p>
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This setting controls the discount percentage shown in the checkout page. 
                Make sure the backend also uses the same percentage for consistency.
              </p>
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

      {/* Payment Method Rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Ban className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <CardTitle>Payment Method Rules</CardTitle>
              <CardDescription>Restrict a payment method under specific conditions (e.g. disable COD above ₹5,000).</CardDescription>
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
                  <Label className="text-xs">Min order value ₹ (optional)</Label>
                  <Input type="number" min="0" value={ruleForm.minOrderValue} onChange={e => setRuleForm(f => ({ ...f, minOrderValue: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max order value ₹ (optional)</Label>
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
                      {r.conditions?.minOrderValue != null && <span>Min ₹{r.conditions.minOrderValue} </span>}
                      {r.conditions?.maxOrderValue != null && <span>Max ₹{r.conditions.maxOrderValue} </span>}
                      {r.conditions?.excludePincodes?.length ? <span>Excl. {r.conditions.excludePincodes.length} pincode(s)</span> : null}
                      {!r.conditions?.minOrderValue && !r.conditions?.maxOrderValue && !r.conditions?.excludePincodes?.length && '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? 'default' : 'secondary'} className={r.is_active ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEditRule(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteRule(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              <strong>Note:</strong> These rules are stored and manageable here, but checkout doesn't evaluate them yet — enforcing them at checkout is a separate backend change.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentDiscountSettings;
