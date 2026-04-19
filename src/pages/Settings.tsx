import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Phone,
  CreditCard,
  MessageSquare,
  Settings as SettingsIcon,
  Users,
  Palette,
  ChevronRight,
  Puzzle,
  Box,
  Receipt,
  Building2,
  Truck,
  FileText,
  Key,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { getTenantApiKey, setTenantApiKey } from '@/services/api';

const settingsSections = [
  {
    heading: 'Store',
    items: [
      {
        title: 'Staff & Permissions',
        description: 'Manage staff accounts and their access permissions',
        icon: Users,
        path: '/settings/staff',
      },
      {
        title: 'Billing',
        description: 'Manage your plan, subscription, and invoices',
        icon: Receipt,
        path: '/settings/billing',
      },
    ],
  },
  {
    heading: 'Modules & Plugins',
    items: [
      {
        title: 'Modules',
        description: 'Enable or disable feature modules: B2B, Leads, Coupons, Reviews, Page Editor',
        icon: Puzzle,
        path: '/settings/modules',
      },
      {
        title: 'B2B Settings',
        description: 'Configure B2B pricing tiers, minimum order amounts, and approval flows',
        icon: Building2,
        path: '/b2b',
      },
    ],
  },
  {
    heading: 'Payments',
    items: [
      {
        title: 'Payment Gateways',
        description: 'Configure and enable payment gateways (Razorpay, UPI, COD)',
        icon: CreditCard,
        path: '/settings/payment-gateways',
      },
      {
        title: 'Payment Gateway Discount',
        description: 'Offer a discount for specific payment methods',
        icon: CreditCard,
        path: '/settings/payment-discount',
      },
    ],
  },
  {
    heading: 'Logistics',
    items: [
      {
        title: 'Shipping & Fees',
        description: 'Shipping fee, free shipping threshold, COD charge, and carrier integrations (Shiprocket, Delhivery)',
        icon: Truck,
        path: '/settings/shipping',
      },
      {
        title: 'Warehouses',
        description: 'Manage warehouse locations and default dispatch settings',
        icon: Building2,
        path: '/warehouses',
      },
      {
        title: 'Package Boxes',
        description: 'Define box sizes used when calculating shipping dimensions',
        icon: Box,
        path: '/settings/packages',
      },
    ],
  },
  {
    heading: 'Tax & Compliance',
    items: [
      {
        title: 'GST Settings',
        description: 'Configure GST tax brackets, GSTIN, and invoice settings',
        icon: FileText,
        path: '/settings/gst',
      },
    ],
  },
  {
    heading: 'Developer & Tenant',
    items: [
      {
        title: 'Store API Key (tenant validation)',
        description: 'Optional. Used when the admin is not on your store’s domain. Ensures requests identify your store.',
        icon: Key,
        path: '', // Inline card below, not a link
        inline: true,
      },
    ],
  },
  {
    heading: 'Integrations & Communication',
    items: [
      {
        title: 'API & Integrations',
        description: 'Configure SMTP, Meta Pixel, Razorpay keys, and WhatsApp',
        icon: SettingsIcon,
        path: '/settings/api-integrations',
      },
      {
        title: 'SMS Templates',
        description: 'Configure SMSAlert templates for orders and cart recovery',
        icon: MessageSquare,
        path: '/settings/sms-templates',
      },
      {
        title: 'Contact Details',
        description: 'Phone number, WhatsApp, and email shown on the storefront',
        icon: Phone,
        path: '/settings/contact',
      },
    ],
  },
  {
    heading: 'Appearance',
    items: [
      {
        title: 'Style & Branding',
        description: 'Colors, fonts, logos, storefront theme, and announcement bar',
        icon: Palette,
        path: '/appearance/style',
      },
    ],
  },
];

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:3000';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [tenantApiKeyInput, setTenantApiKeyInput] = useState('');
  const [tenantApiKeySet, setTenantApiKeySet] = useState(false);
  const [tenantApiKeySaved, setTenantApiKeySaved] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cacheMessage, setCacheMessage] = useState('');

  useEffect(() => {
    setTenantApiKeySet(!!getTenantApiKey());
  }, []);

  const handleSaveTenantApiKey = () => {
    const value = tenantApiKeyInput.trim();
    setTenantApiKey(value);
    setTenantApiKeyInput('');
    setTenantApiKeySet(!!value);
    setTenantApiKeySaved(true);
    setTimeout(() => setTenantApiKeySaved(false), 3000);
  };

  const handleClearTenantApiKey = () => {
    setTenantApiKey(null);
    setTenantApiKeyInput('');
    setTenantApiKeySet(false);
  };

  const handleClearCache = async (path?: string) => {
    setCacheStatus('loading');
    setCacheMessage('');
    try {
      const res = await fetch(`${STOREFRONT_URL}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (res.ok && data.revalidated) {
        setCacheStatus('success');
        setCacheMessage(path ? `Cache cleared for ${path}` : 'All storefront pages revalidated');
      } else {
        setCacheStatus('error');
        setCacheMessage(data.error || 'Revalidation failed');
      }
    } catch (e: any) {
      setCacheStatus('error');
      setCacheMessage(e.message || 'Could not reach storefront');
    }
    setTimeout(() => setCacheStatus('idle'), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your store configuration and integrations</p>
      </div>

      {settingsSections.map((section) => (
        <div key={section.heading}>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {section.heading}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {section.items.map((item: any) => {
              const Icon = item.icon;
              if (item.inline && item.title.includes('Store API Key')) {
                return (
                  <Card key="tenant-api-key" className="md:col-span-2">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          <Key className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground">Store API Key (tenant validation)</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Optional. Sent as <code className="bg-muted px-1 rounded">x-api-key</code> so the backend can identify your store when the admin is not on your store’s domain. You can also set <code className="bg-muted px-1 rounded">VITE_API_KEY</code> in .env at build time.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="password"
                          placeholder="rf_..."
                          value={tenantApiKeyInput}
                          onChange={(e) => setTenantApiKeyInput(e.target.value)}
                          className="max-w-md"
                        />
                        <div className="flex gap-2">
                          <Button onClick={handleSaveTenantApiKey} disabled={!tenantApiKeyInput.trim()}>
                            Save
                          </Button>
                          <Button variant="outline" onClick={handleClearTenantApiKey}>
                            Clear
                          </Button>
                        </div>
                      </div>
                      {tenantApiKeySet && (
                        <p className="text-sm text-muted-foreground">
                          API key is set. All requests will include it for store/tenant validation.
                        </p>
                      )}
                      {tenantApiKeySaved && (
                        <p className="text-sm text-green-600">Saved. Requests will use this key for tenant validation.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              }
              return (
                <Card
                  key={item.path}
                  className="group cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200"
                  onClick={() => item.path && navigate(item.path)}
                >
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    </div>
                    {item.path && (
                      <ChevronRight className="flex-shrink-0 w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors mt-0.5" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Cache Management */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Storefront Cache
        </h2>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">Clear Storefront Cache</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Force the storefront to reload fresh data from the server. Use this after updating products, categories, menus, or banners if changes aren't showing.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleClearCache()}
                disabled={cacheStatus === 'loading'}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${cacheStatus === 'loading' ? 'animate-spin' : ''}`} />
                Clear All Cache
              </Button>
              <Button variant="outline" onClick={() => handleClearCache('/category/[slug]')} disabled={cacheStatus === 'loading'}>
                Clear Category Pages
              </Button>
              <Button variant="outline" onClick={() => handleClearCache('/product/[slug]')} disabled={cacheStatus === 'loading'}>
                Clear Product Pages
              </Button>
              <Button variant="outline" onClick={() => handleClearCache('/')} disabled={cacheStatus === 'loading'}>
                Clear Homepage
              </Button>
            </div>

            {cacheStatus === 'success' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                {cacheMessage}
              </div>
            )}
            {cacheStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {cacheMessage}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Storefront URL: <code className="bg-muted px-1 rounded">{STOREFRONT_URL}</code>
              {' — '}set <code className="bg-muted px-1 rounded">VITE_STOREFRONT_URL</code> in admin/.env to change this.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;

