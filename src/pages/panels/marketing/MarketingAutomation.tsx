import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Loader2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { payload } from '../../../lib/unwrap';
import { localeDateTime } from '../../../utils/date';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
} from '@/components/erp';
import { Figure, Lead, LoadFailure, ago, linkCls, num, plural, useLoad, writeError } from './meta/common';

/**
 * Message campaigns > Automation (`/panel/marketing/automation`, MENU-1 mkt-messaging): the rules that send a
 * message (or build a contact list) by themselves after a store event. It opens with what to act on (runs that
 * failed, no rule switched on), then each rule in words (when, wait, channels, which template, which list, its last
 * run), then the latest runs named by their rule.
 *
 * Contract: the `automation-rules` resource (`/api/v2/marketing/automation-rules`, marketing resources.rs; `config`
 * is in the list since MENU-1), `/api/v2/marketing/automation/triggers` and `/automation/executions`
 * (hub/automation.rs), reached through the `/marketing-hub/automation/*` rows of lib/v2/areas/marketing.ts. The
 * runner is the `marketing_automation` job: every send goes through Comms with consent and the wallet.
 */

/** A trigger key in words; an unknown key from the server reads as itself. */
const TRIGGER_WORDS: Record<string, string> = {
  cart_abandoned: 'A cart is left behind',
  order_placed: 'An order is placed',
  order_shipped: 'An order ships',
  order_delivered: 'An order is delivered',
  payment_failed: 'A payment fails',
  customer_signup: 'A customer signs up',
};
const triggerWords = (t: string) => TRIGGER_WORDS[t] ?? t.replace(/_/g, ' ');

/**
 * Suggestions only, used when a trigger is picked: the wait and the words a matching template's name usually has.
 * The server takes any wait and any approved template; these just save typing.
 */
const DELAY_SUGGESTION: Record<string, number> = {
  cart_abandoned: 30, customer_signup: 10, order_placed: 0, order_shipped: 0, order_delivered: 60, payment_failed: 5,
};
const TEMPLATE_HINTS: Record<string, string[]> = {
  cart_abandoned: ['cart'], customer_signup: ['welcome', 'promo'], order_placed: ['order'],
  order_shipped: ['order'], order_delivered: ['order'], payment_failed: ['order', 'payment'],
};
const SEND_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
const CHANNEL_WORD: Record<string, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };

const waitWords = (m: number) => (!m ? 'at once' : m < 60 ? `after ${plural(m, 'minute')}` : m % 60 ? `after ${plural(m, 'minute')}` : `after ${plural(m / 60, 'hour')}`);

