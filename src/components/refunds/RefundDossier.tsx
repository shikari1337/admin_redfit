import React, { useEffect, useState } from 'react';
import { Loader2, Package, FileText, Undo2, ShieldAlert, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';

/**
 * THE REFUND DOSSIER — everything one refund is connected to, on one screen.
 *
 * Owner: "record the refund id and stock reversal and other important
 * interconnected things with refund."
 *
 * Reads `GET /refunds/:id/dossier` (db/queries/refundDossier.ts), which
 * assembles the money, who signed it, the credit note, the return and the
 * stock that actually came back. Before this, answering "was the money sent AND
 * did the goods come back?" meant opening four different screens and knowing
 * which ids joined them.
 *
 * ⚠️ Stock is RESOLVED from the stock ledger, never stored on the refund — so
 * this screen shows the ledger's answer, not a copy that could drift from it.
 *
 * ⚠️ `withheld` is rendered, loudly. Every block of the dossier is best-effort
 * on the server; a block that could not be read must LOOK unread, because an
 * empty stock list that really means "the query failed" is the single most
 * misleading thing this screen could show about a refund.
 *
 * Used by BOTH the Refunds panel and the order page (OrderRefunds), so the two
 * can never tell different stories about the same refund.
 */

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};
const rupees = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};
const when = (v?: string | null) => (v ? String(v).replace('T', ' ').slice(0, 16) : null);

export interface RefundDossierData {
  refund: any;
  approval: {
    approval_request_id: string | null;
    requested_by_name: string | null;
    approved_by_name: string | null;
    executed_by_name: string | null;
    self_approved: boolean;
    self_approved_reason: string | null;
    other_approvers_at_approval: number | null;
    decisions: Array<{
      step_no: number; decision: string; decider_role: string | null;
      decided_by_name: string | null; reason: string | null; decided_at: string | null;
    }>;
  };
  order: any | null;
  creditNote: any | null;
  returnDoc: any | null;
  stock: {
    movements: Array<{
      id: string; sku: string | null; name: string | null; qty_delta: number;
      movement_type: string; ref_doc_type: string; ref_doc_id: string; created_at: string;
    }>;
    unitsReturned: number;
    sourcesChecked: string[];
    note: string;
  };
  withheld: string[];
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap gap-x-2 py-0.5">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-800">{children}</span>
  </div>
);

const Block: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-3">
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
      <Icon className="h-3.5 w-3.5 text-gray-400" />{title}
    </div>
    <div className="text-xs">{children}</div>
  </div>
);

