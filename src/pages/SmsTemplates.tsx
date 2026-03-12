import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaUndo } from 'react-icons/fa';
import { smsTemplatesAPI, smsConfigAPI } from '../services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type TemplateEvent =
  | 'order_confirmation'
  | 'order_status'
  | 'cart_recovery'
  | 'otp_verification'
  | 'password_reset';

interface TemplateForm {
  event: TemplateEvent;
  content: string;
  templateId?: string;
  isEnabled: boolean;
  variablesHint: string[];
}

interface SmsConfigForm {
  baseUrl: string;
  route: string;
  senderId: string;
  isEnabled: boolean;
  apiKey: string;
  apiKeySet: boolean;
}

const EVENT_META: Record<
  TemplateEvent,
  { title: string; description: string; variables: { key: string; description: string }[] }
> = {
  order_confirmation: {
    title: 'Order Confirmation',
    description: 'Sent immediately after a user places an order.',
    variables: [
      { key: '{{customerName}}', description: 'Customer’s name if available' },
      { key: '{{orderId}}', description: 'Human-readable order identifier' },
      { key: '{{orderTotal}}', description: 'Total order amount in INR' },
      { key: '{{trackingLink}}', description: 'Order tracking link (redfit.in/t/<orderId>)' },
    ],
  },
  order_status: {
    title: 'Order Status Update',
    description: 'Triggered whenever the order status changes in the admin panel.',
    variables: [
      { key: '{{orderId}}', description: 'Human-readable order identifier' },
      { key: '{{orderStatus}}', description: 'New status value (e.g. shipped)' },
      { key: '{{trackingLink}}', description: 'Order tracking link' },
    ],
  },
  cart_recovery: {
    title: 'Cart Recovery',
    description: 'Use to nudge customers back to checkout with their saved cart.',
    variables: [
      { key: '{{customerName}}', description: 'Customer’s name if available' },
      { key: '{{cartRecoveryLink}}', description: 'Direct link redfit.in/c/<cartId>' },
      { key: '{{discountCode}}', description: 'Optional coupon code or incentive' },
    ],
  },
  otp_verification: {
    title: 'OTP Verification',
    description:
      'Sent when a user needs to verify ownership of a phone number. Must contain the OTP placeholder.',
    variables: [
      { key: '{{otp}}', description: 'One-time password generated for the user' },
      { key: '{{expiryMinutes}}', description: 'Minutes until the OTP expires' },
    ],
  },
  password_reset: {
    title: 'Password Reset',
    description: 'Used when a user requests to reset their password using an OTP.',
    variables: [
      { key: '{{otp}}', description: 'One-time password generated for the reset flow' },
      { key: '{{expiryMinutes}}', description: 'Minutes until the code expires' },
    ],
  },
};

