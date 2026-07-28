import React, { useEffect, useMemo, useState } from 'react';
import { api, searchAPI } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Field, SelectInput, TextInput, StatCard, StatGrid,
  StatusChip, EmptyState, SectionCard,
} from '../../components/erp';

/**
 * AUTOMATION RULES — the generic workflow rules engine in plain language
 * (spec Part I §13, backend services/workflowEngine.ts).
 *
 * The whole page is one sentence, repeated:
 *    "When [an order over ₹5,000 is placed] then [send me a WhatsApp] and [flag it]."
 *
 * Three tabs:
 *   1. Rules      — the sentence builder + the list of rules (hits, on/off, test)
 *   2. Activity   — every time a rule acted, and what happened
 *   3. Webhooks   — the hosts a rule is allowed to call (the SSRF allow-list)
 *
 * SAFETY, stated on the page: a rule can notify, flag, draft a purchase order or
 * request an approval. It can never move money or stock by itself.
 */

const rupees = (minor: number | null | undefined) =>
  '₹' + ((Number(minor) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

type TriggerMeta = { value: string; label: string; sentence: string; needs?: string; kind: 'instant' | 'scheduled' };
type ActionMeta = { value: string; label: string };
interface Action { type: string; params: Record<string, any>; }
interface Rule {
  id: string; name: string; description: string | null; active: boolean;
  trigger_event: string; condition: Record<string, any>; actions: Action[];
  rate_cap_per_hour: number; hit_count: number; last_hit_at: string | null;
}

const CHANNELS = [{ v: 'whatsapp', label: 'WhatsApp' }, { v: 'sms', label: 'SMS' }, { v: 'email', label: 'Email' }];

/** The rule, read back as an English sentence. */
function sentenceFor(rule: Pick<Rule, 'trigger_event' | 'condition' | 'actions'>, triggers: TriggerMeta[]): string {
  const meta = triggers.find((t) => t.value === rule.trigger_event);
  let when = meta?.sentence ?? rule.trigger_event;
  when = when
    .replace('{threshold}', rupees(rule.condition?.threshold_minor))
    .replace('{hours}', String(rule.condition?.hours ?? '?'))
    .replace('{qty}', String(rule.condition?.qty ?? '?'));
  const then = (rule.actions ?? []).map((a) => {
    if (a.type === 'notify') return `send a ${CHANNELS.find((c) => c.v === a.params?.channel)?.label ?? a.params?.channel} to ${a.params?.to || 'the store owner'}`;
    if (a.type === 'create_draft_po') return 'create a draft purchase order';
    if (a.type === 'flag_entity') return `flag it as "${a.params?.flag ?? 'needs attention'}"`;
    if (a.type === 'create_approval_request') return 'raise an approval request';
    if (a.type === 'webhook') { try { return `call ${new URL(a.params?.url).host}`; } catch { return 'call a webhook'; } }
    return a.type;
  });
  return `${when} → ${then.length ? then.join(' and ') : 'do nothing yet'}.`;
}

const WorkflowRules: React.FC = () => {
  const [tab, setTab] = useState<'rules' | 'log' | 'webhooks'>('rules');
  const [triggers, setTriggers] = useState<TriggerMeta[]>([]);
  const [actions, setActions] = useState<ActionMeta[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };
  const fail = (e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Something went wrong');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [metaRes, rulesRes] = await Promise.all([api.get('/workflow-rules/meta'), api.get('/workflow-rules')]);
      const meta = payload<any>(metaRes);
      setTriggers(meta?.triggers ?? []);
      setActions(meta?.actions ?? []);
      setRules(payload<Rule[]>(rulesRes) ?? []);
    } catch (e) { fail(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeCount = rules.filter((r) => r.active).length;
  const totalHits = rules.reduce((s, r) => s + (Number(r.hit_count) || 0), 0);

  return (
    <Page>
      <PageHeader
        title="Automation Rules"
        description="Write the little automations you keep in your head: “when an order over ₹5,000 is placed, send me a WhatsApp”, “when stock drops below 10, draft a purchase order”, “when an order sits unshipped for 48 hours, flag it”."
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        Rules can <b>notify you</b>, <b>flag a document</b>, <b>draft a purchase order</b> or <b>request an approval</b> —
        they never move money or stock by themselves. Every rule also has an hourly limit, and each event is acted on
        only once.
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="flex gap-1 border-b border-gray-200">
        {([['rules', 'Rules'], ['log', 'What the rules did'], ['webhooks', 'Allowed webhook hosts']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="space-y-4">
          <StatGrid>
            <StatCard label="Rules set up" value={rules.length} />
            <StatCard label="Switched on" value={activeCount} tone={activeCount ? 'good' : 'default'} />
            <StatCard label="Times they have fired" value={totalHits} />
          </StatGrid>

          {editing ? (
            <RuleBuilder
              key={editing === 'new' ? 'new' : editing.id}
              rule={editing === 'new' ? null : editing}
              triggers={triggers} actionTypes={actions}
              onCancel={() => setEditing(null)}
              onSaved={(what) => { setEditing(null); flash(what); load(); }}
              onError={fail}
            />
          ) : (
            <Btn onClick={() => setEditing('new')}>+ New rule</Btn>
          )}

          {loading && <div className="text-sm text-gray-500">Loading…</div>}
          {!loading && rules.length === 0 && !editing && (
            <EmptyState title="No rules yet"
              description="Start with something simple: “when an order over ₹5,000 is placed, send me a WhatsApp”." />
          )}

          <div className="space-y-3">
            {rules.map((r) => (
              <RuleCard key={r.id} rule={r} triggers={triggers}
                onEdit={() => setEditing(r)}
                onChanged={(m) => { flash(m); load(); }}
                onError={fail} />
            ))}
          </div>
        </div>
      )}

      {tab === 'log' && <ActivityLog rules={rules} onError={fail} />}
      {tab === 'webhooks' && <WebhookHosts onError={fail} onFlash={flash} />}
    </Page>
  );
};

// ── One rule, as a card ──────────────────────────────────────────────────────
const RuleCard: React.FC<{
  rule: Rule; triggers: TriggerMeta[];
  onEdit: () => void; onChanged: (m: string) => void; onError: (e: any) => void;
}> = ({ rule, triggers, onEdit, onChanged, onError }) => {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);

  const toggle = async () => {
    setBusy(true);
    try {
      await api.patch(`/workflow-rules/${rule.id}/active`, { active: !rule.active });
      onChanged(rule.active ? `“${rule.name}” switched off.` : `“${rule.name}” switched on.`);
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the rule “${rule.name}”? Its history stays in the activity log.`)) return;
    setBusy(true);
    try { await api.delete(`/workflow-rules/${rule.id}`); onChanged(`“${rule.name}” deleted.`); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setPreview(null);
    try { setPreview(payload<any>(await api.get(`/workflow-rules/${rule.id}/dry-run`, { params: { limit: 10 } }))); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };

  const meta = triggers.find((t) => t.value === rule.trigger_event);

  return (
    <SectionCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{rule.name}</span>
            <StatusChip status={rule.active ? 'active' : 'inactive'} />
            {meta && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                {meta.kind === 'instant' ? 'runs immediately' : 'checked every 10 minutes'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-700">{sentenceFor(rule, triggers)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Fired {rule.hit_count} time(s){rule.last_hit_at ? ` · last ${rule.last_hit_at.slice(0, 16).replace('T', ' ')}` : ''} ·
            at most {rule.rate_cap_per_hour} action(s) an hour
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" variant="outline" disabled={busy} onClick={test}>Test it</Btn>
          <Btn size="sm" variant="outline" disabled={busy} onClick={onEdit}>Edit</Btn>
          <Btn size="sm" variant="outline" disabled={busy} onClick={toggle}>{rule.active ? 'Switch off' : 'Switch on'}</Btn>
          <Btn size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={remove}>Delete</Btn>
        </div>
      </div>

      {preview && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3">
          <div className="text-sm font-medium text-gray-800">
            {preview.matched} match(es) in your data right now — nothing was sent or changed by this test.
          </div>
          <div className="mt-1 text-xs text-gray-500">{preview.note}</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(preview.sample ?? []).map((s: any) => (
              <li key={s.occurrence_key} className="flex flex-wrap items-center gap-2">
                <span className="text-gray-800">{s.label}</span>
                {s.already_fired
                  ? <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">already handled</span>
                  : <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800">would run: {s.would_run.join(', ')}</span>}
              </li>
            ))}
            {!(preview.sample ?? []).length && <li className="text-gray-500">Nothing matches yet.</li>}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};

// ── The sentence builder ─────────────────────────────────────────────────────
const emptyAction = (): Action => ({ type: 'notify', params: { channel: 'whatsapp', to: '' } });

const RuleBuilder: React.FC<{
  rule: Rule | null; triggers: TriggerMeta[]; actionTypes: ActionMeta[];
  onCancel: () => void; onSaved: (m: string) => void; onError: (e: any) => void;
}> = ({ rule, triggers, actionTypes, onCancel, onSaved, onError }) => {
  const [name, setName] = useState(rule?.name ?? 'My rule');
  const [trigger, setTrigger] = useState(rule?.trigger_event ?? 'order_value_over');
  const [amount, setAmount] = useState(rule ? String((Number(rule.condition?.threshold_minor) || 0) / 100 || '') : '5000');
  const [hours, setHours] = useState(String(rule?.condition?.hours ?? 48));
  const [qty, setQty] = useState(String(rule?.condition?.qty ?? 10));
  const [sku, setSku] = useState('');
  const [variationId, setVariationId] = useState<string>(rule?.condition?.variation_id ?? '');
  const [skuLabel, setSkuLabel] = useState('');
  const [cap, setCap] = useState(String(rule?.rate_cap_per_hour ?? 30));
  const [acts, setActs] = useState<Action[]>(rule?.actions?.length ? rule.actions.map((a) => ({ ...a, params: { ...a.params } })) : [emptyAction()]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);

  const meta = triggers.find((t) => t.value === trigger);

  const condition = useMemo(() => {
    const c: Record<string, any> = {};
    if (trigger === 'order_value_over') c.threshold_minor = Math.round((Number(amount) || 0) * 100);
    if (trigger === 'order_unshipped_hours') c.hours = Math.max(1, Number(hours) || 0);
    if (trigger === 'stock_below') {
      c.qty = Math.max(0, Number(qty) || 0);
      if (variationId) c.variation_id = variationId;
    }
    return c;
  }, [trigger, amount, hours, qty, variationId]);

  const body = () => ({
    name, trigger_event: trigger, condition,
    actions: acts.map((a) => ({ type: a.type, params: a.params })),
    rate_cap_per_hour: Math.max(1, Number(cap) || 30),
  });

  const findSku = async () => {
    const hits = await searchAPI.query('variation', sku, 1);
    if (!hits[0]) { onError(new Error(`No SKU matched "${sku}" (type at least 3 characters)`)); return; }
    setVariationId(hits[0].id); setSkuLabel(`${hits[0].label} ${hits[0].sublabel ?? ''}`.trim());
  };

  const save = async () => {
    setSaving(true);
    try {
      if (rule) { await api.put(`/workflow-rules/${rule.id}`, body()); onSaved(`“${name}” saved.`); }
      else { await api.post('/workflow-rules', body()); onSaved(`“${name}” created.`); }
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  const testDraft = async () => {
    setSaving(true); setPreview(null);
    try { setPreview(payload<any>(await api.post('/workflow-rules/dry-run', { ...body(), limit: 10 }))); }
    catch (e) { onError(e); } finally { setSaving(false); }
  };

  const setAct = (i: number, patch: Partial<Action>) => setActs((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setParam = (i: number, k: string, v: any) => setActs((as) => as.map((a, j) => (j === i ? { ...a, params: { ...a.params, [k]: v } } : a)));

  return (
    <SectionCard>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Name this rule" className="min-w-[220px] flex-1">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Most actions per hour">
          <TextInput type="number" min={1} className="w-24" value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
      </div>

      {/* WHEN … */}
      <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <span className="pb-2 text-sm font-medium text-gray-700">When</span>
          <Field>
            <SelectInput value={trigger} onChange={(e) => { setTrigger(e.target.value); setActs([emptyAction()]); }}>
              {triggers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
          </Field>
          {trigger === 'order_value_over' && (
            <Field label="Order value over (₹)">
              <TextInput type="number" min={0} className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          {trigger === 'order_unshipped_hours' && (
            <Field label="Hours unshipped">
              <TextInput type="number" min={1} className="w-24" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          )}
          {trigger === 'stock_below' && (
            <>
              <Field label="Sellable stock at or below">
                <TextInput type="number" min={0} className="w-24" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="Only this SKU (optional)">
                <TextInput value={sku} placeholder="type a SKU" onChange={(e) => setSku(e.target.value)} className="w-36" />
              </Field>
              <Btn size="sm" variant="outline" onClick={findSku}>Find</Btn>
              {variationId && (
                <Btn size="sm" variant="ghost" className="text-red-600"
                  onClick={() => { setVariationId(''); setSkuLabel(''); }}>clear</Btn>
              )}
            </>
          )}
        </div>
        {skuLabel && <p className="mt-1 text-xs text-gray-600">Watching: {skuLabel}</p>}
        {meta?.kind === 'scheduled' && (
          <p className="mt-2 text-xs text-gray-500">This one is checked in the background every 10 minutes — nothing happens “at” the exact hour.</p>
        )}
      </div>

      {/* THEN … */}
      <div className="mt-3 space-y-2">
        <div className="text-sm font-medium text-gray-700">then</div>
        {acts.map((a, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-white p-2">
            <Field>
              <SelectInput value={a.type} onChange={(e) => setAct(i, { type: e.target.value, params: e.target.value === 'notify' ? { channel: 'whatsapp', to: '' } : {} })}>
                {actionTypes
                  .filter((t) => t.value !== 'create_draft_po' || trigger === 'stock_below')
                  .map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectInput>
            </Field>

            {a.type === 'notify' && (
              <>
                <Field label="Channel">
                  <SelectInput value={a.params.channel ?? 'whatsapp'} onChange={(e) => setParam(i, 'channel', e.target.value)}>
                    {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label={(a.params.channel ?? 'whatsapp') === 'email' ? 'Email (blank = store owner)' : 'Phone number'}>
                  <TextInput value={a.params.to ?? ''} onChange={(e) => setParam(i, 'to', e.target.value)} className="w-48" />
                </Field>
                <Field label="Message (optional)" className="min-w-[200px] flex-1">
                  <TextInput value={a.params.message ?? ''} placeholder="e.g. Big order {{orderNumber}} for {{amount}}"
                    onChange={(e) => setParam(i, 'message', e.target.value)} />
                </Field>
              </>
            )}

            {a.type === 'flag_entity' && (
              <>
                <Field label="Flag it as">
                  <TextInput value={a.params.flag ?? 'needs_attention'} onChange={(e) => setParam(i, 'flag', e.target.value)} className="w-40" />
                </Field>
                <Field label="Note (optional)" className="min-w-[200px] flex-1">
                  <TextInput value={a.params.note ?? ''} onChange={(e) => setParam(i, 'note', e.target.value)} />
                </Field>
              </>
            )}

            {a.type === 'create_approval_request' && (
              <Field label="Title (optional)" className="min-w-[220px] flex-1">
                <TextInput value={a.params.title ?? ''} onChange={(e) => setParam(i, 'title', e.target.value)} />
              </Field>
            )}

            {a.type === 'create_draft_po' && (
              <p className="pb-2 text-xs text-gray-500">
                Uses your reorder settings: preferred vendor, reorder point and suggested quantity. The purchase order is a
                <b> draft</b> — no number, no stock, no accounting entry until you issue it.
              </p>
            )}

            {a.type === 'webhook' && (
              <>
                <Field label="URL (host must be allow-listed)" className="min-w-[240px] flex-1">
                  <TextInput value={a.params.url ?? ''} placeholder="https://hooks.example.com/growcord"
                    onChange={(e) => setParam(i, 'url', e.target.value)} />
                </Field>
                <Field label="Signing secret (optional)">
                  <TextInput value={a.params.secret ?? ''} onChange={(e) => setParam(i, 'secret', e.target.value)} className="w-40" />
                </Field>
              </>
            )}

            {acts.length > 1 && <Btn size="sm" variant="ghost" className="text-red-600" onClick={() => setActs((as) => as.filter((_, j) => j !== i))}>Remove</Btn>}
          </div>
        ))}
        <Btn variant="outline" size="sm" onClick={() => setActs((as) => [...as, emptyAction()])}>+ and also…</Btn>
      </div>

      <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <b>Reads as:</b> {sentenceFor({ trigger_event: trigger, condition, actions: acts }, triggers)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}</Btn>
        <Btn variant="outline" onClick={testDraft} disabled={saving}>Test against my data</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>

      {preview && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3 text-sm">
          <div className="font-medium text-gray-800">{preview.matched} match(es) — this test changed nothing.</div>
          <div className="text-xs text-gray-500">{preview.note}</div>
          <ul className="mt-2 space-y-1">
            {(preview.sample ?? []).map((s: any) => <li key={s.occurrence_key} className="text-gray-700">{s.label}</li>)}
            {!(preview.sample ?? []).length && <li className="text-gray-500">Nothing matches yet.</li>}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};

// ── Activity log ─────────────────────────────────────────────────────────────
const ActivityLog: React.FC<{ rules: Rule[]; onError: (e: any) => void }> = ({ rules, onError }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/workflow-rules/log', { params: { limit: 200, ...(ruleId ? { ruleId } : {}) } });
      setRows(payload<any[]>(res) ?? []);
    } catch (e) { onError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ruleId]);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Field label="Rule">
          <SelectInput value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">All rules</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </SelectInput>
        </Field>
        <Btn variant="outline" onClick={load}>Refresh</Btn>
      </div>

      {!loading && rows.length === 0 && (
        <EmptyState title="Nothing has fired yet" description="When a rule acts, every action it took is listed here with the outcome." />
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">What it did</th>
                <th className="px-4 py-2">On</th>
                <th className="px-4 py-2">Result</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-xs text-gray-600">{(r.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-2">{r.rule_name ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{r.action_type}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-gray-500">{r.occurrence_key}</td>
                  <td className="px-4 py-2"><StatusChip status={r.status === 'executed' ? 'completed' : r.status} /></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{r.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Webhook allow-list ──────────────────────────────────────────────────────
const WebhookHosts: React.FC<{ onError: (e: any) => void; onFlash: (m: string) => void }> = ({ onError, onFlash }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [host, setHost] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    try { setRows(payload<any[]>(await api.get('/workflow-rules/webhook-hosts')) ?? []); } catch (e) { onError(e); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    try { await api.post('/workflow-rules/webhook-hosts', { host, note }); setHost(''); setNote(''); onFlash('Host allowed.'); load(); }
    catch (e) { onError(e); }
  };
  const remove = async (id: string) => {
    try { await api.delete(`/workflow-rules/webhook-hosts/${id}`); onFlash('Host removed.'); load(); } catch (e) { onError(e); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        A rule can only call a web address whose host you list here. Internal / private addresses (localhost, 10.x, 192.168.x,
        169.254.x …) are refused outright, and every call times out after 5 seconds.
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Host"><TextInput value={host} placeholder="hooks.example.com" onChange={(e) => setHost(e.target.value)} /></Field>
        <Field label="What is it for?" className="min-w-[200px] flex-1"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Btn onClick={add} disabled={!host.trim()}>Allow this host</Btn>
      </div>

      {rows.length === 0
        ? <EmptyState title="No hosts allowed yet" description="Add a host before creating a webhook action." />
        : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-2">Host</th><th className="px-4 py-2">Note</th><th className="px-4 py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-mono text-xs">{r.host}</td>
                    <td className="px-4 py-2 text-gray-600">{r.note ?? ''}</td>
                    <td className="px-4 py-2 text-right">
                      <Btn size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Remove</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
};

export default WorkflowRules;