const RefundDossier: React.FC<{ refundId: string }> = ({ refundId }) => {
  const [d, setD] = useState<RefundDossierData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setD(null); setErr('');
    api.get(`/refunds/${refundId}/dossier`)
      .then((r) => { if (live) setD(payload<RefundDossierData>(r)); })
      .catch((e) => { if (live) setErr(e?.response?.data?.message ?? e?.message ?? 'Could not load the full record.'); });
    return () => { live = false; };
  }, [refundId]);

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>;
  if (!d) return <div className="flex items-center gap-2 px-1 py-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the full record…</div>;

  const a = d.approval;
  const r = d.refund ?? {};

  return (
    <div className="space-y-3">
      {/* Anything the server could not read is NAMED. An empty block must never
          be mistaken for "nothing happened". */}
      {d.withheld?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Some of this record could not be read just now: <strong>{d.withheld.join(', ')}</strong>.
            What you see below is complete apart from that — it is not a sign that nothing happened.
          </span>
        </div>
      )}

      {/* A self-approval is an EXCEPTION to the two-person rule and is shown as
          one, with its reason and how many other people could have signed at
          that moment (0 is what justifies it). */}
      {a.self_approved && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Approved by the person who raised it</strong> — an exception to the two-person rule.
            {a.self_approved_reason && <> Reason given: “{a.self_approved_reason}”.</>}
            {a.other_approvers_at_approval != null && (
              <> At that moment <strong>{a.other_approvers_at_approval}</strong> other
                {a.other_approvers_at_approval === 1 ? ' person' : ' people'} could have signed it.</>
            )}
          </span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Block title="The refund" icon={Undo2}>
          <Row label="Refund id">
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">{r.id}</code>
          </Row>
          <Row label="Amount">{inr(r.amount_minor)}</Row>
          <Row label="Status">{r.status}</Row>
          {r.gateway_refund_id && <Row label="Gateway refund id"><code className="text-[11px]">{r.gateway_refund_id}</code></Row>}
          {r.reference && <Row label="Reference"><code className="text-[11px]">{r.reference}</code></Row>}
          <Row label="Raised by">{a.requested_by_name ?? '—'}</Row>
          <Row label="Approved by">{a.approved_by_name ?? 'not yet'}</Row>
          {a.executed_by_name && <Row label="Sent by">{a.executed_by_name}</Row>}
        </Block>

        <Block title="The order it belongs to" icon={FileText}>
          {d.order ? (
            <>
              <Row label="Order">{d.order.order_id}</Row>
              <Row label="Order status">{d.order.order_status}</Row>
              <Row label="Payment">{d.order.payment_status}{d.order.payment_method ? ` · ${d.order.payment_method}` : ''}</Row>
              {d.order.razorpay_payment_id && (
                <Row label="Paid with"><code className="text-[11px]">{d.order.razorpay_payment_id}</code></Row>
              )}
              <Row label="Order total">{rupees(d.order.total)}</Row>
              <Row label="Refunded so far">{rupees(d.order.refunded_amount)}</Row>
            </>
          ) : <span className="text-gray-500">This refund names no order.</span>}
        </Block>

        {d.creditNote && (
          <Block title="The credit note" icon={FileText}>
            <Row label="Number">{d.creditNote.cn_number}</Row>
            <Row label="Status">{d.creditNote.status}</Row>
            <Row label="Value">{inr(d.creditNote.total_minor)}</Row>
            <Row label="Restocked on issue">{d.creditNote.restock ? 'yes' : 'no'}</Row>
            {d.creditNote.issued_at && <Row label="Issued">{when(d.creditNote.issued_at)}</Row>}
          </Block>
        )}

        {d.returnDoc && (
          <Block title="The return" icon={Package}>
            <Row label="Return">{d.returnDoc.return_number ?? d.returnDoc.id}</Row>
            <Row label="Status">{d.returnDoc.status}{d.returnDoc.resolution ? ` · ${d.returnDoc.resolution}` : ''}</Row>
            <Row label="Received">{d.returnDoc.total_received ?? 0}</Row>
            <Row label="Back on the shelf">{d.returnDoc.total_resellable ?? 0}</Row>
            <Row label="Damaged / scrapped">
              {(Number(d.returnDoc.total_damaged) || 0) + (Number(d.returnDoc.total_scrapped) || 0)}
            </Row>
          </Block>
        )}
      </div>

      {/* THE STOCK REVERSAL — the owner's second question. Money going back and
          goods coming back are different events; this says plainly which of
          them has happened. */}
      <Block title="Stock that came back" icon={Package}>
        <p className="mb-2 text-gray-600">{d.stock.note}</p>
        {d.stock.movements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2 font-medium">SKU</th>
                  <th className="py-1 pr-2 font-medium">Item</th>
                  <th className="py-1 pr-2 text-right font-medium">Units</th>
                  <th className="py-1 pr-2 font-medium">Why</th>
                  <th className="py-1 pr-2 font-medium">Against</th>
                  <th className="py-1 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {d.stock.movements.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1 pr-2 font-mono">{m.sku ?? '—'}</td>
                    <td className="py-1 pr-2">{m.name ?? '—'}</td>
                    <td className="py-1 pr-2 text-right font-medium tabular-nums text-emerald-700">+{m.qty_delta}</td>
                    <td className="py-1 pr-2 text-gray-600">{String(m.movement_type).replace(/_/g, ' ')}</td>
                    <td className="py-1 pr-2 text-gray-600">{String(m.ref_doc_type).replace(/_/g, ' ')} {m.ref_doc_id}</td>
                    <td className="py-1 text-gray-500">{when(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.stock.sourcesChecked?.length > 0 && (
          <p className="mt-2 text-[11px] text-gray-400">
            Traced on the stock ledger against: {d.stock.sourcesChecked.map((s) => s.replace(/_/g, ' ')).join(', ')}.
          </p>
        )}
      </Block>

      {/* WHO SIGNED IT — the approval trail, not just the final state. */}
      {a.decisions.length > 0 && (
        <Block title="How it was signed off" icon={ShieldAlert}>
          <ul className="space-y-1">
            {a.decisions.map((x, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-medium text-gray-800">Step {x.step_no}: {x.decision}</span>
                <span className="text-gray-600">
                  by {x.decided_by_name ?? x.decider_role ?? 'unknown'}{x.decided_at ? ` · ${when(x.decided_at)}` : ''}
                </span>
                {x.reason && <span className="w-full text-gray-500">“{x.reason}”</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
};

export default RefundDossier;
