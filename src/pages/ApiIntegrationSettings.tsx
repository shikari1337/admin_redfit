import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Mail, Facebook, CreditCard, MessageCircle, Bot, Loader2, BarChart3, Copy, Check, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

import api, { smsTemplatesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const ApiIntegrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [copied, setCopied] = useState<string | null>(null);
  // True when nothing below is saved but the server's own RAZORPAY_KEY_ID/
  // SECRET env vars are still quietly taking real payments — see the
  // `envFallbackActive` doc comment in routes/settings.ts GET /admin.
  const [razorpayEnvFallback, setRazorpayEnvFallback] = useState(false);
  // Live WhatsApp notification status — fetched directly from the Growcord
  // platform (not derived from what's typed in the form below), so this
  // reflects what will actually happen on the next real send.
  const [waStatus, setWaStatus] = useState<any | null>(null);
  const [waStatusLoading, setWaStatusLoading] = useState(false);
  const [waStatusError, setWaStatusError] = useState<string | null>(null);
  const [waEventsOpen, setWaEventsOpen] = useState(false);
  const [formData, setFormData] = useState({
    smtp: {
      useEnvVars: false,
      isEnabled: false,
      test: { host: '', port: 587, user: '', password: '', secure: false, requireTls: true, ignoreTls: false, fromEmail: '', adminEmail: '', passwordSet: false },
      live: { host: '', port: 587, user: '', password: '', secure: false, requireTls: true, ignoreTls: false, fromEmail: '', adminEmail: '', passwordSet: false },
    },
    metaPixel: {
      useEnvVars: false,
      pixelId: '',
      accessToken: '',
      apiVersion: 'v18.0',
      isEnabled: false,
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
    whatsapp: {
      useEnvVars: false,
      accessToken: '',
      phoneNumberId: '',
      businessAccountId: '',
      apiVersion: 'v21.0',
      apiUrl: '',
      accountSid: '',
      authToken: '',
      fromNumber: '',
      isEnabled: false,
      useMetaApi: true,
    },
    // In-house Growcord gateway — saved under the `whatsapp_settings` key that
    // services/messaging/whatsapp actually reads (separate from `whatsapp`).
    // TEST/LIVE pair, same convention as razorpay/smtp above.
    whatsapp_settings: {
      isEnabled: true,
      channelPriority: 'whatsapp_first',
      test: { apiUrl: '', apiKey: '', apiKeySet: false, phoneNumberId: '' },
      live: { apiUrl: '', apiKey: '', apiKeySet: false, phoneNumberId: '' },
    },
    gemini: {
      useEnvVars: false,
      apiKey: '',
      isEnabled: false,
    },
  });

  useEffect(() => {
    fetchSettings();
    loadWaStatus();
  }, []);

  const loadWaStatus = async (refresh = false) => {
    try {
      setWaStatusLoading(true);
      setWaStatusError(null);
      const res: any = await smsTemplatesAPI.whatsappLiveStatus(refresh);
      setWaStatus(res?.data ?? res);
    } catch (err: any) {
      setWaStatusError(err?.response?.data?.message || err?.message || 'Failed to check WhatsApp status');
    } finally {
      setWaStatusLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      const settings = response.data?.success && response.data?.data 
        ? response.data.data 
        : response.data?.data 
        ? response.data.data 
        : response.data;
      
      if (settings) {
        if (settings.smtp) {
          const modeView = (m: any) => ({
            host: m?.host || '', port: m?.port || 587, user: m?.user || '',
            secure: !!m?.secure, requireTls: m?.requireTls !== false, ignoreTls: !!m?.ignoreTls,
            fromEmail: m?.fromEmail || '', adminEmail: m?.adminEmail || '',
            password: m?.passwordSet ? '••••••••' : '', passwordSet: !!m?.passwordSet,
          });
          setFormData(prev => ({
            ...prev,
            smtp: {
              useEnvVars: settings.smtp.useEnvVars || false,
              isEnabled: settings.smtp.isEnabled || false,
              test: modeView(settings.smtp.test),
              live: modeView(settings.smtp.live),
            },
          }));
        }

        if (settings.metaPixel) {
          setFormData(prev => ({
            ...prev,
            metaPixel: {
              ...prev.metaPixel,
              useEnvVars: settings.metaPixel.useEnvVars || false,
              ...settings.metaPixel,
              accessToken: settings.metaPixel.accessTokenSet ? '••••••••' : '',
            },
          }));
        }

        if (settings.ga4) {
          setFormData(prev => ({
            ...prev,
            ga4: {
              ...prev.ga4,
              useEnvVars: settings.ga4.useEnvVars || false,
              ...settings.ga4,
              apiSecret: settings.ga4.apiSecretSet ? '••••••••' : '',
            },
          }));
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
          setFormData(prev => ({
            ...prev,
            razorpay: {
              useEnvVars: rp.useEnvVars || false,
              isEnabled: rp.isEnabled || false,
              test: modeView(rp.test),
              live: modeView(rp.live),
            },
          }));
          setRazorpayEnvFallback(!!rp.envFallbackActive);
        }
        setStoreSlug(settings.slug ?? null);
        setEnvironment(settings.environment === 'live' ? 'live' : 'test');

        if (settings.whatsapp) {
          setFormData(prev => ({
            ...prev,
            whatsapp: {
              ...prev.whatsapp,
              useEnvVars: settings.whatsapp.useEnvVars || false,
              ...settings.whatsapp,
              accessToken: settings.whatsapp.accessTokenSet ? '••••••••' : '',
              authToken: settings.whatsapp.authTokenSet ? '••••••••' : '',
            },
          }));
        }

        if (settings.whatsapp_settings) {
          const w = settings.whatsapp_settings;
          const modeView = (m: any) => ({
            apiUrl: m?.apiUrl || '', phoneNumberId: m?.phoneNumberId || '',
            // The server never returns the key itself, only `apiKeySet`.
            apiKey: m?.apiKeySet ? '••••••••' : '', apiKeySet: !!m?.apiKeySet,
          });
          setFormData(prev => ({
            ...prev,
            whatsapp_settings: {
              isEnabled: w.isEnabled !== false,
              channelPriority: w.channelPriority || 'whatsapp_first',
              test: modeView(w.test),
              live: modeView(w.live),
            },
          }));
        }

        if (settings.gemini) {
          setFormData(prev => ({
            ...prev,
            gemini: {
              ...prev.gemini,
              useEnvVars: settings.gemini.useEnvVars || false,
              ...settings.gemini,
              apiKey: settings.gemini.apiKeySet ? '••••••••' : '',
            },
          }));
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const modeOut = (m: any) => ({
        host: m.host, port: m.port, user: m.user, secure: m.secure,
        requireTls: m.requireTls, ignoreTls: m.ignoreTls, fromEmail: m.fromEmail, adminEmail: m.adminEmail,
        password: m.password && !m.password.startsWith('••••') ? m.password : undefined,
      });
      const submitData: any = {
        smtp: {
          isEnabled: formData.smtp.isEnabled,
          useEnvVars: formData.smtp.useEnvVars,
          test: modeOut(formData.smtp.test),
          live: modeOut(formData.smtp.live),
        },
        metaPixel: {
          ...formData.metaPixel,
          accessToken: formData.metaPixel.accessToken && !formData.metaPixel.accessToken.startsWith('••••') ? formData.metaPixel.accessToken : undefined,
        },
        ga4: {
          ...formData.ga4,
          apiSecret: formData.ga4.apiSecret && !formData.ga4.apiSecret.startsWith('••••') ? formData.ga4.apiSecret : undefined,
        },
        razorpay: {
          isEnabled: formData.razorpay.isEnabled,
          useEnvVars: formData.razorpay.useEnvVars,
          test: {
            keyId: formData.razorpay.test.keyId && !formData.razorpay.test.keyId.startsWith('••••') ? formData.razorpay.test.keyId : undefined,
            keySecret: formData.razorpay.test.keySecret && !formData.razorpay.test.keySecret.startsWith('••••') ? formData.razorpay.test.keySecret : undefined,
            webhookSecret: formData.razorpay.test.webhookSecret && !formData.razorpay.test.webhookSecret.startsWith('••••') ? formData.razorpay.test.webhookSecret : undefined,
          },
          live: {
            keyId: formData.razorpay.live.keyId && !formData.razorpay.live.keyId.startsWith('••••') ? formData.razorpay.live.keyId : undefined,
            keySecret: formData.razorpay.live.keySecret && !formData.razorpay.live.keySecret.startsWith('••••') ? formData.razorpay.live.keySecret : undefined,
            webhookSecret: formData.razorpay.live.webhookSecret && !formData.razorpay.live.webhookSecret.startsWith('••••') ? formData.razorpay.live.webhookSecret : undefined,
          },
        },
        whatsapp: {
          ...formData.whatsapp,
          accessToken: formData.whatsapp.accessToken && !formData.whatsapp.accessToken.startsWith('••••') ? formData.whatsapp.accessToken : undefined,
          authToken: formData.whatsapp.authToken && !formData.whatsapp.authToken.startsWith('••••') ? formData.whatsapp.authToken : undefined,
        },
        whatsapp_settings: {
          isEnabled: formData.whatsapp_settings.isEnabled,
          channelPriority: formData.whatsapp_settings.channelPriority,
          test: {
            apiUrl: formData.whatsapp_settings.test.apiUrl,
            phoneNumberId: formData.whatsapp_settings.test.phoneNumberId,
            apiKey: formData.whatsapp_settings.test.apiKey && !formData.whatsapp_settings.test.apiKey.startsWith('••••') ? formData.whatsapp_settings.test.apiKey : undefined,
          },
          live: {
            apiUrl: formData.whatsapp_settings.live.apiUrl,
            phoneNumberId: formData.whatsapp_settings.live.phoneNumberId,
            apiKey: formData.whatsapp_settings.live.apiKey && !formData.whatsapp_settings.live.apiKey.startsWith('••••') ? formData.whatsapp_settings.live.apiKey : undefined,
          },
        },
        gemini: {
          ...formData.gemini,
          apiKey: formData.gemini.apiKey && !formData.gemini.apiKey.startsWith('••••') ? formData.gemini.apiKey : undefined,
        },
      };

      await api.put('/settings', submitData);
      alert('Settings saved successfully!');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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

  const handleSmtpModeChange = (mode: 'test' | 'live', field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      smtp: {
        ...prev.smtp,
        [mode]: { ...prev.smtp[mode], [field]: value },
      },
    }));
  };

  const handleWhatsappSettingsModeChange = (mode: 'test' | 'live', field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      whatsapp_settings: {
        ...prev.whatsapp_settings,
        [mode]: { ...prev.whatsapp_settings[mode], [field]: value },
      },
    }));
  };

  // Same construction as ShippingSettings.tsx's Shiprocket webhook URL:
  // api.defaults.baseURL already carries `/api/v{N}` — the webhook router is
  // mounted alongside `/products`, `/orders`, etc, just under `/webhooks/payments`.
  const apiBase = (api.defaults.baseURL || '').replace(/\/$/, '');
  const razorpayWebhookUrl = storeSlug
    ? `${apiBase.startsWith('http') ? apiBase : window.location.origin + apiBase}/webhooks/payments/razorpay/${storeSlug}`
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">API & Integration Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Configure third-party API integrations</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* SMTP Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>SMTP Email Configuration</CardTitle>
                <CardDescription>Configure email sending via SMTP</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                Store is in {environment === 'live' ? 'LIVE' : 'TEST'} mode
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.smtp.useEnvVars}
                  onCheckedChange={(checked) => handleChange('smtp', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.smtp.isEnabled}
                  onCheckedChange={(checked) => handleChange('smtp', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.smtp.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> SMTP configuration will be read from .env file (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, etc.)
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The mode above is set by the platform (super admin), not here. Fill in whichever
              pair matches it — the other stays saved and ready for when the platform switches
              your store's mode.
            </p>

            <div className={formData.smtp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}>
              {(['live', 'test'] as const).map((mode) => (
                <div key={mode} className="rounded-lg border p-4 space-y-4 bg-muted/30 mb-4 last:mb-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide">{mode}</p>
                    {mode === environment && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">ACTIVE MODE</span>
                    )}
                    {formData.smtp[mode].host && formData.smtp[mode].passwordSet ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Configured</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not configured</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">SMTP Host</label>
                      <Input
                        type="text"
                        value={formData.smtp[mode].host}
                        onChange={(e) => handleSmtpModeChange(mode, 'host', e.target.value)}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">SMTP Port</label>
                      <Input
                        type="number"
                        value={formData.smtp[mode].port}
                        onChange={(e) => handleSmtpModeChange(mode, 'port', parseInt(e.target.value))}
                        placeholder="587"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">SMTP User</label>
                      <Input
                        type="text"
                        value={formData.smtp[mode].user}
                        onChange={(e) => handleSmtpModeChange(mode, 'user', e.target.value)}
                        placeholder="your-email@gmail.com"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        name={`smtp-${mode}-user-no-autofill`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">SMTP Password</label>
                      <Input
                        type="password"
                        value={formData.smtp[mode].password}
                        onChange={(e) => handleSmtpModeChange(mode, 'password', e.target.value)}
                        placeholder={formData.smtp[mode].password.startsWith('••••') ? 'Leave blank to keep current' : 'Enter password'}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">From Email</label>
                      <Input
                        type="email"
                        value={formData.smtp[mode].fromEmail}
                        onChange={(e) => handleSmtpModeChange(mode, 'fromEmail', e.target.value)}
                        placeholder="noreply@yourstore.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Admin Email</label>
                      <Input
                        type="email"
                        value={formData.smtp[mode].adminEmail}
                        onChange={(e) => handleSmtpModeChange(mode, 'adminEmail', e.target.value)}
                        placeholder="admin@yourstore.com"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.smtp[mode].secure}
                        onCheckedChange={(checked) => handleSmtpModeChange(mode, 'secure', checked as boolean)}
                      />
                      <span className="text-sm font-medium">Use SSL/TLS (Port 465)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.smtp[mode].requireTls}
                        onCheckedChange={(checked) => handleSmtpModeChange(mode, 'requireTls', checked as boolean)}
                      />
                      <span className="text-sm font-medium">Require TLS (Port 587)</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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
            </div>
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
                <CardDescription>Measurement Protocol — server-confirmed purchase events, ad-blocker resistant</CardDescription>
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
                SEO &amp; Analytics — only the API Secret (server-only) lives here.
              </p>
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.ga4.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Secret</label>
                <Input
                  type="password"
                  value={formData.ga4.apiSecret}
                  onChange={(e) => handleChange('ga4', 'apiSecret', e.target.value)}
                  placeholder={formData.ga4.apiSecret.startsWith('••••') ? 'Leave blank to keep current' : 'Analytics ▸ Admin ▸ Data Streams ▸ Measurement Protocol API secrets'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Razorpay API Settings — the ONLY place Razorpay is configured now
            (moved off Payment Gateway Settings, which used to have its own
            duplicate copy of these same two fields — see that page). */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Razorpay</CardTitle>
                <CardDescription>Payment keys, webhook, enable/disable — the ONE place for Razorpay</CardDescription>
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
                  and "Enabled" above is off. That's not a bug — it's just invisible from this
                  page. Save your OWN Live Key ID/Secret below and turn "Enabled" on to switch
                  checkout to your store's Razorpay account instead of the shared default.
                  The Webhook Secret field below works independently of this — save it any time
                  to start verifying webhook deliveries, even before you move off the default key.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              The mode above is set by the platform (super admin), not here. Fill in whichever
              pair matches it — the other stays saved and ready for when the platform switches
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
                        placeholder={formData.razorpay[mode].webhookSecret.startsWith('••••') ? 'Leave blank to keep current' : 'From Razorpay Dashboard ▸ Settings ▸ Webhooks'}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {formData.razorpay[mode].webhookSecretSet
                          ? 'A webhook secret is saved for this mode — Razorpay pushes (payment success, failure, refunds) are verified against it.'
                          : `Not set — payments will only update your order after the customer's browser calls back. If they close the tab before that, the order can be stuck as unpaid until you set this.`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <p className="text-sm font-semibold">Webhook URL — register in Razorpay Dashboard ▸ Settings ▸ Webhooks</p>
              <p className="text-[11px] text-muted-foreground">
                Same URL for both modes — Razorpay Dashboard has its own Test/Live toggle; switch it there,
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

        {/* WhatsApp Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>WhatsApp API</CardTitle>
                <CardDescription>Configure WhatsApp messaging integration</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.whatsapp.useEnvVars}
                  onCheckedChange={(checked) => handleChange('whatsapp', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.whatsapp.isEnabled}
                  onCheckedChange={(checked) => handleChange('whatsapp', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.whatsapp.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> WhatsApp configuration will be read from .env file (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID for Meta API, or WHATSAPP_API_URL, WHATSAPP_ACCOUNT_SID, WHATSAPP_AUTH_TOKEN, WHATSAPP_FROM_NUMBER for Twilio)
                </p>
              </div>
            )}

            {/*
              Growcord gateway (wa.growcord.in) — the IN-HOUSE provider the
              backend actually uses by default (services/messaging/whatsapp).
              It reads apiUrl/apiKey/phoneNumberId from the `whatsapp_settings`
              key, which NOTHING in the admin used to write: a store could not
              point the gateway at its own number and silently fell back to the
              platform's env credentials. The Meta/Twilio fields below are a
              separate (`whatsapp`) key and are unaffected.
            */}
            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Growcord WhatsApp Gateway (in-house)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Used first for order updates, OTPs and cart recovery. Leave blank to use the
                    platform's shared account.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    Store is in {environment === 'live' ? 'LIVE' : 'TEST'} mode
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.whatsapp_settings.isEnabled}
                      onCheckedChange={(c) => handleChange('whatsapp_settings', 'isEnabled', c as boolean)}
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Channel priority</label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={formData.whatsapp_settings.channelPriority}
                  onChange={(e) => handleChange('whatsapp_settings', 'channelPriority', e.target.value)}
                >
                  <option value="whatsapp_first">WhatsApp first, SMS if it fails (recommended)</option>
                  <option value="sms_first">SMS first, WhatsApp if it fails</option>
                  <option value="both">Send both every time</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Applies to order updates, OTP and cart recovery — one shared setting for both modes.
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                The mode above is set by the platform (super admin), not here. Fill in whichever
                pair matches it — the other stays saved and ready for when the platform switches
                your store's mode.
              </p>

              {(['live', 'test'] as const).map((mode) => (
                <div key={mode} className="rounded-lg border p-3 space-y-3 bg-background">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide">{mode}</p>
                    {mode === environment && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">ACTIVE MODE</span>
                    )}
                    {formData.whatsapp_settings[mode].phoneNumberId && formData.whatsapp_settings[mode].apiKeySet ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Configured</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not configured</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API URL</label>
                      <Input
                        type="text"
                        value={formData.whatsapp_settings[mode].apiUrl}
                        onChange={(e) => handleWhatsappSettingsModeChange(mode, 'apiUrl', e.target.value)}
                        placeholder="https://wa.growcord.in/api"
                      />
                      <p className="text-[11px] text-muted-foreground">Base URL without the trailing /v1.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API Key</label>
                      <Input
                        type="password"
                        value={formData.whatsapp_settings[mode].apiKey}
                        onChange={(e) => handleWhatsappSettingsModeChange(mode, 'apiKey', e.target.value)}
                        placeholder={formData.whatsapp_settings[mode].apiKeySet ? 'Leave blank to keep current' : 'sk_live_…'}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {formData.whatsapp_settings[mode].apiKeySet ? 'A key is saved and encrypted.' : 'Stored encrypted.'}
                      </p>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">Phone Number ID</label>
                      <Input
                        type="text"
                        value={formData.whatsapp_settings[mode].phoneNumberId}
                        onChange={(e) => handleWhatsappSettingsModeChange(mode, 'phoneNumberId', e.target.value)}
                        placeholder="WhatsApp phone number ID"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/*
              Live status, fetched from the WhatsApp platform itself — not the
              form above. Every event's template is fixed 1:1 by the platform
              (whatsappapidocs/PUBLIC_API.md §6b); there is no per-event
              template to "pick" here, only whether it is APPROVED and the
              number can actually send right now. This is what would have
              caught the 2026-08-28 incident immediately instead of a shopper
              silently never getting a WhatsApp OTP.
            */}
            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Live notification status</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Checked directly against the WhatsApp platform using this store's active credentials.
                  </p>
                </div>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => loadWaStatus(true)} disabled={waStatusLoading}
                >
                  {waStatusLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Refresh from WhatsApp
                </Button>
              </div>

              {waStatusError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{waStatusError}</span>
                </div>
              )}

              {!waStatusError && waStatus && !waStatus.enabled && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted border text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>WhatsApp is disabled for this store's current mode — no notifications will send until it's enabled above.</span>
                </div>
              )}

              {!waStatusError && waStatus?.enabled && !waStatus.connected && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Can't reach WhatsApp — {waStatus.connectionError || 'connection failed'}</p>
                    <p className="text-xs mt-0.5 text-red-700">
                      {waStatus.usingPlatformDefault
                        ? "This store has no key of its own configured and the platform's shared default is not working — fill in the API key above."
                        : "This store's own API key above is not working — check it's current and active."}
                    </p>
                  </div>
                </div>
              )}

              {!waStatusError && waStatus?.enabled && waStatus.connected && (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Connected — <strong>{waStatus.registeredPhone || waStatus.phoneNumberId}</strong>.{' '}
                      <strong>{waStatus.ready}/{waStatus.total}</strong> notification templates approved and ready to send.
                      {waStatus.usingPlatformDefault && ' Using the platform\'s shared default key.'}
                    </span>
                  </div>

                  {waStatus.health && !waStatus.health.canSend && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Sending is blocked for this number</p>
                        <ul className="list-disc list-inside text-xs mt-1">
                          {(waStatus.health.blockers || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {waStatus.ready < waStatus.total && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{waStatus.total - waStatus.ready} event(s) below are not yet approved — those specific notifications will fall back to SMS until Meta approves them.</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
                    onClick={() => setWaEventsOpen((v) => !v)}
                  >
                    {waEventsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {waEventsOpen ? 'Hide' : 'Show'} all {waStatus.total} events
                  </button>

                  {waEventsOpen && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(waStatus.events || []).map((ev: any) => (
                        <div key={ev.event} className="flex items-start gap-2 p-2.5 rounded-md border bg-background">
                          {ev.ready ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                          ) : ev.status === 'PENDING' ? (
                            <Loader2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{ev.title || ev.event}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {ev.ready ? 'Approved & ready' : ev.status === 'PENDING' ? 'Pending Meta approval' : (ev.statusReason || ev.status || 'Not ready')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={`flex flex-col gap-3 ${formData.whatsapp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={formData.whatsapp.useMetaApi}
                  onChange={() => handleChange('whatsapp', 'useMetaApi', true)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium">Meta WhatsApp Business API (Recommended)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!formData.whatsapp.useMetaApi}
                  onChange={() => handleChange('whatsapp', 'useMetaApi', false)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium">Twilio WhatsApp API</span>
              </label>
            </div>

            {formData.whatsapp.useMetaApi ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.whatsapp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Access Token</label>
                  <Input
                    type="password"
                    value={formData.whatsapp.accessToken}
                    onChange={(e) => handleChange('whatsapp', 'accessToken', e.target.value)}
                    placeholder={formData.whatsapp.accessToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter access token'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Phone Number ID</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.phoneNumberId}
                    onChange={(e) => handleChange('whatsapp', 'phoneNumberId', e.target.value)}
                    placeholder="Enter phone number ID"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Business Account ID</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.businessAccountId}
                    onChange={(e) => handleChange('whatsapp', 'businessAccountId', e.target.value)}
                    placeholder="Enter business account ID"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">API Version</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.apiVersion}
                    onChange={(e) => handleChange('whatsapp', 'apiVersion', e.target.value)}
                    placeholder="v21.0"
                  />
                </div>
              </div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.whatsapp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">API URL</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.apiUrl}
                    onChange={(e) => handleChange('whatsapp', 'apiUrl', e.target.value)}
                    placeholder="https://api.twilio.com/2010-04-01/Accounts"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Account SID</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.accountSid}
                    onChange={(e) => handleChange('whatsapp', 'accountSid', e.target.value)}
                    placeholder="Enter Twilio Account SID"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Auth Token</label>
                  <Input
                    type="password"
                    value={formData.whatsapp.authToken}
                    onChange={(e) => handleChange('whatsapp', 'authToken', e.target.value)}
                    placeholder={formData.whatsapp.authToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter auth token'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">From Number</label>
                  <Input
                    type="text"
                    value={formData.whatsapp.fromNumber}
                    onChange={(e) => handleChange('whatsapp', 'fromNumber', e.target.value)}
                    placeholder="whatsapp:+14155238886"
                  />
                </div>
              </div>
            )}
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
