import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaUndo } from 'react-icons/fa';
import { cartsAPI, smsTemplatesAPI } from '../services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Mail, Phone, Percent, ExternalLink, AlertTriangle } from 'lucide-react';

type WhatsAppMode = 'default' | 'custom';

interface WhatsAppChannelForm {
  enabled: boolean;
  mode: WhatsAppMode;
  templateId?: string;
  templateName?: string;
  languageCode?: string;
  paramOrder?: string[];
}
interface EmailChannelForm { enabled: boolean; subject: string; headline: string; message: string }
interface StepForm {
  key: string;
  name: string;
  enabled: boolean;
  delayHours: number;
  discount?: { enabled: boolean; type: 'percentage' | 'fixed'; value: number; maxDiscount?: number; expiresInDays?: number };
  channels: { whatsapp: WhatsAppChannelForm; sms: { enabled: boolean }; email: EmailChannelForm };
}

interface WaTemplateSummary { id: string; name: string; language: string; category?: string; status: string }

/** Human labels for the variables a step's content may reference — mirrors the
 *  backend's RECOVERY_VARIABLE_KEYS (source of truth for which keys are valid;
 *  `recoveryUrl` is omitted here since it's a value-identical alias of
 *  cartRecoveryLink and would only confuse the picker). */
const VARIABLE_LABELS: Record<string, string> = {
  customerName: 'Customer Name',
  cartRecoveryLink: 'Cart Recovery Link',
  discountCode: 'Discount Code',
  discountLabel: 'Discount Label (e.g. "10% off")',
  discountExpiry: 'Discount Expiry Date',
  cartTotal: 'Cart Total',
  cartId: 'Cart ID',
  storeUrl: 'Store URL',
};
const PICKABLE_VARIABLES = Object.keys(VARIABLE_LABELS);

const asArray = (res: any): any[] => (Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);

