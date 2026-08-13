import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Mail, Facebook, CreditCard, MessageCircle, Bot, Loader2, BarChart3 } from 'lucide-react';

import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const ApiIntegrationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    smtp: {
      useEnvVars: false,
      host: '',
      port: 587,
      user: '',
      password: '',
      secure: false,
      requireTls: true,
      ignoreTls: false,
      fromEmail: '',
      adminEmail: '',
      isEnabled: false,
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
      keyId: '',
      keySecret: '',
      isEnabled: false,
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
    gemini: {
      useEnvVars: false,
      apiKey: '',
      isEnabled: false,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

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
          setFormData(prev => ({
            ...prev,
            smtp: {
              ...prev.smtp,
              useEnvVars: settings.smtp.useEnvVars || false,
              ...settings.smtp,
              password: settings.smtp.passwordSet ? '••••••••' : '',
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
          setFormData(prev => ({
            ...prev,
            razorpay: {
              ...prev.razorpay,
              useEnvVars: settings.razorpay.useEnvVars || false,
              keyId: settings.razorpay.keyIdSet ? '••••••••' : '',
              keySecret: settings.razorpay.keySecretSet ? '••••••••' : '',
              isEnabled: settings.razorpay.isEnabled || false,
            },
          }));
        }

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
      const submitData: any = {
        smtp: {
          ...formData.smtp,
          password: formData.smtp.password && !formData.smtp.password.startsWith('••••') ? formData.smtp.password : undefined,
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
          ...formData.razorpay,
          keyId: formData.razorpay.keyId && !formData.razorpay.keyId.startsWith('••••') ? formData.razorpay.keyId : undefined,
          keySecret: formData.razorpay.keySecret && !formData.razorpay.keySecret.startsWith('••••') ? formData.razorpay.keySecret : undefined,
        },
        whatsapp: {
          ...formData.whatsapp,
          accessToken: formData.whatsapp.accessToken && !formData.whatsapp.accessToken.startsWith('••••') ? formData.whatsapp.accessToken : undefined,
          authToken: formData.whatsapp.authToken && !formData.whatsapp.authToken.startsWith('••••') ? formData.whatsapp.authToken : undefined,
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

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.smtp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">SMTP Host</label>
                <Input
                  type="text"
                  value={formData.smtp.host}
                  onChange={(e) => handleChange('smtp', 'host', e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">SMTP Port</label>
                <Input
                  type="number"
                  value={formData.smtp.port}
                  onChange={(e) => handleChange('smtp', 'port', parseInt(e.target.value))}
                  placeholder="587"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">SMTP User</label>
                <Input
                  type="text"
                  value={formData.smtp.user}
                  onChange={(e) => handleChange('smtp', 'user', e.target.value)}
                  placeholder="your-email@gmail.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">SMTP Password</label>
                <Input
                  type="password"
                  value={formData.smtp.password}
                  onChange={(e) => handleChange('smtp', 'password', e.target.value)}
                  placeholder={formData.smtp.password.startsWith('••••') ? 'Leave blank to keep current' : 'Enter password'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">From Email</label>
                <Input
                  type="email"
                  value={formData.smtp.fromEmail}
                  onChange={(e) => handleChange('smtp', 'fromEmail', e.target.value)}
                  placeholder="noreply@yourstore.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Admin Email</label>
                <Input
                  type="email"
                  value={formData.smtp.adminEmail}
                  onChange={(e) => handleChange('smtp', 'adminEmail', e.target.value)}
                  placeholder="admin@yourstore.com"
                />
              </div>
            </div>
            <div className={`flex flex-col sm:flex-row gap-6 pt-4 ${formData.smtp.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.smtp.secure}
                  onCheckedChange={(checked) => handleChange('smtp', 'secure', checked as boolean)}
                />
                <span className="text-sm font-medium">Use SSL/TLS (Port 465)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.smtp.requireTls}
                  onCheckedChange={(checked) => handleChange('smtp', 'requireTls', checked as boolean)}
                />
                <span className="text-sm font-medium">Require TLS (Port 587)</span>
              </label>
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

        {/* Razorpay API Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Razorpay API Integration</CardTitle>
                <CardDescription>Configure Razorpay payment keys</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
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
          <CardContent className="space-y-4">
            {formData.razorpay.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> Razorpay configuration will be read from .env file (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.razorpay.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Key ID</label>
                <Input
                  type="text"
                  value={formData.razorpay.keyId}
                  onChange={(e) => handleChange('razorpay', 'keyId', e.target.value)}
                  placeholder={formData.razorpay.keyId.startsWith('••••') ? 'Leave blank to keep current' : 'Enter Razorpay Key ID'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Key Secret</label>
                <Input
                  type="password"
                  value={formData.razorpay.keySecret}
                  onChange={(e) => handleChange('razorpay', 'keySecret', e.target.value)}
                  placeholder={formData.razorpay.keySecret.startsWith('••••') ? 'Leave blank to keep current' : 'Enter Razorpay Key Secret'}
                />
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
