import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaCopy, FaExternalLinkAlt, FaSms, FaWhatsapp, FaEnvelope } from 'react-icons/fa';
import { cartsAPI, journeyAPI, couponsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ButtonLoader from '../components/ButtonLoader';
import { localeDateTime } from '../utils/date';

interface CartDetailItem {
  productId: string;
  variationId?: string | null;
  productName: string;
  sku?: string | null;
  /** true = matched from the name, not recorded by the shopper's client. */
  skuInferred?: boolean;
  price: number;
  quantity: number;
  image?: string | null;
  attributes?: Record<string, any>;
  lineTotal: number;
  addedAt?: string;
}

/** Estimated charges breakdown — same shape Order Detail's Order Summary
 *  shows, computed from the store's flat shipping/COD config (no confirmed
 *  address needed pre-checkout). Mirrors whatever waiver is currently applied. */
interface CartCharges {
  subtotal: number;
  shipping: number;
  codFee: number;
  discount: number;
  /** Each discount the pricing brain applied, with its own reason. */
  discountItems?: Array<{ amount: number; reason: string }>;
  couponCode?: string | null;
  couponError?: string | null;
  /** The order's real GST snapshot (same shape checkout returns). */
  gst?: { taxType?: string; cgst?: number; sgst?: number; igst?: number } | null;
  tax?: number;
  /** False when the shopper never entered an address — place-of-supply unknown. */
  addressKnown?: boolean;
  total: number;
  paymentMethod: 'cod' | 'prepaid';
  shippingWaived: boolean;
  codWaived: boolean;
}

interface JourneyEvent {
  type: string;
  storeSlug?: string;
  store_slug?: string;
  ipAddress?: string;
  meta?: Record<string, any>;
  createdAt?: string;
  created_at?: string;
}

/** One WhatsApp/SMS/Email attempt for this cart (automated flow or a manual
 *  staff send) — `status:'sent'` means the provider ACCEPTED the request,
 *  not confirmed delivery (no delivery-receipt webhook exists for either
 *  channel in this platform). */
interface CartScheduleStep {
  key: string; name: string; enabled: boolean; delayHours: number;
  state: 'sent' | 'skipped' | 'disabled' | 'pending';
  dueAt: string | null; channels: string[];
  discount: { type: string; value: number } | null;
  content: {
    email: { subject: string | null; headline: string | null; message: string | null } | null;
    whatsapp: { mode: string; templateName: string | null } | null;
    sms: { editedIn: string } | null;
  };
  sent: Array<{ channel: string; status: string; at: string; error: string | null }>;
}
interface CartSchedule {
  automationEnabled: boolean; blockers: string[]; anchorAt: string;
  attempts: number; manualSends: number; plan: CartScheduleStep[];
}

interface CartTeamMember {
  agentId: string; agentName: string | null; role?: string | null;
  lastAction: string; lastAt: string; earnsCredit: boolean;
}
interface CartTeam {
  contributors: CartTeamMember[];
  wouldCredit: { agentId: string; agentName: string | null; basis: string; detail: string; at: string } | null;
  activity: Array<{ id: string; actorName: string | null; action: string; created_at: string;
                    actor_name?: string | null; to_value?: string | null }>;
}

interface CartLink {
  key: string;
  label: string;
  longUrl: string;
  shortUrl: string | null;
}

interface RecoveryLogEntry {
  id: string;
  cart_id: string;
  step_key: string | null;
  trigger: 'automated' | 'manual';
  channel: 'whatsapp' | 'sms' | 'email';
  status: 'sent' | 'failed';
  provider_message_id: string | null;
  error: string | null;
  actor_id: string | null;
  actor: { name: string; email: string } | null;
  sent_at: string;
}

interface CheckoutAttempt {
  id: string;
  paymentMethod?: string;
  payment_method?: string;
  paymentGateway?: string | null;
  payment_gateway?: string | null;
  status: string;
  failureReason?: string | null;
  failure_reason?: string | null;
  couponCode?: string | null;
  coupon_code?: string | null;
  total?: number;
  createdAt?: string;
  created_at?: string;
  /** Set once this attempt actually confirmed into a real order. */
  orderId?: string | null;
  order_id?: string | null;
  orderNumber?: string | null;
  order_number?: string | null;
}

interface CartDetail {
  _id: string;
  cartId?: string;
  customerId?: string;
  status: string;
  isGuest?: boolean;
  metadata?: { admin_notes?: Array<{ text: string; by: string; at: string }> } & Record<string, any>;
  items: CartDetailItem[];
  itemCount: number;
  total: number;
  appliedCouponCode?: string | null;
  recoveryToken?: string | null;
  recoveryUrl?: string | null;
  /** Set when this cart became an order — the proof behind "Recovered". */
  orderId?: string | null;
  orderStatus?: string | null;
  orderedAt?: string | null;
  salesAgentName?: string | null;
  lastActiveAt?: string;
  lastRecoveredAt?: string;
  lastRecoverySmsAt?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: { name?: string; email?: string; phoneNumber?: string } | null;
  checkoutAttempts?: CheckoutAttempt[];
  charges?: CartCharges;
}

const formatDate = (value?: string | null) => (value ? localeDateTime(value) : '—');
/** Cart ledger actions in the words staff use. Mirrors staffActivity's
 *  CART_* vocabulary; an unknown action degrades to its raw key rather than
 *  rendering blank. */
/** Past this many lines the items table gets its own scroll area instead of
 *  growing the page. Chosen so an ordinary cart is untouched. */
const ITEMS_SCROLL_THRESHOLD = 10;

const CART_ACTION_LABELS: Record<string, string> = {
  'cart.recovery_send': 'sent a reminder',
  'cart.waive_charge': 'waived a charge',
  'cart.discount_apply': 'applied a discount',
  'cart.discount_remove': 'removed a discount',
  'cart.items_edit': 'edited the items',
  'cart.note': 'added a note',
};
const actionLabel = (a?: string | null) => (a ? CART_ACTION_LABELS[a] ?? a : '—');

const formatMoney = (value?: number | null) =>
  `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    abandoned: 'bg-amber-100 text-amber-800',
    active: 'bg-blue-100 text-blue-800',
    converted: 'bg-green-100 text-green-800',
    expired: 'bg-gray-100 text-gray-600',
  };
  return styles[status] || 'bg-gray-100 text-gray-600';
};

/** cart_checkout_attempts.status → badge tone (same tailwind vocabulary as statusBadge above). */
const attemptStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-amber-100 text-amber-800',
    expired: 'bg-gray-100 text-gray-600',
    created: 'bg-blue-100 text-blue-800',
    otp_sent: 'bg-blue-100 text-blue-800',
    otp_verified: 'bg-blue-100 text-blue-800',
    payment_created: 'bg-blue-100 text-blue-800',
  };
  return styles[status] || 'bg-gray-100 text-gray-600';
};

const AbandonedCartDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which channel is currently sending (null = none in flight) — drives each
  // button's own loading state independently, and disables the other two
  // while one is in flight so a double-click can't fire two channels at once.
  const [sendingChannel, setSendingChannel] = useState<'whatsapp' | 'sms' | 'email' | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<{ ok: boolean; channel: string; reason?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [journey, setJourney] = useState<JourneyEvent[] | null>(null);
  const [recoveryLog, setRecoveryLog] = useState<RecoveryLogEntry[] | null>(null);
  /** Per-channel short links (gc.mw when the store prefers the platform
   *  shortener). One PER CHANNEL on purpose — a single shared link would merge
   *  WhatsApp/SMS/email opens into one number nobody can act on. */
  const [links, setLinks] = useState<CartLink[] | null>(null);
  const [team, setTeam] = useState<CartTeam | null>(null);
  const [schedule, setSchedule] = useState<CartSchedule | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Apply Discount panel
  const [coupons, setCoupons] = useState<any[]>([]);
  const [discountMode, setDiscountMode] = useState<'existing' | 'generate'>('existing');
  const [selectedCoupon, setSelectedCoupon] = useState('');
  const [genType, setGenType] = useState<'percentage' | 'fixed'>('percentage');
  const [genValue, setGenValue] = useState('');
  const [genMaxDiscount, setGenMaxDiscount] = useState('');
  const [genExpiresInDays, setGenExpiresInDays] = useState('7');
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [removingDiscount, setRemovingDiscount] = useState(false);
  const [togglingCharge, setTogglingCharge] = useState<'shipping' | 'cod' | null>(null);

  useEffect(() => {
    couponsAPI.getAll()
      .then((res: any) => setCoupons(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])))
      .catch(() => setCoupons([]));
  }, []);

  const handleAddNote = async () => {
    if (!noteText.trim() || !cart) return;
    setSavingNote(true);
    try {
      await cartsAPI.addNote(String(cart._id), noteText.trim());
      setNoteText('');
      fetchCart();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save the note');
    } finally {
      setSavingNote(false);
    }
  };

  const fetchCart = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await cartsAPI.getDetail(id);
      const record = data?.data ?? data;
      if (!record || !record._id) throw new Error('Cart not found');
      setCart(record as CartDetail);
      // Shopper journey (this store's slice of the central footprint) — what
      // they looked at, logins, checkout attempts. Guests leave no footprint.
      if (record.customerId) {
        journeyAPI.customerJourney(String(record.customerId), 60)
          .then((j) => setJourney(Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : [])))
          .catch(() => setJourney([]));
      } else {
        setJourney([]);
      }
      cartsAPI.getRecoveryLog(id)
        .then((rows: any) => setRecoveryLog(Array.isArray(rows) ? rows : []))
        .catch(() => setRecoveryLog([]));
      cartsAPI.getLinks(id)
        .then((d: any) => setLinks(Array.isArray(d?.links) ? d.links : []))
        .catch(() => setLinks([]));
      cartsAPI.getTeam(id)
        .then((d: any) => setTeam(d ?? null))
        .catch(() => setTeam(null));
      cartsAPI.getSchedule(id)
        .then((d: any) => setSchedule(d ?? null))
        .catch(() => setSchedule(null));
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const handleSendRecovery = async (channel: 'whatsapp' | 'sms' | 'email') => {
    if (!cart) return;
    setSendingChannel(channel);
    setRecoveryResult(null);
    try {
      const res = await cartsAPI.sendRecovery(String(cart._id), { channel });
      setRecoveryResult(res?.data ?? { ok: true, channel });
      fetchCart();
    } catch (err: any) {
      const payload = err.response?.data;
      // The route returns the real per-channel failure reason as `data` even on a
      // non-2xx response (422 = channel accepted but not delivered); fall back to
      // a generic message only for something that never reached that logic (network
      // error, 400 validation, etc).
      setRecoveryResult(
        payload?.data ?? { ok: false, channel, reason: payload?.message || err.message || 'Failed to send recovery message' }
      );
    } finally {
      setSendingChannel(null);
    }
  };

  const handleCopyLink = async () => {
    if (!cart?.recoveryUrl) return;
    try {
      await navigator.clipboard.writeText(cart.recoveryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(cart.recoveryUrl);
    }
  };

  const handleApplyDiscount = async () => {
    if (!cart) return;
    if (discountMode === 'existing' && !selectedCoupon) {
      alert('Choose a coupon first');
      return;
    }
    if (discountMode === 'generate') {
      const value = parseFloat(genValue);
      if (!Number.isFinite(value) || value <= 0) {
        alert('Enter a valid discount value');
        return;
      }
    }
    if (cart.appliedCouponCode) {
      const ok = window.confirm(
        `This cart already has "${cart.appliedCouponCode}" applied. Replace it with the new discount?`
      );
      if (!ok) return;
    }

    setApplyingDiscount(true);
    try {
      const body: any =
        discountMode === 'existing'
          ? { mode: 'existing', couponCode: selectedCoupon }
          : {
              mode: 'generate',
              type: genType,
              value: parseFloat(genValue),
              ...(genMaxDiscount ? { maxDiscount: parseFloat(genMaxDiscount) } : {}),
              ...(genExpiresInDays ? { expiresInDays: parseInt(genExpiresInDays, 10) } : {}),
            };
      await cartsAPI.applyDiscount(String(cart._id), body);
      setSelectedCoupon('');
      setGenValue('');
      setGenMaxDiscount('');
      fetchCart();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to apply discount');
    } finally {
      setApplyingDiscount(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!cart) return;
    const ok = window.confirm('Remove the applied discount from this cart?');
    if (!ok) return;
    setRemovingDiscount(true);
    try {
      await cartsAPI.removeDiscount(String(cart._id));
      fetchCart();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to remove discount');
    } finally {
      setRemovingDiscount(false);
    }
  };

  /** Toggle a shipping/COD waiver — reaches the real order if this cart is
   *  later recovered and checked out, not just the estimate shown here. */
  const handleToggleCharge = async (charge: 'shipping' | 'cod') => {
    if (!cart?.charges) return;
    setTogglingCharge(charge);
    try {
      const body = charge === 'shipping'
        ? { shippingWaived: !cart.charges.shippingWaived }
        : { codWaived: !cart.charges.codWaived };
      await cartsAPI.updateCharges(String(cart._id), body);
      fetchCart();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to update the charge');
    } finally {
      setTogglingCharge(null);
    }
  };

  // NOTE: hooks must run on EVERY render. This sat below the `loading` /
  // `error` early returns, so it was skipped on the first pass and called on
  // the second — "Rendered more hooks than during the previous render". Both
  // tsc and vite build pass on that; only the browser catches it.
  /**
   * Communication counts derived from `cart_recovery_log` — the authoritative
   * record of what was actually attempted. Derived ONCE here so the command
   * band and the Communication Log below cannot quote different numbers.
   * `null` while loading, so the band shows an em dash instead of a false 0.
   */
  const comms = useMemo(() => {
    if (!recoveryLog) return null;
    return {
      sent: recoveryLog.filter((l) => l.status === 'sent').length,
      failed: recoveryLog.filter((l) => l.status === 'failed').length,
      automated: recoveryLog.filter((l) => l.trigger === 'automated').length,
      manual: recoveryLog.filter((l) => l.trigger === 'manual').length,
    };
  }, [recoveryLog]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" color="primary" text="Loading cart..." />
      </div>
    );
  }

  if (error || !cart) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button
          onClick={() => navigate('/orders/abandoned-carts')}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <FaArrowLeft className="mr-2" /> Back to Abandoned Carts
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error || 'Cart not found'}
        </div>
      </div>
    );
  }

  const attributeText = (attrs?: Record<string, any>) => {
    if (!attrs || typeof attrs !== 'object') return null;
    const parts = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    return parts.length ? parts.join(' · ') : null;
  };

  const activeCoupons = coupons.filter((c: any) => c.isActive ?? c.is_active);



  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    } catch { /* clipboard blocked — the link is on screen to copy by hand */ }
  };

  /** One fact per cell, same reading order as Order Detail's command band. */
  const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
    <div className="flex flex-col justify-center px-4 py-2 border-l border-slate-200 first:border-l-0">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? 'text-slate-800'}`}>{value}</span>
    </div>
  );

  return (
    /* Full-bleed: cancels Layout.tsx's own padding, same as Order Detail. */
    <div className="-m-4 md:-m-6 lg:-m-8 bg-slate-50 min-h-screen">
      {/* ── Command band — the whole cart in one line, sticky while scrolling ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 md:px-6 py-2.5 flex items-center gap-3 flex-nowrap overflow-x-auto">
          <Link
            to="/orders/abandoned-carts"
            className="shrink-0 inline-flex items-center text-sm text-slate-500 hover:text-slate-900"
            title="Back to Abandoned Carts"
          >
            <FaArrowLeft />
          </Link>
          <div className="shrink-0">
            <div className="text-base font-bold text-slate-900 leading-tight">
              Cart {cart.cartId || String(cart._id).slice(-8)}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${statusBadge(cart.status)}`}>
                {cart.status}
              </span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cart.isGuest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {cart.isGuest ? 'Guest' : 'Signed in'}
              </span>
              {/* "Recovered" is only ever true because an order exists — name it. */}
              {cart.orderId && (
                <Link
                  to={`/orders/${cart.orderId}`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                  title={cart.orderedAt ? `Ordered ${formatDate(cart.orderedAt)}` : undefined}
                >
                  {cart.orderId} →
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-stretch shrink-0 ml-2">
            <Stat label="Total" value={formatMoney(cart.total ?? 0)} />
            <Stat label="Lines" value={cart.itemCount ?? cart.items?.length ?? 0} />
            <Stat label="Sent" value={comms ? comms.sent : '—'} />
            {/* Failures were previously invisible anywhere on this page, even
                though every attempt is recorded with its provider reason. A
                cart whose only nudge BOUNCED reads identically to one nobody
                ever contacted unless this is on screen. */}
            <Stat
              label="Failed"
              value={comms ? comms.failed : '—'}
              tone={comms && comms.failed > 0 ? 'text-red-600' : 'text-slate-400'}
            />
            <Stat
              label="Automated"
              value={comms ? comms.automated : '—'}
              tone={comms && comms.automated > 0 ? 'text-slate-800' : 'text-slate-400'}
            />
            <Stat
              label="By staff"
              value={comms ? comms.manual : '—'}
              tone={comms && comms.manual > 0 ? 'text-slate-800' : 'text-slate-400'}
            />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
          {(
            [
              { channel: 'whatsapp' as const, label: 'WhatsApp', Icon: FaWhatsapp, className: 'bg-green-600 hover:bg-green-700 disabled:bg-green-400' },
              { channel: 'sms' as const, label: 'SMS', Icon: FaSms, className: 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400' },
              { channel: 'email' as const, label: 'Email', Icon: FaEnvelope, className: 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400' },
            ]
          ).map(({ channel, label, Icon, className }) => (
            <button
              key={channel}
              onClick={() => handleSendRecovery(channel)}
              disabled={sendingChannel !== null}
              className={`inline-flex items-center px-3 py-2 text-sm text-white rounded-md ${className}`}
            >
              {sendingChannel === channel ? (
                <>
                  <ButtonLoader size="sm" color="current" />
                  <span className="ml-2">Sending...</span>
                </>
              ) : (
                <>
                  <Icon className="mr-2" /> {label}
                </>
              )}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 space-y-4">
        {/* Items — FULL WIDTH above the grid, as on Order Detail. The scroller
            needs w-0 min-w-full: a flex/grid child's min-width:auto otherwise
            lets a wide table widen the whole PAGE (COMMON_MISTAKES #215). */}
        <div className="w-0 min-w-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Items ({cart.itemCount ?? cart.items?.length ?? 0})</h2>
            {(cart.items?.length ?? 0) > ITEMS_SCROLL_THRESHOLD && (
              <span className="text-xs text-slate-400">Scroll for the rest · header stays put</span>
            )}
          </div>
          {/* A 69-line cart pushed every other panel off the screen. Cap the
              body and let it scroll, with a sticky header so the columns stay
              readable. Small carts are unaffected — max-height only bites past
              the threshold, so a 3-line cart still renders at its natural size. */}
          <div
            className="overflow-auto"
            style={(cart.items?.length ?? 0) > ITEMS_SCROLL_THRESHOLD ? { maxHeight: '32rem' } : undefined}
          >
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider w-10">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider w-28">SKU</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider w-24">Rate</th>
                  <th className="px-3 py-2 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider w-14">Qty</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider w-28">Total</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider w-40 hidden lg:table-cell">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(cart.items || []).map((item, index) => (
                  <tr key={`${item.productId}-${item.variationId ?? index}`}>
                    <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums text-right">{index + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 shrink-0" title="No image" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 truncate" title={item.productName}>{item.productName}</div>
                          {attributeText(item.attributes) && (
                            <div className="text-[11px] text-slate-400 truncate">{attributeText(item.attributes)}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap tabular-nums">
                      {item.sku ? (
                        <span
                          className={item.skuInferred ? 'text-amber-700' : 'text-slate-600'}
                          title={item.skuInferred
                            ? 'Matched from the item name — this line never recorded which variation was chosen'
                            : undefined}
                        >
                          {item.sku}{item.skuInferred && <span className="ml-1 text-[10px]">≈</span>}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-sm text-slate-700 text-right whitespace-nowrap tabular-nums">{formatMoney(item.price)}</td>
                    <td className="px-3 py-1.5 text-sm text-slate-700 text-center tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-1.5 text-sm font-semibold text-slate-900 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(item.lineTotal ?? item.price * item.quantity)}
                    </td>
                    {/* Its own column, not a third line under the name — the
                        added time is the least-scanned fact on the row and was
                        costing every row 18px of height. */}
                    <td className="px-3 py-1.5 text-[11px] text-slate-400 whitespace-nowrap hidden lg:table-cell">
                      {item.addedAt ? formatDate(item.addedAt) : '—'}
                    </td>
                  </tr>
                ))}
                {(!cart.items || cart.items.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">This cart has no items.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Estimated charges — same breakdown shape as Order Detail's Order
              Summary; shipping/COD can be waived here to win the cart back,
              honored automatically if this cart is recovered and checked out. */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatMoney(cart.charges?.subtotal ?? cart.total)}</span>
            </div>
            {cart.appliedCouponCode && (
              <div className="flex justify-between text-gray-600">
                <span>Discount ({cart.appliedCouponCode})</span>
                <span>−{formatMoney(cart.charges?.discount ?? 0)}</span>
              </div>
            )}
            {cart.charges && (
              <>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Shipping {cart.charges.shippingWaived && <span className="text-emerald-600 font-medium">(waived)</span>}</span>
                  <div className="flex items-center gap-2">
                    <span className={cart.charges.shippingWaived ? 'line-through text-gray-400' : ''}>
                      {formatMoney(cart.charges.shipping)}
                    </span>
                    <button
                      onClick={() => handleToggleCharge('shipping')}
                      disabled={togglingCharge !== null}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {togglingCharge === 'shipping' ? '…' : cart.charges.shippingWaived ? 'Restore' : 'Waive'}
                    </button>
                  </div>
                </div>
                {cart.charges.paymentMethod === 'cod' && (
                  <div className="flex justify-between items-center text-gray-600">
                    <span>COD charge {cart.charges.codWaived && <span className="text-emerald-600 font-medium">(waived)</span>}</span>
                    <div className="flex items-center gap-2">
                      <span className={cart.charges.codWaived ? 'line-through text-gray-400' : ''}>{formatMoney(cart.charges.codFee)}</span>
                      <button
                        onClick={() => handleToggleCharge('cod')}
                        disabled={togglingCharge !== null}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {togglingCharge === 'cod' ? '…' : cart.charges.codWaived ? 'Restore' : 'Waive'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* Every discount the pricing brain applied, named. Subtotal and
                total can only differ for a reason that is on screen. */}
            {(cart.charges?.discountItems ?? []).map((d, i) => (
              <div key={i} className="flex justify-between text-sm text-emerald-700">
                <span>{d.reason || 'Discount'}</span>
                <span>-{formatMoney(d.amount)}</span>
              </div>
            ))}
            {cart.charges?.tax ? (
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  Incl. GST{cart.charges.gst?.taxType ? ` (${cart.charges.gst.taxType})` : ''}
                  {cart.charges.gst?.taxType === 'IGST'
                    ? '' : cart.charges.gst?.cgst != null ? ' — CGST + SGST' : ''}
                </span>
                <span>{formatMoney(cart.charges.tax)}</span>
              </div>
            ) : null}
            {cart.charges && cart.charges.addressKnown === false && (
              <p className="text-[11px] text-gray-400">
                No delivery address on this cart yet — GST is split into IGST or CGST+SGST once
                the shopper enters one at checkout.
              </p>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Estimated total</span>
              <span>{formatMoney(cart.charges?.total ?? cart.total)}</span>
            </div>
            <p className="text-[11px] text-gray-400 pt-1">
              Priced by the same engine as the shopper's cart and checkout, so these figures match what they see. Only the delivery address can still change them.
            </p>
          </div>
        </div>

        {/* Wide column (2/3) + rail (1/3), same proportions as Order Detail */}
        <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-1 lg:order-2">
          {/* Who worked this cart — and who would be credited for the sale.
              Working an abandoned cart IS selling, so this mirrors Order
              Detail's team card rather than inventing a second vocabulary. */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Worked by</h2>
            {team === null ? (
              <div className="text-sm text-slate-400">Loading…</div>
            ) : (
              <div className="space-y-3">
                {team.wouldCredit ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-700">Assisted credit would go to</div>
                    <div className="text-sm font-semibold text-emerald-900">
                      {team.wouldCredit.agentName || 'Unnamed staff'}
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      {team.wouldCredit.basis === 'auto_recovery'
                        ? `Sent the recovery message (${team.wouldCredit.detail})`
                        : `Worked the cart — ${actionLabel(team.wouldCredit.detail)}`}
                    </div>

                  </div>
                ) : (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Not worked yet — a sale would be unassisted.
                  </div>
                )}

                {team.contributors.length > 0 && (
                  <ul className="space-y-1.5">
                    {team.contributors.map((c) => (
                      <li key={c.agentId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-slate-800">
                          {c.agentName || 'Unnamed staff'}
                          {c.role && <span className="text-[11px] text-slate-400 ml-1.5">{c.role}</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {actionLabel(c.lastAction)}
                          {!c.earnsCredit && <span className="ml-1 text-slate-300">(no credit)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Customer */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Customer</h2>
            {cart.user ? (
              <div className="space-y-1.5 text-sm text-gray-700">
                <div className="font-medium text-gray-900">{cart.user.name || 'Unnamed user'}</div>
                {cart.user.email && <div className="text-gray-600">{cart.user.email}</div>}
                {cart.user.phoneNumber ? (
                  <div className="text-gray-600">{cart.user.phoneNumber}</div>
                ) : (
                  <div className="text-amber-600 text-xs">No phone number on file — SMS recovery unavailable</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Anonymous cart — no customer attached.</div>
            )}
          </div>

          {/* Recovery */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Recovery</h2>

            {recoveryResult && (
              <div
                className={`mb-3 px-3 py-2 rounded-md text-sm border ${
                  recoveryResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {recoveryResult.ok
                  ? `Sent via ${recoveryResult.channel === 'whatsapp' ? 'WhatsApp' : recoveryResult.channel === 'sms' ? 'SMS' : recoveryResult.channel === 'email' ? 'Email' : recoveryResult.channel}.`
                  : recoveryResult.reason || 'Could not send the recovery message.'}
              </div>
            )}

            {cart.recoveryUrl ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Token</div>
                  <div className="font-mono text-xs text-gray-700 break-all">{cart.recoveryUrl.split('/').pop()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    <FaCopy className="mr-1.5" /> {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <a
                    href={cart.recoveryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    <FaExternalLinkAlt className="mr-1.5" /> Open
                  </a>
                </div>

                {/* One short link for the cart (gc.mw when the store prefers the
                    platform shortener). Staff copy this and paste it wherever
                    they are talking to the customer. */}
                {links && links.length > 0 && links[0].shortUrl && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="text-xs font-medium text-slate-600 mb-1">Short link</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        {links[0].shortUrl}
                      </code>
                      <button
                        onClick={() => copyText(links[0].shortUrl as string, 'short')}
                        className="shrink-0 px-2 py-1 text-[11px] border border-slate-300 rounded text-slate-600 hover:bg-slate-50"
                      >
                        {copiedKey === 'short' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No recovery link generated yet.</div>
            )}
          </div>

          {/* Apply Discount — attach an existing coupon or mint a one-off code to win this cart back */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Apply Discount</h2>

            {cart.appliedCouponCode && (
              <div className="flex items-center justify-between mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-sm">
                <span className="text-green-800">
                  Applied: <span className="font-semibold">{cart.appliedCouponCode}</span>
                </span>
                <button
                  onClick={handleRemoveDiscount}
                  disabled={removingDiscount}
                  className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  {removingDiscount ? '…' : 'Remove'}
                </button>
              </div>
            )}

            <div className="flex gap-2 mb-3 text-xs">
              <button
                onClick={() => setDiscountMode('existing')}
                className={`flex-1 px-2 py-1.5 rounded-md border ${
                  discountMode === 'existing' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Existing coupon
              </button>
              <button
                onClick={() => setDiscountMode('generate')}
                className={`flex-1 px-2 py-1.5 rounded-md border ${
                  discountMode === 'generate' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Generate one-off
              </button>
            </div>

            {discountMode === 'existing' ? (
              <div className="space-y-2">
                <select
                  value={selectedCoupon}
                  onChange={(e) => setSelectedCoupon(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select an active coupon…</option>
                  {activeCoupons.map((c: any) => (
                    <option key={c._id ?? c.id} value={c.code}>
                      {c.code} — {c.type === 'percentage' ? `${c.value}% off` : c.type === 'fixed' ? `₹${c.value} off` : c.type}
                    </option>
                  ))}
                </select>
                {activeCoupons.length === 0 && (
                  <p className="text-xs text-gray-400">No active coupons found.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={genType}
                    onChange={(e) => setGenType(e.target.value as 'percentage' | 'fixed')}
                    className="px-2 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="percentage">% off</option>
                    <option value="fixed">₹ off</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={genValue}
                    onChange={(e) => setGenValue(e.target.value)}
                    placeholder={genType === 'percentage' ? 'e.g. 15' : 'e.g. 100'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  {genType === 'percentage' && (
                    <input
                      type="number"
                      min="0"
                      value={genMaxDiscount}
                      onChange={(e) => setGenMaxDiscount(e.target.value)}
                      placeholder="Max discount ₹ (optional)"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  )}
                  <input
                    type="number"
                    min="1"
                    value={genExpiresInDays}
                    onChange={(e) => setGenExpiresInDays(e.target.value)}
                    placeholder="Expires in days"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Generates a single-use RECOVER-XXXXXX code sent only to this shopper.
                </p>
              </div>
            )}

            <button
              onClick={handleApplyDiscount}
              disabled={applyingDiscount}
              className="mt-3 w-full px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              {applyingDiscount ? 'Applying…' : 'Apply Discount'}
            </button>
          </div>
        </div>

        {/* Wide column — the history: what happened and what we sent. */}
        <div className="space-y-4 lg:col-span-2 lg:order-1 min-w-0">
          {/* Staff notes — follow-up outcomes, call summaries */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Notes</h2>
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
              {(cart.metadata?.admin_notes ?? []).length === 0 ? (
                <p className="text-sm text-gray-400">No notes yet.</p>
              ) : (
                [...(cart.metadata?.admin_notes ?? [])].reverse().map((n, i) => (
                  <div key={i} className="text-sm border-l-2 border-gray-200 pl-2.5">
                    <p className="text-gray-800">{n.text}</p>
                    <p className="text-[11px] text-gray-400">{n.by} · {formatDate(n.at)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                placeholder="Add a note (e.g. called, will order tomorrow)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={handleAddNote}
                disabled={savingNote || !noteText.trim()}
                className="px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                {savingNote ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Shopper journey — this store's slice of the central footprint */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Shopper Journey</h2>
            {/* This cart's own recovery-link click, pinned above the shopper's
                general activity. `carts.last_recovered_at` records ONLY that the
                link was opened — it is not the same fact as "Recovered" (which
                means an order exists), and keeping the two visibly apart is the
                whole point of showing it here. */}
            {cart.lastRecoveredAt && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm font-medium text-blue-900">Opened the recovery link</div>
                  <div className="text-[11px] text-blue-700">
                    {formatDate(cart.lastRecoveredAt)}
                    {cart.orderId
                      ? ` · then ordered (${cart.orderId})`
                      : ' · has not ordered from it yet'}
                  </div>
                </div>
              </div>
            )}
            {journey === null ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : journey.length === 0 ? (
              <div className="text-sm text-gray-500">
                {cart.customerId
                  ? 'No activity recorded yet for this shopper.'
                  : 'Guest cart — journeys are only recorded for signed-in shoppers.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {journey.map((ev, i) => {
                  const label = String(ev.type || '').replace(/_/g, ' ');
                  const meta = ev.meta || {};
                  const detail = meta.kind === 'product_view' && meta.name ? `Viewed ${meta.name}`
                    : ev.type === 'page_view' && meta.name ? `Viewed ${meta.name}`
                    : ev.type === 'add_to_cart' && meta.name ? `Added ${meta.name}`
                    : ev.type === 'checkout' ? `Checkout${meta.attempt ? ` (attempt ${meta.attempt})` : ''}`
                    : ev.type === 'order' && meta.order_id ? `Placed order ${meta.order_id}${meta.total ? ` — ₹${meta.total}` : ''}`
                    : null;
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        ev.type === 'order' ? 'bg-green-500'
                        : ev.type === 'checkout' ? 'bg-blue-500'
                        : ev.type === 'login_failed' ? 'bg-red-500'
                        : 'bg-gray-300'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-900 capitalize">{detail || label}</div>
                        <div className="text-xs text-gray-400">
                          {formatDate(ev.createdAt ?? ev.created_at)}
                          {ev.ipAddress ? ` · ${ev.ipAddress}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Checkout Attempts — every "Place Order" submission logged before a real order exists (migration 126) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Payment Attempts &amp; Failure Reasons</h2>
            <p className="text-xs text-gray-500 mb-3">Every payment method this shopper tried on this cart, and why it didn't go through.</p>
            {(cart.checkoutAttempts ?? []).length === 0 ? (
              <div className="text-sm text-gray-500">No payment attempts yet — this shopper added items but never reached checkout.</div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {(cart.checkoutAttempts ?? []).map((a) => {
                  const method = a.paymentMethod ?? a.payment_method;
                  const gateway = a.paymentGateway ?? a.payment_gateway;
                  const failureReason = a.failureReason ?? a.failure_reason;
                  const couponCode = a.couponCode ?? a.coupon_code;
                  const createdAt = a.createdAt ?? a.created_at;
                  const orderId = a.orderId ?? a.order_id;
                  const orderNumber = a.orderNumber ?? a.order_number;
                  return (
                    <div key={a.id} className="text-sm border-l-2 border-gray-200 pl-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${attemptStatusBadge(a.status)}`}>
                          {a.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-800">
                          {method === 'cod' ? 'Cash on Delivery' : 'Prepaid'}{gateway ? ` · ${gateway}` : ''}
                        </span>
                        {orderId && (
                          <Link to={`/orders/${orderId}`} className="text-xs text-blue-600 hover:underline font-medium">
                            → Order {orderNumber ?? ''} (remove shipping/COD charge here)
                          </Link>
                        )}
                      </div>
                      {failureReason && (
                        <p className="text-xs text-red-600 mt-1">{failureReason}</p>
                      )}
                      {couponCode && (
                        <p className="text-xs text-gray-500 mt-1">
                          Coupon: <span className="font-medium text-gray-700">{couponCode}</span>
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatMoney(a.total)} · {formatDate(createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Communication Log — every WhatsApp/SMS/Email attempt, automated
              or manual, with the real provider outcome. "Sent" means the
              provider ACCEPTED the request — this platform has no delivery-
              receipt webhook for either channel, so true read/delivery
              confirmation past that point is never known; labelled honestly
              rather than claiming "Delivered". */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Recovery flow</h2>
            <p className="text-xs text-slate-500 mt-1">
              What has gone out and what is queued next. Times are the sweep&apos;s own — this
              cannot predict a different moment from the one it will act on.
            </p>
            {schedule === null ? (
              <div className="mt-3 text-sm text-slate-400">Loading…</div>
            ) : (
              <div className="mt-3 space-y-3">
                {schedule.blockers.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                      Nothing will send automatically
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-900 list-disc list-inside">
                      {schedule.blockers.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  </div>
                )}
                {schedule.plan.map((step) => (
                  <div key={step.key} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{step.name}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        step.state === 'sent' ? 'bg-emerald-100 text-emerald-800'
                        : step.state === 'pending' ? 'bg-blue-100 text-blue-800'
                        : step.state === 'disabled' ? 'bg-slate-100 text-slate-500'
                        : 'bg-amber-100 text-amber-800'}`}>
                        {step.state}
                      </span>
                      {step.discount && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800">
                          attaches a discount
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 ml-auto">
                        {step.state === 'pending' && step.dueAt
                          ? `due ${formatDate(step.dueAt)}`
                          : `+${step.delayHours}h after the previous step`}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Channels: {step.channels.length ? step.channels.join(' · ') : 'none enabled'}
                    </div>
                    {step.content.email && (step.content.email.subject || step.content.email.message) && (
                      <div className="mt-2 rounded bg-slate-50 border border-slate-200 px-2 py-1.5">
                        {step.content.email.subject && (
                          <div className="text-[11px] text-slate-700"><strong>Subject:</strong> {step.content.email.subject}</div>
                        )}
                        {step.content.email.message && (
                          <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-3">{step.content.email.message}</div>
                        )}
                      </div>
                    )}
                    {step.sent.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {step.sent.map((x, i) => (
                          <li key={i} className="text-[11px] text-slate-500">
                            <span className="uppercase">{x.channel}</span> · {x.status}
                            {x.error && <span className="text-red-600"> — {x.error}</span>}
                            <span className="text-slate-400"> · {formatDate(x.at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <Link to="/settings/cart-recovery-automation" className="inline-block text-xs text-blue-600 hover:underline">
                  Edit the flow, timing and wording →
                </Link>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Communication Log</h2>
            <p className="text-xs text-gray-500 mb-3">
              Every recovery message attempted for this cart. &quot;Sent&quot; means the provider accepted
              it — not a delivery confirmation (WhatsApp/SMS don&apos;t report that back to us).
            </p>
            {recoveryLog === null ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : recoveryLog.length === 0 ? (
              <div className="text-sm text-gray-500">No messages sent for this cart yet.</div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {recoveryLog.map((entry) => {
                  const ChannelIcon = entry.channel === 'whatsapp' ? FaWhatsapp : entry.channel === 'sms' ? FaSms : FaEnvelope;
                  const channelColor = entry.channel === 'whatsapp' ? 'text-green-600' : entry.channel === 'sms' ? 'text-blue-600' : 'text-purple-600';
                  const stepLabel = entry.step_key
                    ? entry.step_key.charAt(0).toUpperCase() + entry.step_key.slice(1)
                    : entry.trigger === 'manual' ? 'Manual send' : '—';
                  return (
                    <div key={entry.id} className="text-sm border-l-2 border-gray-200 pl-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ChannelIcon className={channelColor} />
                        <span className="font-medium text-gray-800 capitalize">{entry.channel}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          entry.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {entry.status === 'sent' ? 'Sent (accepted by provider)' : 'Failed'}
                        </span>
                        <span className="text-xs text-gray-500">{stepLabel}</span>
                        {entry.trigger === 'manual' && (
                          <span className="text-xs text-gray-400">
                            by {entry.actor?.name || entry.actor?.email || 'staff'}
                          </span>
                        )}
                      </div>
                      {entry.status === 'failed' && entry.error && (
                        <p className="text-xs text-red-600 mt-1">{entry.error}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{formatDate(entry.sent_at)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Timeline</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900 text-right">{formatDate(cart.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Last active</dt>
                <dd className="text-gray-900 text-right">{formatDate(cart.lastActiveAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Recovery SMS</dt>
                <dd className="text-gray-900 text-right">{formatDate(cart.lastRecoverySmsAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Link opened</dt>
                <dd className="text-gray-900 text-right">{formatDate(cart.lastRecoveredAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900 text-right">{formatDate(cart.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AbandonedCartDetail;