const CartRecoveryAutomation: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepForm[]>([]);
  const [original, setOriginal] = useState<StepForm[]>([]);
  const [waTemplates, setWaTemplates] = useState<WaTemplateSummary[]>([]);
  const [waTemplatesLoading, setWaTemplatesLoading] = useState(true);
  const [waLoadError, setWaLoadError] = useState<string | null>(null);
  const [waDetailLoading, setWaDetailLoading] = useState<string | null>(null);
  const [smsPreview, setSmsPreview] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [stepsData, smsRows] = await Promise.all([
          cartsAPI.getRecoverySteps(),
          smsTemplatesAPI.list('sms').catch(() => []),
        ]);
        const loaded: StepForm[] = stepsData?.steps ?? [];
        setSteps(loaded);
        setOriginal(JSON.parse(JSON.stringify(loaded)));

        const preview: Record<string, string> = {};
        asArray(smsRows).forEach((t: any) => { if (t.event?.startsWith('cart_recovery_')) preview[t.event] = t.content || ''; });
        setSmsPreview(preview);

        // Fetches live from the store's real WhatsApp Business account (an
        // external API call) — routinely takes a few seconds, so this gets
        // its own loading flag rather than looking like a permanently-empty
        // dropdown while the rest of the page has already rendered.
        cartsAPI.listWhatsAppTemplates()
          .then((rows: any) => setWaTemplates(asArray(rows)))
          .catch((err: any) => setWaLoadError(err.message || 'Could not load WhatsApp templates'))
          .finally(() => setWaTemplatesLoading(false));
      } catch (err: any) {
        setError(err.message || 'Failed to load the cart recovery flow');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasChanges = useMemo(() => JSON.stringify(steps) !== JSON.stringify(original), [steps, original]);

  const patchStep = (key: string, fn: (s: StepForm) => StepForm) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? fn(s) : s)));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const result = await cartsAPI.updateRecoverySteps(steps);
      const saved: StepForm[] = result?.steps ?? steps;
      setSteps(saved);
      setOriginal(JSON.parse(JSON.stringify(saved)));
      setNotice('Cart recovery flow saved.');
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save the cart recovery flow');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSteps(JSON.parse(JSON.stringify(original)));

  const pickWhatsAppTemplate = async (stepKey: string, templateId: string) => {
    if (!templateId) {
      patchStep(stepKey, (s) => ({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, templateId: undefined, templateName: undefined, paramOrder: [] } } }));
      return;
    }
    const summary = waTemplates.find((t) => t.id === templateId);
    try {
      setWaDetailLoading(stepKey);
      const detail = await cartsAPI.getWhatsAppTemplate(templateId);
      const paramCount = Number(detail?.paramCount) || 0;
      patchStep(stepKey, (s) => ({
        ...s,
        channels: {
          ...s.channels,
          whatsapp: {
            ...s.channels.whatsapp,
            templateId,
            templateName: summary?.name || detail?.name,
            languageCode: summary?.language || detail?.language || 'en_US',
            paramOrder: Array.from({ length: paramCount }, (_, i) => s.channels.whatsapp.paramOrder?.[i] || ''),
          },
        },
      }));
    } catch (err: any) {
      setError(err.message || 'Could not load that template');
    } finally {
      setWaDetailLoading(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground mb-4">
          <FaArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Cart Recovery Automation</h1>
        <p className="text-sm text-muted-foreground mt-2">
          The flow a shopper's abandoned cart runs through — a Reminder, then a stronger Persuasion
          nudge, then a Discount-backed final push. Each step has its own timing and its own message
          per channel. A disabled step is skipped without waiting; a disabled channel is simply not
          sent for that step.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 border border-red-200 rounded-lg text-sm font-medium flex justify-between items-start gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-lg leading-none">&times;</button>
        </div>
      )}
      {notice && <div className="bg-emerald-50 text-emerald-800 p-3 border border-emerald-200 rounded-lg text-sm">{notice}</div>}

      <div className="flex flex-wrap items-center gap-2 text-sm bg-muted/40 border rounded-lg p-3">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <span className={`font-medium ${s.enabled ? '' : 'text-muted-foreground line-through'}`}>{s.name}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground">→ {steps[i + 1].delayHours}h →</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="space-y-6">
        {steps.map((step) => (
          <Card key={step.key}>
            <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Input
                    value={step.name}
                    className="text-base font-semibold h-9 w-56"
                    onChange={(e) => patchStep(step.key, (s) => ({ ...s, name: e.target.value }))}
                  />
                  {step.discount?.enabled && <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50"><Percent className="h-3 w-3 mr-1" />Discount</Badge>}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Sends
                  <Input
                    type="number" min={0} max={720}
                    value={step.delayHours}
                    className="h-8 w-20"
                    onChange={(e) => patchStep(step.key, (s) => ({ ...s, delayHours: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                  hours after the previous step (or after abandonment, for the first step).
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <Checkbox checked={step.enabled} onCheckedChange={(c) => patchStep(step.key, (s) => ({ ...s, enabled: c as boolean }))} />
                <span className="text-sm font-medium">Step enabled</span>
              </label>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* ── Discount ── */}
              <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!step.discount?.enabled}
                    onCheckedChange={(c) => patchStep(step.key, (s) => ({
                      ...s,
                      discount: { type: 'percentage', value: 10, maxDiscount: 500, expiresInDays: 7, ...s.discount, enabled: c as boolean },
                    }))}
                  />
                  <span className="text-sm font-medium">Auto-generate a discount code for this step</span>
                </label>
                {step.discount?.enabled && (
                  <div className="grid gap-3 sm:grid-cols-4 pl-6">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Type</label>
                      <select
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={step.discount.type}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, discount: { ...s.discount!, type: e.target.value as 'percentage' | 'fixed' } }))}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed (₹)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Value</label>
                      <Input type="number" min={1} className="h-8" value={step.discount.value}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, discount: { ...s.discount!, value: Number(e.target.value) || 0 } }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Max discount (₹, optional)</label>
                      <Input type="number" min={0} className="h-8" value={step.discount.maxDiscount ?? ''}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, discount: { ...s.discount!, maxDiscount: e.target.value === '' ? undefined : Number(e.target.value) } }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Expires in (days)</label>
                      <Input type="number" min={1} max={90} className="h-8" value={step.discount.expiresInDays ?? 7}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, discount: { ...s.discount!, expiresInDays: Number(e.target.value) || 7 } }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* ── WhatsApp ── */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2 font-medium text-sm"><Phone className="h-4 w-4 text-emerald-600" /> WhatsApp</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={step.channels.whatsapp.enabled}
                      onCheckedChange={(c) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, enabled: c as boolean } } }))} />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
                {step.channels.whatsapp.enabled && (
                  <div className="space-y-3 pl-1">
                    <div className="flex items-center gap-4 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={step.channels.whatsapp.mode !== 'custom'}
                          onChange={() => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, mode: 'default' } } }))} />
                        Use default template
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={step.channels.whatsapp.mode === 'custom'}
                          onChange={() => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, mode: 'custom' } } }))} />
                        Pick a different approved template
                      </label>
                    </div>
                    {step.channels.whatsapp.mode === 'default' ? (
                      <p className="text-xs text-muted-foreground">
                        Sends via your existing approved <span className="font-mono">cart_recovery</span> template — Meta
                        requires a pre-approved template for every WhatsApp message, so wording can't be freely typed
                        here. The discount code shown/hidden automatically depends on this step's settings above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {waLoadError && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{waLoadError}</p>}
                        {waTemplatesLoading ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching your approved templates from WhatsApp…
                          </p>
                        ) : (
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={step.channels.whatsapp.templateId || ''}
                            onChange={(e) => pickWhatsAppTemplate(step.key, e.target.value)}
                          >
                            <option value="">— select an approved template —</option>
                            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                          </select>
                        )}
                        {waDetailLoading === step.key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {!!step.channels.whatsapp.paramOrder?.length && (
                          <div className="bg-muted/50 border rounded-md p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Fill each placeholder ({'{{1}}'}, {'{{2}}'}, …) with a variable, in order
                            </p>
                            {step.channels.whatsapp.paramOrder.map((val, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono shrink-0">{`{{${idx + 1}}}`}</Badge>
                                <select
                                  className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                                  value={val}
                                  onChange={(e) => patchStep(step.key, (s) => {
                                    const paramOrder = [...(s.channels.whatsapp.paramOrder || [])];
                                    paramOrder[idx] = e.target.value;
                                    return { ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, paramOrder } } };
                                  })}
                                >
                                  <option value="">— choose —</option>
                                  {PICKABLE_VARIABLES.map((k) => <option key={k} value={k}>{VARIABLE_LABELS[k]}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── SMS ── */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2 font-medium text-sm"><MessageSquare className="h-4 w-4 text-blue-600" /> SMS</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={step.channels.sms.enabled}
                      onCheckedChange={(c) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, sms: { enabled: c as boolean } } }))} />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
                {step.channels.sms.enabled && (
                  <div className="space-y-2 pl-1">
                    <p className="text-sm bg-muted/50 border rounded-md p-3 font-mono">
                      {smsPreview[`cart_recovery_${step.key}`] || <span className="text-muted-foreground italic">Using the default wording — edit it below.</span>}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => navigate('/settings/sms-templates')}>
                      Edit wording in Settings → SMS Templates <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Email ── */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2 font-medium text-sm"><Mail className="h-4 w-4 text-purple-600" /> Email</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={step.channels.email.enabled}
                      onCheckedChange={(c) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, email: { ...s.channels.email, enabled: c as boolean } } }))} />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
                {step.channels.email.enabled && (
                  <div className="space-y-3 pl-1">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Subject (blank = default)</label>
                      <Input value={step.channels.email.subject}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, email: { ...s.channels.email, subject: e.target.value } } }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Headline (blank = default)</label>
                      <Input value={step.channels.email.headline}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, email: { ...s.channels.email, headline: e.target.value } } }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Message (blank = default)</label>
                      <Textarea rows={3} value={step.channels.email.message}
                        onChange={(e) => patchStep(step.key, (s) => ({ ...s, channels: { ...s.channels, email: { ...s.channels.email, message: e.target.value } } }))} />
                    </div>
                    <div className="bg-muted/50 border rounded-md p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variables</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PICKABLE_VARIABLES.map((k) => (
                          <div key={k} className="text-sm flex items-center gap-2">
                            <Badge variant="outline" className="font-mono bg-background">{`{{${k}}}`}</Badge>
                            <span className="text-muted-foreground text-xs">{VARIABLE_LABELS[k]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-3 sticky bottom-4">
        <Button type="button" variant="outline" onClick={handleReset} disabled={!hasChanges}>
          <FaUndo className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button type="button" onClick={handleSave} disabled={!hasChanges || saving} className="bg-blue-600 hover:bg-blue-700">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FaSave className="mr-2 h-4 w-4" />}
          Save flow
        </Button>
      </div>
    </div>
  );
};

export default CartRecoveryAutomation;
