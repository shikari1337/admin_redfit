import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaUndo } from 'react-icons/fa';
import { smsTemplatesAPI, smsConfigAPI } from '../services/api';

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

        const mapped: TemplateForm[] = (templatesData || []).map((template: any) => ({
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

        const updatedConfig: SmsConfigForm = {
          baseUrl: configData.baseUrl || '',
          route: configData.route || 'Transactional',
          senderId: configData.senderId || '',
          isEnabled: Boolean(configData.isEnabled),
          apiKey: '',
          apiKeySet: Boolean(configData.apiKeySet),
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
      alert(`${EVENT_META[template.event].title} template saved successfully.`);
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
      alert('SMS provider configuration saved successfully.');
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">SMS Templates</h1>
        <p className="text-sm text-gray-600 mt-2">
          Manage SMS alerts for orders, OTP verification, password resets, and cart recovery. Configure
          your SMSAlert provider credentials and customize message templates.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">SMSAlert Provider Settings</h2>
            <p className="text-sm text-gray-600 mt-1">
              Enter the API credentials provided by SMSAlert. API key is stored encrypted and never
              displayed after saving.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={config.isEnabled}
              onChange={(e) => handleConfigChange('isEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Enable SMS sending
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Base URL</label>
            <input
              type="url"
              value={config.baseUrl}
              onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
              placeholder="https://www.smsalert.co.in/api"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-500 mt-1">Default is https://www.smsalert.co.in/api</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Route</label>
            <input
              type="text"
              value={config.route}
              onChange={(e) => handleConfigChange('route', e.target.value)}
              placeholder="Transactional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-500 mt-1">Usually "Transactional" for OTPs and alerts.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sender ID</label>
            <input
              type="text"
              value={config.senderId}
              onChange={(e) => handleConfigChange('senderId', e.target.value.toUpperCase())}
              placeholder="RDFTIN"
              maxLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
            />
            <p className="text-xs text-gray-500 mt-1">
              6-character sender ID approved by SMSAlert. {config.apiKeySet ? 'Stored securely.' : ''}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key {config.apiKeySet ? '(leave blank to keep existing)' : ''}
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => handleConfigChange('apiKey', e.target.value)}
              placeholder={config.apiKeySet ? '••••••••••' : 'Enter SMSAlert API key'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              The key is encrypted before storing. Enter a new key to replace the current one.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleConfigReset}
            disabled={!configHasChanges}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FaUndo className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleConfigSave}
            disabled={!configHasChanges || configSaving}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
          >
            <FaSave className="w-4 h-4" />
            {configSaving ? 'Saving...' : 'Save Provider Settings'}
          </button>
        </div>
      </div>

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
            <div
              key={event}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{meta.title}</h2>
                  <p className="text-sm text-gray-600 mt-1">{meta.description}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={template.isEnabled}
                    onChange={(e) => handleInputChange(event, 'isEnabled', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  Enable template
                </label>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Available variables
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {meta.variables.map((variable) => (
                    <div key={variable.key} className="text-sm text-gray-700">
                      <span className="font-mono bg-white px-2 py-1 rounded border border-gray-200 mr-2">
                        {variable.key}
                      </span>
                      {variable.description}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template ID (optional)
                  </label>
                  <input
                    type="text"
                    value={template.templateId || ''}
                    onChange={(e) => handleInputChange(event, 'templateId', e.target.value)}
                    placeholder="SMS Alert template ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Configure this if your SMSAlert account requires a pre-approved template ID.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variables Hint (optional)
                  </label>
                  <input
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional comma-separated list for reference only.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMS Content
                </label>
                <textarea
                  value={template.content}
                  onChange={(e) => handleInputChange(event, 'content', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Keep messages within 160 characters when possible. Use the variables exactly as
                  listed (including curly braces).
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleReset(event)}
                  disabled={!hasChanges}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <FaUndo className="w-4 h-4" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(template)}
                  disabled={savingEvent === event}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
                >
                  <FaSave className="w-4 h-4" />
                  {savingEvent === event ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SmsTemplates;


