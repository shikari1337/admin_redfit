import React from 'react';

/**
 * The ONE place every admin list/detail page looks up a status → color/label.
 * Each domain keeps its OWN palette (order colors ≠ blog colors ≠ vendor
 * colors) — this is not a single universal palette forced onto every status
 * everywhere, just one place per domain instead of N independent
 * reimplementations that silently drift apart.
 */
export type StatusDomain =
  | 'order'
  | 'payment'
  | 'shipment'
  | 'blog'
  | 'return'
  | 'vendor'
  | 'marketing'
  | 'billing';

const DOMAIN_COLORS: Record<StatusDomain, Record<string, string>> = {
  order: {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    processing: 'bg-purple-100 text-purple-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    partially_delivered: 'bg-amber-100 text-amber-800',
    cancelled: 'bg-red-100 text-red-800',
    returned: 'bg-orange-100 text-orange-800',
  },
  payment: {
    completed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-orange-100 text-orange-800',
  },
  shipment: {
    pending: 'bg-yellow-100 text-yellow-800',
    pickup_scheduled: 'bg-blue-100 text-blue-800',
    picked_up: 'bg-blue-100 text-blue-800',
    in_transit: 'bg-slate-100 text-slate-800',
    out_for_delivery: 'bg-slate-100 text-slate-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    returned: 'bg-gray-100 text-gray-700',
    ndr_failed_delivery: 'bg-red-100 text-red-800',
    rto_in_transit: 'bg-amber-100 text-amber-800',
    rto_delivered: 'bg-gray-100 text-gray-700',
    rto_failed: 'bg-red-100 text-red-800',
  },
  blog: {
    published: 'bg-green-100 text-green-800 border border-green-200',
    draft: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    scheduled: 'bg-blue-100 text-blue-800 border border-blue-200',
    archived: 'bg-gray-100 text-gray-700 border border-gray-200',
  },
  return: {
    pending: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    approved: 'bg-blue-100 text-blue-800 border border-blue-200',
    rejected: 'bg-red-100 text-red-800 border border-red-200',
    completed: 'bg-green-100 text-green-800 border border-green-200',
  },
  vendor: {
    pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    approved: 'bg-green-50 text-green-700 border border-green-200',
    suspended: 'bg-orange-50 text-orange-700 border border-orange-200',
    rejected: 'bg-red-50 text-red-700 border border-red-200',
  },
  marketing: {
    sent: 'bg-green-100 text-green-800',
    scheduled: 'bg-yellow-100 text-yellow-800',
    sending: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    paused: 'bg-purple-100 text-purple-800',
    draft: 'bg-gray-100 text-gray-800',
  },
  billing: {
    pending: 'bg-orange-50 text-orange-700',
    paid: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
    waived: 'bg-gray-100 text-gray-600',
  },
};

const DOMAIN_DEFAULT: Record<StatusDomain, string> = {
  order: 'bg-gray-100 text-gray-800',
  payment: 'bg-gray-100 text-gray-800',
  shipment: 'bg-gray-100 text-gray-700',
  blog: 'bg-gray-100 text-gray-700 border border-gray-200',
  return: 'bg-gray-100 text-gray-700 border border-gray-200',
  vendor: 'bg-gray-50 text-gray-700 border border-gray-200',
  marketing: 'bg-gray-100 text-gray-800',
  billing: 'bg-gray-100 text-gray-600',
};

/**
 * Per-domain label overrides for statuses whose display text isn't just a
 * humanized version of the raw value (e.g. shipment's `ndr_failed_delivery`
 * → "Failed Delivery", not "Ndr Failed Delivery"). Domains not listed (or
 * keys not present) fall back to `humanize()`.
 */
const DOMAIN_LABELS: Partial<Record<StatusDomain, Record<string, string>>> = {
  shipment: {
    pending: 'Pending',
    pickup_scheduled: 'Pickup Scheduled',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    returned: 'Returned',
    ndr_failed_delivery: 'Failed Delivery',
    rto_in_transit: 'RTO In Transit',
    rto_delivered: 'RTO Delivered',
    rto_failed: 'RTO Failed',
  },
};

/** "partially_delivered" → "Partially Delivered". */
function humanize(status: string): string {
  return status
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Raw Tailwind class string for a status pill — for callers that need to
 * apply the color themselves instead of rendering `<StatusBadge>` directly
 * (e.g. a clickable status badge wrapped in a dropdown trigger button).
 */
export function getStatusColorClass(domain: StatusDomain, status: string | null | undefined): string {
  const key = (status || '').toLowerCase();
  return DOMAIN_COLORS[domain]?.[key] ?? DOMAIN_DEFAULT[domain];
}

/** Display label for a status within a domain. */
export function getStatusLabel(domain: StatusDomain, status: string | null | undefined): string {
  const key = (status || '').toLowerCase();
  return DOMAIN_LABELS[domain]?.[key] ?? humanize(status || '');
}

interface StatusBadgeProps {
  status: string;
  /** Which status vocabulary to color/label against. Default 'order' (unchanged from before). */
  type?: StatusDomain;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'order', className = '' }) => {
  const colorClass = getStatusColorClass(type, status);
  const displayStatus = getStatusLabel(type, status);

  return (
    <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${colorClass} ${className}`}>
      {displayStatus}
    </span>
  );
};

export default StatusBadge;
