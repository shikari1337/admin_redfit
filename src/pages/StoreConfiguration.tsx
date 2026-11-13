import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { getStoreTimeZone } from '../utils/date';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Phone, MapPin, Globe, Share2, Clock,
  Loader2, Check, AlertCircle, Sparkles, ExternalLink, RefreshCw, X,
} from 'lucide-react';
import {
  StoreConfig, EMPTY_STORE_CONFIG, loadStoreConfig, storeConfigSavePayload,
  CURRENCIES, LANGUAGES, INDIAN_STATE_OPTIONS, WEEKDAYS,
} from '@/lib/storeConfig';
import { useCountries, useCurrencies, useLanguages, useSubdivisions } from '@/lib/v2/reference';

type Section = keyof StoreConfig;
type TabId = 'business' | 'contact' | 'address' | 'regional' | 'social' | 'hours';

/** The social links the storefront footer draws an icon for (StoreSettingsContext `storeConfig.social`). */
const SOCIAL_FIELDS: Array<{ key: keyof StoreConfig['social']; label: string }> = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'X (Twitter)' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'pinterest', label: 'Pinterest' },
];

/**
 * Store Configuration: who the store is, as the website footer, the contact page, invoices and e-mails show it.
 *
 * Saved as the `storeConfig` setting (Settings Center 1.1) plus the older `general`, `contact` and `logo`
 * mirrors some readers still use (`storeConfigSavePayload`). On v2 the bulk save goes through the registry's
 * own write, one setting at a time (`lib/v2/areas/settings.ts`, `settingsRegistryWrite.ts`). Pickers read
 * the backend reference registry (every country, currency, language and state); the timezone is the
 * platform's, shown read-only.
 */
