import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaWhatsapp, FaEnvelope, FaPhone, FaExternalLinkAlt } from 'react-icons/fa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { customersAPI } from '../../services/api';
import { formatDate } from '../../utils/date';
import { fmtRupees } from '../../lib/money';
import { getStatusColorClass } from './StatusBadge';

/**
 * Who this order is for, and what they are worth to the store.
 *
 * Identity comes from the order's own `shipping_address` snapshot (the sanctioned
 * store-owner view — customers are GLOBAL, in a different database post-ADR-001)
 * and renders immediately. The standing — how many orders they have placed here
 * and what they have spent — comes from ONE extra call to `GET /customers/:id`,
 * which already returns `order_count`, `total_spent`, the B2B profile and the
 * customer's recent orders together. No backend change, no per-row fan-out.
 *
 * A guest checkout has no `customer_id`; the card then shows the order's own
 * contact details and says so, rather than rendering an empty history.
 *
 * ⚠️ `order_count`/`total_spent` are computed by the route over the customer's
 * 100 most recent orders in this store. At exactly 100 the true figure may be
 * higher, so it is labelled "100+" rather than quietly under-reporting.
 */
interface OrderCustomerCardProps {
  customerId?: string | null;
  /** Checkout-time snapshot from this order — always available, always shown. */
  shippingAddress?: Record<string, any> | null;
  /** This order's own id, so it can be marked in the history list. */
  currentOrderId?: string;
  /** This order's value, to frame it against the customer's lifetime spend. */
  orderTotal?: number;
  onWhatsAppClick?: (phone: string) => void;
}

interface CustomerProfile {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  order_count?: number;
  total_spent?: number;
  b2b?: { is_b2b?: boolean; b2b_tier?: string | null; company_name?: string | null; credit_limit?: number; credit_days?: number };
  orders?: Array<{ id: string; order_id: string; order_status: string; payment_status: string; total: number | string; created_at: string }>;
}

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'accent' }> = ({
  label, value, hint, tone = 'default',
}) => (
  <div className="rounded-lg border-2 border-slate-100 bg-slate-50/60 px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`mt-0.5 text-lg font-black tabular-nums leading-tight ${tone === 'accent' ? 'text-emerald-700' : 'text-slate-900'}`}>
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[10px] font-medium text-slate-400">{hint}</p>}
  </div>
);

const OrderCustomerCard: React.FC<OrderCustomerCardProps> = ({
  customerId, shippingAddress, currentOrderId, orderTotal, onWhatsAppClick,
}) => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!customerId) { setProfile(null); return; }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    customersAPI.getById(customerId)
      .then((d: CustomerProfile) => { if (!cancelled) setProfile(d ?? null); })
      // A missing/failed profile must never blank the card — the order's own
      // contact snapshot below is still perfectly usable on its own.
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  const addr = shippingAddress ?? {};
  const name = addr.fullName || addr.full_name || profile?.name || 'Guest customer';
  const phone = addr.mobileNumber || addr.mobile_number || profile?.phone || '';
  const email = addr.email || profile?.email || '';

  const rawCount = Number(profile?.order_count ?? 0);
  // The route aggregates over its own LIMIT 100 — say "100+" rather than quote a
  // number we know is a floor. Same for the spend it was derived from.
  const capped = rawCount >= 100;
  const spent = Number(profile?.total_spent ?? 0);
  const aov = rawCount > 0 ? spent / rawCount : 0;
  const history = profile?.orders ?? [];
  const previous = history.filter((o) => o.id !== currentOrderId && o.order_id !== currentOrderId);
  const firstOrderAt = history.length ? history[history.length - 1]?.created_at : null;
  const isRepeat = rawCount > 1;

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="border-b-2 bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
          <span>Customer</span>
          <div className="flex items-center gap-1.5">
            {profile?.b2b?.is_b2b && (
              <Badge className="border-purple-200 bg-purple-100 text-[10px] font-black uppercase text-purple-800 hover:bg-purple-100">
                B2B{profile.b2b.b2b_tier ? ` · ${profile.b2b.b2b_tier}` : ''}
              </Badge>
            )}
            {!loading && customerId && !failed && (
              <Badge
                variant="outline"
                className={`text-[10px] font-black uppercase ${
                  isRepeat ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-blue-300 bg-blue-50 text-blue-700'
                }`}
              >
                {isRepeat ? 'Repeat' : 'First order'}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* ── Identity — from this order, always present ── */}
        <div>
          <p className="text-base font-black leading-tight text-slate-900">{name}</p>
          {profile?.b2b?.company_name && (
            <p className="text-xs font-bold text-purple-700">{profile.b2b.company_name}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {phone && (
              <>
                <a href={`tel:${phone}`} className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-slate-900">
                  <FaPhone className="h-3 w-3 text-slate-400" />{phone}
                </a>
                {onWhatsAppClick && (
                  <button type="button" onClick={() => onWhatsAppClick(phone)}
                    className="flex items-center gap-1.5 font-bold text-green-700 hover:underline" title="Open WhatsApp">
                    <FaWhatsapp className="h-3.5 w-3.5" />WhatsApp
                  </button>
                )}
              </>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-1.5 font-bold text-blue-700 hover:underline">
                <FaEnvelope className="h-3 w-3" />{email}
              </a>
            )}
          </div>
          {profile?.gstin && (
            <p className="mt-1 font-mono text-[11px] font-bold text-slate-600">GSTIN {profile.gstin}</p>
          )}
        </div>

        {/* ── Standing with this store ── */}
        {!customerId ? (
          <p className="rounded-md border-2 border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Guest checkout — this order is not linked to a customer account, so there is no
            order history to show.
          </p>
        ) : loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : failed ? (
          <p className="rounded-md border-2 border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            Customer history could not be loaded.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="Past orders"
                value={capped ? '100+' : rawCount.toLocaleString('en-IN')}
                hint={firstOrderAt ? `since ${formatDate(firstOrderAt, 'MMM yyyy', '')}` : undefined}
              />
              <Stat
                label="Lifetime value"
                value={fmtRupees(spent)}
                hint={capped ? 'last 100 orders' : undefined}
                tone="accent"
              />
              <Stat
                label="Avg order"
                value={fmtRupees(aov)}
                hint={orderTotal != null && aov > 0
                  ? `this one ${orderTotal >= aov ? '+' : '−'}${Math.round(Math.abs(orderTotal - aov) / aov * 100)}%`
                  : undefined}
              />
            </div>

            {previous.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Recent orders ({previous.length})
                </p>
                <div className="max-h-44 divide-y-2 divide-slate-50 overflow-y-auto rounded-lg border-2 border-slate-100">
                  {previous.slice(0, 8).map((o) => (
                    <Link
                      key={o.id}
                      to={`/orders/${o.id}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-50"
                    >
                      <span className="font-black text-slate-800">{o.order_id}</span>
                      <span className="font-medium text-slate-400">
                        {formatDate(o.created_at, 'dd MMM yy', '')}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${getStatusColorClass('order', o.order_status)}`}>
                        {o.order_status}
                      </span>
                      <span className="min-w-[70px] text-right font-black tabular-nums text-slate-900">
                        {fmtRupees(o.total)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <Link
              to={`/customers/${customerId}`}
              className="inline-flex items-center gap-1.5 text-xs font-black text-blue-700 hover:underline"
            >
              Full customer profile <FaExternalLinkAlt className="h-2.5 w-2.5" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderCustomerCard;
