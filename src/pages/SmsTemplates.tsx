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
import { Loader2, MessageSquare, Phone, CheckCircle2, AlertTriangle, XCircle, Send, Plug, Wand2 } from 'lucide-react';

type Channel = 'sms' | 'whatsapp';

interface VariableDef { key: string; description: string }

interface TemplateForm {
  event: string;
  title: string;
  description: string;
  category: string;
  channel: Channel;
  content: string;
  templateId: string;
  isEnabled: boolean;
  variablesHint: string[];
  variables: VariableDef[];
  requiresOtp: boolean;
}

interface ProviderTemplate {
  id: string;
  title: string;
  template: string;
  active?: boolean;
}

interface SmsConfigMode {
  baseUrl: string;
  route: string;
  senderId: string;
  apiKey: string;
  apiKeySet: boolean;
}

interface SmsConfigForm {
  isEnabled: boolean;
  test: SmsConfigMode;
  live: SmsConfigMode;
}

const EMPTY_SMS_MODE: SmsConfigMode = { baseUrl: '', route: 'transactional', senderId: '', apiKey: '', apiKeySet: false };

interface ConnStatus {
  state: 'unknown' | 'testing' | 'ok' | 'fail';
  message?: string;
}

const CATEGORY_ORDER = ['Authentication', 'Orders', 'Shipping', 'Payments & Returns', 'Marketing'];

const asArray = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
};

/**
 * DLT gateways (SMSAlert) reject any text that isn't a character-for-character
 * match of a template registered on the account — the placeholders are the only
 * part allowed to vary. So the editable content must be the registered text with
 * each {#var#} swapped for one of our {{variables}}.
 */
