import React, { useEffect, useState } from 'react';
import {
  Undo2, Loader2, CheckCircle2, XCircle, Send, RotateCw, X, Plus, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput,
  StatCard, StatGrid, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * REFUND AUTOMATION (migration 081). The plain-language screen for "a prepaid
 * parcel came back — where is the customer's money?"
 *
 * Every refund walks ONE path and you can see exactly where it is:
 *   Waiting for approval → Ready to send → Sending → Sent back
 *                    ↘ Turned down             ↘ Didn't go through (retry)
 *
 * Deliberate UI choices:
 *  • "Send refund now" is the ONLY button that moves money, it is never the
 *    default-styled action, and it only appears on a refund that is approved (or
 *    one that failed and can be retried).
 *  • A failure shows the payment gateway's OWN words, not a generic "error" — the
 *    person fixing it needs to know whether the payment was never captured or the
 *    gateway wallet is empty.
 *  • The queue puts failures first: an unfinished refund is a customer waiting.
 */

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};

interface Refund {
  id: string;
  order_id: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  source: string;
  source_ref_id: string | null;
  amount_minor: string;
  reason: string | null;
  method: string;
  status: string;
  gateway: string | null;
  gateway_payment_id: string | null;
  gateway_refund_id: string | null;
  gateway_error: string | null;
  attempt_count: number;
  reference: string | null;
  approval_request_id: string | null;
  rejected_reason: string | null;
  executed_at: string | null;
  created_at: string;
}

interface Summary {
  awaitingApproval: { count: number; amountMinor: string };
  readyToSend: { count: number; amountMinor: string };
  executing: { count: number; amountMinor: string };
  failed: { count: number; amountMinor: string };
  completed: { count: number; amountMinor: string };
  completedThisMonth: { count: number; amountMinor: string };
  config: {
    autoApproveUnderMinor: number;
    defaultMethod: string;
    autoRequestOnRto: boolean;
    autoRequestOnCreditNote: boolean;
    autoRequestOnCancellation: boolean;
  };
}

/** One vocabulary for the pipeline, in shop English. */
const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting for approval',
  approved: 'Ready to send',
  executing: 'Sending…',
  completed: 'Sent back',
  failed: "Didn't go through",
  rejected: 'Turned down',
};
const STATUS_TONE: Record<string, any> = {
  requested: 'amber', approved: 'blue', executing: 'blue',
  completed: 'green', failed: 'red', rejected: 'default',
};
const SOURCE_LABEL: Record<string, string> = {
  rto: 'Parcel came back',
  cancellation: 'Order cancelled',
  credit_note: 'Credit note',
  manual: 'Entered by hand',
};
const METHOD_LABEL: Record<string, string> = {
  gateway: 'Back to the card / UPI they paid with',
  bank_transfer: 'Bank transfer (you send it)',
  store_credit: 'Kept as store credit',
  adjustment: 'Adjusted against another order',
};

const STATUS_FILTERS = ['', 'requested', 'approved', 'executing', 'failed', 'completed', 'rejected'];

