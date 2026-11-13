import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Plus, Loader2, Check, X, CheckCircle2, XCircle, Inbox, ClipboardList, History } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { localeDateTime } from '../../utils/date';
import { ROLE_LABELS, ASSIGNABLE_ROLES, type ErpRole } from '../../lib/rbac';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip, StatusChip, TabBar, inr, inrMinor,
} from '../../components/erp';

/**
 * APPROVALS (migration 063, Part I §13 reusable approval engine). Three plain-
 * language screens:
 *   - "Waiting for your approval": the inbox. Who asked, what for, how much,
 *     Approve / Reject with a reason.
 *   - "Decided": what was approved, rejected or withdrawn, and when.
 *   - "Rules": the policy. "Anything over ₹X of this kind needs a manager's OK."
 * The stock-adjustment binding runs end to end (MENU-1 inventory): a loose stock
 * change in Update stock at or above a rule's amount lands here as a pending ask
 * and only moves stock once someone approves. A refund is listed here but decided
 * on the Refunds page, where the refund moves with the decision (the server
 * refuses deciding it here).
 */

// Friendly names for the generic doc types the engine can guard.
const DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: 'stock_adjustment', label: 'Stock adjustment' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'journal', label: 'Accounting journal' },
  { value: 'refund', label: 'Refund' },
  { value: 'credit_note', label: 'Credit note' },
];
const docLabel = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;

/** Document types decided on their own page (the server refuses deciding them here). */
const DECIDED_ELSEWHERE: Record<string, { label: string; to: string }> = {
  refund: { label: 'Decide on Refunds', to: '/panel/orders/refunds' },
};

// Who can be named as an approver: the one role list (lib/rbac.ts), plus the store's admin.
const APPROVER_ROLES: ErpRole[] = ['admin', ...ASSIGNABLE_ROLES];
const roleLabel = (r: string | null) => (r ? (ROLE_LABELS[r as ErpRole] ?? r) : 'None');

interface Req {
  id: string; doc_type: string; amount_minor?: string; amount?: number | string | null; status: string;
  current_step: number; total_steps: number; requested_by: string | null;
  title: string | null; created_at: string; decided_at?: string | null; payload?: any;
}
interface Rule {
  id: string; doc_type: string; min_amount_minor: string; approver_role: string;
  fallback_role: string | null; step_no: number; allow_self_approve: boolean; active: boolean; note: string | null;
}

/** Why the change was asked for, as the request carries it (a held stock change keeps its note). */
const whyOf = (r: Req): string | null => {
  const w = r.payload?.reason ?? r.payload?.notes;
  return typeof w === 'string' && w.trim() ? w.trim() : null;
};

const HISTORY_STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Every decision' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Withdrawn' },
];

const blankRule = { id: '', doc_type: 'stock_adjustment', minRupees: '5000', approver_role: 'store_manager', fallback_role: '', step_no: '1', allow_self_approve: false, active: true, note: '' };

const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'That did not work.';

