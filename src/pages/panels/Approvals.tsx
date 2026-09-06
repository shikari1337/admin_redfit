import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Loader2, Check, X, CheckCircle2, XCircle, Inbox, ClipboardList } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { localeDateTime } from '../../utils/date';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip, TabBar,
} from '../../components/erp';

/**
 * APPROVALS (migration 063, Part I §13 reusable approval engine). Two plain-
 * language screens:
 *   • "Waiting for your approval" — the inbox: who asked, what for, how much,
 *     Approve / Reject with a reason.
 *   • "Rules" — the policy: "Anything over ₹X of this kind needs a manager's OK."
 * The stock-adjustment binding proves it end-to-end: a big manual adjustment
 * lands here as a pending ask and only moves stock once someone approves.
 */

const inr = (minor: any) => { const n = Number(minor); return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'; };

// Friendly names for the generic doc types the engine can guard.
const DOC_TYPES: Array<{ value: string; label: string }> = [
  { value: 'stock_adjustment', label: 'Stock adjustment' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'journal', label: 'Accounting journal' },
  { value: 'refund', label: 'Refund' },
  { value: 'credit_note', label: 'Credit note' },
];
const docLabel = (t: string) => DOC_TYPES.find((d) => d.value === t)?.label ?? t;

// Roles that can be named as an approver (mirrors the ERP role list).
const ROLES: Array<{ value: string; label: string }> = [
  { value: 'store_manager', label: 'Store manager' },
  { value: 'warehouse_manager', label: 'Warehouse manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'purchasing_officer', label: 'Purchasing officer' },
  { value: 'admin', label: 'Owner / admin' },
];
const roleLabel = (r: string | null) => (r ? (ROLES.find((x) => x.value === r)?.label ?? r) : '—');

interface Req {
  id: string; doc_type: string; amount_minor: string; status: string;
  current_step: number; total_steps: number; requested_by: string | null;
  title: string | null; created_at: string; payload?: any;
}
interface Rule {
  id: string; doc_type: string; min_amount_minor: string; approver_role: string;
  fallback_role: string | null; step_no: number; allow_self_approve: boolean; active: boolean; note: string | null;
}

const TABS = [
  { key: 'inbox', label: <span className="inline-flex items-center gap-1.5"><Inbox className="h-4 w-4" />Waiting for your approval</span> },
  { key: 'rules', label: <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />Rules</span> },
];

const blankRule = { id: '', doc_type: 'stock_adjustment', minRupees: '5000', approver_role: 'store_manager', fallback_role: '', step_no: '1', allow_self_approve: false, active: true, note: '' };

const Approvals: React.FC = () => {
  const [tab, setTab] = useState('inbox');
  const [pending, setPending] = useState<Req[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});

  // rule editor
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...blankRule });

  const loadPending = () => api.get('/approvals/pending').then((r) => setPending(payload<Req[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  const loadRules = () => api.get('/approvals/rules').then((r) => setRules(payload<Rule[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  useEffect(() => { loadPending(); loadRules(); }, []);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id + decision); setMsg(''); setOk('');
    try {
      await api.post(`/approvals/requests/${id}/${decision}`, { reason: reason[id] || null });
      setOk(decision === 'approve' ? 'Approved — the action has been carried out.' : 'Rejected. Nothing was changed.');
      setReason({ ...reason, [id]: '' });
      loadPending();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
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
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  const toggleRule = async (r: Rule) => {
    setBusy(r.id);
    try { await api.post(`/approvals/rules/${r.id}/active`, { active: !r.active }); loadRules(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(''); }
  };

  return (
    <Page>
      <PageHeader
        title="Approvals"
        icon={ShieldCheck}
        description="Some actions are big enough to need a second person's OK. This is where those requests wait — and where you set the rules for what needs approving."
        actions={tab === 'rules' ? <Btn variant="primary" onClick={() => startEdit()}><Plus className="h-4 w-4" />New rule</Btn> : undefined}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

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
              ) : pending.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <div className="font-medium text-gray-800">{r.title || docLabel(r.doc_type)}</div>
                    <div className="text-xs text-gray-500">Asked {localeDateTime(r.created_at)}</div>
                  </Td>
                  <Td><Chip tone="neutral">{docLabel(r.doc_type)}</Chip></Td>
                  <Td num className="font-semibold">{inr(r.amount_minor)}</Td>
                  <Td muted className="text-xs">{r.total_steps > 1 ? `Step ${r.current_step} of ${r.total_steps}` : 'Single'}</Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <TextInput placeholder="Reason (optional)" value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} className="w-52" />
                      <div className="flex gap-1.5">
                        <Btn variant="success" disabled={!!busy} onClick={() => decide(r.id, 'approve')}>{busy === r.id + 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve</Btn>
                        <Btn variant="danger" disabled={!!busy} onClick={() => decide(r.id, 'reject')}>{busy === r.id + 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}Reject</Btn>
                      </div>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}

      {/* RULES */}
      {tab === 'rules' && (
        <>
          {editing && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">{form.id ? 'Edit rule' : 'New rule'}</h3>
              <p className="text-xs text-gray-500">In plain words: "Anything of this kind worth <b>at or above</b> the amount below needs the chosen role to approve it before it happens."</p>
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
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Also allowed (backup approver)">
                  <SelectInput value={form.fallback_role} onChange={(e) => setForm({ ...form, fallback_role: e.target.value })}>
                    <option value="">None</option>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
                    <Td num className="font-semibold">{inr(r.min_amount_minor)}</Td>
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
