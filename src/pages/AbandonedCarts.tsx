import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FaCog, FaDownload, FaEye, FaSearch, FaSms, FaSyncAlt } from 'react-icons/fa';
import { cartsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ButtonLoader from '../components/ButtonLoader';

interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  size?: string;
}

interface CartRecord {
  _id: string;
  cartId: string; // Unique cart ID
  userId?: string;
  isGuest: boolean; // Whether this is a guest cart
  status: 'active' | 'abandoned' | 'converted';
  items: CartItem[];
  lastActiveAt: string;
  lastRecoveredAt?: string;
  lastRecoverySmsAt?: string;
  createdAt?: string;
  updatedAt?: string;
  recoveryToken: string;
  user?: {
    _id: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
  } | null;
}

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString() : '—';

const AbandonedCarts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingSmsIds, setSendingSmsIds] = useState<Set<string>>(new Set());
  const [carts, setCarts] = useState<CartRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'abandoned' | 'active' | 'converted'>('abandoned');
  // Guest carts have no phone/email on file — they can never be contacted, so
  // they're hidden by default; staff can still opt back in to see them.
  const [includeGuests, setIncludeGuests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [cartSettings, setCartSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchCarts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Fetching carts with params:', { status, search, includeGuests });

      const data = await cartsAPI.listAdmin({ status, search, includeGuests });
      // Backend returns: { success: true, data: carts[] }
      // API interceptor normalizes to: carts[] or { data: carts[] }
      let cartsData: any[] = [];
      if (Array.isArray(data)) {
        cartsData = data;
      } else if (Array.isArray(data?.data)) {
        cartsData = data.data;
      } else if (Array.isArray(data?.data?.data)) {
        cartsData = data.data.data;
      }
      
      // Sanitize cart data - ensure _id and recoveryToken are strings
      const sanitizedCarts = cartsData.map((cart: any) => ({
        ...cart,
        _id: String(cart._id || ''),
        recoveryToken: String(cart.recoveryToken || ''),
        cartId: cart.cartId ? String(cart.cartId) : undefined,
        userId: cart.userId ? String(cart.userId) : undefined,
      }));
      
      console.log('✅ Sanitized carts:', { count: sanitizedCarts.length, sample: sanitizedCarts[0] });
      setCarts(sanitizedCarts);
    } catch (err: any) {
      console.error('❌ Failed to load carts', err);
      setError(err.response?.data?.message || err.message || 'Failed to load carts');
    } finally {
      setLoading(false);
    }
  }, [status, search, includeGuests]);

  useEffect(() => {
    fetchCarts();
  }, [fetchCarts]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchCarts();
  };

  /** Load the store's cart timings the first time the panel is opened. */
  const toggleSettings = async () => {
    const next = !showSettings;
    setShowSettings(next);
    if (next && !cartSettings) {
      try {
        setCartSettings(await cartsAPI.getSettings());
      } catch {
        setError('Could not load cart timing settings.');
      }
    }
  };

  const saveCartSettings = async () => {
    setSavingSettings(true);
    try {
      // The server clamps out-of-range values, so echo BACK what it stored
      // rather than what was typed — otherwise the form shows a value that
      // isn't in effect.
      setCartSettings(await cartsAPI.updateSettings(cartSettings ?? {}));
      setError(null);
    } catch {
      setError('Could not save cart settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const rows = await cartsAPI.exportAdmin({ includeGuests });
      const header = [
        'Cart ID',
        'Type',
        'Customer Name',
        'Phone',
        'Email',
        'Recovery Token',
        'Status',
        'Last Active',
        'Last Recovery',
        'Last SMS',
        'Item Count',
        'Total',
      ];
      const csv = [
        header.join(','),
        ...(Array.isArray(rows) ? rows : []).map((row: any) => {
          // Ensure _id is a string before calling slice
          const cartIdStr = row.cartId || (row._id ? String(row._id).slice(-8) : '');
          return [
            cartIdStr,
            row.isGuest ? 'Guest' : 'Logged In',
            row.user?.name || '',
            row.user?.phoneNumber || '',
            row.user?.email || '',
            row.recoveryToken || '',
            row.status || '',
            row.lastActiveAt || '',
            row.lastRecoveredAt || '',
            row.lastRecoverySmsAt || '',
            row.itemCount || 0,
            row.total || 0,
          ]
            .map((value) => `"${value ?? ''}"`)
            .join(',');
        }),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `abandoned-carts-${new Date().toISOString()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export carts', err);
      setError(err.message || 'Failed to export carts');
    } finally {
      setExporting(false);
    }
  };

  const handleSendRecovery = async (cart: CartRecord) => {
    try {
      // Ensure _id is a string
      const cartIdStr = String(cart._id || '');
      setSendingSmsIds((prev) => new Set(prev).add(cartIdStr));
      await cartsAPI.sendRecovery(cartIdStr);
      fetchCarts();
    } catch (err: any) {
      console.error('Failed to send recovery message', err);
      alert(err.message || 'Failed to send recovery message');
    } finally {
      setSendingSmsIds((prev) => {
        const next = new Set(prev);
        const cartIdStr = String(cart._id || '');
        next.delete(cartIdStr);
        return next;
      });
    }
  };

  const lastMessageSummary = useMemo(() => {
    if (carts.length === 0) return 'No records yet';
    const mostRecent = carts
      .map((cart) => cart.lastRecoverySmsAt)
      .filter(Boolean)
      .sort((a, b) => (a! > b! ? -1 : 1))[0];
    return mostRecent ? formatDate(mostRecent) : 'Never sent';
  }, [carts]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Abandoned Carts</h1>
          <p className="text-sm text-gray-600 mt-1">
            Review carts that didn’t convert, export data for remarketing, and trigger recovery SMS
            messages. Last recovery message sent: <span className="font-semibold">{lastMessageSummary}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchCarts}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? (
              <>
                <ButtonLoader size="sm" color="current" />
                <span className="ml-2">Refreshing...</span>
              </>
            ) : (
              <>
                <FaSyncAlt className="mr-2" />
                Refresh
              </>
            )}
          </button>
          <button
            onClick={toggleSettings}
            className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            <FaCog className="mr-2" />
            {showSettings ? 'Hide timing' : 'Cart timing'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
          >
            <FaDownload className="mr-2" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Two tabs: carts still being shopped, and carts that went cold.
          `converted` stays reachable as a third tab — it is the proof that a
          recovery nudge worked, and hiding it would hide the outcome. */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Cart status">
          {([
            { key: 'active', label: 'Active carts', hint: 'Still being shopped' },
            { key: 'abandoned', label: 'Abandoned carts', hint: 'Idle past the threshold' },
            { key: 'converted', label: 'Recovered', hint: 'Became an order' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              aria-current={status === t.key ? 'page' : undefined}
              title={t.hint}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors ${
                status === t.key
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
              {status === t.key && (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {carts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <form
        onSubmit={handleSearch}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product name or recovery token"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Search
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={includeGuests}
            onChange={(e) => setIncludeGuests(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Show guest carts (no phone/email on file — can&apos;t be contacted)
        </label>
      </form>

      {showSettings && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Cart timing</h2>
            <p className="text-sm text-gray-600 mt-1">
              A cart with items counts as <strong>abandoned</strong> once it has been idle for this
              long. The sweep runs every 15 minutes, so a change takes effect on the next pass.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="cs-abandonmentMinutes" className="block text-xs font-medium text-gray-700">
                Idle before abandoned
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="cs-abandonmentMinutes"
                  type="number"
                  min={0}
                  value={cartSettings?.abandonmentMinutes ?? ''}
                  onChange={(e) => setCartSettings((s: any) => ({ ...(s ?? {}), abandonmentMinutes: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <span className="text-xs text-gray-500">minutes</span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">5 min – 7 days</p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cartSettings?.recoveryAutomationEnabled === true}
                onChange={(e) => setCartSettings((s: any) => ({ ...(s ?? {}), recoveryAutomationEnabled: e.target.checked }))}
                className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-900">Send automated recovery messages</span>
                {cartSettings?.recoveryAutomationEnabled === true ? (
                  <span className="ml-2 align-middle inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">ON</span>
                ) : (
                  <span className="ml-2 align-middle inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">OFF</span>
                )}
                <span className="block text-xs text-gray-500 mt-1">
                  While this is off nothing goes out on its own — carts are still tracked, and you
                  can still send a recovery message by hand from any cart&apos;s detail page. Turning
                  it on lets the 15-minute sweep message <strong>every</strong> contactable customer
                  whose cart went idle in the last 7 days, so the first pass after enabling it can
                  be a large batch.
                </span>
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveCartSettings}
              disabled={savingSettings}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
            >
              {savingSettings ? 'Saving…' : 'Save settings'}
            </button>
            <span className="text-xs text-gray-500">
              Values outside the allowed range are clamped by the server.
            </span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm text-gray-600">
              What actually gets sent — the Reminder → Persuasion → Discount flow, timing and
              message content per channel — now lives in its own settings page.
            </p>
            <Link
              to="/settings/cart-recovery-automation"
              className="inline-flex items-center mt-2 px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Open Cart Recovery Automation →
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cart
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timeline
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    <LoadingSpinner size="md" color="primary" text="Loading carts..." />
                  </td>
                </tr>
              ) : carts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No carts found for the selected filters.
                  </td>
                </tr>
              ) : (
                carts.map((cart) => {
                  // Ensure _id and recoveryToken are strings before calling slice
                  const cartIdStr = String(cart._id || '');
                  const recoveryTokenStr = String(cart.recoveryToken || '');
                  
                  return (
                  <tr key={cartIdStr} className="hover:bg-gray-50">
                    <td className="px-6 py-4 align-top">
                      <Link
                        to={`/orders/abandoned-carts/${cartIdStr}`}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                      >
                        Cart ID: {cart.cartId || cartIdStr.slice(-8)}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {cart.isGuest ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            Guest
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-800">
                            Logged In
                          </span>
                        )}
                      </div>
                      {recoveryTokenStr && (
                        <div className="text-xs text-gray-400">Token: {recoveryTokenStr.slice(0, 8)}...</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        Status:{' '}
                        <span className="font-medium capitalize">
                          {cart.status}
                        </span>
                      </div>
                      {cartIdStr && (
                        <div className="text-xs text-gray-400 mt-1">
                          Cart ID: {cartIdStr.slice(-6)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      {cart.user ? (
                        <div className="space-y-1 text-sm text-gray-700">
                          <div className="font-medium">{cart.user.name || 'Unnamed user'}</div>
                          {cart.user.email && (
                            <div className="text-xs text-gray-500">{cart.user.email}</div>
                          )}
                          {cart.user.phoneNumber ? (
                            <div className="text-xs text-gray-500">
                              {cart.user.phoneNumber}
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600">No phone number on file</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Anonymous cart</span>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="space-y-2 text-sm text-gray-700">
                        {Array.isArray(cart.items) && cart.items.slice(0, 3).map((item, index) => (
                          <div key={`${cartIdStr}-item-${index}`}>
                            <span className="font-medium">{item.productName}</span>
                            <div className="text-xs text-gray-500">
                              Qty: {item.quantity} · ₹{item.price} {item.size && `· Size ${item.size}`}
                            </div>
                          </div>
                        ))}
                        {Array.isArray(cart.items) && cart.items.length > 3 && (
                          <div className="text-xs text-gray-400">
                            +{cart.items.length - 3} more items
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-600">
                      <div>
                        <span className="font-medium text-gray-700">Last active:</span>{' '}
                        {formatDate(cart.lastActiveAt)}
                      </div>
                      {/* These two used to read "Recovered:" and "Recovery SMS:",
                          which meant something different from the "Recovered"
                          TAB right above them (that tab means "an order was
                          placed from this cart"). This one is only ever "the
                          shopper opened the recovery link" — and the send may
                          have been WhatsApp or email, not SMS. */}
                      <div>
                        <span className="font-medium text-gray-700">Link opened:</span>{' '}
                        {formatDate(cart.lastRecoveredAt)}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Last message:</span>{' '}
                        {formatDate(cart.lastRecoverySmsAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/orders/abandoned-carts/${cartIdStr}`}
                          className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                          <FaEye className="mr-2" />
                          View
                        </Link>
                        <button
                          onClick={() => handleSendRecovery(cart)}
                          disabled={sendingSmsIds.has(cartIdStr)}
                          className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
                        >
                          <FaSms className="mr-2" />
                          {sendingSmsIds.has(cartIdStr) ? 'Sending...' : 'Send Recovery'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AbandonedCarts;


