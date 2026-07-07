import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, ExternalLink } from 'lucide-react';
import { gstSettingsAPI, api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const GstSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading]                       = useState(true);
  const [saving, setSaving]                         = useState(false);
  const [gstin, setGstin]                           = useState('');
  const [showPriceIncludingGst, setShowPriceIncludingGst] = useState(false);
  const [showGstOnCheckout, setShowGstOnCheckout]   = useState(true);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      // Load GST display prefs
      const gstRes = await gstSettingsAPI.get();
      const gst = gstRes?.data || gstRes;
      if (gst) {
        setShowPriceIncludingGst(gst.showPriceIncludingGst ?? false);
        setShowGstOnCheckout(gst.showGstOnCheckout ?? true);
      }
      // Load GSTIN from admin settings
      const adminRes = await api.get('/settings/admin');
      const adminData = adminRes?.data;
      const s = adminData?.success !== undefined ? adminData?.data : adminData;
      if (s?.gstin) setGstin(s.gstin);
    } catch (err: any) {
      if (err?.response?.status !== 404) console.error('Failed to load GST settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save GSTIN separately in the settings table
      await api.put('/settings/gstin', { value: gstin.trim().toUpperCase() });
      // Save display prefs via the GST settings key
      await gstSettingsAPI.update({ showPriceIncludingGst, showGstOnCheckout });
      alert('GST settings saved successfully!');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save GST settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">GST Display Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control how taxes appear on the storefront and at checkout.
          To configure tax rates and rules, use <button onClick={() => navigate('/settings/tax-rules')} className="text-primary underline underline-offset-2 font-medium">Tax Rules</button>.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* GSTIN */}
          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              value={gstin}
              onChange={e => setGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              15-character GST Identification Number, printed on all invoices and receipts.
            </p>
          </div>

          <div className="border-t pt-5 space-y-5">
            {/* Show price including GST */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Show Price Including GST</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Storefront product prices already include GST — no "+" tax line shown
                </div>
              </div>
              <Switch checked={showPriceIncludingGst} onCheckedChange={setShowPriceIncludingGst} />
            </div>

            {/* Show GST on Checkout */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Show GST Breakdown at Checkout</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Display CGST + SGST / IGST line items on the checkout order summary
                </div>
              </div>
              <Switch checked={showGstOnCheckout} onCheckedChange={setShowGstOnCheckout} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax Rates → Tax Rules */}
      <Card className="border-dashed">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Tax Rates &amp; Rules</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Define GST/IGST rates per state, category, or HSN code (CGST + SGST breakdown, priority ordering)
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings/tax-rules')} className="flex-shrink-0 gap-1.5">
            Manage Rules
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings')}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 min-w-[120px]">
          {saving
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
            : <><Save className="mr-2 h-4 w-4" /> Save Changes</>
          }
        </Button>
      </div>
    </div>
  );
};

export default GstSettings;
