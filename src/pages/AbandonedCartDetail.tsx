import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaCopy, FaExternalLinkAlt, FaSms } from 'react-icons/fa';
import { cartsAPI, journeyAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ButtonLoader from '../components/ButtonLoader';

interface CartDetailItem {
  productId: string;
  variationId?: string | null;
  productName: string;
  price: number;
  quantity: number;
  image?: string | null;
  attributes?: Record<string, any>;
  lineTotal: number;
  addedAt?: string;
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
  lastActiveAt?: string;
  lastRecoveredAt?: string;
  lastRecoverySmsAt?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: { name?: string; email?: string; phoneNumber?: string } | null;
}

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');
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

const AbandonedCartDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingSms, setSendingSms] = useState(false);
  const [copied, setCopied] = useState(false);
  const [journey, setJourney] = useState<JourneyEvent[] | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

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
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const handleSendRecovery = async () => {
    if (!cart) return;
    try {
      setSendingSms(true);
      await cartsAPI.sendRecovery(String(cart._id));
      alert('Recovery message sent');
      fetchCart();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to send recovery message');
    } finally {
      setSendingSms(false);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Link
            to="/orders/abandoned-carts"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <FaArrowLeft className="mr-2" /> Back to Abandoned Carts
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Cart {cart.cartId || String(cart._id).slice(-8)}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium capitalize ${statusBadge(cart.status)}`}>
              {cart.status}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${cart.isGuest ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              {cart.isGuest ? 'Guest' : 'Logged In'}
            </span>
          </div>
        </div>
        <button
          onClick={handleSendRecovery}
          disabled={sendingSms}
          className="inline-flex items-center px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 self-start"
        >
          {sendingSms ? (
            <>
              <ButtonLoader size="sm" color="current" />
              <span className="ml-2">Sending...</span>
            </>
          ) : (
            <>
              <FaSms className="mr-2" /> Send Recovery
            </>
          )}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Items ({cart.itemCount ?? cart.items?.length ?? 0})</h2>
            <div className="text-lg font-bold text-gray-900">{formatMoney(cart.total)}</div>
          </div>
          <div className="divide-y divide-gray-100">
            {(cart.items || []).map((item, index) => (
              <div key={`${item.productId}-${item.variationId ?? index}`} className="px-6 py-4 flex items-start gap-4">
                {item.image ? (
                  <img src={item.image} alt={item.productName} className="w-14 h-14 rounded-md object-cover border border-gray-200" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-400">
                    No image
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                  {attributeText(item.attributes) && (
                    <div className="text-xs text-gray-500 mt-0.5">{attributeText(item.attributes)}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {formatMoney(item.price)} × {item.quantity}
                    {item.addedAt && <span className="ml-2 text-gray-400">Added {formatDate(item.addedAt)}</span>}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                  {formatMoney(item.lineTotal ?? item.price * item.quantity)}
                </div>
              </div>
            ))}
            {(!cart.items || cart.items.length === 0) && (
              <div className="px-6 py-10 text-center text-gray-500">This cart has no items.</div>
            )}
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-1 text-sm">
            {cart.appliedCouponCode && (
              <div className="flex justify-between text-gray-600">
                <span>Applied coupon</span>
                <span className="font-medium text-gray-900">{cart.appliedCouponCode}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>Cart total</span>
              <span>{formatMoney(cart.total)}</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
            {cart.recoveryToken ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Token</div>
                  <div className="font-mono text-xs text-gray-700 break-all">{cart.recoveryToken}</div>
                </div>
                {cart.recoveryUrl && (
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
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No recovery link generated yet.</div>
            )}
          </div>

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
  );
};

export default AbandonedCartDetail;
