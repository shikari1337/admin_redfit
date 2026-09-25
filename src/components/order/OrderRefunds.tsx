import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Undo2, ShieldAlert, Link2 } from 'lucide-react';
import RefundDossier from '@/components/refunds/RefundDossier';

export interface OrderRefundRow {
  id: string;
  source: string;
  amount_minor: string;
  method: string;
  status: string;
  gateway: string | null;
  gateway_refund_id: string | null;
  gateway_error: string | null;
  reference: string | null;
  reason: string | null;
  adjusted_order_id: string | null;
  adjusted_order_number?: string | null;
  attempt_count: number;
  executed_at: string | null;
  created_at: string;
  /**
   * Migration 210. `self_approved_at` records an approval that stepped around
   * the two-person rule; `credit_note_id`/`return_id` are the two links a
   * refund was missing — the paperwork that reverses the GST and the goods that
   * came back. All three ride `listRefunds`' own column list.
   */
  self_approved_at?: string | null;
  self_approved_reason?: string | null;
  credit_note_id?: string | null;
  return_id?: string | null;
}

interface Props {
  refunds?: OrderRefundRow[] | null;
  /**
   * The gateway payment this order was collected on. A refund row records the
   * REFUND id; reconciling against Razorpay needs the payment it was taken
   * from, and that only lives on the order.
   */
  gatewayPaymentId?: string | null;
}

/** "06 Sep 2026, 11:20 pm" — a refund without its clock cannot be reconciled. */
const stamp = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const inr = (minor: any) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
};

/** Plain words for the pipeline states — the operator should not have to learn them. */
const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  requested: { label: 'Waiting for approval', variant: 'secondary' },
  approved: { label: 'Ready to send', variant: 'secondary' },
  executing: { label: 'Sending…', variant: 'secondary' },
  completed: { label: 'Refunded', variant: 'default' },
  failed: { label: "Didn't go through", variant: 'destructive' },
  rejected: { label: 'Turned down', variant: 'outline' },
};

const METHOD: Record<string, string> = {
  gateway: 'Reversed online payment',
  bank_transfer: 'Refunded by hand',
  store_credit: 'Kept as store credit',
  adjustment: 'Adjusted to another order',
};

const SOURCE: Record<string, string> = {
  cancellation: 'Order cancelled',
  rto: 'Parcel returned (RTO)',
  credit_note: 'Credit note',
  manual: 'Raised by hand',
};

/**
 * The money that went BACK on this order — refund id, rail and where each one
 * got to, on the order page itself.
 *
 * Before this, a cancellation's refund existed only as a row in
 * `refund_requests`, reachable solely from the Refunds screen. So the two facts
 * staff actually ask for on the order — "was it refunded?" and "what is the
 * refund id?" — were invisible exactly where they are asked.
 *
 * Renders nothing when the order has no refunds, so an ordinary order page is
 * unchanged.
 */
const OrderRefunds: React.FC<Props> = ({ refunds, gatewayPaymentId }) => {
  // Which refund's full record is expanded. One at a time — each one is a
  // several-join read, and an order rarely has more than a couple of refunds.
  const [open, setOpen] = useState<string | null>(null);
  if (!Array.isArray(refunds) || refunds.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b border-line px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <Undo2 className="h-3.5 w-3.5 text-slate-400" /> Refunds
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {refunds.map((r) => {
          const s = STATUS[r.status] ?? { label: r.status, variant: 'outline' as const };
          return (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">{inr(r.amount_minor)}</span>
                <div className="flex items-center gap-1.5">
                  {/* An approval that stepped around the two-person rule is
                      shown on the order itself, not only in the Refunds screen. */}
                  {r.self_approved_at && (
                    <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800">
                      <ShieldAlert className="h-3 w-3" />Self-approved
                    </Badge>
                  )}
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              </div>
              {/* The refund's OWN id, always — a store-credit or hand-recorded
                  refund has no gateway reference, so without this it had no
                  quotable identifier on the order at all. */}
              <div className="mt-1 text-xs text-muted-foreground">
                Refund id <code className="text-[11px]">{r.id}</code>
              </div>
              <div className="mt-1 text-muted-foreground">
                {SOURCE[r.source] ?? r.source} · {METHOD[r.method] ?? r.method}
              </div>
              {/* WHEN — raised, and (if it went out) when the money actually left. */}
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>Raised {stamp(r.created_at) ?? '—'}</span>
                {r.executed_at && <span>Sent {stamp(r.executed_at)}</span>}
              </div>

              {/* The GATEWAY's refund id — the proof the money left, and the
                  thing anyone reconciling against Razorpay actually needs. It
                  is named for the gateway so it can never be confused with the
                  refund's own id shown above: only one of them exists before
                  the money moves. */}
              {r.gateway_refund_id && (
                <div className="mt-2 space-y-0.5">
                  <div>
                    <span className="text-muted-foreground">Gateway refund ID: </span>
                    <code className="text-xs">{r.gateway_refund_id}</code>
                    {r.gateway && <span className="text-xs text-muted-foreground"> ({r.gateway})</span>}
                  </div>
                  {gatewayPaymentId && (
                    <div>
                      <span className="text-muted-foreground">Against payment: </span>
                      <code className="text-xs">{gatewayPaymentId}</code>
                    </div>
                  )}
                </div>
              )}
              {r.method === 'adjustment' && (
                <div className="mt-2">
                  <span className="text-muted-foreground">Adjusted to order: </span>
                  <span className="font-medium">{r.adjusted_order_number ?? r.adjusted_order_id ?? '—'}</span>
                </div>
              )}
              {r.method !== 'gateway' && r.reference && (
                <div className="mt-2">
                  <span className="text-muted-foreground">Reference: </span>
                  <code className="text-xs">{r.reference}</code>
                </div>
              )}
              {/* The gateway's OWN words on a failure — the person fixing it
                  needs to know whether the payment was never captured or the
                  account is empty, not a generic "error". */}
              {r.status === 'failed' && r.gateway_error && (
                <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {r.gateway_error}
                  {r.attempt_count > 1 && <> (attempt {r.attempt_count})</>}
                </div>
              )}
              {r.self_approved_at && r.self_approved_reason && (
                <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                  Approved by the person who raised it — “{r.self_approved_reason}”
                </div>
              )}
              {r.reason && <div className="mt-2 text-xs text-muted-foreground">{r.reason}</div>}

              {/* The full record — credit note, return and the stock that came
                  back — in the same component the Refunds screen uses, so the
                  order page and that screen can never disagree. */}
              <button type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setOpen((o) => (o === r.id ? null : r.id))}>
                <Link2 className="h-3 w-3" />
                {open === r.id ? 'Hide the full record' : 'Full record — credit note, return, stock'}
              </button>
              {open === r.id && <div className="mt-2"><RefundDossier refundId={r.id} /></div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default OrderRefunds;
