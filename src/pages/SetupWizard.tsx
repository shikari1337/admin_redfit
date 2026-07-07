import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Store, Phone, Image, Receipt, CreditCard, Truck,
  Check, ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'store',    label: 'Store Info',    icon: Store,      description: 'Basic store details' },
  { id: 'contact',  label: 'Contact',       icon: Phone,      description: 'Email, phone & address' },
  { id: 'branding', label: 'Branding',      icon: Image,      description: 'Logo & colors' },
  { id: 'tax',      label: 'Tax / GST',     icon: Receipt,    description: 'GSTIN & tax preferences' },
  { id: 'payment',  label: 'Payment',       icon: CreditCard, description: 'Enable payment methods' },
  { id: 'shipping', label: 'Shipping',      icon: Truck,      description: 'Shipping fees & COD' },
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const TIMEZONES  = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Singapore'];

// ─── Component ────────────────────────────────────────────────────────────────

const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // ── Step 1: Store Info ──
  const [storeName,    setStoreName]    = useState('');
  const [storeDesc,    setStoreDesc]    = useState('');
  const [websiteUrl,   setWebsiteUrl]   = useState('');
  const [currency,     setCurrency]     = useState('INR');
  const [timezone,     setTimezone]     = useState('Asia/Kolkata');

  // ── Step 2: Contact ──
  const [contactEmail,    setContactEmail]    = useState('');
  const [contactPhone,    setContactPhone]    = useState('');
  const [whatsappNumber,  setWhatsappNumber]  = useState('');
  const [storeAddress,    setStoreAddress]    = useState('');

  // ── Step 3: Branding ──
  const [logoUrl,        setLogoUrl]        = useState('');
  const [faviconUrl,     setFaviconUrl]     = useState('');
  const [primaryColor,   setPrimaryColor]   = useState('#0D9488');
  const [secondaryColor, setSecondaryColor] = useState('#F59E0B');

  // ── Step 4: Tax / GST ──
  const [gstin,                 setGstin]                 = useState('');
  const [showPriceIncludingGst, setShowPriceIncludingGst] = useState(false);
  const [showGstOnCheckout,     setShowGstOnCheckout]     = useState(true);
  const [defaultGstRate,        setDefaultGstRate]        = useState('18');

  // ── Step 5: Payment ──
  const [codEnabled,       setCodEnabled]       = useState(true);
  const [codChargePay,     setCodChargePay]     = useState('');
  const [razorpayEnabled,  setRazorpayEnabled]  = useState(false);
  const [razorpayKeyId,    setRazorpayKeyId]    = useState('');
  const [razorpaySecret,   setRazorpaySecret]   = useState('');
  const [upiEnabled,       setUpiEnabled]       = useState(false);
  const [upiId,            setUpiId]            = useState('');
  const [upiPayeeName,     setUpiPayeeName]     = useState('');

  // ── Step 6: Shipping ──
  const [freeShippingAmount, setFreeShippingAmount] = useState('');
  const [codCharge,          setCodCharge]          = useState('');
  const [defaultShippingFee, setDefaultShippingFee] = useState('');

  // ─── Load existing settings so the wizard pre-fills ─────────────────────────
  useEffect(() => {
    api.get('/settings/admin')
      .then(res => {
        const raw = res.data;
        const s: Record<string, any> =
          raw?.success !== undefined && raw?.data !== undefined ? raw.data : raw ?? {};

        // Step 1
        if (s.general?.siteName)        setStoreName(s.general.siteName);
        if (s.general?.siteDescription) setStoreDesc(s.general.siteDescription);
        if (s.general?.websiteUrl)      setWebsiteUrl(s.general.websiteUrl);
        if (s.general?.currency)        setCurrency(s.general.currency);
        if (s.general?.timezone)        setTimezone(s.general.timezone);

        // Step 2
        if (s.contact?.email || s.storeEmail)         setContactEmail(s.contact?.email || s.storeEmail || '');
        if (s.contact?.phoneNumber || s.storePhone)   setContactPhone(s.contact?.phoneNumber || s.storePhone || '');
        if (s.contact?.whatsappNumber || s.whatsapp)  setWhatsappNumber(s.contact?.whatsappNumber || s.whatsapp || '');
        if (s.contact?.address || s.storeAddress)     setStoreAddress(s.contact?.address || s.storeAddress || '');

        // Step 3
        if (s.logo?.logoUrl)        setLogoUrl(s.logo.logoUrl);
        if (s.logo?.faviconUrl)     setFaviconUrl(s.logo.faviconUrl);
        if (s.colors?.primaryColor) setPrimaryColor(s.colors.primaryColor);
        if (s.colors?.secondaryColor) setSecondaryColor(s.colors.secondaryColor);

        // Step 4
        if (s.gstin)                          setGstin(s.gstin);
        if (s.gst?.showPriceIncludingGst != null) setShowPriceIncludingGst(s.gst.showPriceIncludingGst);
        if (s.gst?.showGstOnCheckout != null)     setShowGstOnCheckout(s.gst.showGstOnCheckout);
        if (s.gst?.defaultRate)               setDefaultGstRate(String(s.gst.defaultRate));

        // Step 5
        if (s.cod?.isEnabled != null)           setCodEnabled(s.cod.isEnabled);
        if (s.cod?.charge != null)              setCodChargePay(String(s.cod.charge));
        if (s.razorpay?.isEnabled != null)      setRazorpayEnabled(s.razorpay.isEnabled);
        if (s.razorpay?.keyId)                  setRazorpayKeyId(s.razorpay.keyId);
        if (s.razorpay?.keySecret)              setRazorpaySecret(s.razorpay.keySecret);
        if (s.upi?.isEnabled != null)           setUpiEnabled(s.upi.isEnabled);
        if (s.upi?.upiId)                       setUpiId(s.upi.upiId);
        if (s.upi?.payeeName)                   setUpiPayeeName(s.upi.payeeName);

        // Step 6
        if (s.shipping?.freeShippingAmount != null) setFreeShippingAmount(String(s.shipping.freeShippingAmount));
        if (s.shipping?.codCharge != null)          setCodCharge(String(s.shipping.codCharge));
        if (s.shipping?.defaultFee != null)         setDefaultShippingFee(String(s.shipping.defaultFee));
      })
      .catch(() => { /* pre-fill is best-effort */ })
      .finally(() => setLoadingSettings(false));
  }, []);

  // ─── Save current step's settings ───────────────────────────────────────────
  const saveCurrentStep = async (): Promise<boolean> => {
    setSaveError(null);
    setSaving(true);
    try {
      const stepId = STEPS[currentStep].id;

      if (stepId === 'store') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'general', value: { siteName: storeName, siteDescription: storeDesc, websiteUrl, currency, timezone }, grp: 'general', is_public: true },
          ],
        });
      }

      if (stepId === 'contact') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'contact', value: { email: contactEmail, phoneNumber: contactPhone, whatsappNumber, address: storeAddress }, grp: 'contact', is_public: true },
          ],
        });
      }

      if (stepId === 'branding') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'logo',   value: { logoUrl, faviconUrl },                           grp: 'appearance', is_public: true },
            { key: 'colors', value: { primaryColor, secondaryColor },                  grp: 'appearance', is_public: true },
          ],
        });
      }

      if (stepId === 'tax') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'gstin', value: gstin, grp: 'tax', is_public: false },
            { key: 'gst',   value: { showPriceIncludingGst, showGstOnCheckout, defaultRate: parseFloat(defaultGstRate) || 18 }, grp: 'tax', is_public: true },
          ],
        });
      }

      if (stepId === 'payment') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'cod',      value: { isEnabled: codEnabled, charge: parseFloat(codChargePay) || 0 }, grp: 'payment', is_public: false },
            { key: 'razorpay', value: { isEnabled: razorpayEnabled, keyId: razorpayKeyId, keySecret: razorpaySecret }, grp: 'payment', is_public: false },
            { key: 'upi',      value: { isEnabled: upiEnabled, upiId, payeeName: upiPayeeName }, grp: 'payment', is_public: false },
          ],
        });
      }

      if (stepId === 'shipping') {
        await api.post('/settings/bulk', {
          settings: [
            { key: 'shipping', value: { freeShippingAmount: parseFloat(freeShippingAmount) || 0, codCharge: parseFloat(codCharge) || 0, defaultFee: parseFloat(defaultShippingFee) || 0 }, grp: 'shipping', is_public: true },
          ],
        });
      }

      return true;
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Failed to save. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await saveCurrentStep();
    if (ok) setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setSaveError(null);
    setCurrentStep(s => Math.max(s - 1, 0));
  };

  const handleFinish = async () => {
    const ok = await saveCurrentStep();
    if (ok) navigate('/dashboard');
  };

  const handleSkip = () => {
    setSaveError(null);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      navigate('/dashboard');
    }
  };

  const isLastStep = currentStep === STEPS.length - 1;

  if (loadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Store Setup</h1>
          <p className="text-sm text-muted-foreground">
            Complete these steps to launch your store. You can always change these later in Settings.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground">
          Skip setup for now
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar steps */}
        <div className="hidden md:flex w-64 bg-white border-r flex-col py-8 px-4 gap-1">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const done   = idx < currentStep;
            const active = idx === currentStep;
            return (
              <button
                key={step.id}
                onClick={() => idx < currentStep && setCurrentStep(idx)}
                disabled={idx > currentStep}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors w-full
                  ${active ? 'bg-primary text-primary-foreground' : ''}
                  ${done   ? 'text-green-700 hover:bg-green-50 cursor-pointer' : ''}
                  ${!active && !done ? 'text-muted-foreground cursor-not-allowed' : ''}
                `}
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                  ${active ? 'bg-white/20' : done ? 'bg-green-100' : 'bg-muted'}`}>
                  {done
                    ? <Check className="h-3.5 w-3.5 text-green-600" />
                    : <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-muted-foreground'}`} />
                  }
                </div>
                <div>
                  <div className={`text-sm font-medium ${active ? 'text-white' : ''}`}>{step.label}</div>
                  <div className={`text-xs ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{step.description}</div>
                </div>
              </button>
            );
          })}

          <div className="mt-auto pt-6 px-3">
            <div className="text-xs text-muted-foreground mb-1.5">
              {currentStep} of {STEPS.length} steps completed
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-xl mx-auto space-y-6">

            {/* Mobile step indicator */}
            <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-1">
              {STEPS.map((step, idx) => {
                const done   = idx < currentStep;
                const active = idx === currentStep;
                return (
                  <div key={step.id} className={`flex-shrink-0 flex items-center gap-1.5 text-xs
                    ${active ? 'text-primary font-semibold' : done ? 'text-green-600' : 'text-muted-foreground'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px]
                      ${active ? 'bg-primary text-white' : done ? 'bg-green-100' : 'bg-muted'}`}>
                      {done ? '✓' : idx + 1}
                    </div>
                    {step.label}
                    {idx < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                  </div>
                );
              })}
            </div>

            {/* Step heading */}
            <div>
              <h2 className="text-2xl font-bold text-foreground">{STEPS[currentStep].label}</h2>
              <p className="text-muted-foreground text-sm mt-1">{STEPS[currentStep].description}</p>
            </div>

            {saveError && (
              <div className="flex items-start gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                {saveError}
              </div>
            )}

            {/* ── STEP: Store Info ── */}
            {STEPS[currentStep].id === 'store' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-storeName">Store Name <span className="text-destructive">*</span></Label>
                    <Input id="w-storeName" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="e.g. Homeomead" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-storeDesc">Store Description</Label>
                    <Textarea id="w-storeDesc" value={storeDesc} onChange={e => setStoreDesc(e.target.value)} placeholder="Short description shown on the storefront" rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-websiteUrl">Website URL</Label>
                    <Input id="w-websiteUrl" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://yourstore.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP: Contact ── */}
            {STEPS[currentStep].id === 'contact' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-email">Store Email <span className="text-destructive">*</span></Label>
                    <Input id="w-email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contact@yourstore.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="w-phone">Phone Number</Label>
                      <Input id="w-phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+91 98765 43210" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="w-whatsapp">WhatsApp Number</Label>
                      <Input id="w-whatsapp" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+91 98765 43210" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-address">Store Address</Label>
                    <Textarea id="w-address" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Full address shown on invoices and contact page" rows={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP: Branding ── */}
            {STEPS[currentStep].id === 'branding' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-logoUrl">Logo URL</Label>
                    <Input id="w-logoUrl" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://cdn.yourstore.com/logo.png" />
                    <p className="text-xs text-muted-foreground">Upload the logo in Gallery first, then paste the URL here. Or set it later in Appearance → Style.</p>
                    {logoUrl && <img src={logoUrl} alt="logo preview" className="h-12 mt-2 object-contain rounded border" />}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-faviconUrl">Favicon URL</Label>
                    <Input id="w-faviconUrl" value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="https://cdn.yourstore.com/favicon.ico" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="w-primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <input type="color" id="w-primaryColor" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-12 rounded border cursor-pointer" />
                        <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#0D9488" className="font-mono" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="w-secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <input type="color" id="w-secondaryColor" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-10 w-12 rounded border cursor-pointer" />
                        <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} placeholder="#F59E0B" className="font-mono" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP: Tax / GST ── */}
            {STEPS[currentStep].id === 'tax' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-gstin">GSTIN</Label>
                    <Input id="w-gstin" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" className="font-mono" maxLength={15} />
                    <p className="text-xs text-muted-foreground">15-character GST Identification Number. Required for GST invoices.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Default GST Rate (%)</Label>
                    <Input type="number" min={0} max={100} value={defaultGstRate} onChange={e => setDefaultGstRate(e.target.value)} placeholder="18" />
                    <p className="text-xs text-muted-foreground">Used as fallback when no specific Tax Rule matches. Common rates: 0%, 5%, 12%, 18%, 28%.</p>
                  </div>
                  <div className="space-y-4 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">Show Price Including GST</div>
                        <div className="text-xs text-muted-foreground">Display product prices with GST already included on the storefront</div>
                      </div>
                      <Switch checked={showPriceIncludingGst} onCheckedChange={setShowPriceIncludingGst} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">Show GST Breakdown at Checkout</div>
                        <div className="text-xs text-muted-foreground">Display CGST + SGST/IGST line items on the checkout page</div>
                      </div>
                      <Switch checked={showGstOnCheckout} onCheckedChange={setShowGstOnCheckout} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP: Payment ── */}
            {STEPS[currentStep].id === 'payment' && (
              <div className="space-y-4">
                {/* COD */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Cash on Delivery (COD)</div>
                        <div className="text-xs text-muted-foreground">Allow customers to pay when the order is delivered</div>
                      </div>
                      <Switch checked={codEnabled} onCheckedChange={setCodEnabled} />
                    </div>
                    {codEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="w-codChargePay">COD Charge (₹)</Label>
                        <Input id="w-codChargePay" type="number" min={0} value={codChargePay} onChange={e => setCodChargePay(e.target.value)} placeholder="0" />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Razorpay */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Razorpay</div>
                        <div className="text-xs text-muted-foreground">Accept cards, UPI, net banking via Razorpay</div>
                      </div>
                      <Switch checked={razorpayEnabled} onCheckedChange={setRazorpayEnabled} />
                    </div>
                    {razorpayEnabled && (
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="w-rpKeyId">Key ID</Label>
                          <Input id="w-rpKeyId" value={razorpayKeyId} onChange={e => setRazorpayKeyId(e.target.value)} placeholder="rzp_live_..." />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="w-rpSecret">Key Secret</Label>
                          <Input id="w-rpSecret" type="password" value={razorpaySecret} onChange={e => setRazorpaySecret(e.target.value)} placeholder="••••••••••••••••••••" />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* UPI */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">Direct UPI</div>
                        <div className="text-xs text-muted-foreground">Accept UPI payments via PhonePe, GPay, Paytm etc.</div>
                      </div>
                      <Switch checked={upiEnabled} onCheckedChange={setUpiEnabled} />
                    </div>
                    {upiEnabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="w-upiId">UPI ID</Label>
                          <Input id="w-upiId" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="yourstore@upi" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="w-upiName">Payee Name</Label>
                          <Input id="w-upiName" value={upiPayeeName} onChange={e => setUpiPayeeName(e.target.value)} placeholder="Your Store Name" />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── STEP: Shipping ── */}
            {STEPS[currentStep].id === 'shipping' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-freeShipping">Free Shipping Threshold (₹)</Label>
                    <Input id="w-freeShipping" type="number" min={0} value={freeShippingAmount} onChange={e => setFreeShippingAmount(e.target.value)} placeholder="500" />
                    <p className="text-xs text-muted-foreground">Orders above this amount get free shipping. Set 0 to disable.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-defaultFee">Default Shipping Fee (₹)</Label>
                    <Input id="w-defaultFee" type="number" min={0} value={defaultShippingFee} onChange={e => setDefaultShippingFee(e.target.value)} placeholder="99" />
                    <p className="text-xs text-muted-foreground">Applied when the order doesn't qualify for free shipping.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-codCharge">COD Charge (₹)</Label>
                    <Input id="w-codCharge" type="number" min={0} value={codCharge} onChange={e => setCodCharge(e.target.value)} placeholder="50" />
                    <p className="text-xs text-muted-foreground">Extra fee added to COD orders. Set 0 for no charge.</p>
                  </div>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    You can set up advanced shipping zones, carriers (Shiprocket, Delhivery), and per-pincode rules in <strong>Settings → Shipping</strong> later.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0 || saving}
              >
                Back
              </Button>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={saving}
                  className="text-muted-foreground"
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  onClick={isLastStep ? handleFinish : handleNext}
                  disabled={saving}
                  className="min-w-[120px]"
                >
                  {saving
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</>
                    : isLastStep
                      ? <><Check className="h-4 w-4 mr-2" /> Finish Setup</>
                      : <>Next <ChevronRight className="h-4 w-4 ml-1" /></>
                  }
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