const Approvals: React.FC = () => {
  const [tab, setTab] = useState('inbox');
  const [pending, setPending] = useState<Req[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [history, setHistory] = useState<Req[] | null>(null);
  const [histStatus, setHistStatus] = useState('');
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});

  // rule editor
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...blankRule });

  const loadPending = () => api.get('/approvals/pending').then((r) => setPending(payload<Req[]>(r) ?? [])).catch((e) => { setPending([]); setMsg(errText(e)); });
  const loadRules = () => api.get('/approvals/rules').then((r) => setRules(payload<Rule[]>(r) ?? [])).catch((e) => { setRules([]); setMsg(errText(e)); });
  const loadHistory = useCallback(() => {
    setHistory(null);
    api.get('/approvals/requests', { params: { status: histStatus || undefined, limit: 100 } })
      .then((r) => {
        const rows = payload<Req[]>(r) ?? [];
        // The history is every request; the inbox already shows the pending ones.
        setHistory(Array.isArray(rows) ? rows.filter((x) => x.status !== 'pending') : []);
      })
      .catch((e) => { setHistory([]); setMsg(errText(e)); });
  }, [histStatus]);
  useEffect(() => { loadPending(); loadRules(); }, []);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id + decision); setMsg(''); setOk('');
    try {
      await api.post(`/approvals/requests/${id}/${decision}`, { reason: reason[id] || null });
      setOk(decision === 'approve' ? 'Approved. The action has been carried out.' : 'Rejected. Nothing was changed.');
      setReason({ ...reason, [id]: '' });
      loadPending();
    } catch (e: any) { setMsg(errText(e)); }
    finally { setBusy(''); }
  };

  const startEdit = (r?: Rule) => {
    setEditing(true); setMsg(''); setOk('');
    if (r) setForm({ id: r.id, doc_type: r.doc_type, minRupees: String(Number(r.min_amount_minor) / 100), approver_role: r.approver_role, fallback_role: r.fallback_role ?? '', step_no: String(r.step_no), allow_self_approve: r.allow_self_approve, active: r.active, note: r.note ?? '' });
    else setForm({ ...blankRule });
  };

  const saveRule = async () => {
    setBusy('rule'); setMsg(''); setOk('');
    try {
      await api.post('/approvals/rules', {
        id: form.id || undefined,
        docType: form.doc_type,
        minAmountMinor: Math.round((Number(form.minRupees) || 0) * 100),
        approverRole: form.approver_role,
        fallbackRole: form.fallback_role || null,
        stepNo: Math.max(1, Math.round(Number(form.step_no) || 1)),
        allowSelfApprove: form.allow_self_approve,
        active: form.active,
        note: form.note || null,
      });
      setOk('Rule saved.'); setEditing(false); loadRules();
    } catch (e: any) { setMsg(errText(e)); }
    finally { setBusy(''); }
  };

  const toggleRule = async (r: Rule) => {
    setBusy(r.id);
    try { await api.post(`/approvals/rules/${r.id}/active`, { active: !r.active }); loadRules(); }
    catch (e: any) { setMsg(errText(e)); }
    finally { setBusy(''); }
  };

  const waiting = pending?.length ?? 0;
  const tabs = [
    { key: 'inbox', label: <span className="inline-flex items-center gap-1.5"><Inbox className="h-4 w-4" />Waiting for your approval{waiting > 0 ? ` (${waiting})` : ''}</span> },
    { key: 'history', label: <span className="inline-flex items-center gap-1.5"><History className="h-4 w-4" />Decided</span> },
    { key: 'rules', label: <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />Rules</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Approvals"
        icon={ShieldCheck}
        description="Some actions are big enough to need a second person's OK. Those requests wait here, and here you set the rules for what needs approving."
        actions={tab === 'rules' ? <Btn variant="primary" onClick={() => startEdit()}><Plus className="h-4 w-4" />New rule</Btn> : undefined}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* INBOX */}
      {tab === 'inbox' && (
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>What's being asked</Th><Th>Kind</Th><Th num>Amount</Th><Th>Step</Th><Th>Your decision</Th>
            </THead>
            <TBody>
              {pending == null ? (
                <EmptyRow colSpan={5}>Loading…</EmptyRow>
              ) : pending.length === 0 ? (
                <EmptyRow colSpan={5}>
                  <EmptyState title="Nothing waiting" description="When someone does something that needs your OK, it will show up here." />
                </EmptyRow>
              ) : pending.map((r) => {
                const elsewhere = DECIDED_ELSEWHERE[r.doc_type];
                const why = whyOf(r);
                return (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-medium text-gray-800">{r.title || docLabel(r.doc_type)}</div>
                      {why && <div className="text-xs text-gray-600">Why: {why}</div>}
                      <div className="text-xs text-gray-500">Asked {localeDateTime(r.created_at)}</div>
                    </Td>
                    <Td><Chip tone="neutral">{docLabel(r.doc_type)}</Chip></Td>
                    <Td num className="font-semibold">{inrMinor(r.amount_minor)}</Td>
                    <Td muted className="text-xs">{r.total_steps > 1 ? `Step ${r.current_step} of ${r.total_steps}` : 'Single'}</Td>
                    <Td>
                      {elsewhere ? (
                        <Btn asChild variant="outline" size="sm"><Link to={elsewhere.to}>{elsewhere.label}</Link></Btn>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <TextInput placeholder="Reason (optional)" value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} className="w-52 max-w-full" />
                          <div className="flex flex-wrap gap-1.5">
                            <Btn variant="success" disabled={!!busy} onClick={() => decide(r.id, 'approve')}>{busy === r.id + 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve</Btn>
                            <Btn variant="danger" disabled={!!busy} onClick={() => decide(r.id, 'reject')}>{busy === r.id + 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}Reject</Btn>
                          </div>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </TableShell>
      )}

      {/* DECIDED */}
      {tab === 'history' && (
        <>
          <FilterBar>
            <Field label="Show">
              <SelectInput value={histStatus} onChange={(e) => setHistStatus(e.target.value)}>
                {HISTORY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectInput>
            </Field>
          </FilterBar>
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>What was asked</Th><Th>Kind</Th><Th num>Amount</Th><Th>Outcome</Th><Th>Decided</Th>
              </THead>
              <TBody>
                {history == null ? (
                  <EmptyRow colSpan={5}>Loading…</EmptyRow>
                ) : history.length === 0 ? (
                  <EmptyRow colSpan={5}>
                    <EmptyState title="Nothing decided yet" description="Approved, rejected and withdrawn requests are kept here." />
                  </EmptyRow>
                ) : history.map((r) => {
                  const why = whyOf(r);
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <div className="font-medium text-gray-800">{r.title || docLabel(r.doc_type)}</div>
                        {why && <div className="text-xs text-gray-600">Why: {why}</div>}
                        <div className="text-xs text-gray-500">Asked {localeDateTime(r.created_at)}</div>
                      </Td>
                      <Td><Chip tone="neutral">{docLabel(r.doc_type)}</Chip></Td>
                      <Td num className="font-semibold">{r.amount_minor != null ? inrMinor(r.amount_minor) : inr(r.amount)}</Td>
                      <Td><StatusChip status={r.status} /></Td>
                      <Td muted className="text-xs">{r.decided_at ? localeDateTime(r.decided_at) : ''}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        </>
      )}

      {/* RULES */}
      {tab === 'rules' && (
        <>
          {editing && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">{form.id ? 'Edit rule' : 'New rule'}</h3>
              <p className="text-xs text-gray-500">In plain words: "Anything of this kind worth <b>at or above</b> the amount below needs the chosen role to approve it before it happens."</p>
              {form.doc_type === 'stock_adjustment' && (
                <p className="text-xs text-gray-500">A stock change is worth its units times their average cost (the selling price when no cost is known). It applies to loose stock received or removed in Update stock.</p>
              )}
              <FilterBar>
                <Field label="This applies to">
                  <SelectInput value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                    {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Needs approval at or above (₹)">
                  <TextInput type="number" min={0} value={form.minRupees} onChange={(e) => setForm({ ...form, minRupees: e.target.value })} />
                </Field>
                <Field label="Who must approve">
                  <SelectInput value={form.approver_role} onChange={(e) => setForm({ ...form, approver_role: e.target.value })}>
                    {APPROVER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Also allowed (backup approver)">
                  <SelectInput value={form.fallback_role} onChange={(e) => setForm({ ...form, fallback_role: e.target.value })}>
                    <option value="">None</option>
                    {APPROVER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Sign-off level (1 = single)">
                  <TextInput type="number" min={1} value={form.step_no} onChange={(e) => setForm({ ...form, step_no: e.target.value })} className="w-28" />
                </Field>
              </FilterBar>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.allow_self_approve} onChange={(e) => setForm({ ...form, allow_self_approve: e.target.checked })} />
                Let the person who asked approve their own request (off = someone else must approve)
              </label>
              <Field label="Note (optional)"><TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. large write-offs need the store manager" /></Field>
              <div className="flex gap-2">
                <Btn variant="success" disabled={busy === 'rule'} onClick={saveRule}>{busy === 'rule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save rule</Btn>
                <Btn variant="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
              </div>
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Applies to</Th><Th num>At or above</Th><Th>Approver</Th><Th>Backup</Th><Th>Level</Th><Th>Self-approve</Th><Th>Status</Th><Th></Th>
              </THead>
              <TBody>
                {rules == null ? (
                  <EmptyRow colSpan={8}>Loading…</EmptyRow>
                ) : rules.length === 0 ? (
                  <EmptyRow colSpan={8}>
                    <EmptyState title="No rules yet" description="Add a rule so big actions get a second pair of eyes. For example: 'Stock adjustments over ₹5,000 need the store manager.'" />
                  </EmptyRow>
                ) : rules.map((r) => (
                  <Tr key={r.id}>
                    <Td>{docLabel(r.doc_type)}</Td>
                    <Td num className="font-semibold">{inrMinor(r.min_amount_minor)}</Td>
                    <Td>{roleLabel(r.approver_role)}</Td>
                    <Td muted>{roleLabel(r.fallback_role)}</Td>
                    <Td muted className="text-xs">{r.step_no}</Td>
                    <Td>{r.allow_self_approve ? <Chip tone="amber">Allowed</Chip> : <Chip tone="neutral">Blocked</Chip>}</Td>
                    <Td>{r.active ? <Chip tone="green"><CheckCircle2 className="mr-1 inline h-3 w-3" />On</Chip> : <Chip tone="red"><XCircle className="mr-1 inline h-3 w-3" />Off</Chip>}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Btn variant="outline" onClick={() => startEdit(r)}>Edit</Btn>
                        <Btn variant="ghost" disabled={busy === r.id} onClick={() => toggleRule(r)}>{r.active ? 'Turn off' : 'Turn on'}</Btn>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </>
      )}
    </Page>
  );
};

export default Approvals;
