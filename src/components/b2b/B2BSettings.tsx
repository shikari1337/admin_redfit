import { useState, useEffect } from 'react';
import { modulesAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';

export default function B2BSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    minOrderValue: 0,
    paymentMethods: {
      razorpay: true,
      bankTransfer: true,
      upi: true,
      cod: false,
    }
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await modulesAPI.list();
      // Interceptor unwraps {success,data} → res is usually the array itself.
      const list: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      const b2bMod = list.find((m: any) => m.key === 'b2b');
      if (b2bMod && b2bMod.config) {
        setSettings({
          minOrderValue: b2bMod.config.minOrderValue || 0,
          paymentMethods: {
            razorpay: b2bMod.config.paymentMethods?.razorpay ?? true,
            bankTransfer: b2bMod.config.paymentMethods?.bankTransfer ?? true,
            upi: b2bMod.config.paymentMethods?.upi ?? true,
            cod: b2bMod.config.paymentMethods?.cod ?? false,
          }
        });
      }
    } catch (err: any) {
      setError('Failed to load B2B settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await modulesAPI.updateConfig('b2b', true, settings);
      setSuccess('B2B Settings updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentMethod = (key: keyof typeof settings.paymentMethods, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      paymentMethods: {
        ...prev.paymentMethods,
        [key]: value
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">B2B Store Settings</h3>
          <p className="text-sm text-muted-foreground">Configure global configurations for your B2B customers.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm">{success}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Order Settings</CardTitle>
          <CardDescription>Global restrictions and rules for B2B orders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Minimum Order Value (₹)</Label>
            <Input 
              type="number" 
              min="0"
              value={settings.minOrderValue} 
              onChange={e => setSettings(s => ({ ...s, minOrderValue: Number(e.target.value) }))} 
              placeholder="e.g. 10000"
            />
            <p className="text-xs text-muted-foreground">
              B2B customers will not be able to checkout if their subtotal is below this amount. Set to 0 to disable.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Gateways</CardTitle>
          <CardDescription>Select which payment methods are available during B2B checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Razorpay (Credit Card / Netbanking)</Label>
              <p className="text-xs text-muted-foreground">Allow online payments through Razorpay gateway.</p>
            </div>
            <Switch 
              checked={settings.paymentMethods.razorpay} 
              onCheckedChange={(v) => updatePaymentMethod('razorpay', v)} 
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Bank Transfer (NEFT/RTGS/IMPS)</Label>
              <p className="text-xs text-muted-foreground">Allow manual bank transfer. Order remains on hold until payment is verified.</p>
            </div>
            <Switch 
              checked={settings.paymentMethods.bankTransfer} 
              onCheckedChange={(v) => updatePaymentMethod('bankTransfer', v)} 
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>UPI Payments</Label>
              <p className="text-xs text-muted-foreground">Allow direct UPI app payments.</p>
            </div>
            <Switch 
              checked={settings.paymentMethods.upi} 
              onCheckedChange={(v) => updatePaymentMethod('upi', v)} 
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Cash on Delivery (COD)</Label>
              <p className="text-xs text-muted-foreground">Allow paying by cash upon delivery (usually disabled for B2B).</p>
            </div>
            <Switch 
              checked={settings.paymentMethods.cod} 
              onCheckedChange={(v) => updatePaymentMethod('cod', v)} 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