const toEditableContent = (providerText: string, vars: VariableDef[]): string => {
  let i = 0;
  return providerText.replace(/\{#var#\}/g, () => vars[i]?.key ?? `{{var${++i}}}`);
};

/** Compare a body against a registered template, ignoring placeholder values. */
const matchesProviderTemplate = (content: string, providerText: string): boolean => {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = providerText.split('{#var#}').map(esc).join('[\\s\\S]*?');
  return new RegExp(`^${pattern}$`).test(content.trim());
};

const SmsTemplates: React.FC = () => {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel>('sms');
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState<string | null>(null);
  const [testingEvent, setTestingEvent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateForm[]>([]);
  const [originalTemplates, setOriginalTemplates] = useState<Record<string, TemplateForm>>({});
  const [providerTemplates, setProviderTemplates] = useState<ProviderTemplate[]>([]);
  const [conn, setConn] = useState<ConnStatus>({ state: 'unknown' });
  const [testPhone, setTestPhone] = useState('');
  const [autoMapping, setAutoMapping] = useState(false);
  const [config, setConfig] = useState<SmsConfigForm>({
    isEnabled: false, test: { ...EMPTY_SMS_MODE }, live: { ...EMPTY_SMS_MODE },
  });
  const [originalConfig, setOriginalConfig] = useState<SmsConfigForm | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');

  const keyOf = (t: { event: string; channel: Channel }) => `${t.channel}:${t.event}`;

  const loadTemplates = async (ch: Channel) => {
    const rows = asArray(await smsTemplatesAPI.list(ch));
    const mapped: TemplateForm[] = rows.map((t: any) => ({
      event: t.event,
      title: t.title || t.event,
      description: t.description || '',
      category: t.category || 'Marketing',
      channel: (t.channel as Channel) || ch,
      content: t.content || '',
      templateId: t.templateId || '',
      isEnabled: t.isEnabled !== false,
      variablesHint: Array.isArray(t.variablesHint) ? t.variablesHint : [],
      variables: Array.isArray(t.variables) ? t.variables : [],
      requiresOtp: !!t.requiresOtp,
    }));
    const originals: Record<string, TemplateForm> = {};
    mapped.forEach((t) => { originals[keyOf(t)] = { ...t }; });
    setTemplates(mapped);
    setOriginalTemplates(originals);
  };

  const testConnection = async () => {
    setConn({ state: 'testing' });
    const r: any = await smsConfigAPI.test();
    setConn({ state: r?.ok ? 'ok' : 'fail', message: r?.message });
    if (r?.ok) loadProviderTemplates();
  };

  const loadProviderTemplates = async () => {
    const r: any = await smsConfigAPI.getProviderTemplates();
    setProviderTemplates(r?.ok ? r.templates : []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [, configData] = await Promise.all([loadTemplates(channel), smsConfigAPI.get()]);
        const c = configData?.data || configData || {};
        const modeView = (m: any): SmsConfigMode => ({
          baseUrl: m?.baseUrl || '', route: m?.route || 'transactional', senderId: m?.senderId || '',
          apiKey: '', apiKeySet: Boolean(m?.apiKeySet),
        });
        const next: SmsConfigForm = {
          isEnabled: Boolean(c?.isEnabled),
          test: modeView(c?.test),
          live: modeView(c?.live),
        };
        setConfig(next);
        setOriginalConfig({ ...next });
        setEnvironment(c?.environment === 'live' ? 'live' : 'test');
        if (next.live.apiKeySet || next.test.apiKeySet) { testConnection(); }
      } catch (err: any) {
        setError(err.message || 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchChannel = async (ch: Channel) => {
    if (ch === channel) return;
    setChannel(ch);
    setLoading(true);
    try { await loadTemplates(ch); }
    catch (err: any) { setError(err.message || 'Failed to load templates'); }
    finally { setLoading(false); }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateForm[]>();
    templates.forEach((t) => {
      const arr = map.get(t.category) || [];
      arr.push(t);
      map.set(t.category, arr);
    });
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }))
      .concat([...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).map((c) => ({ category: c, items: map.get(c)! })));
  }, [templates]);

  const patch = (event: string, field: keyof TemplateForm, value: any) => {
    setTemplates((prev) => prev.map((t) => (t.event === event && t.channel === channel ? { ...t, [field]: value } : t)));
  };

  /** Adopt a registered DLT template for an event: exact text + its id. */
  const useProviderTemplate = (t: TemplateForm, providerId: string) => {
    const pt = providerTemplates.find((p) => p.id === providerId);
    if (!pt) { patch(t.event, 'templateId', ''); return; }
    setTemplates((prev) => prev.map((x) => (x.event === t.event && x.channel === channel
      ? { ...x, templateId: pt.id, content: toEditableContent(pt.template, x.variables) }
      : x)));
    setNotice(`Loaded DLT template ${pt.id} into "${t.title}". Check the variables line up, then Save.`);
    setTimeout(() => setNotice(null), 6000);
  };

  /**
   * Adopt the DLT-approved wording for every action we can match. Without this
   * each action keeps our own wording, which the gateway rejects outright.
   */
  const handleAutoMap = async () => {
    try {
      setAutoMapping(true);
      setError(null);
      const r: any = await smsConfigAPI.applyAutoMap();
      if (!r?.ok) { setError(r?.message || 'Auto-map failed'); return; }
      await loadTemplates(channel);
      setNotice(`${r.message}. Review the text below, then use "Send test" to confirm.`);
      setTimeout(() => setNotice(null), 8000);
    } finally {
      setAutoMapping(false);
    }
  };

  const handleReset = (t: TemplateForm) => {
    const original = originalTemplates[keyOf(t)];
    if (original) setTemplates((prev) => prev.map((x) => (keyOf(x) === keyOf(t) ? { ...original } : x)));
  };

  const handleSave = async (template: TemplateForm) => {
    if (template.requiresOtp && !/\{\{\s*otp\s*\}\}/i.test(template.content)) {
      setError(`${template.title} must include the {{otp}} variable.`);
      return;
    }
    try {
      setSavingEvent(keyOf(template));
      setError(null);
      await smsTemplatesAPI.update(template.event, {
        content: template.content,
        templateId: template.templateId,
        isEnabled: template.isEnabled,
        variablesHint: template.variablesHint,
        channel: template.channel,
      });
      setOriginalTemplates((prev) => ({ ...prev, [keyOf(template)]: { ...template } }));
      setNotice(`Saved "${template.title}".`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save template.');
    } finally {
      setSavingEvent(null);
    }
  };

  const handleTestSend = async (template: TemplateForm) => {
    if (!testPhone.trim()) { setError('Enter a test mobile number at the top first.'); return; }
    try {
      setTestingEvent(keyOf(template));
      setError(null);
      const r: any = await smsConfigAPI.sendTest({ phoneNumber: testPhone.trim(), event: template.event });
      if (r?.ok) { setNotice(`Test SMS sent for "${template.title}".`); setTimeout(() => setNotice(null), 5000); }
      else setError(`${template.title}: ${r?.message || 'Test failed'}`);
    } finally {
      setTestingEvent(null);
    }
  };

  const handleConfigSave = async () => {
    try {
      setConfigSaving(true);
      setError(null);
      const modeOut = (m: SmsConfigMode) => ({
        baseUrl: m.baseUrl, route: m.route, senderId: m.senderId,
        apiKey: m.apiKey.trim() ? m.apiKey.trim() : undefined,
      });
      const payload: any = { isEnabled: config.isEnabled, test: modeOut(config.test), live: modeOut(config.live) };
      const res = await smsConfigAPI.update(payload);
      const updated = res?.data || res;
      const modeView = (m: any): SmsConfigMode => ({
        baseUrl: m?.baseUrl || '', route: m?.route || 'transactional', senderId: m?.senderId || '',
        apiKey: '', apiKeySet: Boolean(m?.apiKeySet),
      });
      const next: SmsConfigForm = {
        isEnabled: Boolean(updated.isEnabled), test: modeView(updated.test), live: modeView(updated.live),
      };
      setConfig(next);
      setOriginalConfig({ ...next });
      testConnection();
    } catch (err: any) {
      setError(err.message || 'Failed to save provider settings.');
    } finally {
      setConfigSaving(false);
    }
  };

  const modeChanged = (a: SmsConfigMode, b: SmsConfigMode) =>
    a.baseUrl !== b.baseUrl || a.route !== b.route || a.senderId !== b.senderId || Boolean(b.apiKey.trim());

  const configHasChanges = !!originalConfig && (
    originalConfig.isEnabled !== config.isEnabled ||
    modeChanged(originalConfig.test, config.test) || modeChanged(originalConfig.live, config.live)
  );

  const handleSmsConfigModeChange = (mode: 'test' | 'live', field: keyof SmsConfigMode, value: any) => {
    setConfig((p) => ({ ...p, [mode]: { ...p[mode], [field]: value } }));
  };

  const ChannelTab: React.FC<{ id: Channel; icon: React.ReactNode; label: string }> = ({ id, icon, label }) => (
    <button type="button" onClick={() => switchChannel(id)}
      className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        channel === id ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <FaArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Notification Templates</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure the SMS gateway and map each action to one of your DLT-approved templates.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium flex justify-between items-start gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg leading-none">&times;</button>
        </div>
      )}
      {notice && (
        <div className="bg-emerald-50 text-emerald-800 p-3 border border-emerald-200 rounded-lg text-sm">{notice}</div>
      )}

      <div className="flex items-center gap-2">
        <ChannelTab id="sms" icon={<MessageSquare className="h-4 w-4" />} label="SMS" />
        <ChannelTab id="whatsapp" icon={<Phone className="h-4 w-4" />} label="WhatsApp" />
      </div>

      {channel === 'sms' && (
        <>
          {/* ── Connection status: answers "are my details actually saved & working?" ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>SMS Gateway</CardTitle>
                  <CardDescription>Credentials are stored encrypted. Test to confirm they work.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    Store is in {environment === 'live' ? 'LIVE' : 'TEST'} mode
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={conn.state === 'testing'}>
                    {conn.state === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                    Test connection
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={config.isEnabled ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-600'}>
                  {config.isEnabled ? 'Sending enabled' : 'Sending disabled'}
                </Badge>
                {conn.state === 'ok' && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> {conn.message}
                  </span>
                )}
                {conn.state === 'fail' && (
                  <span className="inline-flex items-center gap-1 text-sm text-red-700">
                    <XCircle className="h-4 w-4" /> {conn.message}
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <p className="text-xs text-muted-foreground">
                The mode above is set by the platform (super admin), not here. Fill in whichever
                pair matches it — the other stays saved and ready for when the platform switches
                your store's mode. "Test connection" checks the ACTIVE mode's credentials.
              </p>

              {(['live', 'test'] as const).map((mode) => (
                <div key={mode} className="rounded-lg border p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide">{mode}</p>
                    {mode === environment && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">ACTIVE MODE</span>
                    )}
                    {config[mode].apiKeySet && config[mode].senderId ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Configured</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Not configured</span>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">API Base URL</label>
                      <Input type="url" value={config[mode].baseUrl} placeholder="https://www.smsalert.co.in/api"
                        onChange={(e) => handleSmsConfigModeChange(mode, 'baseUrl', e.target.value)} />
                      <p className="text-[10px] text-muted-foreground">
                        Base only — don&apos;t include <span className="font-mono">/push.json</span>. We add the endpoint.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Route</label>
                      <Input type="text" value={config[mode].route} placeholder="transactional"
                        onChange={(e) => handleSmsConfigModeChange(mode, 'route', e.target.value)} />
                      <p className="text-[10px] text-muted-foreground">Lowercase, e.g. <span className="font-mono">transactional</span>.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sender ID</label>
                      <Input type="text" value={config[mode].senderId} maxLength={6} className="uppercase" placeholder="RDFTIN"
                        onChange={(e) => handleSmsConfigModeChange(mode, 'senderId', e.target.value.toUpperCase())} />
                      <p className="text-[10px] text-muted-foreground">Must be an approved sender on your gateway account.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">API Key {config[mode].apiKeySet && <span className="text-muted-foreground">(leave blank to keep current)</span>}</label>
                      <Input type="password" value={config[mode].apiKey} placeholder={config[mode].apiKeySet ? '•••••••••• saved' : 'Enter API key'}
                        onChange={(e) => handleSmsConfigModeChange(mode, 'apiKey', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={config.isEnabled} onCheckedChange={(c) => setConfig((p) => ({ ...p, isEnabled: c as boolean }))} />
                  <span className="text-sm font-medium">Enable SMS sending</span>
                </label>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" disabled={!configHasChanges}
                    onClick={() => originalConfig && setConfig({ ...originalConfig, test: { ...originalConfig.test, apiKey: '' }, live: { ...originalConfig.live, apiKey: '' } })}>
                    <FaUndo className="mr-2 h-4 w-4" /> Reset
                  </Button>
                  <Button type="button" onClick={handleConfigSave} disabled={!configHasChanges || configSaving} className="bg-blue-600 hover:bg-blue-700">
                    {configSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FaSave className="mr-2 h-4 w-4" />}
                    Save gateway settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── DLT explainer + test number ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">DLT approved templates ({providerTemplates.length})</CardTitle>
              <CardDescription>
                Indian SMS gateways reject any message whose text isn&apos;t an exact match of a template registered on
                your account — only the placeholders may change. Pick the matching DLT template for each action below,
                otherwise sending fails with <span className="font-mono">Invalid Template Match</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Test mobile number</label>
                  <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="9876543210" className="w-48" />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={loadProviderTemplates}>Refresh list</Button>
                <Button type="button" size="sm" onClick={handleAutoMap} disabled={autoMapping || providerTemplates.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700">
                  {autoMapping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Auto-map actions to DLT templates
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Auto-map matches each action to its registered template and fills the variable slots — review the
                result below, then Send test.
              </p>
              {providerTemplates.length === 0 && (
                <p className="text-sm text-amber-700 inline-flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> No DLT templates loaded — test the connection first.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {channel === 'whatsapp' && (
        <div className="bg-muted/40 border rounded-lg p-4 text-sm text-muted-foreground">
          WhatsApp uses templates approved in your WhatsApp Business account. Set the
          <span className="font-mono"> template name</span> to the approved name.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, items }) => (
            <div key={category} className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</h2>
              {items.map((t) => {
                const k = keyOf(t);
                const hasChanges = JSON.stringify(t) !== JSON.stringify(originalTemplates[k]);
                const linked = providerTemplates.find((p) => p.id === t.templateId);
                const matches = linked ? matchesProviderTemplate(t.content, linked.template) : false;
                const showDltWarning = channel === 'sms' && providerTemplates.length > 0 && (!linked || !matches);

                return (
                  <Card key={k}>
                    <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          {t.title}
                          {t.requiresOtp && <Badge variant="outline" className="text-[10px]">Security</Badge>}
                          {channel === 'sms' && linked && matches && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-normal">
                              <CheckCircle2 className="h-3.5 w-3.5" /> DLT {linked.id}
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>{t.description}</CardDescription>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <Checkbox checked={t.isEnabled} onCheckedChange={(c) => patch(t.event, 'isEnabled', c as boolean)} />
                        <span className="text-sm font-medium">Enabled</span>
                      </label>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {channel === 'sms' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">DLT template used for this action</label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={t.templateId}
                            onChange={(e) => useProviderTemplate(t, e.target.value)}
                          >
                            <option value="">— none selected —</option>
                            {providerTemplates.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.id} — {p.template.slice(0, 70)}{p.template.length > 70 ? '…' : ''}
                              </option>
                            ))}
                          </select>
                          {showDltWarning && (
                            <p className="text-xs text-amber-700 inline-flex items-start gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {!linked
                                ? 'No DLT template selected — sending this will fail with "Invalid Template Match".'
                                : 'The content no longer matches the selected DLT template. Only placeholders may differ.'}
                            </p>
                          )}
                        </div>
                      )}

                      {channel === 'whatsapp' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">WhatsApp template name</label>
                          <Input value={t.templateId} placeholder="order_confirmation"
                            onChange={(e) => patch(t.event, 'templateId', e.target.value)} />
                        </div>
                      )}

                      {t.variables.length > 0 && (
                        <div className="bg-muted/50 border rounded-md p-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variables</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {t.variables.map((v) => (
                              <div key={v.key} className="text-sm flex items-center gap-2">
                                <Badge variant="outline" className="font-mono bg-background">{v.key}</Badge>
                                <span className="text-muted-foreground text-xs">{v.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Message text</label>
                        <Textarea value={t.content} rows={3} className="font-mono text-sm"
                          onChange={(e) => patch(t.event, 'content', e.target.value)} />
                        {linked && (
                          <p className="text-[10px] text-muted-foreground">
                            Registered DLT text: <span className="font-mono">{linked.template}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between gap-3 pt-1 flex-wrap">
                        {channel === 'sms' && (
                          <Button type="button" variant="outline" onClick={() => handleTestSend(t)} disabled={testingEvent === k}>
                            {testingEvent === k ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Send test
                          </Button>
                        )}
                        <div className="flex gap-3 ml-auto">
                          <Button type="button" variant="outline" onClick={() => handleReset(t)} disabled={!hasChanges}>
                            <FaUndo className="mr-2 h-4 w-4" /> Reset
                          </Button>
                          <Button type="button" onClick={() => handleSave(t)} disabled={savingEvent === k} className="bg-blue-600 hover:bg-blue-700">
                            {savingEvent === k ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FaSave className="mr-2 h-4 w-4" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmsTemplates;