const MarketingAutomation: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('marketing.manage');

  const rulesQ = useLoad(async () => (payload(await api.get('/marketing-hub/automation/rules')) ?? []) as any[], []);
  const triggersQ = useLoad(async () => (payload(await api.get('/marketing-hub/automation/triggers')) ?? []) as string[], []);
  const templatesQ = useLoad(async () => (payload(await api.get('/marketing-hub/templates', { params: { status: 'approved' } })) ?? []) as any[], []);
  const runsQ = useLoad(async () => (payload(await api.get('/marketing-hub/automation/executions', { params: { limit: 200 } })) ?? []) as any[], []);
  const listsQ = useLoad(async () => (payload(await api.get('/marketing-hub/audiences/lists')) ?? []) as any[], []);

  const rules = rulesQ.data ?? [];
  const runs = runsQ.data ?? [];
  const templates = templatesQ.data ?? [];
  const lists = listsQ.data ?? [];
  const ruleName = (id: string | null | undefined) => rules.find((r) => r.id === id)?.name ?? 'A removed rule';

  const runsByRule = useMemo(() => {
    const m = new Map<string, { count: number; failed: number; last: any }>();
    for (const e of runs) {
      const k = String(e.rule_id ?? '');
      const cur = m.get(k) ?? { count: 0, failed: 0, last: null };
      cur.count += 1;
      if (e.status === 'failed') cur.failed += 1;
      if (!cur.last || String(e.executed_at ?? '') > String(cur.last.executed_at ?? '')) cur.last = e;
      m.set(k, cur);
    }
    return m;
  }, [runs]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const failedWeek = runs.filter((e) => e.status === 'failed' && e.executed_at && new Date(e.executed_at).getTime() >= weekAgo);
  const runsWeek = runs.filter((e) => e.executed_at && new Date(e.executed_at).getTime() >= weekAgo);
  const activeRules = rules.filter((r) => r.is_active);

  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setError(''); setBusyId(id);
    try { await fn(); rulesQ.reload(); runsQ.reload(); }
    catch (e) { setError(writeError(e, 'The change was refused.')); }
    finally { setBusyId(null); }
  };

  // New rule.
  const blank = { name: '', nameTouched: false, trigger_event: '', delay_minutes: 30, channels: ['email'] as string[], listOnly: false, add_to_list_id: '', template_ref: '', subject: '', body: '' };
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const pickTrigger = (trigger: string) => {
    const hints = TEMPLATE_HINTS[trigger] ?? [];
    const match = templates.find((t) => form.channels.includes(t.channel) && hints.some((h) => String(t.name ?? '').toLowerCase().includes(h)));
    const wait = DELAY_SUGGESTION[trigger] ?? form.delay_minutes;
    setForm({
      ...form,
      trigger_event: trigger,
      delay_minutes: wait,
      name: form.nameTouched ? form.name : `${triggerWords(trigger)}, ${form.channels.map((c) => CHANNEL_WORD[c] ?? c).join(' and ')}, ${waitWords(wait)}`,
      template_ref: form.template_ref || (match?.id ?? ''),
    });
  };
  const toggleChannel = (c: string) => {
    const next = form.channels.includes(c) ? form.channels.filter((x) => x !== c) : [...form.channels, c];
    setForm({ ...form, channels: next });
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const config: Record<string, unknown> = form.template_ref ? { template_ref: form.template_ref } : { body: form.body, subject: form.subject };
      if (form.add_to_list_id) config.add_to_list_id = form.add_to_list_id;
      await api.post('/marketing-hub/automation/rules', {
        name: form.name, trigger_event: form.trigger_event,
        delay_minutes: Number(form.delay_minutes) || 0,
        channels: form.listOnly ? [] : form.channels,
        config,
      });
      setShowNew(false); setForm(blank);
      rulesQ.reload();
    } catch (e) {
      setError(writeError(e, 'The rule was not saved.'));
    } finally { setSaving(false); }
  };
  const canSave = !!form.name && !!form.trigger_event
    && (form.listOnly ? !!form.add_to_list_id : form.channels.length > 0 && (!!form.template_ref || !!form.body));

  const templateName = (ref: unknown) => templates.find((t) => t.id === ref)?.name;
  const sends = (r: any) => {
    const cfg = r.config && typeof r.config === 'object' ? r.config : {};
    const ref = cfg.template_ref ?? r.template_id;
    const chans = Array.isArray(r.channels) ? r.channels : [];
    const parts: string[] = [];
    if (chans.length) parts.push(`Sends ${ref ? `"${templateName(ref) ?? 'a template that is no longer approved'}"` : 'its own text'} by ${chans.map((c: string) => CHANNEL_WORD[c] ?? c).join(' and ')}`);
    if (cfg.add_to_list_id) parts.push(`adds people to "${lists.find((l) => l.id === cfg.add_to_list_id)?.name ?? 'a removed list'}"`);
    return parts.join(', and ') || 'Does nothing yet';
  };

  return (
    <Page>
      <PageHeader title="Automation" icon={Bot}
        description="Messages that send by themselves after a store event: a cart left behind, an order placed, shipped or delivered, a failed payment, a new sign-up."
        actions={canManage && (
          <Btn size="sm" onClick={() => setShowNew((s) => !s)}>{showNew ? <><X className="h-4 w-4" /> Close</> : <><Plus className="h-4 w-4" /> New rule</>}</Btn>
        )} />

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {rulesQ.data && runsQ.data && (failedWeek.length > 0 ? (
        <Lead tone="bad" title={`${plural(failedWeek.length, 'run')} failed in the last 7 days`}>
          <ul className="space-y-0.5">
            {failedWeek.slice(0, 3).map((e) => <li key={e.id}><b>{ruleName(e.rule_id)}</b>: {e.error || 'no reason given'} ({ago(e.executed_at)})</li>)}
            {failedWeek.length > 3 && <li>and {plural(failedWeek.length - 3, 'more')} in the list below</li>}
          </ul>
        </Lead>
      ) : rules.length > 0 && activeRules.length === 0 ? (
        <Lead tone="warn" title="Every rule is switched off">Nothing sends by itself until you switch a rule on.</Lead>
      ) : rules.length === 0 ? (
        <Lead tone="info" title="No rules yet">Start with a cart reminder or a thank-you after delivery. Use New rule.</Lead>
      ) : (
        <Lead tone="good" title={`${plural(activeRules.length, 'rule')} on, no failures this week`}>{plural(runsWeek.length, 'run')} in the last 7 days.</Lead>
      ))}

      {rulesQ.data && runsQ.data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label="Rules on" value={num(activeRules.length)} sub={`of ${num(rules.length)}`} />
          <Figure label="Runs, 7 days" value={num(runsWeek.length)} />
          <Figure label="Failed, 7 days" value={num(failedWeek.length)} tone={failedWeek.length ? 'bad' : 'neutral'} />
          <Figure label="Approved templates" value={num(templates.length)} tone={templates.length ? 'neutral' : 'warn'} />
        </div>
      )}

      {showNew && canManage && (
        <SectionCard title="New rule" description="Pick when it runs; the wait, name and template fill in and you can change them.">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-medium">When
                <select value={form.trigger_event} onChange={(e) => pickTrigger(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                  <option value="">{triggersQ.loading ? 'Loading...' : 'Pick an event'}</option>
                  {(triggersQ.data ?? []).map((t) => <option key={t} value={t}>{triggerWords(t)}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, nameTouched: true })}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">Wait (minutes)
                <input type="number" min={0} inputMode="numeric" value={form.delay_minutes}
                  onChange={(e) => setForm({ ...form, delay_minutes: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm" />
              </label>
            </div>
            <fieldset className="flex flex-wrap items-center gap-3 text-sm">
              <legend className="sr-only">What it does</legend>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={!form.listOnly} onChange={() => setForm({ ...form, listOnly: false })} /> Send a message</label>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={form.listOnly} onChange={() => setForm({ ...form, listOnly: true })} /> Only add people to a list</label>
              {!form.listOnly && SEND_CHANNELS.map((c) => (
                <label key={c} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={form.channels.includes(c)} onChange={() => toggleChannel(c)} /> {CHANNEL_WORD[c]}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium">Also add the people to a contact list <span className="font-normal text-gray-400">(optional)</span>
              <select value={form.add_to_list_id} onChange={(e) => setForm({ ...form, add_to_list_id: e.target.value })}
                className="mt-1 w-full max-w-md rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                <option value="">No list</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({num(l.member_count)})</option>)}
              </select>
            </label>
            {!form.listOnly && (
              <label className="block text-sm font-medium">Approved template
                <select value={form.template_ref} onChange={(e) => setForm({ ...form, template_ref: e.target.value })}
                  className="mt-1 w-full max-w-md rounded-md border border-gray-200 bg-white px-2 py-2 text-sm">
                  <option value="">None, write the text below</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({CHANNEL_WORD[t.channel] ?? t.channel})</option>)}
                </select>
                {!templatesQ.loading && templates.length === 0 && (
                  <span className="mt-1 block text-xs font-normal text-amber-700">No approved template yet. <Link className={linkCls} to="/panel/marketing/templates">Open Templates</Link> to approve one.</span>
                )}
              </label>
            )}
            {!form.listOnly && !form.template_ref && (
              <>
                <label className="block text-sm font-medium">Email subject
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="mt-1 w-full max-w-md rounded-md border border-gray-200 px-2 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Text <span className="font-normal text-gray-400">(placeholders such as {'{{name}}'}, {'{{orderNumber}}'}, {'{{cartValue}}'})</span>
                  <textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 font-mono text-sm" />
                </label>
              </>
            )}
            <Btn onClick={save} disabled={!canSave || saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save rule</Btn>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Rules" description="Each rule runs once per order, cart or customer." flush>
        {rulesQ.error && !rulesQ.data ? (
          <div className="p-4"><LoadFailure failure={rulesQ.error} what="The automation rules are not served on this backend yet." onRetry={rulesQ.reload} /></div>
        ) : (
          <ul className="divide-y">
            {rules.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">{rulesQ.loading ? 'Loading...' : 'No rules yet.'}</li>}
            {rules.map((r) => {
              const stat = runsByRule.get(String(r.id));
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-[min(100%,16rem)] flex-1">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-gray-600">{triggerWords(String(r.trigger_event ?? ''))}, {waitWords(Number(r.delay_minutes) || 0)}. {sends(r)}.</p>
                    <p className="text-xs text-gray-500">
                      {stat ? `Last ran ${ago(stat.last?.executed_at)}, ${plural(stat.count, 'run')} in the latest ${num(runs.length)}${stat.failed ? `, ${num(stat.failed)} failed` : ''}.` : 'Has not run yet.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage ? (
                      <Btn size="sm" variant={r.is_active ? 'success' : 'outline'} disabled={busyId === r.id}
                        aria-pressed={!!r.is_active}
                        onClick={() => act(r.id, () => api.put(`/marketing-hub/automation/rules/${r.id}`, { is_active: !r.is_active }))}>
                        {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin" />}{r.is_active ? 'On' : 'Off'}
                      </Btn>
                    ) : <StatusChip status={r.is_active ? 'active' : 'paused'} label={r.is_active ? 'On' : 'Off'} />}
                    {canManage && (
                      <Btn size="icon" variant="ghost" aria-label={`Delete ${r.name}`} disabled={busyId === r.id}
                        onClick={() => { if (window.confirm(`Delete the rule "${r.name}"? Its past runs stay in the log.`)) void act(r.id, () => api.delete(`/marketing-hub/automation/rules/${r.id}`)); }}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Latest runs" description="Newest first, up to 200." flush>
        {runsQ.error && !runsQ.data ? (
          <div className="p-4"><LoadFailure failure={runsQ.error} what="The automation log is not served on this backend yet." onRetry={runsQ.reload} /></div>
        ) : (
          <TableShell className="rounded-none border-0 shadow-none" maxHeight="28rem">
            <table className="w-full min-w-[36rem] text-sm">
              <THead><Th>Rule</Th><Th>For</Th><Th>Result</Th><Th num>When</Th></THead>
              <TBody>
                {runs.length === 0 && <EmptyRow colSpan={4}>{runsQ.loading ? 'Loading...' : 'Nothing has run yet.'}</EmptyRow>}
                {runs.map((e) => (
                  <Tr key={e.id}>
                    <Td>{ruleName(e.rule_id)}</Td>
                    <Td className="font-mono text-xs">{e.subject_key}</Td>
                    <Td>
                      <StatusChip status={e.status} />
                      {e.error && <span className="ml-2 text-xs text-red-700">{e.error}</span>}
                    </Td>
                    <Td num muted className="text-xs">{e.executed_at ? localeDateTime(e.executed_at) : ''}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        )}
      </SectionCard>
    </Page>
  );
};

export default MarketingAutomation;