const Refunds: React.FC = () => {
  const [list, setList] = useState<Refund[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<Refund | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // decide / execute inputs
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');

  // "refund by hand" form
  const [creating, setCreating] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('gateway');
  const [newReason, setNewReason] = useState('');
  const [refundable, setRefundable] = useState<any>(null);

  // Refund policy editor. `PUT /refunds/config` has existed since 081 with no UI
  // at all, so the auto-approve limit — the ONE dial that decides whether a
  // refund goes out by itself or waits for a manager — could only be changed by
  // calling the API by hand. A store wanting cancellations to refund
  // automatically had no way to say so.
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [policyLimit, setPolicyLimit] = useState('');
  const [policyOnCancel, setPolicyOnCancel] = useState(true);
  const [policyOnRto, setPolicyOnRto] = useState(true);
  const [policyOnCreditNote, setPolicyOnCreditNote] = useState(true);

  const err = (e: any) => setMsg(e?.response?.data?.message ?? e?.message ?? 'Something went wrong.');

  const load = () => {
    api.get('/refunds', { params: status ? { status } : {} })
      .then((r) => setList(payload<Refund[]>(r) ?? []))
      .catch(err);
    api.get('/refunds/summary').then((r) => setSummary(payload<Summary>(r))).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setReason(''); setReference('');
    try { setDetail(payload<Refund>(await api.get(`/refunds/${id}`))); setCreating(false); }
    catch (e) { err(e); }
  };

  const act = async (verb: 'approve' | 'reject' | 'execute') => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try {
      const body = verb === 'execute' ? { reference: reference.trim() || null } : { reason: reason.trim() || null };
      const res = await api.post(`/refunds/${detail.id}/${verb}`, body);
      const m = (res as any)?.message ?? (res as any)?.data?.message;
      // The execute route answers 200 even when the gateway refused — read `ok`.
      if (verb === 'execute' && (res as any)?.ok === false) setMsg(m || 'The refund did not go through.');
      else setOk(m || 'Done.');
      await openDetail(detail.id); load();
    } catch (e) { err(e); }
    finally { setBusy(false); }
  };

  /** Save the refund rules (PUT /refunds/config — the route that had no UI). */
  const savePolicy = async () => {
    setBusy(true); setMsg(''); setOk('');
    try {
      const rupees = policyLimit.trim();
      await api.put('/refunds/config', {
        // Blank means "no refund goes out unapproved" — 0, not "leave unchanged".
        autoApproveUnderMinor: rupees === '' ? 0 : Math.max(0, Math.round(Number(rupees) * 100)),
        autoRequestOnCancellation: policyOnCancel,
        autoRequestOnRto: policyOnRto,
        autoRequestOnCreditNote: policyOnCreditNote,
      });
      setEditingPolicy(false);
      setOk('Refund rules saved.');
      load();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const checkRefundable = async () => {
    if (!orderNumber.trim()) return;
    setMsg(''); setRefundable(null);
    try { setRefundable(payload<any>(await api.get(`/refunds/refundable/${encodeURIComponent(orderNumber.trim())}`))); }
    catch (e) { err(e); }
  };

  const create = async () => {
    setBusy(true); setMsg(''); setOk('');
    try {
      const res = await api.post('/refunds', {
        orderNumber: orderNumber.trim(),
        source: 'manual',
        amount: amount.trim() || undefined,     // rupees; blank = everything left
        method,
        reason: newReason.trim() || null,
      });
      setOk((res as any)?.message ?? 'Refund requested.');
      setCreating(false); setOrderNumber(''); setAmount(''); setNewReason(''); setRefundable(null);
      load();
      const created = payload<Refund>(res);
      if (created?.id) openDetail(created.id);
    } catch (e) { err(e); }
    finally { setBusy(false); }
  };

  const canApprove = detail?.status === 'requested';
  const canSend = detail?.status === 'approved' || detail?.status === 'failed';

  return (
    <Page>
      <PageHeader
        title="Refunds — money going back to customers"
        icon={Undo2}
        description="When a prepaid parcel comes back, an order is cancelled, or you issue a credit note settled in cash, the money owed shows up here. Every refund follows one path — asked for, approved, sent, confirmed — so nothing is ever forgotten or paid twice."
        actions={
          <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}>
            <Plus className="h-4 w-4" />{creating ? 'Cancel' : 'Refund by hand'}
          </Btn>
        }
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* TILES */}
      {summary && (
        <StatGrid cols={5}>
          <StatCard label="Waiting for approval" value={inr(summary.awaitingApproval.amountMinor)}
            sub={`${summary.awaitingApproval.count} refund(s)`} tone={summary.awaitingApproval.count ? 'warn' : 'default'} icon={ShieldCheck} />
          <StatCard label="Ready to send" value={inr(summary.readyToSend.amountMinor)}
            sub={`${summary.readyToSend.count} approved, not yet paid`} tone={summary.readyToSend.count ? 'info' : 'default'} icon={Send} />
          <StatCard label="Sending now" value={inr(summary.executing.amountMinor)}
            sub={`${summary.executing.count} at the gateway`} icon={Loader2} />
          <StatCard label="Didn't go through" value={inr(summary.failed.amountMinor)}
            sub={`${summary.failed.count} need a retry`} tone={summary.failed.count ? 'bad' : 'default'} icon={AlertTriangle} />
          <StatCard label="Sent back this month" value={inr(summary.completedThisMonth.amountMinor)}
            sub={`${summary.completedThisMonth.count} refund(s) completed`} tone="good" icon={CheckCircle2} />
        </StatGrid>
      )}

      {summary && !editingPolicy && (
        <p className="text-xs text-gray-500">
          Your rule right now:{' '}
          {summary.config.autoApproveUnderMinor > 0
            ? <>refunds under <strong>{inr(summary.config.autoApproveUnderMinor)}</strong> go out without a manager; anything bigger waits for approval.</>
            : <><strong>every</strong> refund waits for a manager's approval — including refunds opened by a cancellation, so none of them go back on their own.</>}
          {' '}Cancelled paid orders {summary.config.autoRequestOnCancellation ? 'open a refund automatically' : 'do NOT open a refund automatically'};
          {' '}returned parcels {summary.config.autoRequestOnRto ? 'do too' : 'do not'};
          {' '}cash/bank credit notes {summary.config.autoRequestOnCreditNote ? 'do too' : 'do not'}.
          {' '}
          <button type="button" className="underline hover:text-gray-700"
            onClick={() => {
              setEditingPolicy(true); setMsg(''); setOk('');
              setPolicyLimit(summary.config.autoApproveUnderMinor > 0 ? String(summary.config.autoApproveUnderMinor / 100) : '');
              setPolicyOnCancel(summary.config.autoRequestOnCancellation !== false);
              setPolicyOnRto(summary.config.autoRequestOnRto !== false);
              setPolicyOnCreditNote(summary.config.autoRequestOnCreditNote !== false);
            }}>
            Change
          </button>
        </p>
      )}

      {/* POLICY EDITOR */}
      {summary && editingPolicy && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800">Refund rules</h3>
          <p className="text-xs text-gray-500">
            The limit decides how much money may go back <strong>without a second person</strong>.
            A refund at or above it is held for a manager — and the person who raised it cannot be
            the one who approves it. Leave the limit empty to keep every refund under approval.
          </p>
          <FilterBar>
            <Field label="Refund without approval, up to (₹)">
              <TextInput type="number" min={0} step="1" value={policyLimit}
                onChange={(e) => setPolicyLimit(e.target.value)} placeholder="e.g. 5000 — blank = never" />
            </Field>
          </FilterBar>
          <div className="space-y-2 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={policyOnCancel} onChange={(e) => setPolicyOnCancel(e.target.checked)} />
              Cancelling a paid order opens a refund automatically
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={policyOnRto} onChange={(e) => setPolicyOnRto(e.target.checked)} />
              A returned (RTO) prepaid parcel opens a refund automatically
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={policyOnCreditNote} onChange={(e) => setPolicyOnCreditNote(e.target.checked)} />
              A cash/bank-settled credit note opens a refund automatically
            </label>
          </div>
          <div className="flex gap-2">
            <Btn onClick={savePolicy} disabled={busy}>{busy ? 'Saving…' : 'Save rules'}</Btn>
            <Btn variant="ghost" onClick={() => setEditingPolicy(false)} disabled={busy}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* CREATE */}
      {creating && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800">Send money back on an order</h3>
          <p className="text-xs text-gray-500">
            Type the order number and we will tell you exactly how much can still go back — you can never refund more than the customer paid.
          </p>
          <FilterBar>
            <Field label="Order number">
              <TextInput value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} onBlur={checkRefundable} placeholder="e.g. ORD-00003" />
            </Field>
            <Field label="Amount (₹) — blank = everything left">
              <TextInput type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="How should it go back?">
              <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectInput>
            </Field>
            <Field label="Why?">
              <TextInput value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="e.g. customer cancelled after paying" />
            </Field>
          </FilterBar>
          {refundable && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              They paid <strong>{inr(refundable.paidMinor)}</strong>
              {Number(refundable.refundedMinor) > 0 && <> · <strong>{inr(refundable.refundedMinor)}</strong> already back with them</>}
              {Number(refundable.inFlightMinor) > 0 && <> · <strong>{inr(refundable.inFlightMinor)}</strong> already on its way</>}
              {' '}→ you can still refund <strong>{inr(refundable.refundableMinor)}</strong>.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" onClick={checkRefundable}>Check what's refundable</Btn>
            <Btn variant="success" disabled={busy || !orderNumber.trim()} onClick={create}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Request refund
            </Btn>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {detail && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                {inr(detail.amount_minor)} back to {detail.customer_name || 'the customer'}
                <Chip tone={STATUS_TONE[detail.status] ?? 'default'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.order_number ? `Order ${detail.order_number} · ` : ''}
                {SOURCE_LABEL[detail.source] ?? detail.source} · {METHOD_LABEL[detail.method] ?? detail.method}
                {detail.attempt_count > 0 && ` · ${detail.attempt_count} attempt(s)`}
              </div>
              {detail.reason && <div className="mt-1 text-xs text-gray-600">“{detail.reason}”</div>}
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          {detail.status === 'failed' && detail.gateway_error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <strong>The payment gateway refused this refund:</strong>
              <div className="mt-1 font-mono break-all">{detail.gateway_error}</div>
              <div className="mt-1">Fix the problem (a top-up, or the right payment) and press “Try again”.</div>
            </div>
          )}
          {detail.status === 'completed' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Money sent{detail.executed_at ? ` on ${detail.executed_at.replace('T', ' ')}` : ''}.
              {detail.gateway_refund_id && <> Gateway reference <span className="font-mono">{detail.gateway_refund_id}</span>.</>}
              {detail.reference && <> Reference <span className="font-mono">{detail.reference}</span>.</>}
            </div>
          )}
          {detail.status === 'rejected' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              Turned down{detail.rejected_reason ? `: ${detail.rejected_reason}` : '.'} No money went out.
            </div>
          )}
          {detail.status === 'requested' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Nothing has been paid yet. A manager must approve this before the money can leave.
            </div>
          )}

          {canApprove && (
            <div className="space-y-2">
              <Field label="Note / reason (kept on the record)">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you approving or turning this down?" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Btn variant="success" disabled={busy} onClick={() => act('approve')}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve
                </Btn>
                <Btn variant="danger" disabled={busy} onClick={() => act('reject')}>
                  <XCircle className="h-4 w-4" />Turn down
                </Btn>
              </div>
            </div>
          )}

          {canSend && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              {detail.method !== 'gateway' && (
                <Field label={detail.method === 'bank_transfer' ? 'Bank reference / UTR (required)' : 'Reference (optional)'}>
                  <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="so the payment can be traced later" />
                </Field>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="primary" disabled={busy} onClick={() => act('execute')}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : detail.status === 'failed' ? <RotateCw className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {detail.status === 'failed' ? 'Try again' : 'Send the money back now'}
                </Btn>
                <span className="text-xs text-gray-600">
                  {detail.method === 'gateway'
                    ? `This reverses the original online payment${detail.gateway_payment_id ? ` (${detail.gateway_payment_id})` : ''}.`
                    : detail.method === 'bank_transfer'
                      ? 'Marks it done once you have transferred the money yourself.'
                      : 'Records it as store credit — no cash leaves the business.'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUEUE */}
      <FilterBar>
        <Field label="Show">
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s || 'all'} value={s}>{s ? (STATUS_LABEL[s] ?? s) : 'Everything'}</option>
            ))}
          </SelectInput>
        </Field>
      </FilterBar>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Order / customer</Th><Th>Why</Th><Th num>Amount</Th><Th>How</Th><Th>Where it is</Th><Th>Opened</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={6}>Loading refunds…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={6}>
                <EmptyState
                  title="No refunds to deal with"
                  description="When a prepaid parcel comes back or you issue a cash credit note, the refund shows up here automatically."
                />
              </EmptyRow>
            ) : list.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                <Td>
                  {r.order_number || '—'}
                  <span className="block text-xs text-gray-400">{r.customer_name || ''}</span>
                </Td>
                <Td muted>{SOURCE_LABEL[r.source] ?? r.source}</Td>
                <Td num>{inr(r.amount_minor)}</Td>
                <Td muted className="text-xs">{r.method === 'gateway' ? 'Original payment' : r.method === 'bank_transfer' ? 'Bank transfer' : 'Store credit'}</Td>
                <Td>
                  <Chip tone={STATUS_TONE[r.status] ?? 'default'}>{STATUS_LABEL[r.status] ?? r.status}</Chip>
                  {r.status === 'failed' && r.attempt_count > 1 && <span className="ml-1 text-xs text-red-600">{r.attempt_count} tries</span>}
                </Td>
                <Td muted className="text-xs">{(r.created_at || '').replace('T', ' ').slice(0, 16)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default Refunds;
