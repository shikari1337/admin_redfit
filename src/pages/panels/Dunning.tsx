import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, Field, FilterBar, SelectInput, TextInput, StatCard, StatGrid, StatusChip, EmptyState, inr,
  ExportMenu, Pagination, DrillLink, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * AR Dunning — "Politely chase unpaid invoices automatically."
 *
 * Three plain-language jobs on one page:
 *   1. The SCHEDULE — add steps: "Day [3] send [WhatsApp] using [polite reminder]".
 *   2. Who's DUE now — a dry-run preview of overdue invoices and which reminder is
 *      next, with a per-row "Send now" nudge.
 *   3. HISTORY — every reminder that has gone out (sent / failed / skipped).
 *
 * Reminders send through the platform's messaging layer; dunning is operational
 * (never charged to your wallet). A step fires at most once per invoice.
 */

const today = () => new Date().toISOString().slice(0, 10);

// Client CSV columns for the "who's due now" list and the reminder history.
const dueCsvCols: CsvColumn<any>[] = [
  { key: 'customer', label: 'Customer', format: (i) => i.company || i.customer_name || '' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'amount', label: 'Amount', format: (i) => (Number(i.amount) || 0).toFixed(2) },
  { key: 'due_date', label: 'Due' },
  { key: 'days_overdue', label: 'Days over' },
  { key: 'channel', label: 'Channel' },
  { key: 'template_key', label: 'Template' },
  { key: 'contactable', label: 'Contactable', format: (i) => (i.contactable ? 'yes' : 'no') },
];
const historyCsvCols: CsvColumn<any>[] = [
  { key: 'when', label: 'When', format: (r) => (r.sent_at || r.created_at || '').slice(0, 16).replace('T', ' ') },
  { key: 'customer_name', label: 'Customer', format: (r) => r.customer_name || '' },
  { key: 'invoice', label: 'Invoice', format: (r) => r.invoice || r.order_number || '' },
  { key: 'step', label: 'Step', format: (r) => `Day ${r.offset_days ?? '?'} (#${r.step_index})` },
  { key: 'channel', label: 'Channel' },
  { key: 'status', label: 'Status' },
  { key: 'detail', label: 'Detail', format: (r) => r.error || r.provider || '' },
];

interface Step { offset_days: number; channel: string; template_key: string; subject?: string | null; }
interface Policy { id: string; name: string; active: boolean; steps: Step[]; send_after_hour: number; send_before_hour: number; note: string | null; }
interface Tpl { key: string; label: string; subject: string; body: string; }

const CHANNELS = [
  { v: 'whatsapp', label: 'WhatsApp' },
  { v: 'sms', label: 'SMS' },
  { v: 'email', label: 'Email' },
];

