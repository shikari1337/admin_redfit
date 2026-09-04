import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, ExternalLink } from 'lucide-react';
import { gstSettingsAPI, api } from '../services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettingsSection } from '../hooks/useSettingsSection';

const DEFAULT_FORM_DATA = {
  gstin: '',
  showPriceIncludingGst: false,
  showGstOnCheckout: true,
  // Whether GST is actually charged/recorded. Without this the order's tax and
  // CGST/SGST/IGST breakdown stay zero and no GST invoice can be produced.
  gstEnabled: false,
  defaultRate: 18,
};

type FormData = typeof DEFAULT_FORM_DATA;

const GstSettings: React.FC = () => {
  const navigate = useNavigate();

  const { formData, setFormData, loading, saving, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    fetcher: async () => {
      try {
        // Load GST display prefs
        const gst = await gstSettingsAPI.get();
        // Load GSTIN from admin settings
        const admin = await api.get('/settings/admin').then(r => r.data);
        return { gst, admin };
      } catch (err: any) {
        // The GST settings key may not exist yet on a fresh store — that's not
        // a real error, just "nothing saved yet"; skip silently (also skips the
        // GSTIN fetch, matching the original single-try behavior).
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    parse: ({ gst, admin }) => ({
      gstin: admin?.gstin || DEFAULT_FORM_DATA.gstin,
      showPriceIncludingGst: gst?.showPriceIncludingGst ?? false,
      showGstOnCheckout: gst?.showGstOnCheckout ?? true,
      gstEnabled: gst?.enabled === true,
      defaultRate: Number(gst?.defaultRate ?? 18),
    }),
    submitter: async (data) => {
      // Save GSTIN separately in the settings table
      await api.put('/settings/gstin', { value: data.gstin.trim().toUpperCase() });
      // Save display prefs via the GST settings key
      // Send the whole object — PUT /settings/:key replaces the value, so
      // omitting enabled/defaultRate here would silently wipe them.
      await gstSettingsAPI.update({
        showPriceIncludingGst: data.showPriceIncludingGst,
        showGstOnCheckout: data.showGstOnCheckout,
        enabled: data.gstEnabled,
        defaultRate: Number(data.defaultRate) || 0,
      } as any);
    },
    successMessage: 'GST settings saved successfully!',
    onError: (err: any) => alert(err?.response?.data?.message || 'Failed to save GST settings'),
  });

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
              value={formData.gstin}
              onChange={e => setFormData(prev => ({ ...prev, gstin: e.target.value }))}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              15-character GST Identification Number, printed on all invoices and receipts.
            </p>
          </div>

          <div className="border-t pt-5 space-y-5">
            {/* Collect GST — the master switch. Everything below is display only. */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Collect GST on orders</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Records the CGST/SGST/IGST split on every order so GST invoices can be issued.
                  While this is off, orders are saved with zero tax.
                </div>
              </div>
              <Switch checked={formData.gstEnabled} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, gstEnabled: checked }))} />
            </div>

            {/* Default rate */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="font-medium text-sm">Default GST rate (%)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Applied to products without their own tax rule. Intra-state splits into
                  CGST+SGST; inter-state becomes IGST.
                </div>
              </div>
              <Input
                type="number" min="0" max="28" step="0.5"
                value={formData.defaultRate}
                onChange={(e) => setFormData(prev => ({ ...prev, defaultRate: Number(e.target.value) }))}
                className="w-24"
                disabled={!formData.gstEnabled}
              />
            </div>

            {/* Show price including GST */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Show Price Including GST</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Storefront product prices already include GST — no "+" tax line shown
                </div>
              </div>
              <Switch checked={formData.showPriceIncludingGst} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showPriceIncludingGst: checked }))} />
            </div>

            {/* Show GST on Checkout */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Show GST Breakdown at Checkout</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Display CGST + SGST / IGST line items on the checkout order summary
                </div>
              </div>
              <Switch checked={formData.showGstOnCheckout} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, showGstOnCheckout: checked }))} />
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
        <Button onClick={() => handleSubmit()} disabled={saving} className="bg-blue-600 hover:bg-blue-700 min-w-[120px]">
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
