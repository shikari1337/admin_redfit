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
import {
  StoreConfig, EMPTY_STORE_CONFIG, loadStoreConfig, storeConfigSavePayload,
  COUNTRIES, CURRENCIES, TIMEZONES, LANGUAGES, INDIAN_STATES,
} from '@/lib/storeConfig';

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 'store',    label: 'Store & Region', icon: Store,      description: 'Name, currency, country & reach' },
  { id: 'contact',  label: 'Contact & Address', icon: Phone,   description: 'Email, phone & business address' },
  { id: 'branding', label: 'Branding',      icon: Image,      description: 'Logo & colors' },
  { id: 'tax',      label: 'Tax / GST',     icon: Receipt,    description: 'GSTIN & tax preferences' },
  { id: 'payment',  label: 'Payment',       icon: CreditCard, description: 'Enable payment methods' },
  { id: 'shipping', label: 'Shipping',      icon: Truck,      description: 'Shipping fees & COD' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // ── Canonical store config (drives store / contact / branding-logo steps) ──
  const [cfg, setCfg] = useState<StoreConfig>(EMPTY_STORE_CONFIG);
  const set = <S extends keyof StoreConfig>(section: S, patch: Partial<StoreConfig[S]>) =>
    setCfg((c) => ({ ...c, [section]: { ...(c[section] as any), ...patch } }));
  const toggleOperating = (code: string) =>
    setCfg((c) => {
      const has = c.regional.operatingCountries.includes(code);
      const next = has ? c.regional.operatingCountries.filter((x) => x !== code) : [...c.regional.operatingCountries, code];
      return { ...c, regional: { ...c.regional, operatingCountries: next.length ? next : ['IN'] } };
    });

  // ── Branding colors (separate `colors` settings key) ──
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

        setCfg(loadStoreConfig(s));

        // Branding colors
        if (s.colors?.primaryColor) setPrimaryColor(s.colors.primaryColor);
        if (s.colors?.secondaryColor) setSecondaryColor(s.colors.secondaryColor);

        // Tax
        if (s.gstin)                          setGstin(s.gstin);
        if (s.gst?.showPriceIncludingGst != null) setShowPriceIncludingGst(s.gst.showPriceIncludingGst);
        if (s.gst?.showGstOnCheckout != null)     setShowGstOnCheckout(s.gst.showGstOnCheckout);
        if (s.gst?.defaultRate)               setDefaultGstRate(String(s.gst.defaultRate));

        // Payment
        if (s.cod?.isEnabled != null)           setCodEnabled(s.cod.isEnabled);
        if (s.cod?.charge != null)              setCodChargePay(String(s.cod.charge));
        if (s.razorpay?.isEnabled != null)      setRazorpayEnabled(s.razorpay.isEnabled);
        if (s.razorpay?.keyId)                  setRazorpayKeyId(s.razorpay.keyId);
        if (s.razorpay?.keySecret)              setRazorpaySecret(s.razorpay.keySecret);
        if (s.upi?.isEnabled != null)           setUpiEnabled(s.upi.isEnabled);
        if (s.upi?.upiId)                       setUpiId(s.upi.upiId);
        if (s.upi?.payeeName)                   setUpiPayeeName(s.upi.payeeName);

        // Shipping
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

      // Store / Contact steps persist the whole canonical config (+ legacy mirror).
      if (stepId === 'store' || stepId === 'contact') {
        await api.post('/settings/bulk', { settings: storeConfigSavePayload(cfg) });
      }

      if (stepId === 'branding') {
        await api.post('/settings/bulk', {
          settings: [
            ...storeConfigSavePayload(cfg), // keeps logo/favicon in sync with canonical config
            { key: 'colors', value: { primaryColor, secondaryColor }, grp: 'appearance', is_public: true },
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
    // Mark the store as configured on the final save.
    setCfg((c) => ({ ...c, setupCompleted: true }));
    const ok = await saveCurrentStep();
    if (ok) {
      // Ensure setupCompleted is persisted even if the last step wasn't store/contact.
      try { await api.post('/settings/bulk', { settings: storeConfigSavePayload({ ...cfg, setupCompleted: true }) }); } catch { /* best-effort */ }
      navigate('/dashboard');
    }
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
            Complete these steps to launch your store. You can always change these later in Settings → Store Configuration.
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

            {/* ── STEP: Store & Region ── */}
            {STEPS[currentStep].id === 'store' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-storeName">Store Name <span className="text-destructive">*</span></Label>
                    <Input id="w-storeName" value={cfg.business.name} onChange={e => set('business', { name: e.target.value })} placeholder="e.g. HomeoMead" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="w-legalName">Legal Entity Name</Label>
                      <Input id="w-legalName" value={cfg.business.legalName} onChange={e => set('business', { legalName: e.target.value })} placeholder="HomeoMead Wellness Pvt. Ltd." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="w-tagline">Tagline</Label>
                      <Input id="w-tagline" value={cfg.business.tagline} onChange={e => set('business', { tagline: e.target.value })} placeholder="Authentic homeopathy, delivered" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-storeDesc">Store Description</Label>
                    <Textarea id="w-storeDesc" value={cfg.business.description} onChange={e => set('business', { description: e.target.value })} placeholder="Short description shown on the storefront footer" rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-websiteUrl">Website URL</Label>
                    <Input id="w-websiteUrl" value={cfg.business.websiteUrl} onChange={e => set('business', { websiteUrl: e.target.value })} placeholder="https://yourstore.com" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Base Country</Label>
                      <Select value={cfg.regional.baseCountry} onValueChange={v => set('regional', { baseCountry: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={cfg.regional.currency} onValueChange={v => set('regional', { currency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={cfg.regional.language} onValueChange={v => set('regional', { language: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select value={cfg.regional.timezone} onValueChange={v => set('regional', { timezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Countries you sell / ship to</Label>
                    <p className="text-xs text-muted-foreground">Controls the country list at checkout.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {COUNTRIES.slice(0, 12).map(c => {
                        const on = cfg.regional.operatingCountries.includes(c.code);
                        return (
                          <button
                            key={c.code} type="button" onClick={() => toggleOperating(c.code)}
                            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm text-left transition-colors ${
                              on ? 'border-primary bg-primary/5' : 'border-gray-200 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${on ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                              {on && <Check className="h-2.5 w-2.5 text-white" />}
                            </span>
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── STEP: Contact & Address ── */}
            {STEPS[currentStep].id === 'contact' && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="w-email">Support Email <span className="text-destructive">*</span></Label>
                    <Input id="w-email" type="email" value={cfg.contact.email} onChange={e => set('contact', { email: e.target.value })} placeholder="support@yourstore.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="w-phone">Phone Number</Label>
                      <Input id="w-phone" value={cfg.contact.phone} onChange={e => set('contact', { phone: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="w-whatsapp">WhatsApp Number</Label>
                      <Input id="w-whatsapp" value={cfg.contact.whatsapp} onChange={e => set('contact', { whatsapp: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                  </div>

                  <div className="pt-2 border-t space-y-4">
                    <p className="text-sm font-medium text-foreground">Business Address</p>
                    <div className="space-y-2">
                      <Label htmlFor="w-addr1">Address Line 1</Label>
                      <Input id="w-addr1" value={cfg.address.line1} onChange={e => set('address', { line1: e.target.value })} placeholder="123 Health Avenue" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="w-city">City</Label>
                        <Input id="w-city" value={cfg.address.city} onChange={e => set('address', { city: e.target.value })} placeholder="New Delhi" />
                      </div>
                      <div className="space-y-2">
                        <Label>State / Region</Label>
                        {cfg.address.country === 'IN' ? (
                          <Select value={cfg.address.state || undefined} onValueChange={v => set('address', { state: v })}>
                            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                            <SelectContent>
                              {INDIAN_STATES.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={cfg.address.state} onChange={e => set('address', { state: e.target.value })} placeholder="State / Province" />
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="w-postal">Postal / PIN Code</Label>
                        <Input id="w-postal" value={cfg.address.postalCode} onChange={e => set('address', { postalCode: e.target.value })} placeholder="110001" />
                      </div>
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Select value={cfg.address.country} onValueChange={v => set('address', { country: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
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
                    <Input id="w-logoUrl" value={cfg.business.logoUrl} onChange={e => set('business', { logoUrl: e.target.value })} placeholder="https://cdn.yourstore.com/logo.png" />
                    <p className="text-xs text-muted-foreground">Upload the logo in Gallery first, then paste the URL here. Or set it later in Appearance → Style.</p>
                    {cfg.business.logoUrl && <img src={cfg.business.logoUrl} alt="logo preview" className="h-12 mt-2 object-contain rounded border" />}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="w-faviconUrl">Favicon URL</Label>
                    <Input id="w-faviconUrl" value={cfg.business.faviconUrl} onChange={e => set('business', { faviconUrl: e.target.value })} placeholder="https://cdn.yourstore.com/favicon.ico" />
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
