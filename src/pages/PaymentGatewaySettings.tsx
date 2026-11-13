/**
 * Settings, Payment Gateways: the ways a shopper can pay online, as checkout offers them.
 *
 * Saved through `PUT /settings` (the registry write, lib/v2/areas/settingsRegistryWrite.ts) into the
 * `upi` and `manualPayment` settings that growcord-rs checkout reads (`GET /api/v2/checkout/gateways`,
 * `POST /payments/{id}/upi-link`). What this page shows as "on" is what checkout offers: UPI only with
 * a UPI id AND a payee name (the pay link needs both), bank transfer only when switched on. Razorpay
 * keys live on API Integrations and PayPal in the Settings Center; this page shows whether they are on.
 * The usual UPI app buttons are the registry's `suggested` list (settings_registry.rs `upi.apps`),
 * with a copy here only as the fallback when the registry cannot be read.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, CreditCard, Smartphone, HandCoins, Loader2, ArrowUpRight, Globe, Plus, Trash2, RotateCcw, X } from 'lucide-react';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/erp';
import { useSettingsSection } from '../hooks/useSettingsSection';

interface UpiApp { name: string; urlTemplate: string; enabled: boolean; icon?: string }

/** Fallback only: the registry's `upi.apps` `suggested` list is the source (see the header). */
const FALLBACK_UPI_APPS: UpiApp[] = [
  { name: 'PhonePe', urlTemplate: 'phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Google Pay', urlTemplate: 'tez://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Paytm', urlTemplate: 'paytmmp://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'BHIM', urlTemplate: 'bhim://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
  { name: 'Amazon Pay', urlTemplate: 'amazonpay://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}', enabled: true },
];
const MAX_APPS = 12;

interface FormData {
  upi: { isEnabled: boolean; upiId: string; payeeName: string; apps: UpiApp[] };
  manualPayment: { isEnabled: boolean; instructions: string; accountDetails: string };
}

const DEFAULT_FORM_DATA: FormData = {
  upi: { isEnabled: false, upiId: '', payeeName: '', apps: [] },
  manualPayment: { isEnabled: false, instructions: '', accountDetails: '' },
};

/** What the store has switched on elsewhere, read with the same settings. */
interface Elsewhere { razorpay: boolean; paypal: boolean }

/** A UPI id: name@handle (the server checks the same, commerce upi_settings.rs). */
const VPA = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;
/** Schemes that run script: never an app link (kernel sanitize `SCRIPT_SCHEMES`). */
const SCRIPT_SCHEME = /^\s*(javascript|vbscript|data|file|blob|about|filesystem):/i;
const hasScheme = (t: string) => /^[a-z][a-z0-9+.-]*:/i.test(t.trim());

const appsOf = (raw: unknown): UpiApp[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((a: any) => a && typeof a === 'object')
    .map((a: any) => ({
      name: String(a.name ?? ''),
      urlTemplate: String(a.urlTemplate ?? a.url_template ?? ''),
      enabled: a.enabled !== false,
      ...(a.icon || a.iconUrl ? { icon: String(a.icon ?? a.iconUrl) } : {}),
    }));

const parse = (settings: any): FormData => {
  const u = settings?.upi ?? settings?.upi_settings ?? null;
  const m = settings?.manualPayment ?? null;
  return {
    upi: {
      isEnabled: u?.isEnabled === true || u?.is_enabled === true,
      upiId: String(u?.upiId ?? u?.upi_id ?? ''),
      payeeName: String(u?.payeeName ?? u?.payee_name ?? ''),
      apps: appsOf(u?.apps),
    },
    // Not set = off: checkout offers bank transfer only when it is switched on.
    manualPayment: {
      isEnabled: m?.isEnabled === true,
      instructions: String(m?.instructions ?? ''),
      accountDetails: String(m?.accountDetails ?? ''),
    },
  };
};

/** The problems a save would be refused for, in the words the owner reads. */
function problemsOf(f: FormData): string[] {
  const out: string[] = [];
  const id = f.upi.upiId.trim();
  if (id && !VPA.test(id)) out.push('The UPI id is written as name@bank, like store@okaxis.');
  if (f.upi.isEnabled && (!id || !f.upi.payeeName.trim())) out.push('UPI needs a UPI id and a payee name before it can be switched on.');
  if (f.upi.apps.length > MAX_APPS) out.push(`At most ${MAX_APPS} UPI app buttons.`);
  f.upi.apps.forEach((a, i) => {
    const n = a.name.trim() || `App ${i + 1}`;
    if (!a.name.trim()) out.push(`App ${i + 1} needs a name.`);
    const t = a.urlTemplate.trim();
    if (t && (SCRIPT_SCHEME.test(t) || !hasScheme(t))) out.push(`${n}: the link must open the app, like phonepe://pay?pa={upiId}&am={amount}.`);
  });
  if (f.manualPayment.isEnabled && !f.manualPayment.accountDetails.trim()) out.push('Bank transfer needs the account details the shopper pays into.');
  return out;
}

const errText = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || fallback;

const StatusRow: React.FC<{ label: string; on: boolean; hint: string; to?: string; toLabel?: string }> = ({ label, on, hint, to, toLabel }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Chip tone={on ? 'green' : 'neutral'}>{on ? 'Offered' : 'Not offered'}</Chip>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
    </div>
    {to && (
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        {toLabel} <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    )}
  </div>
);

const PaymentGatewaySettings: React.FC = () => {
  const navigate = useNavigate();
  const [elsewhere, setElsewhere] = useState<Elsewhere>({ razorpay: false, paypal: false });
  /** The form as last loaded or saved: what checkout offers right now. */
  const [saved, setSaved] = useState<FormData>(DEFAULT_FORM_DATA);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [addingUsual, setAddingUsual] = useState(false);

  const { formData, setFormData, loading, saving, reload, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse,
    onLoaded: (settings) => {
      setLoadError(null);
      setSaved(parse(settings));
      setElsewhere({ razorpay: settings?.razorpay?.isEnabled === true, paypal: settings?.paypal?.isEnabled === true });
    },
    onLoadError: (e) => setLoadError(errText(e, 'The payment settings could not be read.')),
    submitter: async (f) => {
      await api.put('/settings', {
        upi: {
          isEnabled: f.upi.isEnabled,
          upiId: f.upi.upiId.trim(),
          payeeName: f.upi.payeeName.trim(),
          apps: f.upi.apps.map((a) => ({ name: a.name.trim(), urlTemplate: a.urlTemplate.trim(), enabled: a.enabled, ...(a.icon ? { icon: a.icon } : {}) })),
        },
        manualPayment: {
          isEnabled: f.manualPayment.isEnabled,
          instructions: f.manualPayment.instructions.trim(),
          accountDetails: f.manualPayment.accountDetails.trim(),
        },
      });
    },
    onSuccess: () => { setSaveError(null); setNotice('Saved. Checkout offers these from now on.'); reload(); },
    onError: (e) => { setNotice(null); setSaveError(errText(e, 'The payment settings were not saved.')); },
  });

  const dirty = useMemo(() => JSON.stringify(formData) !== JSON.stringify(saved), [formData, saved]);

  const setUpi = (patch: Partial<FormData['upi']>) => { setNotice(null); setFormData((p) => ({ ...p, upi: { ...p.upi, ...patch } })); };
  const setManual = (patch: Partial<FormData['manualPayment']>) => { setNotice(null); setFormData((p) => ({ ...p, manualPayment: { ...p.manualPayment, ...patch } })); };
  const setApp = (i: number, patch: Partial<UpiApp>) => setUpi({ apps: formData.upi.apps.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  /** The registry's usual set (store data), else the fallback above. Adds only the ones not listed yet. */
  const addUsualApps = async () => {
    setAddingUsual(true);
    let usual = FALLBACK_UPI_APPS;
    try {
      const r = await api.get('/settings/registry');
      const defs: any[] = (r.data as any)?.definitions ?? [];
      const field = defs.find((d) => d?.key === 'upi')?.fields?.find((x: any) => x?.path === 'apps');
      const listed = appsOf(field?.suggested);
      if (listed.length) usual = listed;
    } catch { /* the fallback stands */ }
    const have = new Set(formData.upi.apps.map((a) => a.name.trim().toLowerCase()));
    setUpi({ apps: [...formData.upi.apps, ...usual.filter((a) => !have.has(a.name.trim().toLowerCase()))].slice(0, MAX_APPS) });
    setAddingUsual(false);
  };

  const onSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = problemsOf(formData);
    setProblems(p);
    if (p.length) { setNotice(null); return; }
    handleSubmit();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const upiReady = saved.upi.isEnabled && !!saved.upi.upiId.trim() && !!saved.upi.payeeName.trim();
  const nothingOnline = !elsewhere.razorpay && !elsewhere.paypal && !upiReady && !saved.manualPayment.isEnabled;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Payment Gateways</h1>
        <p className="text-sm text-muted-foreground mt-2">The ways a shopper can pay online at checkout. Cash on delivery and its fee are set under Shipping and Payment Methods &amp; Discounts.</p>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => reload()}>Try again</Button>
        </div>
      )}

      {/* What checkout offers right now (the saved values, not unsaved edits) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What shoppers can pick now</CardTitle>
          {nothingOnline && (
            <CardDescription className="text-amber-700">No online way to pay is on: shoppers can only choose cash on delivery, where it is allowed.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <StatusRow label="Razorpay" on={elsewhere.razorpay} hint="Cards, UPI, net banking and wallets, paid into your Razorpay account." to="/settings/api-integrations" toLabel="Keys" />
          <StatusRow label="PayPal" on={elsewhere.paypal} hint="Shoppers outside India, in markets that list PayPal." to="/settings?key=paypal" toLabel="Set up" />
          <StatusRow
            label="UPI to your own id"
            on={upiReady}
            hint={saved.upi.isEnabled && !upiReady ? 'Switched on, but it needs a UPI id and a payee name.' : 'QR code and app buttons; your team confirms each payment.'}
          />
          <StatusRow label="Bank transfer" on={saved.manualPayment.isEnabled} hint="The order waits until your team marks it paid." />
        </CardContent>
      </Card>

      <form onSubmit={onSave} className="space-y-6 pb-12">
        {/* Razorpay and PayPal: their keys live on their own pages */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Razorpay</p>
                  <p className="text-xs text-muted-foreground">Keys, webhook and the on/off switch are on API Integrations.</p>
                </div>
              </div>
              <Link to="/settings/api-integrations">
                <Button type="button" variant="outline" size="sm">Configure <ArrowUpRight className="ml-1.5 h-4 w-4" /></Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-sky-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">PayPal</p>
                  <p className="text-xs text-muted-foreground">Credentials in the Settings Center; which markets offer it under Markets.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to="/settings?key=paypal"><Button type="button" variant="outline" size="sm">Configure</Button></Link>
                <Link to="/settings/markets"><Button type="button" variant="ghost" size="sm">Markets</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* UPI to the store's own id */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <CardTitle>UPI to your own id</CardTitle>
                <CardDescription>No gateway fee. The shopper scans a QR code or taps an app, then sends proof; your team confirms the payment.</CardDescription>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={formData.upi.isEnabled} onCheckedChange={(c) => setUpi({ isEnabled: c })} aria-label="Offer UPI" />
              <span className="text-sm font-medium">{formData.upi.isEnabled ? 'On' : 'Off'}</span>
            </label>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="upi-id">UPI id</label>
                <Input id="upi-id" type="text" value={formData.upi.upiId} onChange={(e) => setUpi({ upiId: e.target.value })} placeholder="store@okaxis" autoComplete="off" />
                <p className="text-xs text-muted-foreground">The address the money is paid to.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="upi-payee">Payee name</label>
                <Input id="upi-payee" type="text" value={formData.upi.payeeName} maxLength={100} onChange={(e) => setUpi({ payeeName: e.target.value })} placeholder="Your business name" />
                <p className="text-xs text-muted-foreground">Shown in the shopper's UPI app when they pay.</p>
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">App buttons</h3>
                  <p className="text-xs text-muted-foreground">
                    One-tap buttons beside the QR code. A link may use {'{upiId}'}, {'{payeeName}'}, {'{amount}'} and {'{transactionNote}'}.
                    With no buttons, checkout shows one button that opens the phone's own UPI app chooser.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addUsualApps} disabled={addingUsual || formData.upi.apps.length >= MAX_APPS}>
                    {addingUsual ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}Add the usual apps
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setUpi({ apps: [...formData.upi.apps, { name: '', urlTemplate: '', enabled: true }] })} disabled={formData.upi.apps.length >= MAX_APPS}>
                    <Plus className="mr-1.5 h-4 w-4" />Add an app
                  </Button>
                </div>
              </div>
              {formData.upi.apps.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No app buttons yet.</p>
              ) : (
                <div className="space-y-3">
                  {formData.upi.apps.map((app, i) => (
                    <div key={i} className="rounded-lg border bg-muted/40 p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox checked={app.enabled} onCheckedChange={(c) => setApp(i, { enabled: c === true })} aria-label={`Show ${app.name || 'this app'}`} />
                          Shown
                        </label>
                        <Input value={app.name} maxLength={40} onChange={(e) => setApp(i, { name: e.target.value })} placeholder="App name, like PhonePe" className="h-9 flex-1 min-w-[10rem]" aria-label="App name" />
                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setUpi({ apps: formData.upi.apps.filter((_, j) => j !== i) })} aria-label={`Remove ${app.name || 'this app'}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input value={app.urlTemplate} onChange={(e) => setApp(i, { urlTemplate: e.target.value })} placeholder="phonepe://pay?pa={upiId}&pn={payeeName}&am={amount}&cu=INR&tn={transactionNote}" className="h-9 font-mono text-xs" aria-label="App link" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bank transfer */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <HandCoins className="w-6 h-6 text-purple-600" />
              </div>
              <div className="min-w-0">
                <CardTitle>Bank transfer</CardTitle>
                <CardDescription>NEFT, IMPS or RTGS into your account. The order waits until your team marks it paid.</CardDescription>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={formData.manualPayment.isEnabled} onCheckedChange={(c) => setManual({ isEnabled: c })} aria-label="Offer bank transfer" />
              <span className="text-sm font-medium">{formData.manualPayment.isEnabled ? 'On' : 'Off'}</span>
            </label>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="bank-instructions">How to pay</label>
              <Textarea id="bank-instructions" value={formData.manualPayment.instructions} onChange={(e) => setManual({ instructions: e.target.value })} placeholder="Transfer the order amount to the account below and quote your order number. We send your order once the payment reaches us." rows={3} />
              <p className="text-xs text-muted-foreground">Shown when the shopper picks bank transfer.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="bank-details">Account details</label>
              <Textarea id="bank-details" value={formData.manualPayment.accountDetails} onChange={(e) => setManual({ accountDetails: e.target.value })} placeholder={'Account name\nAccount number\nIFSC\nBank and branch'} rows={4} />
              <p className="text-xs text-muted-foreground">Account name, number, IFSC and bank, exactly as the shopper should type them.</p>
            </div>
          </CardContent>
        </Card>

        {problems.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-1" role="alert">
            <p className="font-medium">Not saved yet:</p>
            <ul className="list-disc pl-5 space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {saveError && (
          <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span>{saveError}</span>
            <button type="button" onClick={() => setSaveError(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-1 py-3">
          {notice && !dirty && <span className="text-sm text-emerald-700 mr-auto">{notice}</span>}
          {dirty && <span className="text-sm text-muted-foreground mr-auto">Unsaved changes</span>}
          <Button type="button" variant="outline" onClick={() => navigate('/settings')}>Cancel</Button>
          <Button type="submit" disabled={saving || !dirty} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PaymentGatewaySettings;
