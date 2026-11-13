import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Cable, Save, Mail, Facebook, CreditCard, MessageCircle, Bot, Loader2, BarChart3, Copy, Check, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

import api, { getApiBase } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useSettingsSection } from '../hooks/useSettingsSection';

const DEFAULT_FORM_DATA = {
  metaPixel: {
    useEnvVars: false,
    pixelId: '',
    accessToken: '',
    apiVersion: 'v18.0',
    isEnabled: false,
    // META-16 (EVT-05): Meta's test code while testing, business events and product level events (both on by default).
    testEventCode: '',
    businessEvents: true,
    productLevelEvents: true,
  },
  ga4: {
    useEnvVars: false,
    apiSecret: '',
    isEnabled: false,
  },
  razorpay: {
    useEnvVars: false,
    isEnabled: false,
    test: { keyId: '', keySecret: '', webhookSecret: '', keyIdSet: false, keySecretSet: false, webhookSecretSet: false },
    live: { keyId: '', keySecret: '', webhookSecret: '', keyIdSet: false, keySecretSet: false, webhookSecretSet: false },
  },
  gemini: {
    useEnvVars: false,
    apiKey: '',
    isEnabled: false,
    textModel: '',
    imageModel: '',
  },
  // OpenAI / ChatGPT — same encrypted-at-rest treatment as gemini (settingsSecrets.ts).
  openai: {
    useEnvVars: false,
    apiKey: '',
    isEnabled: false,
    textModel: '',
    imageModel: '',
  },
  // Which configured provider writes text / makes images (registry 10.8).
  aiPreferences: {
    textProvider: 'auto',
    imageProvider: 'auto',
  },
};

type FormData = typeof DEFAULT_FORM_DATA;

const ApiIntegrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [copied, setCopied] = useState<string | null>(null);
  // True when nothing below is saved but the server's own RAZORPAY_KEY_ID/
  // SECRET env vars are still quietly taking real payments — see the
  // `envFallbackActive` doc comment in routes/settings.ts GET /admin.
  const [razorpayEnvFallback, setRazorpayEnvFallback] = useState(false);
  // A failed load must not leave the defaults on screen to be saved: they would switch Razorpay, the pixel
  // and AI off over the store's real settings.
  const [loadFailed, setLoadFailed] = useState(false);
  const {
    formData, setFormData, loading, saving, reload, handleSubmit,
  } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse: (settings): FormData => {
      const next: FormData = {
        metaPixel: { ...DEFAULT_FORM_DATA.metaPixel },
        ga4: { ...DEFAULT_FORM_DATA.ga4 },
        razorpay: { ...DEFAULT_FORM_DATA.razorpay },
        gemini: { ...DEFAULT_FORM_DATA.gemini },
        openai: { ...DEFAULT_FORM_DATA.openai },
        aiPreferences: { ...DEFAULT_FORM_DATA.aiPreferences },
      };

      // metaPixel/ga4/whatsapp/gemini: spread the real settings object over the
      // defaults (not the other way — a trailing `...settings.x` spread after an
      // explicit `field: x || default` used to silently clobber that default the
      // instant the settings object existed at all, which is the normal case;
      // only mattered for a field genuinely never saved before, e.g. `useEnvVars`
      // on an old store config — then a controlled Checkbox would receive
      // `undefined` instead of `false`. Explicit `??` re-applied AFTER the spread
      // is what actually makes the default stick.
      if (settings.metaPixel) {
        next.metaPixel = {
          ...DEFAULT_FORM_DATA.metaPixel,
          ...settings.metaPixel,
          useEnvVars: settings.metaPixel.useEnvVars ?? false,
          accessToken: settings.metaPixel.accessTokenSet ? '••••••••' : '',
        };
      }

      if (settings.ga4) {
        next.ga4 = {
          ...DEFAULT_FORM_DATA.ga4,
          ...settings.ga4,
          useEnvVars: settings.ga4.useEnvVars ?? false,
          apiSecret: settings.ga4.apiSecretSet ? '••••••••' : '',
        };
      }

      if (settings.razorpay) {
        const rp = settings.razorpay;
        const modeView = (m: any) => ({
          keyId: m?.keyIdSet ? '••••••••' : '',
          keySecret: m?.keySecretSet ? '••••••••' : '',
          webhookSecret: m?.webhookSecretSet ? '••••••••' : '',
          keyIdSet: !!m?.keyIdSet,
          keySecretSet: !!m?.keySecretSet,
          webhookSecretSet: !!m?.webhookSecretSet,
        });
        next.razorpay = {
          useEnvVars: rp.useEnvVars || false,
          isEnabled: rp.isEnabled || false,
          test: modeView(rp.test),
          live: modeView(rp.live),
        };
      }

      if (settings.gemini) {
        next.gemini = {
          ...DEFAULT_FORM_DATA.gemini,
          ...settings.gemini,
          useEnvVars: settings.gemini.useEnvVars ?? false,
          apiKey: settings.gemini.apiKeySet ? '••••••••' : '',
          textModel: settings.gemini.textModel || '',
          imageModel: settings.gemini.imageModel || '',
        };
      }

      if (settings.openai) {
        next.openai = {
          ...DEFAULT_FORM_DATA.openai,
          ...settings.openai,
          useEnvVars: settings.openai.useEnvVars ?? false,
          apiKey: settings.openai.apiKeySet ? '••••••••' : '',
          textModel: settings.openai.textModel || '',
          imageModel: settings.openai.imageModel || '',
        };
      }

      if (settings.aiPreferences) {
        next.aiPreferences = { ...DEFAULT_FORM_DATA.aiPreferences, ...settings.aiPreferences };
      }

      return next;
    },
    onLoaded: (settings) => {
      setLoadFailed(false);
      setStoreSlug(settings.slug ?? null);
      setEnvironment(settings.environment === 'live' ? 'live' : 'test');
      if (settings.razorpay) setRazorpayEnvFallback(!!settings.razorpay.envFallbackActive);
    },
    onLoadError: () => setLoadFailed(true),
    submitter: async (data) => {
      // Only the fields this page edits: a section read back from the server also carries what other screens
      // keep in it (the Meta app's `pixelSetup`, the SEO page's GA4 measurement id), and sending those back
      // through the registry made every save report them as "not saved".
      const secretOut = (v: string) => (v && !v.startsWith('••••') ? v : undefined);
      const submitData: any = {
        metaPixel: {
          isEnabled: data.metaPixel.isEnabled,
          useEnvVars: data.metaPixel.useEnvVars,
          pixelId: data.metaPixel.pixelId,
          accessToken: secretOut(data.metaPixel.accessToken),
          testEventCode: data.metaPixel.testEventCode,
          businessEvents: data.metaPixel.businessEvents,
          productLevelEvents: data.metaPixel.productLevelEvents,
        },
        ga4: {
          isEnabled: data.ga4.isEnabled,
          useEnvVars: data.ga4.useEnvVars,
          apiSecret: secretOut(data.ga4.apiSecret),
        },
        razorpay: {
          isEnabled: data.razorpay.isEnabled,
          useEnvVars: data.razorpay.useEnvVars,
          test: {
            keyId: data.razorpay.test.keyId && !data.razorpay.test.keyId.startsWith('••••') ? data.razorpay.test.keyId : undefined,
            keySecret: data.razorpay.test.keySecret && !data.razorpay.test.keySecret.startsWith('••••') ? data.razorpay.test.keySecret : undefined,
            webhookSecret: data.razorpay.test.webhookSecret && !data.razorpay.test.webhookSecret.startsWith('••••') ? data.razorpay.test.webhookSecret : undefined,
          },
          live: {
            keyId: data.razorpay.live.keyId && !data.razorpay.live.keyId.startsWith('••••') ? data.razorpay.live.keyId : undefined,
            keySecret: data.razorpay.live.keySecret && !data.razorpay.live.keySecret.startsWith('••••') ? data.razorpay.live.keySecret : undefined,
            webhookSecret: data.razorpay.live.webhookSecret && !data.razorpay.live.webhookSecret.startsWith('••••') ? data.razorpay.live.webhookSecret : undefined,
          },
        },
        gemini: {
          isEnabled: data.gemini.isEnabled,
          useEnvVars: data.gemini.useEnvVars,
          apiKey: secretOut(data.gemini.apiKey),
          textModel: data.gemini.textModel,
          imageModel: data.gemini.imageModel,
        },
        openai: {
          isEnabled: data.openai.isEnabled,
          useEnvVars: data.openai.useEnvVars,
          apiKey: secretOut(data.openai.apiKey),
          textModel: data.openai.textModel,
          imageModel: data.openai.imageModel,
        },
        aiPreferences: data.aiPreferences,
      };

      await api.put('/settings', submitData);
    },
    onSuccess: () => { reload(); },
    successMessage: 'Settings saved successfully!',
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

  const handleRazorpayModeChange = (mode: 'test' | 'live', field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      razorpay: {
        ...prev.razorpay,
        [mode]: { ...prev.razorpay[mode], [field]: value },
      },
    }));
  };

  // getApiBase() (services/api.ts) is the one place the absolute API base is
  // worked out; the webhook router is mounted alongside `/products`, `/orders`
  // etc, just under `/webhooks/payments`.
  const razorpayWebhookUrl = storeSlug
    ? `${getApiBase()}/webhooks/payments/razorpay/${storeSlug}`
    : '';

  const copyToClipboard = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch { /* clipboard blocked — the value is still visible to select manually */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10">
        <h1 className="text-2xl font-semibold text-foreground">API Integrations</h1>
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The store's keys could not be loaded, so nothing can be saved yet (saving now would switch them off). Try again.</span>
        </div>
        <Button type="button" variant="outline" onClick={() => reload()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">API Integrations</h1>
        <p className="text-sm text-muted-foreground mt-2">Keys for payments, the Meta pixel, Google Analytics and AI. Email and WhatsApp have their own pages, linked below.</p>
      </div>

      {/* The distributor ERP has its own section (it keeps store stock, not a key): point to it from here. */}
      <Link
        to="/panel/inventory/erp"
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        data-testid="settings-erp-link"
      >
        <Cable className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
        <span className="flex-1">
          <span className="font-medium text-gray-900">Distributor ERP</span>
          <span className="block text-xs text-gray-500">Connect your distributor's ERP, map its fields and see the hourly stock update: Inventory, ERP Sync.</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </Link>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* SMTP and the WhatsApp gateway have one editor each, on the Messaging pages (with the test send and the
            template approval panel). This page kept a second copy of both, which v2 could not save. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link to="/messaging/email?tab=sender" className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
            <Mail className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span className="flex-1">
              <span className="font-medium text-gray-900">Email sender and SMTP</span>
              <span className="block text-xs text-gray-500">Your own mail server (Test and Live), the from address, and a test send: Messaging, Email, Sender.</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          </Link>
          <Link to="/messaging/whatsapp?tab=connection" className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
            <MessageCircle className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
            <span className="flex-1">
              <span className="font-medium text-gray-900">WhatsApp connection</span>
              <span className="block text-xs text-gray-500">Gateway number and key, channel order and which templates Meta approved: Messaging, WhatsApp, Connection.</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          </Link>
        </div>

        {/* Meta Pixel Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Facebook className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Meta Pixel (Facebook)</CardTitle>
                <CardDescription>Configure Meta Conversion API tracking</CardDescription>
                <Link to="/panel/marketing/meta?tab=events" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Manage in Facebook and Instagram</Link>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.metaPixel.useEnvVars}
                  onCheckedChange={(checked) => handleChange('metaPixel', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.metaPixel.isEnabled}
                  onCheckedChange={(checked) => handleChange('metaPixel', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.metaPixel.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> Meta Pixel configuration will be read from .env file (META_PIXEL_ID, META_ACCESS_TOKEN, META_API_VERSION)
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.metaPixel.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Pixel ID</label>
                <Input
                  type="text"
                  value={formData.metaPixel.pixelId}
                  onChange={(e) => handleChange('metaPixel', 'pixelId', e.target.value)}
                  placeholder="123456789012345"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Access Token</label>
                <Input
                  type="password"
                  value={formData.metaPixel.accessToken}
                  onChange={(e) => handleChange('metaPixel', 'accessToken', e.target.value)}
                  placeholder={formData.metaPixel.accessToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter access token'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Version</label>
                <Input
                  type="text"
                  value={formData.metaPixel.apiVersion}
                  onChange={(e) => handleChange('metaPixel', 'apiVersion', e.target.value)}
                  placeholder="v18.0"
                />
              </div>
              {/* META-15B (EVT-05, EVT-08): the test code and the two switches META-16 reads; the same fields as Events health. */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="mp-test-code">Test event code</label>
                <Input
                  id="mp-test-code"
                  type="text"
                  value={formData.metaPixel.testEventCode ?? ''}
                  onChange={(e) => handleChange('metaPixel', 'testEventCode', e.target.value.trim())}
                  placeholder="TEST12345"
                />
                <p className="text-xs text-muted-foreground">From Events Manager, Test events. While set, server events go only to Test Events; clear it when you are done.</p>
              </div>
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.metaPixel.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.metaPixel.businessEvents !== false}
                  onCheckedChange={(checked) => handleChange('metaPixel', 'businessEvents', checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium">Business events</span>
                  <span className="block text-xs text-muted-foreground">Delivered, returned to origin, COD confirmed, staff placed and WhatsApp orders, sent to Meta as their own events.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.metaPixel.productLevelEvents !== false}
                  onCheckedChange={(checked) => handleChange('metaPixel', 'productLevelEvents', checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium">Product level events</span>
                  <span className="block text-xs text-muted-foreground">Each event names the products (SKUs) in it, so catalog ads learn what sells. Off: only the value and currency.</span>
                </span>
              </label>
            </div>
            <Link to="/panel/marketing/meta/events" className="inline-block text-xs font-medium text-primary hover:underline">See what Meta received in Events health</Link>
          </CardContent>
        </Card>

        {/* GA4 Server-Side Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <CardTitle>Google Analytics 4 (Server-Side)</CardTitle>
                <CardDescription>Measurement Protocol, server-confirmed purchase events, ad-blocker resistant</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.ga4.useEnvVars}
                  onCheckedChange={(checked) => handleChange('ga4', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.ga4.isEnabled}
                  onCheckedChange={(checked) => handleChange('ga4', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.ga4.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> GA4 Measurement Protocol will be read from .env file (GA4_MEASUREMENT_ID, GA4_API_SECRET)
                </p>
              </div>
            )}
            <div className={`p-4 bg-muted/50 border border-border rounded-lg mb-2 ${formData.ga4.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <p className="text-sm text-muted-foreground">
                The Measurement ID is the same <code>G-XXXXXXXXXX</code> configured under
                SEO &amp; Analytics, only the API Secret (server-only) lives here.
              </p>
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.ga4.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Secret</label>
                <Input
                  type="password"
                  value={formData.ga4.apiSecret}
                  onChange={(e) => handleChange('ga4', 'apiSecret', e.target.value)}
                  placeholder={formData.ga4.apiSecret.startsWith('••••') ? 'Leave blank to keep current' : 'Analytics, Admin, Data Streams, Measurement Protocol API secrets'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Razorpay API Settings — the ONLY place Razorpay is configured now
            (moved off Payment Gateway Settings, which used to have its own
            duplicate copy of these same two fields, see that page). */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Razorpay</CardTitle>
                <CardDescription>Payment keys, webhook, enable/disable, the ONE place for Razorpay</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                Store is in {environment === 'live' ? 'LIVE' : 'TEST'} mode
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.razorpay.useEnvVars}
                  onCheckedChange={(checked) => handleChange('razorpay', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.razorpay.isEnabled}
                  onCheckedChange={(checked) => handleChange('razorpay', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.razorpay.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> Razorpay configuration will be read from .env file (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
                </p>
              </div>
            )}

            {!formData.razorpay.useEnvVars && razorpayEnvFallback && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-900">
                  <strong>Nothing below is saved, but checkout is working.</strong> Razorpay is
                  currently taking real payments through the server's own default account
                  (its RAZORPAY_KEY_ID/SECRET), because nothing store-specific is saved here yet
                  and "Enabled" above is off. That is not a bug, just invisible from this
                  page. Save your OWN Live Key ID/Secret below and turn "Enabled" on to switch
                  checkout to your store's Razorpay account instead of the shared default.
                  The Webhook Secret field below works independently of this, save it any time
                  to start verifying webhook deliveries, even before you move off the default key.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The mode above is set by the platform (super admin), not here. Fill in whichever
              pair matches it, the other stays saved and ready for when the platform switches
              your store's mode, so you never have to re-enter keys.
            </p>

            <div className={formData.razorpay.useEnvVars ? 'opacity-50 pointer-events-none' : ''}>
              {(['live', 'test'] as const).map((mode) => (
                <div key={mode} className="rounded-lg border p-4 space-y-4 bg-muted/30 mb-4 last:mb-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide">{mode} keys</p>
                    {mode === environment && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">ACTIVE MODE</span>
                    )}
                    {formData.razorpay[mode].keyIdSet && formData.razorpay[mode].keySecretSet ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Key configured</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not configured</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Key ID</label>
                      <Input
                        type="text"
                        value={formData.razorpay[mode].keyId}
                        onChange={(e) => handleRazorpayModeChange(mode, 'keyId', e.target.value)}
                        placeholder={formData.razorpay[mode].keyId.startsWith('••••') ? 'Leave blank to keep current' : `Enter ${mode} Key ID`}
                        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                        data-1p-ignore data-lpignore="true" name={`razorpay-${mode}-key-id-no-autofill`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Key Secret</label>
                      <Input
                        type="password"
                        value={formData.razorpay[mode].keySecret}
                        onChange={(e) => handleRazorpayModeChange(mode, 'keySecret', e.target.value)}
                        placeholder={formData.razorpay[mode].keySecret.startsWith('••••') ? 'Leave blank to keep current' : `Enter ${mode} Key Secret`}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">Webhook Secret</label>
                      <Input
                        type="password"
                        value={formData.razorpay[mode].webhookSecret}
                        onChange={(e) => handleRazorpayModeChange(mode, 'webhookSecret', e.target.value)}
                        placeholder={formData.razorpay[mode].webhookSecret.startsWith('••••') ? 'Leave blank to keep current' : 'From Razorpay Dashboard, Settings, Webhooks'}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {formData.razorpay[mode].webhookSecretSet
                          ? 'A webhook secret is saved for this mode, Razorpay pushes (payment success, failure, refunds) are verified against it.'
                          : `Not set: payments will only update your order after the customer's browser calls back. If they close the tab before that, the order can be stuck as unpaid until you set this.`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <p className="text-sm font-semibold">Webhook URL: register in Razorpay Dashboard, Settings, Webhooks</p>
              <p className="text-[11px] text-muted-foreground">
                Same URL for both modes, Razorpay Dashboard has its own Test/Live toggle; switch it there,
                paste this URL, and set the matching Webhook Secret above. Subscribe to at least: <code>payment.captured</code>,
                {' '}<code>order.paid</code>, <code>payment.failed</code>, <code>refund.processed</code>.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={razorpayWebhookUrl || 'Save your store once to reveal your webhook URL'}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" size="sm" disabled={!razorpayWebhookUrl} onClick={() => copyToClipboard(razorpayWebhookUrl, 'razorpay-webhook-url')}>
                  {copied === 'razorpay-webhook-url' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copied === 'razorpay-webhook-url' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gemini Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>Google Gemini AI</CardTitle>
                <CardDescription>Configure Gemini API for AI-powered features</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.gemini.useEnvVars}
                  onCheckedChange={(checked) => handleChange('gemini', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.gemini.isEnabled}
                  onCheckedChange={(checked) => handleChange('gemini', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.gemini.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> Gemini API key will be read from .env file (GEMINI_API_KEY)
                </p>
              </div>
            )}

            <div className={`space-y-2 md:w-1/2 ${formData.gemini.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="text-sm font-medium text-foreground">API Key</label>
              <Input
                type="password"
                value={formData.gemini.apiKey}
                onChange={(e) => handleChange('gemini', 'apiKey', e.target.value)}
                placeholder={formData.gemini.apiKey.startsWith('••••') ? 'Leave blank to keep current' : 'Enter Gemini API key'}
              />
              <p className="text-[10px] text-muted-foreground">
                Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Text model (optional)</label>
                <Input value={formData.gemini.textModel} onChange={(e) => handleChange('gemini', 'textModel', e.target.value)} placeholder="Platform default" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Image model (optional)</label>
                <Input value={formData.gemini.imageModel} onChange={(e) => handleChange('gemini', 'imageModel', e.target.value)} placeholder="Platform default" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OpenAI / ChatGPT */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <CardTitle>OpenAI (ChatGPT)</CardTitle>
                <CardDescription>GPT models for product copy and gpt-image for pictures, alongside or instead of Gemini</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={formData.openai.useEnvVars} onCheckedChange={(checked) => handleChange('openai', 'useEnvVars', checked as boolean)} />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={formData.openai.isEnabled} onCheckedChange={(checked) => handleChange('openai', 'isEnabled', checked as boolean)} />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.openai.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800"><strong>Using Environment Variables:</strong> the key is read from the server (OPENAI_API_KEY)</p>
              </div>
            )}
            <div className={formData.openai.useEnvVars ? 'space-y-2 md:w-1/2 opacity-50 pointer-events-none' : 'space-y-2 md:w-1/2'}>
              <label className="text-sm font-medium text-foreground">API Key</label>
              <Input type="password" value={formData.openai.apiKey} onChange={(e) => handleChange('openai', 'apiKey', e.target.value)}
                placeholder={formData.openai.apiKey.startsWith('••••') ? 'Leave blank to keep current' : 'sk-…'} />
              <p className="text-[10px] text-muted-foreground">Create a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a>. Stored encrypted; never shown again.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Text model (optional)</label>
                <Input value={formData.openai.textModel} onChange={(e) => handleChange('openai', 'textModel', e.target.value)} placeholder="gpt-4.1-mini" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Image model (optional)</label>
                <Input value={formData.openai.imageModel} onChange={(e) => handleChange('openai', 'imageModel', e.target.value)} placeholder="gpt-image-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Which provider does what */}
        <Card>
          <CardHeader>
            <CardTitle>AI provider preferences</CardTitle>
            <CardDescription>Which switched-on provider writes text and which makes images. Automatic uses Gemini first for text and OpenAI first for images.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {(['textProvider', 'imageProvider'] as const).map((k) => (
              <div key={k} className="space-y-2">
                <label className="text-sm font-medium text-foreground">{k === 'textProvider' ? 'Text (descriptions, SEO, FAQs)' : 'Images (banners, product scenes)'}</label>
                <select className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background" value={formData.aiPreferences[k]} onChange={(e) => handleChange('aiPreferences', k, e.target.value)}>
                  <option value="auto">Automatic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                </select>
              </div>
            ))}
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
    </div>
  );
};

export default ApiIntegrationSettings;