const StoreConfiguration: React.FC = () => {
  const COUNTRIES = useCountries();
  const currencies = useCurrencies(CURRENCIES);
  const languages = useLanguages(LANGUAGES);
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<TabId>('business');

  const { formData: cfg, setFormData: setCfg, loading, saving, reload, handleSubmit: saveConfig } = useSettingsSection<StoreConfig>({
    defaults: EMPTY_STORE_CONFIG,
    // The axios interceptor already unwraps {success,data}, so the default
    // fetcher's `response.data` IS the settings object here.
    parse: loadStoreConfig,
    onLoaded: () => setLoadFailed(false),
    // Saving after a failed load would write empty fields over the store's real details: block it.
    onLoadError: () => setLoadFailed(true),
    submitter: async (data) => {
      const payload = storeConfigSavePayload({ ...data, setupCompleted: true });
      await api.post('/settings/bulk', { settings: payload });
      setCfg((c) => ({ ...c, setupCompleted: true }));
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => setError(err?.response?.data?.message || err?.message || 'The configuration was not saved.'),
  });

  const states = useSubdivisions(cfg.address.country, cfg.address.country === 'IN' ? INDIAN_STATE_OPTIONS : []);

  const handleSave = () => {
    if (loadFailed) return;
    setSaved(false);
    setError(null);
    saveConfig();
  };

  const set = <S extends Section>(section: S, patch: Partial<StoreConfig[S]>) =>
    setCfg((c) => ({ ...c, [section]: { ...(c[section] as any), ...patch } }));

  const setOperating = (next: string[]) =>
    setCfg((c) => ({ ...c, regional: { ...c.regional, operatingCountries: next.length ? next : [c.regional.baseCountry || 'IN'] } }));

  const setAccepted = (next: string[]) =>
    setCfg((c) => ({ ...c, regional: { ...c.regional, supportedCurrencies: next.length ? next : [c.regional.currency] } }));

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

  /** What a shopper or an invoice would miss today, in the order to fix it. */
  const missing = useMemo(() => {
    const out: Array<{ label: string; tab: TabId }> = [];
    if (!cfg.business.name.trim()) out.push({ label: 'Store name', tab: 'business' });
    if (!cfg.contact.email.trim()) out.push({ label: 'Support email', tab: 'contact' });
    if (!cfg.contact.phone.trim() && !cfg.contact.whatsapp.trim()) out.push({ label: 'Phone or WhatsApp', tab: 'contact' });
    if (!cfg.address.line1.trim() || !cfg.address.city.trim() || !cfg.address.postalCode.trim()) out.push({ label: 'Address', tab: 'address' });
    if (cfg.address.country === 'IN' && !cfg.address.state) out.push({ label: 'State', tab: 'address' });
    return out;
  }, [cfg]);

  const countryLabel = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
  const currencyLabel = (code: string) => {
    const c = currencies.find((x) => x.code === code);
    return c ? `${c.symbol} ${c.code}` : code;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10">
        <h1 className="text-2xl font-semibold text-foreground">Store Configuration</h1>
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The store's details could not be loaded, so nothing can be saved yet (saving now would blank them). Try again.</span>
        </div>
        <Button variant="outline" onClick={() => reload()} className="gap-2"><RefreshCw className="h-4 w-4" /> Try again</Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Store Configuration</h1>
            {cfg.setupCompleted
              ? <Badge className="border-green-200 bg-green-500/15 text-green-700">Configured</Badge>
              : <Badge className="border-amber-200 bg-amber-500/15 text-amber-700">Incomplete</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Who you are, as the website footer, the contact page, invoices and checkout show it.
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

      {/* What to act on first: details a shopper or an invoice would miss. */}
      {missing.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Still missing:</span>
          {missing.map((m) => (
            <button key={m.label} type="button" onClick={() => setTab(m.tab)}
              className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100">
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* The rest of the store's identity lives on two other screens, and people looked for it here first. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink-soft">
        <span>Also part of who you are:</span>
        <Link to="/settings/invoice" className="underline hover:text-ink" title="CIN and licences are kept with the invoice settings">
          Invoice: GSTIN, CIN, FSSAI and drug licences printed on every bill
        </Link>
        <Link to="/products/companies" className="underline hover:text-ink">
          Companies: the legal entities behind your brands
        </Link>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <Check className="h-4 w-4" /> Configuration saved. The website shows it on its next load.
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="business" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Business</TabsTrigger>
          <TabsTrigger value="contact" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Contact</TabsTrigger>
          <TabsTrigger value="address" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</TabsTrigger>
          <TabsTrigger value="regional" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Regional</TabsTrigger>
          <TabsTrigger value="social" className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Social</TabsTrigger>
          <TabsTrigger value="hours" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Hours</TabsTrigger>
        </TabsList>

        {/* Business */}
        <TabsContent value="business">
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Store / Brand Name" required>
                  <Input value={cfg.business.name} onChange={(e) => set('business', { name: e.target.value })} placeholder="Your store" />
                </Field>
                <Field label="Legal Entity Name" hint="Shown on invoices and policies">
                  <Input value={cfg.business.legalName} onChange={(e) => set('business', { legalName: e.target.value })} placeholder="Registered company name" />
                </Field>
              </div>
              <Field label="Tagline" hint="Shown in the website footer">
                <Input value={cfg.business.tagline} onChange={(e) => set('business', { tagline: e.target.value })} placeholder="A few words about the store" />
              </Field>
              <Field label="Description" hint="Short paragraph shown in the website footer">
                <Textarea rows={3} value={cfg.business.description} onChange={(e) => set('business', { description: e.target.value })}
                  placeholder="What you sell and why people buy from you." />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Website URL">
                  <Input value={cfg.business.websiteUrl} onChange={(e) => set('business', { websiteUrl: e.target.value })} placeholder="https://yourstore.in" />
                </Field>
                <Field label="Logo URL" hint="Upload in Gallery and paste the address, or set it in Appearance, Style.">
                  <Input value={cfg.business.logoUrl} onChange={(e) => set('business', { logoUrl: e.target.value })} placeholder="https://…/logo.png" />
                </Field>
              </div>
              <Field label="Favicon URL">
                <Input value={cfg.business.faviconUrl} onChange={(e) => set('business', { faviconUrl: e.target.value })} placeholder="https://…/favicon.ico" />
              </Field>
              {cfg.business.logoUrl && (
                <img src={cfg.business.logoUrl} alt="logo preview" className="h-12 rounded border bg-white object-contain p-1" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact */}
        <TabsContent value="contact">
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Support Email" required>
                  <Input type="email" value={cfg.contact.email} onChange={(e) => set('contact', { email: e.target.value })} placeholder="support@yourstore.in" />
                </Field>
                <Field label="Sales Email" hint="Optional, for wholesale and bulk enquiries">
                  <Input type="email" value={cfg.contact.salesEmail} onChange={(e) => set('contact', { salesEmail: e.target.value })} placeholder="sales@yourstore.in" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                What shoppers send from the website reaches
                <Link to="/settings/contact" className="mx-1 font-medium underline">Contact Submissions</Link>
                and
                <Link to="/leads" className="mx-1 font-medium underline">CRM leads</Link>.
                This screen only sets the details shown to shoppers.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Address */}
        <TabsContent value="address">
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <Field label="Address Line 1">
                <Input value={cfg.address.line1} onChange={(e) => set('address', { line1: e.target.value })} placeholder="Building, street" />
              </Field>
              <Field label="Address Line 2">
                <Input value={cfg.address.line2} onChange={(e) => set('address', { line2: e.target.value })} placeholder="Area, landmark" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="City">
                  <Input value={cfg.address.city} onChange={(e) => set('address', { city: e.target.value })} placeholder="City" />
                </Field>
                <Field label="State / Region">
                  {states.length > 0 ? (
                    <Select value={cfg.address.state || undefined} onValueChange={(v) => set('address', { state: v })}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        {states.map((st) => <SelectItem key={st.value} value={st.value}>{st.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={cfg.address.state} onChange={(e) => set('address', { state: e.target.value })} placeholder="State / Province" />
                  )}
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Postal / PIN Code">
                  <Input value={cfg.address.postalCode} onChange={(e) => set('address', { postalCode: e.target.value })} placeholder="110001" />
                </Field>
                <Field label="Country">
                  <Select value={cfg.address.country} onValueChange={(v) => set('address', { country: v, state: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Google Maps Link" hint="The contact page shows it as View on map">
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

        {/* Regional / Commerce */}
        <TabsContent value="regional">
          <Card>
            <CardContent className="space-y-6 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Base Country" hint="Where the business is registered">
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
                      {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} ({c.name})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <PickList
                label="Countries you sell and ship to"
                hint="The country list at checkout. Markets decide each country's currency and tax treatment."
                selected={cfg.regional.operatingCountries}
                options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                labelOf={countryLabel}
                addLabel="Add a country"
                onChange={setOperating}
              />

              <PickList
                label="Accepted currencies"
                selected={cfg.regional.supportedCurrencies}
                options={currencies.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code} (${c.name})` }))}
                labelOf={currencyLabel}
                addLabel="Add a currency"
                onChange={setAccepted}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/*
                  * Read-only on purpose. The timezone that decides where a business day starts (reports, GST
                  * periods, coupon validity, every date this panel renders) lives on the PLATFORM store record.
                  * A second, editable copy under storeConfig was written and read by nothing.
                  */}
                <Field label="Timezone">
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                    {getStoreTimeZone()}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every report, invoice date and business day on this store uses this timezone.
                    Ask your platform administrator to change it.
                  </p>
                </Field>
                <Field label="Default Language">
                  <Select value={cfg.regional.language} onValueChange={(v) => set('regional', { language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        {/* Social */}
        <TabsContent value="social">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <p className="text-sm text-muted-foreground">Links shown in the website footer. Leave one blank to hide its icon.</p>
              {SOCIAL_FIELDS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <div className="flex items-center gap-2">
                    <Input value={cfg.social[key]} onChange={(e) => set('social', { [key]: e.target.value } as Partial<StoreConfig['social']>)} placeholder={`https://${key}.com/yourstore`} />
                    {cfg.social[key] && (
                      <a href={cfg.social[key]} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-primary" aria-label={`Open ${label}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </Field>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business hours */}
        <TabsContent value="hours">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <p className="text-sm text-muted-foreground">Shown on the website's contact page.</p>
              <div className="space-y-2">
                {WEEKDAYS.map(({ key, label }) => {
                  const h = cfg.hours.find((x) => x.day === key);
                  if (!h) return null;
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-3">
                      <span className="w-24 text-sm font-medium">{label}</span>
                      <Switch checked={!h.closed} onCheckedChange={(v) => setHour(key, { closed: !v })} aria-label={`${label} open`} />
                      {h.closed ? (
                        <span className="text-sm text-muted-foreground">Closed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input type="time" value={h.open} onChange={(e) => setHour(key, { open: e.target.value })} className="w-28 sm:w-32" aria-label={`${label} opens`} />
                          <span className="text-sm text-muted-foreground">to</span>
                          <Input type="time" value={h.close} onChange={(e) => setHour(key, { close: e.target.value })} className="w-28 sm:w-32" aria-label={`${label} closes`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Field label="Note" hint="For example: closed on public holidays">
                <Input value={cfg.hoursNote} onChange={(e) => setCfg((c) => ({ ...c, hoursNote: e.target.value }))} placeholder="Closed on national holidays" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Saved as public store settings. The website reads them live.
          </span>
          <Button onClick={handleSave} disabled={saving} className="ml-auto min-w-[130px] gap-2">
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

/**
 * A chosen-few list over a long reference list (every country, every currency): what is chosen shows as
 * chips, the rest is one picker away. Drawing all 250 countries as buttons did not fit a phone.
 */
const PickList: React.FC<{
  label: string;
  hint?: string;
  selected: string[];
  options: Array<{ value: string; label: string }>;
  labelOf: (value: string) => string;
  addLabel: string;
  onChange: (next: string[]) => void;
}> = ({ label, hint, selected, options, labelOf, addLabel, onChange }) => {
  const rest = options.filter((o) => !selected.includes(o.value));
  return (
    <div>
      <Label className="mb-1 block">{label}</Label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/5 px-2.5 py-1 text-xs font-medium text-foreground">
            {labelOf(v)}
            {selected.length > 1 && (
              <button type="button" onClick={() => onChange(selected.filter((x) => x !== v))} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${labelOf(v)}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {rest.length > 0 && (
          <Select value="" onValueChange={(v) => v && onChange([...selected, v])}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-56"><SelectValue placeholder={addLabel} /></SelectTrigger>
            <SelectContent>
              {rest.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
};

export default StoreConfiguration;
