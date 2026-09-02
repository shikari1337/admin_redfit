import React from 'react';
import { FaCheck, FaTimes, FaPause, FaUndo } from 'react-icons/fa';
import { Card, CardContent } from '@/components/ui/card';

interface OrderProgressStepperProps {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
}

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
const OrderProgressStepper: React.FC<OrderProgressStepperProps> = ({ orderStatus, paymentStatus, paymentMethod }) => {
  if (orderStatus === 'cancelled') {
    return (
      <Card className="shadow-sm border-red-200 bg-red-50/60">
        <CardContent className="py-2.5 px-4 flex items-center gap-2 text-sm text-red-700">
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
                <div className="flex flex-col items-center gap-1.5 w-20 shrink-0">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${CIRCLE_CLASS[state]}`}>
                    {state === 'partial' ? '!' : state === 'done' ? <FaCheck className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-xs text-center leading-tight ${state === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                    {step.key === 'payment' && isCod ? 'Pay on Delivery' : step.label}
                    {state === 'partial' ? ' (Partial)' : ''}
                  </span>
                </div>
                {!isLast && (
                  <div className={`h-0.5 flex-1 mt-4 ${lineDone ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
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
