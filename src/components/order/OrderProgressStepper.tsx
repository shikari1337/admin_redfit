import React from 'react';
import { FaCheck, FaTimes, FaPause, FaUndo } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';

interface OrderProgressStepperProps {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  /** `orders.status_history` — supplies WHEN each stage was reached. */
  statusHistory?: Array<Record<string, any>> | null;
  /** Order creation instant, for the "Order Placed" stage. */
  createdAt?: string | Date | null;
  /** Stamped on delivery; used when history has no explicit delivered entry. */
  deliveredAt?: string | Date | null;
}

/** "06 Sep, 07:10 pm" — short enough to sit under a stage label. */
const stamp = (d?: string | Date | null): string | null => {
  if (!d) return null;
  const t = new Date(d as any);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

/** Which order status first satisfies each stage, so a time can be found for it. */
const STAGE_STATUSES: Record<string, string[]> = {
  confirmed: ['confirmed', 'processing'],
  shipped: ['shipped', 'partially_delivered', 'out_for_delivery'],
  delivered: ['delivered', 'completed'],
};

const STEPS = [
  { key: 'placed', label: 'Order Placed' },
  { key: 'payment', label: 'Payment' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

const CONFIRMED_OR_LATER = new Set([
  'confirmed', 'processing', 'shipped', 'out_for_delivery',
  'delivered', 'partially_delivered', 'return_requested', 'returned', 'completed',
]);
const SHIPPED_OR_LATER = new Set([
  'shipped', 'out_for_delivery', 'delivered', 'partially_delivered',
  'return_requested', 'returned', 'completed',
]);
const DELIVERED_OR_LATER = new Set([
  'delivered', 'partially_delivered', 'return_requested', 'returned', 'completed',
]);

type StepState = 'done' | 'current' | 'pending' | 'partial';

const CIRCLE_CLASS: Record<StepState, string> = {
  done: 'border-green-500 bg-green-500 text-white',
  partial: 'border-amber-400 bg-amber-100 text-amber-700',
  current: 'border-primary bg-primary/10 text-primary',
  pending: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

/**
 * Pure presentational read of order_status/payment_status into a 5-stage
 * progress bar. It drives nothing — the existing status Select and action
 * buttons on OrderDetail remain the only way to actually change anything;
 * this only makes "where is this order right now" legible at a glance
 * instead of a bare status pill buried in the sidebar.
 */
const OrderProgressStepper: React.FC<OrderProgressStepperProps> = ({
  orderStatus, paymentStatus, paymentMethod, statusHistory, createdAt, deliveredAt,
}) => {
  /**
   * The EARLIEST time each stage was reached, read off `status_history`.
   * That array is JSONB and deliberately never camelCased by the API layer, so
   * its entries carry `changed_at` (with `changedAt`/`timestamp` seen on older
   * rows) — read whichever exists rather than assuming one.
   */
  const timeFor = React.useCallback((stageKey: string): string | null => {
    if (stageKey === 'placed') return stamp(createdAt);
    // An order row is only born when its payment's confirming step succeeds
    // (docs/CHECKOUT_LOGIC.md §0a — order-creation deferral), so for a paid
    // PREPAID order `created_at` genuinely IS the moment payment cleared.
    // COD is settled at delivery, so that stage borrows the delivery time.
    if (stageKey === 'payment') {
      if (paymentMethod === 'cod') return stamp(deliveredAt);
      return paymentStatus === 'completed' ? stamp(createdAt) : null;
    }
    if (stageKey === 'delivered' && deliveredAt) return stamp(deliveredAt);
    const wanted = STAGE_STATUSES[stageKey];
    if (!wanted || !Array.isArray(statusHistory)) return null;
    const hits = statusHistory
      .filter((e) => wanted.includes(String(e?.status ?? '').toLowerCase()))
      .map((e) => e?.changed_at ?? e?.changedAt ?? e?.timestamp)
      .filter(Boolean)
      .map((d: any) => new Date(d).getTime())
      .filter((n) => Number.isFinite(n));
    return hits.length ? stamp(new Date(Math.min(...hits))) : null;
  }, [statusHistory, createdAt, deliveredAt, paymentMethod, paymentStatus]);

  if (orderStatus === 'cancelled') {
    return (
      <Card className="shadow-sm border-red-200 bg-red-50/60">
        <CardContent className="py-2 px-4 flex items-center gap-2 text-sm text-red-700">
          <FaTimes className="h-4 w-4 shrink-0" />
          <span className="font-medium">This order was cancelled.</span>
        </CardContent>
      </Card>
    );
  }

  const isCod = paymentMethod === 'cod';
  const paymentDone = paymentStatus === 'completed';
  // COD collects at delivery — don't show the payment stage as "waiting" for
  // the entire life of an otherwise-healthy cash-on-delivery order.
  const paymentStepDone = paymentDone || (isCod && DELIVERED_OR_LATER.has(orderStatus));

  const flags = [
    true, // placed — always true, the order exists
    paymentStepDone,
    CONFIRMED_OR_LATER.has(orderStatus),
    SHIPPED_OR_LATER.has(orderStatus),
    DELIVERED_OR_LATER.has(orderStatus),
  ];
  const firstPendingIndex = flags.findIndex((f) => !f);

  const stepStates: StepState[] = flags.map((done, i) => {
    if (i === 4 && orderStatus === 'partially_delivered') return 'partial';
    if (done) return 'done';
    if (i === firstPendingIndex) return 'current';
    return 'pending';
  });

  const isOnHold = orderStatus === 'on_hold';
  const isReturnRequested = orderStatus === 'return_requested';
  const isReturned = orderStatus === 'returned';

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-3 pb-3 px-4">
        {isOnHold && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-3">
            <FaPause className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">This order is on hold — progress is paused.</span>
          </div>
        )}
        {(isReturnRequested || isReturned) && (
          <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 mb-3">
            <FaUndo className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">
              {isReturnRequested ? 'A return has been requested for this order.' : 'This order was returned.'}
            </span>
          </div>
        )}
        <div className="flex items-start">
          {STEPS.map((step, i) => {
            const state = stepStates[i];
            const isLast = i === STEPS.length - 1;
            const lineDone = state === 'done' || state === 'partial';
            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center gap-0.5 w-24 shrink-0">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold ${CIRCLE_CLASS[state]}`}>
                    {state === 'partial' ? '!' : state === 'done' ? <FaCheck className="h-2.5 w-2.5" /> : i + 1}
                  </div>
                  <span className={`text-[11px] text-center leading-tight ${state === 'pending' ? 'text-muted-foreground' : 'text-foreground font-bold'}`}>
                    {step.key === 'payment' && isCod ? 'Pay on Delivery' : step.label}
                    {state === 'partial' ? ' (Partial)' : ''}
                  </span>
                  {/* WHEN it happened — a progress bar without times cannot answer
                      "how long has this been sitting in Confirmed?". */}
                  {(() => {
                    const t = timeFor(step.key);
                    return t
                      ? <span className="text-[10px] leading-tight text-center font-medium tabular-nums text-slate-400">{t}</span>
                      : <span className="text-[10px] leading-tight">&nbsp;</span>;
                  })()}
                </div>
                {!isLast && (
                  <div className={`h-0.5 flex-1 mt-3 ${lineDone ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderProgressStepper;
