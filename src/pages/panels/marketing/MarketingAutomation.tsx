import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDateTime } from '../../../utils/date';

/**
 * Automation rules — auto emails / notifications on store events.
 * Rules send APPROVED templates (or a free-form body for transactional-style
 * triggers); cart/signup triggers are consent-filtered by the engine.
 */
const MarketingAutomation: React.FC = () => {
  const { hasPerm } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>({ channels: ['email'], delay_minutes: 30 });
  const [error, setError] = useState('');

  const load = async () => {
    const [r, t, tp, ex, ls] = await Promise.all([
      api.get('/marketing-hub/automation/rules'),
      api.get('/marketing-hub/automation/triggers'),
      api.get('/marketing-hub/templates', { params: { status: 'approved' } }),
      api.get('/marketing-hub/automation/executions', { params: { limit: 50 } }),
      api.get('/marketing-hub/audiences/lists'),
    ]);
    setRules(payload(r) ?? []); setTriggers(payload(t) ?? []);
    setTemplates(payload(tp) ?? []); setExecutions(payload(ex) ?? []);
    setLists(payload(ls) ?? []);
  };
  useEffect(() => { load().catch((e) => setError(e?.response?.data?.message ?? e.message)); }, []);

  const act = async (fn: () => Promise<any>) => {
    setError('');
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const save = () => act(async () => {
    const config: any = form.template_ref
      ? { template_ref: form.template_ref } : { body: form.body, subject: form.subject };
    if (form.add_to_list_id) config.add_to_list_id = form.add_to_list_id;
    await api.post('/marketing-hub/automation/rules', {
      name: form.name, trigger_event: form.trigger_event,
      delay_minutes: Number(form.delay_minutes) || 0,
      channels: form.listOnly ? [] : form.channels,
      config,
    });
    setShowNew(false); setForm({ channels: ['email'], delay_minutes: 30 });
  });

  /** Sensible per-trigger defaults + auto name + best-matching approved template. */
  const DELAY_DEFAULTS: Record<string, number> = {
    cart_abandoned: 30, customer_signup: 10, order_placed: 0,
    order_shipped: 0, order_delivered: 60, payment_failed: 5,
  };
  const TEMPLATE_HINTS: Record<string, string[]> = {
    cart_abandoned: ['cart'], customer_signup: ['welcome', 'promo'],
    order_placed: ['order'], order_shipped: ['order'], order_delivered: ['order'],
    payment_failed: ['order', 'payment'],
  };
  const pickTrigger = (trigger: string) => {
    const channels: string[] = form.channels?.length ? form.channels : ['email'];
    const hints = TEMPLATE_HINTS[trigger] ?? [];
    const match = templates.find((t) => channels.includes(t.channel)
      && hints.some((h) => t.name.toLowerCase().includes(h)));
    setForm({
      ...form,
      trigger_event: trigger,
      delay_minutes: DELAY_DEFAULTS[trigger] ?? 30,
      name: form.nameTouched ? form.name
        : `${trigger.replace(/_/g, ' ')} → ${channels.join('+')}${DELAY_DEFAULTS[trigger] ? ` after ${DELAY_DEFAULTS[trigger]}m` : ''}`,
      template_ref: form.template_ref || (match?.id ?? ''),
    });
  };

  const toggleChannel = (c: string) => {
    const set = new Set(form.channels ?? []);
    set.has(c) ? set.delete(c) : set.add(c);
    setForm({ ...form, channels: [...set] });
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Automation</h1>
          <p className="text-sm text-gray-500">
            Event-triggered messages: abandoned carts, order updates, payment failures, welcome flows.
          </p>
        </div>
        {hasPerm('marketing.manage') && (
          <button onClick={() => setShowNew((s) => !s)}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            {showNew ? 'Close' : '+ Rule'}
          </button>
        )}
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showNew && (
        <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Trigger <span className="text-gray-400">(sets name, delay & template automatically)</span>
              <select value={form.trigger_event ?? ''} onChange={(e) => pickTrigger(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5">
                <option value="">— select —</option>
                {triggers.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="text-sm">Name <span className="text-gray-400">(auto)</span>
              <input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value, nameTouched: true })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm">Delay (minutes)
              <input type="number" min={0} value={form.delay_minutes}
                onChange={(e) => setForm({ ...form, delay_minutes: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Action:</span>
            <label><input type="radio" checked={!form.listOnly} onChange={() => setForm({ ...form, listOnly: false })} /> Send message</label>
            <label><input type="radio" checked={!!form.listOnly} onChange={() => setForm({ ...form, listOnly: true })} /> Only collect into a list (no send)</label>
            {!form.listOnly && (
              <>
                <span className="ml-2">Channels:</span>
                {['email', 'sms', 'whatsapp'].map((c) => (
                  <label key={c} className="capitalize">
                    <input type="checkbox" checked={(form.channels ?? []).includes(c)} onChange={() => toggleChannel(c)} /> {c}
                  </label>
                ))}
              </>
            )}
          </div>
          <label className="block text-sm">Also add matched people to a marketing list <span className="text-gray-400">(rules can build lists)</span>
            <select value={form.add_to_list_id ?? ''} onChange={(e) => setForm({ ...form, add_to_list_id: e.target.value })}
              className="mt-1 w-full max-w-md rounded border px-2 py-1.5">
              <option value="">— none —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.member_count})</option>)}
            </select>
          </label>
          <label className="block text-sm">Approved template (recommended — auto-matched to the trigger)
            <select value={form.template_ref ?? ''} onChange={(e) => setForm({ ...form, template_ref: e.target.value })}
              className="mt-1 w-full max-w-md rounded border px-2 py-1.5">
              <option value="">— free-form body below —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
            </select>
            {templates.length === 0 && (
              <span className="text-xs text-amber-600"> No approved templates — open <a className="underline" href="/panel/marketing/templates">Templates</a> once to auto-seed a starter set.</span>
            )}
          </label>
          {!form.template_ref && (
            <>
              <label className="block text-sm">Subject (email)
                <input value={form.subject ?? ''} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="mt-1 w-full max-w-md rounded border px-2 py-1.5" />
              </label>
              <label className="block text-sm">Body — {'{{name}}'}, {'{{orderNumber}}'}, {'{{cartValue}}'}…
                <textarea rows={3} value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-sm" />
              </label>
            </>
          )}
          <button onClick={save}
            disabled={!form.name || !form.trigger_event
              || (form.listOnly ? !form.add_to_list_id
                  : (!(form.channels ?? []).length || (!form.template_ref && !form.body)))}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            Create rule
          </button>
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm divide-y">
        {rules.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No automation rules yet.</div>}
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-[220px] flex-1">
              <span className="font-medium">{r.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                on <b>{r.trigger_event}</b> · +{r.delay_minutes ?? 0}m · {(r.channels ?? []).join(', ')}
              </span>
              <span className="ml-2 text-xs text-gray-400">{r.execution_count ?? 0} runs</span>
            </div>
            {hasPerm('marketing.manage') && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => act(() => api.put(`/marketing-hub/automation/rules/${r.id}`, { is_active: !r.is_active }))}
                  className={`rounded px-2 py-1 text-xs font-medium ${r.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {r.is_active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => { if (window.confirm('Delete rule?')) act(() => api.delete(`/marketing-hub/automation/rules/${r.id}`)); }}
                  className="rounded border px-2 py-1 text-xs text-red-600">✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="mb-2 font-semibold">Recent executions</div>
        {executions.length === 0 ? (
          <div className="text-sm text-gray-500">Nothing executed yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500"><tr><th className="py-1">Subject</th><th>Status</th><th>At</th></tr></thead>
            <tbody className="divide-y">
              {executions.map((e) => (
                <tr key={e.id}>
                  <td className="py-1 font-mono text-xs">{e.subject_key}</td>
                  <td className={`text-xs capitalize ${e.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}>{e.status}{e.error ? ` — ${e.error}` : ''}</td>
                  <td className="text-xs text-gray-400">{localeDateTime(e.executed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MarketingAutomation;
