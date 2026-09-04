import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Phone, MapPin, Globe, Share2, Clock,
  Loader2, Check, AlertCircle, Sparkles, ExternalLink,
} from 'lucide-react';
import {
  StoreConfig, EMPTY_STORE_CONFIG, loadStoreConfig, storeConfigSavePayload,
  COUNTRIES, CURRENCIES, TIMEZONES, LANGUAGES, INDIAN_STATES, WEEKDAYS,
} from '@/lib/storeConfig';

// Small helpers to update deeply-nested config immutably.
type Section = keyof StoreConfig;

const StoreConfiguration: React.FC = () => {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { formData: cfg, setFormData: setCfg, loading, saving, handleSubmit: saveConfig } = useSettingsSection<StoreConfig>({
    defaults: EMPTY_STORE_CONFIG,
    // The axios interceptor already unwraps {success,data}, so the default
    // fetcher's `response.data` IS the settings object here — `loadStoreConfig`
    // takes that directly (this also drops a dead-but-harmless unwrap ternary
    // that used to sit in front of it).
    parse: loadStoreConfig,
    onLoadError: () => setError('Could not load current settings — showing defaults.'),
    submitter: async (data) => {
      const payload = storeConfigSavePayload({ ...data, setupCompleted: true });
      await api.post('/settings/bulk', { settings: payload });
      setCfg((c) => ({ ...c, setupCompleted: true }));
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Failed to save configuration.'),
  });

  const handleSave = () => {
    setSaved(false);
    setError(null);
    saveConfig();
  };

  const set = <S extends Section>(section: S, patch: Partial<StoreConfig[S]>) =>
    setCfg((c) => ({ ...c, [section]: { ...(c[section] as any), ...patch } }));

  const toggleOperating = (code: string) =>
    setCfg((c) => {
      const has = c.regional.operatingCountries.includes(code);
      const next = has
        ? c.regional.operatingCountries.filter((x) => x !== code)
        : [...c.regional.operatingCountries, code];
      return { ...c, regional: { ...c.regional, operatingCountries: next.length ? next : ['IN'] } };
    });

  const toggleCurrency = (code: string) =>
    setCfg((c) => {
      const has = c.regional.supportedCurrencies.includes(code);
      const next = has
        ? c.regional.supportedCurrencies.filter((x) => x !== code)
        : [...c.regional.supportedCurrencies, code];
      return { ...c, regional: { ...c.regional, supportedCurrencies: next.length ? next : [c.regional.currency] } };
    });

  const setHour = (day: string, patch: Partial<StoreConfig['hours'][number]>) =>
    setCfg((c) => ({
      ...c,
      hours: c.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    }));

  const addressPreview = useMemo(
    () =>
      [cfg.address.line1, cfg.address.line2, cfg.address.city, cfg.address.state, cfg.address.postalCode]
        .filter(Boolean)
        .join(', '),
    [cfg.address]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Store Configuration</h1>
            {cfg.setupCompleted
              ? <Badge className="bg-green-500/15 text-green-700 border-green-200">Configured</Badge>
              : <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">Incomplete</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Business identity, contact, address, regional &amp; commerce settings. Used across the storefront —
            footer, contact page, invoices and checkout.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/setup')} className="gap-2">
            <Sparkles className="h-4 w-4" /> Setup Wizard
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[130px] gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 mb-4 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <Check className="h-4 w-4" /> Configuration saved. The storefront will reflect these on next load.
        </div>
      )}

      <Tabs defaultValue="business">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="business" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Business</TabsTrigger>
          <TabsTrigger value="contact" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Contact</TabsTrigger>
          <TabsTrigger value="address" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</TabsTrigger>
          <TabsTrigger value="regional" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Regional</TabsTrigger>
          <TabsTrigger value="social" className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Social</TabsTrigger>
          <TabsTrigger value="hours" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Hours</TabsTrigger>
        </TabsList>

        {/* ── Business ── */}
        <TabsContent value="business">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Store / Brand Name" required>
                  <Input value={cfg.business.name} onChange={(e) => set('business', { name: e.target.value })} placeholder="HomeoMead" />
                </Field>
                <Field label="Legal Entity Name" hint="Shown on invoices & policies">
                  <Input value={cfg.business.legalName} onChange={(e) => set('business', { legalName: e.target.value })} placeholder="HomeoMead Wellness Pvt. Ltd." />
                </Field>
              </div>
              <Field label="Tagline">
                <Input value={cfg.business.tagline} onChange={(e) => set('business', { tagline: e.target.value })} placeholder="Authentic homeopathy, delivered fast" />
              </Field>
              <Field label="Description" hint="Short paragraph shown in the storefront footer">
                <Textarea rows={3} value={cfg.business.description} onChange={(e) => set('business', { description: e.target.value })}
                  placeholder="Your trusted destination for homeopathic medicines, ayurvedic products and personal care." />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Website URL">
                  <Input value={cfg.business.websiteUrl} onChange={(e) => set('business', { websiteUrl: e.target.value })} placeholder="https://homeomead.com" />
                </Field>
                <Field label="Logo URL" hint="Upload in Gallery, paste URL. Or set in Appearance → Style.">
                  <Input value={cfg.business.logoUrl} onChange={(e) => set('business', { logoUrl: e.target.value })} placeholder="https://cdn.…/logo.png" />
                </Field>
              </div>
              <Field label="Favicon URL">
                <Input value={cfg.business.faviconUrl} onChange={(e) => set('business', { faviconUrl: e.target.value })} placeholder="https://cdn.…/favicon.ico" />
              </Field>
              {cfg.business.logoUrl && (
                <img src={cfg.business.logoUrl} alt="logo preview" className="h-12 object-contain rounded border p-1 bg-white" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Contact ── */}
        <TabsContent value="contact">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Support Email" required>
                  <Input type="email" value={cfg.contact.email} onChange={(e) => set('contact', { email: e.target.value })} placeholder="support@homeomead.com" />
                </Field>
                <Field label="Sales Email" hint="Optional — for B2B / wholesale enquiries">
                  <Input type="email" value={cfg.contact.salesEmail} onChange={(e) => set('contact', { salesEmail: e.target.value })} placeholder="sales@homeomead.com" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Phone">
                  <Input value={cfg.contact.phone} onChange={(e) => set('contact', { phone: e.target.value })} placeholder="+91 98765 43210" />
                </Field>
                <Field label="WhatsApp">
                  <Input value={cfg.contact.whatsapp} onChange={(e) => set('contact', { whatsapp: e.target.value })} placeholder="+91 98765 43210" />
                </Field>
                <Field label="Toll-Free">
                  <Input value={cfg.contact.tollFree} onChange={(e) => set('contact', { tollFree: e.target.value })} placeholder="1800 123 4567" />
                </Field>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                Customer messages from the storefront <strong>Contact</strong> form land in your
                <button type="button" onClick={() => navigate('/leads')} className="mx-1 underline font-medium">Leads (CRM)</button>
                — not here. This screen only sets the details shown to shoppers.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Address ── */}
        <TabsContent value="address">
          <Card>
            <CardContent className="p-6 space-y-5">
              <Field label="Address Line 1">
                <Input value={cfg.address.line1} onChange={(e) => set('address', { line1: e.target.value })} placeholder="123 Health Avenue" />
              </Field>
              <Field label="Address Line 2">
                <Input value={cfg.address.line2} onChange={(e) => set('address', { line2: e.target.value })} placeholder="Near City Hospital" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="City">
                  <Input value={cfg.address.city} onChange={(e) => set('address', { city: e.target.value })} placeholder="New Delhi" />
                </Field>
                <Field label="State / Region">
                  {cfg.address.country === 'IN' ? (
                    <Select value={cfg.address.state || undefined} onValueChange={(v) => set('address', { state: v })}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={cfg.address.state} onChange={(e) => set('address', { state: e.target.value })} placeholder="State / Province" />
                  )}
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Postal / PIN Code">
                  <Input value={cfg.address.postalCode} onChange={(e) => set('address', { postalCode: e.target.value })} placeholder="110001" />
                </Field>
                <Field label="Country">
                  <Select value={cfg.address.country} onValueChange={(v) => set('address', { country: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Google Maps Link" hint="Shown as a 'View on map' link on the contact page">
                <Input value={cfg.address.mapUrl} onChange={(e) => set('address', { mapUrl: e.target.value })} placeholder="https://maps.google.com/…" />
              </Field>
              {addressPreview && (
                <p className="text-xs text-muted-foreground">
                  Preview: <span className="text-foreground">{addressPreview}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Regional / Commerce ── */}
        <TabsContent value="regional">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Base Country" hint="Where the business is registered / operates">
                  <Select value={cfg.regional.baseCountry} onValueChange={(v) => set('regional', { baseCountry: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default Currency">
                  <Select value={cfg.regional.currency} onValueChange={(v) => set('regional', { currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.symbol} — {c.code} ({c.name})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div>
                <Label className="mb-2 block">Countries you sell / ship to</Label>
                <p className="text-xs text-muted-foreground mb-3">Enables the country list at checkout. Select all that apply.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COUNTRIES.map((c) => {
                    const on = cfg.regional.operatingCountries.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleOperating(c.code)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                          on ? 'border-primary bg-primary/5 text-foreground' : 'border-gray-200 text-muted-foreground hover:bg-muted'
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

              <div>
                <Label className="mb-2 block">Accepted currencies</Label>
                <div className="flex flex-wrap gap-2">
                  {CURRENCIES.map((c) => {
                    const on = cfg.regional.supportedCurrencies.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCurrency(c.code)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-200 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {c.symbol} {c.code}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Timezone">
                  <Select value={cfg.regional.timezone} onValueChange={(v) => set('regional', { timezone: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default Language">
                  <Select value={cfg.regional.language} onValueChange={(v) => set('regional', { language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Weight Unit">
                  <Select value={cfg.regional.weightUnit} onValueChange={(v) => set('regional', { weightUnit: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilogram (kg)</SelectItem>
                      <SelectItem value="g">Gram (g)</SelectItem>
                      <SelectItem value="lb">Pound (lb)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Dimension Unit">
                  <Select value={cfg.regional.dimensionUnit} onValueChange={(v) => set('regional', { dimensionUnit: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">Centimetre (cm)</SelectItem>
                      <SelectItem value="in">Inch (in)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Social ── */}
        <TabsContent value="social">
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Links shown in the storefront footer. Leave blank to hide an icon.</p>
              {(['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'pinterest'] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <div className="flex items-center gap-2">
                    <Input value={cfg.social[k]} onChange={(e) => set('social', { [k]: e.target.value } as any)} placeholder={`https://${k}.com/yourstore`} />
                    {cfg.social[k] && (
                      <a href={cfg.social[k]} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </Field>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Business hours ── */}
        <TabsContent value="hours">
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Displayed on the contact page.</p>
              <div className="space-y-2">
                {WEEKDAYS.map(({ key, label }) => {
                  const h = cfg.hours.find((x) => x.day === key)!;
                  return (
                    <div key={key} className="flex items-center gap-3 flex-wrap">
                      <span className="w-24 text-sm font-medium">{label}</span>
                      <Switch checked={!h.closed} onCheckedChange={(v) => setHour(key, { closed: !v })} />
                      {h.closed ? (
                        <span className="text-sm text-muted-foreground">Closed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input type="time" value={h.open} onChange={(e) => setHour(key, { open: e.target.value })} className="w-32" />
                          <span className="text-muted-foreground">—</span>
                          <Input type="time" value={h.close} onChange={(e) => setHour(key, { close: e.target.value })} className="w-32" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Field label="Note" hint="e.g. Closed on public holidays">
                <Input value={cfg.hoursNote} onChange={(e) => setCfg((c) => ({ ...c, hoursNote: e.target.value }))} placeholder="Closed on national holidays" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-3 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Saved as public store settings — the storefront reads these live.
          </span>
          <Button onClick={handleSave} disabled={saving} className="min-w-[130px] gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save changes</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Small labelled field wrapper ────────────────────────────────────────────
const Field: React.FC<{ label: string; hint?: string; required?: boolean; children: React.ReactNode }> = ({
  label, hint, required, children,
}) => (
  <div className="space-y-1.5">
    <Label className="text-sm">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default StoreConfiguration;
