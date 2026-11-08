/**
 * The thresholds behind the Meta ad alerts (META-10's `meta_insights` store setting, `GET|PATCH
 * /meta/insights/settings`): when spend without sales, a low return, a cost per purchase spike, people seeing an
 * ad too often, rejections, account problems and an expiring token raise an alert. Each field shows the seeded
 * default beside it; saving sends only the alert rules, merged key by key on the server and written to the audit
 * log with the person.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import { metaAdsApi, type AlertRuleSetting, type InsightsAlertSettings } from '@/lib/v2/areas/meta';
import { LoadFailure, money, useLoad, writeError } from '../common';

type RuleKey = 'spend_no_sales' | 'roas_below' | 'cpa_spike' | 'frequency' | 'rejected' | 'account_issue' | 'token';
type FieldKey = keyof AlertRuleSetting;
interface FieldDef { key: FieldKey; label: string; kind: 'days' | 'int' | 'decimal' | 'money' }

/** How each rule reads on screen; the values themselves come from the setting. */
const RULES: Array<{ key: RuleKey; title: string; help: string; fields: FieldDef[] }> = [
  { key: 'spend_no_sales', title: 'Spend without sales', help: 'An ad spends and the store records no purchase from it.',
    fields: [{ key: 'days', label: 'Over the last (days)', kind: 'days' }, { key: 'min_spend_minor', label: 'Once it has spent at least', kind: 'money' }, { key: 'aov_multiple', label: 'Or, when no amount is set, times your average order', kind: 'decimal' }] },
  { key: 'roas_below', title: 'Return below target', help: 'Sales from ads divided by spend falls under your target.',
    fields: [{ key: 'target', label: 'Target return (for example 1.5)', kind: 'decimal' }, { key: 'days', label: 'Over the last (days)', kind: 'days' }, { key: 'min_spend_minor', label: 'Once it has spent at least', kind: 'money' }, { key: 'aov_multiple', label: 'Or, when no amount is set, times your average order', kind: 'decimal' }] },
  { key: 'cpa_spike', title: 'Cost per purchase jumps', help: 'The recent cost per purchase is well above its usual level.',
    fields: [{ key: 'percent', label: 'Rise of at least (percent)', kind: 'int' }, { key: 'recent_days', label: 'Recent days', kind: 'days' }, { key: 'baseline_days', label: 'Compared with the days before', kind: 'days' }, { key: 'min_purchases', label: 'Only with at least (purchases)', kind: 'int' }] },
  { key: 'frequency', title: 'Seen too often', help: 'People see the same ad so often that they tire of it.',
    fields: [{ key: 'max', label: 'Times per person, at most', kind: 'decimal' }, { key: 'days', label: 'Over the last (days)', kind: 'days' }] },
  { key: 'rejected', title: 'Rejected ads', help: 'Meta refuses an ad.', fields: [] },
  { key: 'account_issue', title: 'Ad account problems', help: 'The ad account is disabled, unpaid or restricted.', fields: [] },
  { key: 'token', title: 'Meta connection ending', help: "The connection's access runs out soon.", fields: [{ key: 'expires_within_days', label: 'Warn this many days ahead', kind: 'days' }] },
];

const toField = (f: FieldDef, v: unknown, cur: string): string => {
  if (v === null || v === undefined) return '';
  if (f.kind === 'money') return String(minorToMajor(Number(v), cur));
  return String(v);
};
const fromField = (f: FieldDef, v: string, cur: string): unknown => {
  const t = v.trim();
  if (f.kind === 'money') return t ? majorToMinor(t, cur) : null;
  if (f.kind === 'decimal') return t;
  return t === '' ? undefined : Number(t);
};
const defaultText = (f: FieldDef, v: unknown, cur: string): string => {
  if (v === null || v === undefined || v === '') return 'not set';
  return f.kind === 'money' ? money(Number(v), cur) : String(v);
};