const SmsTemplates: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState<TemplateEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateForm[]>([]);
  const [originalTemplates, setOriginalTemplates] = useState<Record<string, TemplateForm>>({});
  const [config, setConfig] = useState<SmsConfigForm>({
    baseUrl: '',
    route: '',
    senderId: '',
    isEnabled: false,
    apiKey: '',
    apiKeySet: false,
  });
  const [originalConfig, setOriginalConfig] = useState<SmsConfigForm | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [templatesData, configData] = await Promise.all([
          smsTemplatesAPI.list(),
          smsConfigAPI.get(),
        ]);

        let templates: any[] = [];
        if (Array.isArray(templatesData)) {
          templates = templatesData;
        } else if (Array.isArray(templatesData?.data)) {
          templates = templatesData.data;
        } else if (Array.isArray(templatesData?.data?.data)) {
          templates = templatesData.data.data;
        }

        const mapped: TemplateForm[] = templates.map((template: any) => ({
          event: template.event,
          content: template.content,
          templateId: template.templateId,
          isEnabled: template.isEnabled,
          variablesHint: template.variablesHint || [],
        }));

        const originals: Record<string, TemplateForm> = {};
        mapped.forEach((template) => {
          originals[template.event] = { ...template };
        });

        setTemplates(mapped);
        setOriginalTemplates(originals);

        const configResponse = configData?.data || configData;
        const updatedConfig: SmsConfigForm = {
          baseUrl: configResponse?.baseUrl || '',
          route: configResponse?.route || 'Transactional',
          senderId: configResponse?.senderId || '',
          isEnabled: Boolean(configResponse?.isEnabled),
          apiKey: '',
          apiKeySet: Boolean(configResponse?.apiKeySet),
        };
        setConfig(updatedConfig);
        setOriginalConfig({ ...updatedConfig });
      } catch (err: any) {
        console.error('Failed to load SMS templates', err);
        setError(err.message || 'Failed to load SMS templates');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const templateMap = useMemo(() => {
    const map = new Map<TemplateEvent, TemplateForm>();
    templates.forEach((template) => {
      map.set(template.event, template);
    });
    return map;
  }, [templates]);

  const handleInputChange = (
    event: TemplateEvent,
    field: keyof TemplateForm,
    value: string | string[] | boolean
  ) => {
    setTemplates((prev) =>
      prev.map((template) =>
        template.event === event
          ? {
              ...template,
              [field]: value,
            }
          : template
      )
    );
  };

  const handleReset = (event: TemplateEvent) => {
    const original = originalTemplates[event];
    if (!original) {
      return;
    }
    setTemplates((prev) =>
      prev.map((template) => (template.event === event ? { ...original } : template))
    );
  };

  const handleSave = async (template: TemplateForm) => {
    const normalizedContent = template.content.toLowerCase();
    if (template.event === 'otp_verification' && !normalizedContent.includes('{{otp}}')) {
      setError('OTP Verification template must include the {{otp}} variable.');
      return;
    }
    if (template.event === 'password_reset' && !normalizedContent.includes('{{otp}}')) {
      setError('Password Reset template must include the {{otp}} variable.');
      return;
    }

    try {
      setSavingEvent(template.event);
      setError(null);
      const payload = {
        content: template.content,
        templateId: template.templateId,
        isEnabled: template.isEnabled,
        variablesHint: template.variablesHint,
      };
      await smsTemplatesAPI.update(template.event, payload);
      setOriginalTemplates((prev) => ({
        ...prev,
        [template.event]: { ...template },
      }));
    } catch (err: any) {
      console.error('Failed to save template', err);
      setError(err.message || 'Failed to save template. Please try again.');
    } finally {
      setSavingEvent(null);
    }
  };

  const handleConfigChange = <Field extends keyof SmsConfigForm>(
    field: Field,
    value: SmsConfigForm[Field]
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleConfigReset = () => {
    if (!originalConfig) {
      return;
    }
    setConfig({
      ...originalConfig,
      apiKey: '',
    });
  };

  const handleConfigSave = async () => {
    try {
      setConfigSaving(true);
      setError(null);

      const payload: {
        baseUrl: string;
        route: string;
        senderId: string;
        isEnabled: boolean;
        apiKey?: string;
      } = {
        baseUrl: config.baseUrl,
        route: config.route,
        senderId: config.senderId,
        isEnabled: config.isEnabled,
      };

      const apiKeyTrimmed = config.apiKey.trim();
      if (apiKeyTrimmed) {
        payload.apiKey = apiKeyTrimmed;
      }

      const updated = await smsConfigAPI.update(payload);
      const nextConfig: SmsConfigForm = {
        baseUrl: updated.baseUrl,
        route: updated.route,
        senderId: updated.senderId,
        isEnabled: updated.isEnabled,
        apiKey: '',
        apiKeySet: Boolean(updated.apiKeySet),
      };
      setConfig(nextConfig);
      setOriginalConfig({ ...nextConfig });
    } catch (err: any) {
      console.error('Failed to save SMS provider configuration', err);
      setError(err.message || 'Failed to save SMS provider configuration. Please try again.');
    } finally {
      setConfigSaving(false);
    }
  };

  const configHasChanges =
    !!originalConfig &&
    (originalConfig.baseUrl !== config.baseUrl ||
      originalConfig.route !== config.route ||
      originalConfig.senderId !== config.senderId ||
      originalConfig.isEnabled !== config.isEnabled ||
      Boolean(config.apiKey.trim()));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="text-muted-foreground mb-4"
        >
          <FaArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">SMS Templates</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage SMS alerts for orders, OTP verification, password resets, and cart recovery. Configure
          your SMSAlert provider credentials and customize message templates.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg font-bold leading-none">&times;</button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle>SMS Provider Settings</CardTitle>
            <CardDescription>
              Enter the API credentials provided by SMS provider. API key is stored encrypted and never
              displayed after saving.
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={config.isEnabled}
              onCheckedChange={(checked) => handleConfigChange('isEnabled', checked as boolean)}
            />
            <span className="text-sm font-medium leading-none">Enable SMS sending</span>
          </label>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                API Base URL
              </label>
              <Input
                type="url"
                value={config.baseUrl}
                onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
                placeholder="https://www.smsalert.co.in/api"
              />
              <p className="text-[10px] text-muted-foreground">Default is https://www.smsalert.co.in/api</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Route
              </label>
              <Input
                type="text"
                value={config.route}
                onChange={(e) => handleConfigChange('route', e.target.value)}
                placeholder="Transactional"
              />
              <p className="text-[10px] text-muted-foreground">Usually "Transactional" for OTPs and alerts.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Sender ID
              </label>
              <Input
                type="text"
                value={config.senderId}
                onChange={(e) => handleConfigChange('senderId', e.target.value.toUpperCase())}
                placeholder="RDFTIN"
                maxLength={6}
                className="uppercase"
              />
              <p className="text-[10px] text-muted-foreground">
                6-character sender ID approved by provider. {config.apiKeySet ? 'Stored securely.' : ''}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                API Key {config.apiKeySet ? '(leave blank to keep existing)' : ''}
              </label>
              <Input
                type="password"
                value={config.apiKey}
                onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                placeholder={config.apiKeySet ? '••••••••••' : 'Enter API key'}
              />
              <p className="text-[10px] text-muted-foreground">
                The key is encrypted before storing. Enter a new key to replace the current one.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleConfigReset}
              disabled={!configHasChanges}
            >
              <FaUndo className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              type="button"
              onClick={handleConfigSave}
              disabled={!configHasChanges || configSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {configSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FaSave className="mr-2 h-4 w-4" />}
              {configSaving ? 'Saving...' : 'Save Provider Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {(Object.keys(EVENT_META) as TemplateEvent[]).map((event) => {
          const template = templateMap.get(event);
          if (!template) {
            return null;
          }

          const meta = EVENT_META[event];
          const hasChanges =
            JSON.stringify(template) !== JSON.stringify(originalTemplates[event]);

          return (
            <Card key={event}>
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>{meta.title}</CardTitle>
                  <CardDescription>{meta.description}</CardDescription>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={template.isEnabled}
                    onCheckedChange={(checked) => handleInputChange(event, 'isEnabled', checked as boolean)}
                  />
                  <span className="text-sm font-medium leading-none">Enable template</span>
                </label>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="bg-muted bg-opacity-50 border rounded-md p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Available variables
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {meta.variables.map((variable) => (
                      <div key={variable.key} className="text-sm text-foreground flex items-center gap-2">
                        <Badge variant="outline" className="font-mono bg-background">
                          {variable.key}
                        </Badge>
                        <span className="text-muted-foreground">{variable.description}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Template ID (optional)
                    </label>
                    <Input
                      type="text"
                      value={template.templateId || ''}
                      onChange={(e) => handleInputChange(event, 'templateId', e.target.value)}
                      placeholder="Provider template ID"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Configure this if your account requires a pre-approved template ID.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Variables Hint (optional)
                    </label>
                    <Input
                      type="text"
                      value={template.variablesHint.join(', ')}
                      onChange={(e) =>
                        handleInputChange(
                          event,
                          'variablesHint',
                          e.target.value
                            .split(',')
                            .map((token) => token.trim())
                            .filter(Boolean)
                        )
                      }
                      placeholder="customerName, orderId, trackingLink"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Optional comma-separated list for reference only.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    SMS Content
                  </label>
                  <Textarea
                    value={template.content}
                    onChange={(e) => handleInputChange(event, 'content', e.target.value)}
                    rows={4}
                    className="font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Keep messages within 160 characters when possible. Use the variables exactly as
                    listed (including curly braces).
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleReset(event)}
                    disabled={!hasChanges}
                  >
                    <FaUndo className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleSave(template)}
                    disabled={savingEvent === event}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {savingEvent === event ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FaSave className="mr-2 h-4 w-4" />}
                    {savingEvent === event ? 'Saving...' : 'Save Template'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SmsTemplates;


