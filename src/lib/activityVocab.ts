/**
 * Human labels for `staff_activity.action` (migration 151).
 *
 * MIRRORS `backend/src/services/staffActivity.ts` ACTIVITY_ACTIONS. The backend
 * column is an unconstrained VARCHAR on purpose (so adding an ERP entity needs
 * no migration), which means this map can always fall behind the server —
 * `actionLabel` therefore DEGRADES rather than showing a blank: an unknown
 * `purchase_order.receive` renders as "Purchase order receive", never as an
 * empty cell or a raw dotted token the merchant has to decode.
 */
export const ACTION_LABEL: Record<string, string> = {
  'order.create_manual': 'created order',
  'order.status_change': 'changed status of',
  'order.assign': 'assigned',
  'order.unassign': 'unassigned',
  'order.agent_set': 'changed sales credit on',
  'order.note': 'noted on',
  'order.flag': 'flagged',
  'order.items_edit': 'edited items on',
  'order.cancel': 'cancelled',
  'order.waive_charge': 'waived a charge on',
  'order.payment_record': 'recorded payment on',
  'order.payment_mark_paid': 'marked paid',
  'order.email_send': 'emailed the customer about',
  'order.shipment_create': 'created a shipment for',
  'order.delivery_mark': 'set delivery status on',
  'order.invoice_details': 'edited invoice details on',
};

/** Short noun form for charts/columns, where a verb phrase reads badly. */
export const ACTION_SHORT: Record<string, string> = {
  'order.create_manual': 'Manual orders',
  'order.status_change': 'Status changes',
  'order.assign': 'Assignments',
  'order.unassign': 'Unassignments',
  'order.agent_set': 'Credit changes',
  'order.note': 'Notes',
  'order.flag': 'Flags',
  'order.items_edit': 'Item edits',
  'order.cancel': 'Cancellations',
  'order.waive_charge': 'Charge waivers',
  'order.payment_record': 'Payments recorded',
  'order.payment_mark_paid': 'Marked paid',
  'order.email_send': 'Emails sent',
  'order.shipment_create': 'Shipments created',
  'order.delivery_mark': 'Delivery updates',
  'order.invoice_details': 'Invoice edits',
};

/** Fallback: 'purchase_order.receive' → 'Purchase order receive'. */
function humanize(action: string): string {
  return String(action)
    .replace(/^[a-z_]+\./, '')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? humanize(action);
}

export function actionShort(action: string): string {
  return ACTION_SHORT[action] ?? humanize(action);
}