export const AlertSettingsDialog: React.FC<{ canEdit: boolean; currency: string; onClose: () => void; onSaved: () => void }> = ({ canEdit, currency, onClose, onSaved }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaAdsApi.insightsSettings(), []);
  const [form, setForm] = useState<Record<string, { enabled: boolean; values: Record<string, string> }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!q.data || form) return;
    const a = q.data.settings.alerts ?? {};
    setForm(Object.fromEntries(RULES.map((r) => {
      const rule = (a[r.key] ?? { enabled: false }) as AlertRuleSetting;
      return [r.key, { enabled: rule.enabled !== false, values: Object.fromEntries(r.fields.map((f) => [f.key, toField(f, rule[f.key], currency)])) }];
    })));
  }, [q.data, form, currency]);

  const save = async () => {
    if (!form) return;
    const alerts: InsightsAlertSettings = {};
    for (const r of RULES) {
      const out: AlertRuleSetting = { enabled: form[r.key].enabled };
      for (const f of r.fields) {
        const v = fromField(f, form[r.key].values[f.key] ?? '', currency);
        if (f.kind === 'money' && v === null && (form[r.key].values[f.key] ?? '').trim()) { setErr(`${r.title}: type an amount in ${currency}.`); return; }
        if ((f.kind === 'days' || f.kind === 'int') && v !== undefined && !(Number.isInteger(v) && (v as number) >= 0)) { setErr(`${r.title}: ${f.label.toLowerCase()} must be a whole number.`); return; }
        if (f.kind === 'decimal' && v !== '' && !/^\d+(\.\d+)?$/.test(String(v))) { setErr(`${r.title}: ${f.label.toLowerCase()} must be a number.`); return; }
        if (v !== undefined && v !== '') (out as any)[f.key] = v;
        if (f.kind === 'money' && v === null) (out as any)[f.key] = null;
      }
      (alerts as any)[r.key] = out;
    }
    setBusy(true); setErr('');
    try { await metaAdsApi.saveInsightsSettings({ alerts }); toast({ title: 'Alert settings saved' }); onSaved(); }
    catch (e) { setErr(writeError(e, 'The settings were not saved.')); }
    finally { setBusy(false); }
  };

  const defaults = q.data?.defaults.alerts ?? {};
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>When to raise an alert</DialogTitle>
          <DialogDescription>Alerts show on Marketing home and here. Each rule can be switched off; the default sits beside each figure.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {q.error && !q.data ? <LoadFailure failure={q.error} what="The alert settings (GET /api/v2/marketing/meta/insights/settings) are not served yet." onRetry={q.reload} />
            : !form ? <p className="text-sm text-gray-500">Loading...</p> : (
              <ul className="divide-y">
                {RULES.map((r) => {
                  const st = form[r.key];
                  const def = (defaults[r.key] ?? {}) as AlertRuleSetting;
                  return (
                    <li key={r.key} className="py-3">
                      <label className="flex items-start gap-3">
                        <Switch checked={st.enabled} disabled={!canEdit} onCheckedChange={(v) => setForm({ ...form, [r.key]: { ...st, enabled: v } })} className="mt-0.5" />
                        <span className="text-sm"><span className="font-medium text-gray-900">{r.title}</span><span className="block text-xs text-gray-600">{r.help}</span></span>
                      </label>
                      {r.fields.length > 0 && st.enabled && (
                        <div className="mt-2 grid gap-3 pl-12 sm:grid-cols-2">
                          {r.fields.map((f) => (
                            <div key={f.key}>
                              <label htmlFor={`al-${r.key}-${f.key}`} className="block text-xs text-gray-700">{f.label}{f.kind === 'money' ? ` (${currency})` : ''}</label>
                              <Input id={`al-${r.key}-${f.key}`} inputMode="decimal" disabled={!canEdit} value={st.values[f.key] ?? ''}
                                onChange={(e) => setForm({ ...form, [r.key]: { ...st, values: { ...st.values, [f.key]: e.target.value } } })} className="mt-1 h-9" />
                              <p className="mt-0.5 text-[11px] text-gray-500">Default: {defaultText(f, def[f.key], currency)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
        <DialogFooter className="items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-red-700">{err || (!canEdit ? 'Changing these needs the ads manage permission.' : '')}</p>
          <Button variant="outline" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && <Button onClick={save} disabled={busy || !form}>{busy && <Loader2 className="animate-spin" />} Save alert settings</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AlertSettingsDialog;
