import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Truck, Warehouse, Loader2 } from 'lucide-react';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const ShippingSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    shippingConfig: {
      freeShippingThreshold: 500,
      shippingFee: 49,
      codFee: 0,
      codEnabled: true,
    },
    shiprocket: {
      useEnvVars: false,
      email: '',
      password: '',
      apiUrl: 'https://apiv2.shiprocket.in',
      pickupPincode: '',
      pickupLocation: '',
      channelId: '',
      isEnabled: false,
    },
    delhivery: {
      useEnvVars: false,
      apiToken: '',
      apiUrl: 'https://staging-express.delhivery.com/api',
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
        if (settings.shippingConfig) {
          setFormData(prev => ({
            ...prev,
            shippingConfig: {
              freeShippingThreshold: settings.shippingConfig.freeShippingThreshold ?? 500,
              shippingFee: settings.shippingConfig.shippingFee ?? 49,
              codFee: settings.shippingConfig.codFee ?? 0,
              codEnabled: settings.shippingConfig.codEnabled !== false,
            },
          }));
        }
        if (settings.shiprocket) {
          setFormData(prev => ({
            ...prev,
            shiprocket: {
              ...prev.shiprocket,
              useEnvVars: settings.shiprocket.useEnvVars || false,
              ...settings.shiprocket,
              password: settings.shiprocket.passwordSet ? '••••••••' : '',
            },
          }));
        }

        if (settings.delhivery) {
          setFormData(prev => ({
            ...prev,
            delhivery: {
              ...prev.delhivery,
              useEnvVars: settings.delhivery.useEnvVars || false,
              ...settings.delhivery,
              apiToken: settings.delhivery.apiTokenSet ? '••••••••' : '',
            },
          }));
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load shipping settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const submitData: any = {
        shippingConfig: {
          freeShippingThreshold: Number(formData.shippingConfig.freeShippingThreshold) || 500,
          shippingFee: Number(formData.shippingConfig.shippingFee) || 0,
          codFee: Number(formData.shippingConfig.codFee) || 0,
          codEnabled: formData.shippingConfig.codEnabled,
        },
        shiprocket: {
          ...formData.shiprocket,
          password: formData.shiprocket.password && !formData.shiprocket.password.startsWith('••••') ? formData.shiprocket.password : undefined,
        },
        delhivery: {
          ...formData.delhivery,
          apiToken: formData.delhivery.apiToken && !formData.delhivery.apiToken.startsWith('••••') ? formData.delhivery.apiToken : undefined,
        },
      };

      await api.put('/settings', submitData);
      alert('Shipping settings saved successfully!');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert(error.response?.data?.message || 'Failed to save shipping settings');
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Shipping Settings</h1>
            <p className="text-sm text-muted-foreground mt-2">Configure shipping providers and manage warehouses</p>
          </div>
          <Button
            onClick={() => navigate('/warehouses')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Warehouse className="mr-2 w-4 h-4" />
            Manage Warehouses
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* Shipping Fees & COD */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Shipping Fees & COD</CardTitle>
                <CardDescription>Set flat shipping fee, free shipping threshold, and cash-on-delivery charge</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Free Shipping Threshold (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.freeShippingThreshold}
                  onChange={(e) => handleChange('shippingConfig', 'freeShippingThreshold', e.target.value)}
                  placeholder="500"
                />
                <p className="text-[11px] text-muted-foreground">Orders above this amount get free shipping</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Flat Shipping Fee (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.shippingFee}
                  onChange={(e) => handleChange('shippingConfig', 'shippingFee', e.target.value)}
                  placeholder="49"
                />
                <p className="text-[11px] text-muted-foreground">Charged when order is below the threshold</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">COD Fee (₹) — extra charge</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.codFee}
                  onChange={(e) => handleChange('shippingConfig', 'codFee', e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">Additional fee added for Cash on Delivery orders (0 = no extra charge)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">COD Available</label>
                <div className="flex items-center gap-3 pt-2">
                  <Checkbox
                    checked={formData.shippingConfig.codEnabled}
                    onCheckedChange={(checked) => handleChange('shippingConfig', 'codEnabled', checked as boolean)}
                  />
                  <span className="text-sm">Enable Cash on Delivery for customers</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shiprocket Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Shiprocket Shipping</CardTitle>
                <CardDescription>Configure Shiprocket shipping integration</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.shiprocket.useEnvVars}
                  onCheckedChange={(checked) => handleChange('shiprocket', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.shiprocket.isEnabled}
                  onCheckedChange={(checked) => handleChange('shiprocket', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.shiprocket.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong>Using Environment Variables:</strong> Shiprocket configuration will be read from .env file (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD, SHIPROCKET_API_URL, SHIPROCKET_PICKUP_PINCODE, SHIPROCKET_PICKUP_LOCATION). <strong>Note:</strong> Channel ID is not available in env vars, configure it here if needed.
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.shiprocket.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  value={formData.shiprocket.email}
                  onChange={(e) => handleChange('shiprocket', 'email', e.target.value)}
                  placeholder="your-email@shiprocket.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={formData.shiprocket.password}
                  onChange={(e) => handleChange('shiprocket', 'password', e.target.value)}
                  placeholder={formData.shiprocket.password.startsWith('••••') ? 'Leave blank to keep current' : 'Enter password'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API URL</label>
                <Input
                  type="text"
                  value={formData.shiprocket.apiUrl}
                  onChange={(e) => handleChange('shiprocket', 'apiUrl', e.target.value)}
                  placeholder="https://apiv2.shiprocket.in"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Channel ID</label>
                <Input
                  type="text"
                  value={formData.shiprocket.channelId}
                  onChange={(e) => handleChange('shiprocket', 'channelId', e.target.value)}
                  placeholder="Enter Shiprocket Channel ID"
                  className={formData.shiprocket.useEnvVars ? "pointer-events-auto opacity-100 bg-background" : ""}
                  disabled={false}
                />
                <p className="text-[10px] text-muted-foreground">Channel ID from Shiprocket settings (configure even when using env vars)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Pickup Pincode</label>
                <Input
                  type="text"
                  value={formData.shiprocket.pickupPincode}
                  onChange={(e) => handleChange('shiprocket', 'pickupPincode', e.target.value)}
                  placeholder="110001"
                />
                <p className="text-[10px] text-muted-foreground">Default pickup pincode (can be overridden by warehouse configuration)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Pickup Location</label>
                <Input
                  type="text"
                  value={formData.shiprocket.pickupLocation}
                  onChange={(e) => handleChange('shiprocket', 'pickupLocation', e.target.value)}
                  placeholder="Default"
                />
                <p className="text-[10px] text-muted-foreground">Default pickup location name (can be overridden by warehouse configuration)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DELHIVERY Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <CardTitle>DELHIVERY Shipping</CardTitle>
                <CardDescription>Configure DELHIVERY shipping integration</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.delhivery.useEnvVars}
                  onCheckedChange={(checked) => handleChange('delhivery', 'useEnvVars', checked as boolean)}
                />
                <span className="text-sm font-medium">Use Env Vars</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.delhivery.isEnabled}
                  onCheckedChange={(checked) => handleChange('delhivery', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.delhivery.useEnvVars && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Using Environment Variables:</strong> DELHIVERY configuration will be read from .env file (DELHIVERY_API_TOKEN, DELHIVERY_API_URL)
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${formData.delhivery.useEnvVars ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Token</label>
                <Input
                  type="password"
                  value={formData.delhivery.apiToken}
                  onChange={(e) => handleChange('delhivery', 'apiToken', e.target.value)}
                  placeholder={formData.delhivery.apiToken.startsWith('••••') ? 'Leave blank to keep current' : 'Enter DELHIVERY API Token'}
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your API token from DELHIVERY Dashboard → Settings → API Setup
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API URL</label>
                <Input
                  type="text"
                  value={formData.delhivery.apiUrl}
                  onChange={(e) => handleChange('delhivery', 'apiUrl', e.target.value)}
                  placeholder="https://staging-express.delhivery.com/api"
                />
                <p className="text-[10px] text-muted-foreground">Production: https://track.delhivery.com/api, Staging: https://staging-express.delhivery.com/api</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Warehouse configuration is managed separately in the <strong>Warehouses</strong> section. Each warehouse must have a DELHIVERY warehouse code (warehouse name as registered with DELHIVERY) configured.
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

export default ShippingSettings;