const Dunning: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');

  const [tab, setTab] = useState<'schedule' | 'due' | 'history'>('schedule');
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadPolicy = async () => {
    setLoading(true); setError('');
    try {
      const [tplRes, polRes] = await Promise.all([
        api.get('/dunning/templates'),
        api.get('/dunning/policies/active'),
      ]);
      setTemplates(payload<Tpl[]>(tplRes) ?? []);
      setPolicy(payload<Policy | null>(polRes));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadPolicy(); }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  return (
    <Page>
      <PageHeader
        title="Payment Reminders (Dunning)"
        description="Politely chase unpaid invoices automatically — remind customers who owe you money on the days you choose, over WhatsApp, SMS or email."
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="flex gap-1 border-b border-gray-200">
        {([['schedule', 'Reminder schedule'], ['due', "Who's due now"], ['history', 'History']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'schedule' && (
        <ScheduleEditor policy={policy} templates={templates} loading={loading} canPost={canPost} onSaved={(p) => { setPolicy(p); flash('Reminder schedule saved.'); }} onError={setError} />
      )}
      {tab === 'due' && <DuePreview onFlash={flash} onError={setError} canPost={canPost} hasPolicy={!!policy?.active && (policy?.steps.length ?? 0) > 0} />}
      {tab === 'history' && <History onError={setError} />}
    </Page>
  );
};

// ── Schedule editor ──────────────────────────────────────────────────────────
const emptyStep = (): Step => ({ offset_days: 7, channel: 'whatsapp', template_key: 'polite', subject: '' });

const ScheduleEditor: React.FC<{
  policy: Policy | null; templates: Tpl[]; loading: boolean; canPost: boolean;
  onSaved: (p: Policy) => void; onError: (m: string) => void;
}> = ({ policy, templates, loading, canPost, onSaved, onError }) => {
  const [name, setName] = useState('Default reminder schedule');
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<Step[]>([{ offset_days: 3, channel: 'whatsapp', template_key: 'polite', subject: '' }]);
  const [after, setAfter] = useState(9);
  const [before, setBefore] = useState(21);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy) {
      setName(policy.name); setActive(policy.active);
      setSteps(policy.steps.length ? policy.steps.map((s) => ({ ...s, subject: s.subject ?? '' })) : [emptyStep()]);
      setAfter(policy.send_after_hour); setBefore(policy.send_before_hour);
    }
  }, [policy]);

  const setStep = (i: number, patch: Partial<Step>) => setSteps((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((ss) => [...ss, emptyStep()]);
  const removeStep = (i: number) => setSteps((ss) => ss.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name, active, send_after_hour: after, send_before_hour: before,
        steps: steps.map((s) => ({
          offset_days: Math.max(0, Number(s.offset_days) || 0),
          channel: s.channel, template_key: s.template_key,
          subject: s.subject?.trim() ? s.subject.trim() : null,
        })),
      };
      const res = policy
        ? await api.put(`/dunning/policies/${policy.id}`, body)
        : await api.post('/dunning/policies', body);
      onSaved(payload<Policy>(res));
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Schedule name" className="min-w-[220px] flex-1">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 pb-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            Turn reminders on
          </label>
          <Field label="Only send between">
            <div className="flex items-center gap-1">
              <SelectInput value={after} onChange={(e) => setAfter(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
              </SelectInput>
              <span className="text-gray-400">and</span>
              <SelectInput value={before} onChange={(e) => setBefore(Number(e.target.value))}>
                {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
              </SelectInput>
            </div>
          </Field>
        </div>
        <p className="mt-2 text-xs text-gray-500">Reminders are only sent inside this window, so nobody is messaged in the middle of the night. "Send now" ignores it.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-gray-800">Reminder steps</div>
        <p className="mb-3 text-xs text-gray-500">Each step reads: once an invoice is <b>N days</b> past due, send a message on a channel using a template. The most advanced due step is sent — never a burst of every missed one.</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              <span className="pb-2 text-sm text-gray-500">Day</span>
              <Field><TextInput type="number" min={0} value={s.offset_days} onChange={(e) => setStep(i, { offset_days: Number(e.target.value) })} className="w-20" /></Field>
              <span className="pb-2 text-sm text-gray-500">send</span>
              <Field>
                <SelectInput value={s.channel} onChange={(e) => setStep(i, { channel: e.target.value })}>
                  {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </SelectInput>
              </Field>
              <span className="pb-2 text-sm text-gray-500">using</span>
              <Field>
                <SelectInput value={s.template_key} onChange={(e) => setStep(i, { template_key: e.target.value })}>
                  {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </SelectInput>
              </Field>
              <Field label="Email subject (optional)" className="min-w-[180px] flex-1">
                <TextInput value={s.subject ?? ''} placeholder="leave blank for default" onChange={(e) => setStep(i, { subject: e.target.value })} />
              </Field>
              {canPost && <Btn variant="ghost" onClick={() => removeStep(i)} className="text-red-600">Remove</Btn>}
            </div>
          ))}
        </div>
        {canPost ? (
          <div className="mt-3 flex items-center gap-2">
            <Btn variant="outline" onClick={addStep}>+ Add a step</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</Btn>
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-500">You have read-only access to reminder settings.</p>
        )}
      </div>
    </div>
  );
};

// ── Who's due now (dry-run preview) ──────────────────────────────────────────
const DuePreview: React.FC<{ onFlash: (m: string) => void; onError: (m: string) => void; canPost: boolean; hasPolicy: boolean }> = ({ onFlash, onError, canPost, hasPolicy }) => {
  const [asOf, setAsOf] = useState(today());
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dunning/preview', { params: { asOf } });
      setItems(payload<any>(res)?.items ?? []);
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [asOf]);

  const sendNow = async (it: any) => {
    setSendingId(it.order_id + it.step_index);
    try {
      const res = await api.post('/dunning/send-now', { orderId: it.order_id, stepIndex: it.step_index });
      const r = payload<any>(res);
      onFlash(r?.ok ? `Reminder sent to ${it.company || it.customer_name || 'the customer'}.` : `Not sent: ${r?.reason ?? r?.status}`);
      load();
    } catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
    finally { setSendingId(''); }
  };

  const totalOwed = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Field label="As of"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <div className="flex items-end gap-2">
          <ExportMenu filename={`dunning-due-${asOf}`} columns={dueCsvCols} rows={items} />
          <Btn variant="outline" onClick={load}>Refresh</Btn>
        </div>
      </div>

      {!hasPolicy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No active reminder schedule yet — set one up in the "Reminder schedule" tab first.
        </div>
      )}

      <StatGrid>
        <StatCard label="Reminders due now" value={items.length} />
        <StatCard label="Money being chased" value={inr(totalOwed)} tone={totalOwed > 0 ? 'warn' : 'default'} />
      </StatGrid>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Due</th>
              <th className="px-4 py-2 text-right">Days over</th>
              <th className="px-4 py-2">Next reminder</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Nobody is due a reminder right now. 🎉</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.order_id + it.step_index}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{it.company || it.customer_name || 'Customer'}</div>
                  <div className="text-xs text-gray-500">{it.phone || it.email || 'no contact on file'}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {it.order_id ? <DrillLink to={`/orders/${it.order_id}`} title="Open this order">{it.invoice}</DrillLink> : it.invoice}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{inr(it.amount)}</td>
                <td className="px-4 py-2 text-xs">{it.due_date}</td>
                <td className="px-4 py-2 text-right font-semibold text-red-700">{it.days_overdue}</td>
                <td className="px-4 py-2">
                  <span className="capitalize">{it.channel}</span>
                  <span className="text-gray-400"> · {it.template_key}</span>
                  {!it.contactable && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">no {it.channel === 'email' ? 'email' : 'phone'}</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {canPost ? (
                    <Btn size="sm" variant="outline" disabled={!it.contactable || sendingId === it.order_id + it.step_index}
                      onClick={() => sendNow(it)}>
                      {sendingId === it.order_id + it.step_index ? 'Sending…' : 'Send now'}
                    </Btn>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── History ──────────────────────────────────────────────────────────────────
const History: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState('');
  // Channel/status filters and paging are client-side over the last 200 log rows
  // (the /dunning/log endpoint only supports a row limit + orderId server-side).
  const lc = useListControls({ pageSize: 25 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(payload<any[]>(await api.get('/dunning/log', { params: { limit: 200 } })) ?? []); }
      catch (e: any) { onError(e?.response?.data?.message ?? e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (channel && (r.channel ?? '') !== channel) return false;
    if (lc.status && (r.status ?? '') !== lc.status) return false;
    return true;
  }), [rows, channel, lc.status]);
  const pageRows = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  if (!loading && rows.length === 0) return <EmptyState title="No reminders sent yet" description="Once reminders go out, they'll be listed here with their status." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar>
          <Field label="Channel">
            <SelectInput value={channel} onChange={(e) => { setChannel(e.target.value); lc.setPage(1); }}>
              <option value="">All channels</option>
              {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </SelectInput>
          </Field>
        </FilterBar>
        <ExportMenu filename="dunning-history" columns={historyCsvCols} rows={filtered} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2">Step</th>
              <th className="px-4 py-2">Channel</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No reminders match your filters.</td></tr>}
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-gray-600">{(r.sent_at || r.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-2">{r.customer_name || '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {r.order_id ? <DrillLink to={`/orders/${r.order_id}`} title="Open this order">{r.invoice || r.order_number || '—'}</DrillLink> : (r.invoice || r.order_number || '—')}
                </td>
                <td className="px-4 py-2 text-xs">Day {r.offset_days ?? '?'} <span className="text-gray-400">(#{r.step_index})</span></td>
                <td className="px-4 py-2 capitalize">{r.channel}</td>
                <td className="px-4 py-2"><StatusChip status={r.status} /></td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.error || r.provider || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
    </div>
  );
};

export default Dunning;
