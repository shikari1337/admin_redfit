import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Smartphone, HandCoins, Loader2, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useSettingsSection } from '../hooks/useSettingsSection';

const DEFAULT_UPI_APPS = [
  { name: 'PhonePe', urlTemplate: 'phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Google Pay', urlTemplate: 'tez://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Paytm', urlTemplate: 'paytmmp://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'BHIM', urlTemplate: 'bhim://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Amazon Pay', urlTemplate: 'amazonpay://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
];

const DEFAULT_FORM_DATA = {
  upi: {
    isEnabled: false,
    upiId: '',
    payeeName: '',
    apps: DEFAULT_UPI_APPS,
  },
  manualPayment: {
    isEnabled: false,
    instructions: '',
    accountDetails: '',
  },
};

type FormData = typeof DEFAULT_FORM_DATA;

const PaymentGatewaySettings: React.FC = () => {
  const navigate = useNavigate();
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);

  const { formData, setFormData, loading, saving, reload, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse: (settings) => {
      const next: FormData = {
        upi: { ...DEFAULT_FORM_DATA.upi },
        manualPayment: { ...DEFAULT_FORM_DATA.manualPayment },
      };
      if (settings.upi) {
        next.upi = {
          isEnabled: settings.upi.isEnabled || false,
          upiId: settings.upi.upiId || '',
          payeeName: settings.upi.payeeName || '',
          apps: settings.upi.apps && settings.upi.apps.length > 0 ? settings.upi.apps : DEFAULT_UPI_APPS,
        };
      }
      if (settings.manualPayment) {
        next.manualPayment = {
          isEnabled: settings.manualPayment.isEnabled !== false,
          instructions: settings.manualPayment.instructions || '',
          accountDetails: settings.manualPayment.accountDetails || '',
        };
      } else {
        next.manualPayment = {
          isEnabled: true,
          instructions: 'Please transfer the payment amount to our bank account. Order will be processed after payment verification.',
          accountDetails: 'Bank transfer, NEFT, IMPS accepted',
        };
      }
      return next;
    },
    onLoaded: (settings) => {
      // Razorpay keys/webhook are configured on the API & Integrations page now
      // (used to be duplicated here too — same setting, two forms, no way to
      // tell from either one whether a key was actually saved). This page just
      // shows whether it's currently on, with a link to the real form.
      setRazorpayEnabled(!!settings.razorpay?.isEnabled);
    },
    onLoadError: () => alert('Failed to load settings. Please try again.'),
    onSuccess: () => { reload(); },
    successMessage: 'Payment gateway settings saved successfully!',
    onError: (error) => alert(error?.response?.data?.message || 'Failed to save settings. Please try again.'),
  });

  const handleChange = (section: keyof typeof formData, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Payment Gateway Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure and enable/disable payment gateways</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* Razorpay — keys/webhook live on API & Integrations now (this page used
            to have its own duplicate copy of the same fields). */}
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">Razorpay</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${razorpayEnabled ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                    {razorpayEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Keys, webhook and enable/disable are configured on API &amp; Integrations</p>
              </div>
            </div>
            <Link to="/settings/api-integrations">
              <Button type="button" variant="outline" size="sm">
                Configure Razorpay <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* UPI Settings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>UPI</CardTitle>
                <CardDescription>Manual prepaid UPI payment</CardDescription>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.upi.isEnabled}
                onCheckedChange={(checked) => handleChange('upi', 'isEnabled', checked as boolean)}
              />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </CardHeader>

          {formData.upi.isEnabled && (
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">UPI ID</label>
                  <Input
                    type="text"
                    value={formData.upi.upiId}
                    onChange={(e) => handleChange('upi', 'upiId', e.target.value)}
                    placeholder="e.g., yespay.mabs0517619IKIT2728@yesbankltd"
                  />
                  <p className="text-[10px] text-muted-foreground">Your UPI payment address (VPA)</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Payee Name</label>
                  <Input
                    type="text"
                    value={formData.upi.payeeName}
                    onChange={(e) => handleChange('upi', 'payeeName', e.target.value)}
                    placeholder="e.g., GROWCORD_STORE"
                  />
                  <p className="text-[10px] text-muted-foreground">Name shown to customers when making payment</p>
                </div>
              </div>

              <div className="pt-6 border-t">
                <h3 className="text-lg font-semibold text-foreground mb-4">UPI Apps Configuration</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure URL templates for 5 UPI payment apps. Use variables: {'{upiId}'}, {'{payeeName}'}, {'{amount}'}, {'{transactionNote}'}
                </p>
                <div className="space-y-4">
                  {formData.upi.apps && formData.upi.apps.map((app, index) => (
                    <div key={index} className="bg-muted/50 p-4 rounded-lg border">
                      <div className="flex items-center gap-3 mb-4">
                        <Checkbox
                          checked={app.enabled}
                          onCheckedChange={(checked) => {
                            const newApps = [...formData.upi.apps];
                            newApps[index].enabled = checked as boolean;
                            handleChange('upi', 'apps', newApps);
                          }}
                        />
                        <label className="text-sm font-medium text-foreground">
                          {app.name}
                        </label>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-muted-foreground">App Name</label>
                          <Input
                            type="text"
                            value={app.name}
                            onChange={(e) => {
                              const newApps = [...formData.upi.apps];
                              newApps[index].name = e.target.value;
                              handleChange('upi', 'apps', newApps);
                            }}
                            className="text-sm h-9"
                            placeholder="e.g., PhonePe"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-muted-foreground">URL Template</label>
                          <Input
                            type="text"
                            value={app.urlTemplate}
                            onChange={(e) => {
                              const newApps = [...formData.upi.apps];
                              newApps[index].urlTemplate = e.target.value;
                              handleChange('upi', 'apps', newApps);
                            }}
                            className="text-sm h-9 font-mono"
                            placeholder="e.g., phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Manual Payment Settings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <HandCoins className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>Manual Payment</CardTitle>
                <CardDescription>Bank transfer, NEFT, IMPS, or other manual payment methods</CardDescription>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.manualPayment.isEnabled}
                onCheckedChange={(checked) => handleChange('manualPayment', 'isEnabled', checked as boolean)}
              />
              <span className="text-sm font-medium">Enabled</span>
            </label>
          </CardHeader>

          {formData.manualPayment.isEnabled && (
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Payment Instructions</label>
                <Textarea
                  value={formData.manualPayment.instructions}
                  onChange={(e) => handleChange('manualPayment', 'instructions', e.target.value)}
                  placeholder="e.g., Please transfer the payment amount to our bank account. Order will be processed after payment verification."
                  rows={3}
                />
                <p className="text-[10px] text-muted-foreground">Instructions shown to customers when they select manual payment</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Account Details</label>
                <Textarea
                  value={formData.manualPayment.accountDetails}
                  onChange={(e) => handleChange('manualPayment', 'accountDetails', e.target.value)}
                  placeholder="e.g., Bank transfer, NEFT, IMPS accepted"
                  rows={2}
                />
                <p className="text-[10px] text-muted-foreground">Payment methods accepted (shown to customers)</p>
              </div>
            </CardContent>
          )}
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
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PaymentGatewaySettings;
