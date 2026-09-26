import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { FilterChip, SearchBox, ListHeader } from '../components/sales/ListChrome';
import InfoTip from '../components/common/InfoTip';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FaCog, FaDownload, FaEye, FaSms, FaSyncAlt } from 'react-icons/fa';
import { cartsAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ButtonLoader from '../components/ButtonLoader';
import { localeDateTime } from '../utils/date';

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
  /** Set only on a CONVERTED cart — the order it actually became, and who was
   *  credited for the sale. 'Recovered' is true only because this order exists. */
  orderId?: string | null;
  salesAgentName?: string | null;
  salesClaimStatus?: string | null;
  /** Items added AFTER the order — bought, then kept shopping in the same
   *  browser. Never part of the recovered sale. */
  hasUnorderedItems?: boolean;
  /** What this shopper would actually PAY, priced by the server for THEM
   *  (services/cartPricing.ts). The line prices below are what the browser
   *  saved — retail, and well over the real charge for a B2B customer. */
  customerTotal?: number | null;
  priceBasis?: 'b2b' | 'retail' | null;
  pricedAt?: string | null;
  /** Why automatic recovery will NOT message this cart, in plain words — absent
   *  when it will. The server answers with the same rule the sweep runs
   *  (db/queries/carts.ts CHASEABLE_CART_SQL), so this screen can never promise
   *  a nudge that never goes out. */
  notChaseableReason?: string | null;
  user?: {
    _id: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
  } | null;
}

/** Same money rendering as everywhere else in the admin — no local copy. */
const formatMoney = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    : '—';

/** Matches the admin Orders list, so paging feels the same across the panel. */
const PAGE_SIZE = 50;

const formatDate = (value?: string) =>
  value ? localeDateTime(value) : '—';

const AbandonedCarts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingSmsIds, setSendingSmsIds] = useState<Set<string>>(new Set());
  const [carts, setCarts] = useState<CartRecord[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'abandoned' | 'active' | 'converted'>('abandoned');
  // Guest carts have no phone/email on file — they can never be contacted, so
  // they're hidden by default; staff can still opt back in to see them.
  const [includeGuests, setIncludeGuests] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [cartSettings, setCartSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  /**
   * Monotonic request id. `page`, `search`, `status` and `includeGuests` can
   * change in the same tick (searching from page 2 sets both), leaving two
   * fetches in flight — and the one that resolved LAST won, not the one the
   * user asked for. Live symptom: searching a customer from page 2 rendered
   * page 2's unfiltered rows. Only the newest request may write state.
   */
  const requestRef = useRef(0);

  const fetchCarts = useCallback(async () => {
    const reqId = ++requestRef.current;
    try {
      setLoading(true);
      setError(null);

      const data = await cartsAPI.listAdmin({
        status, search, includeGuests,
        limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
      });
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
      
      // The interceptor unwraps { success, data, total } to the array itself and
      // keeps `total` as a NON-ENUMERABLE property on it — same read as
      // Orders.tsx. Falling back to the page length keeps the footer honest if
      // an older backend is deployed without the count.
      const resolvedTotal = Number(
        (data as any)?.total ?? (cartsData as any)?.total ?? sanitizedCarts.length
      );
      if (reqId !== requestRef.current) return;   // superseded — drop it
      setCarts(sanitizedCarts);
      setTotal(resolvedTotal);
    } catch (err: any) {
      if (reqId !== requestRef.current) return;
      console.error('❌ Failed to load carts', err);
      setError(err.response?.data?.message || err.message || 'Failed to load carts');
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  }, [status, search, includeGuests, page]);

  useEffect(() => {
    fetchCarts();
  }, [fetchCarts]);

  // The box answers as you type; the query waits 300 ms and starts at page 1.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** Load cart settings on mount, not just when the timing panel is opened —
   *  the automation banner at the top of this page reads them, and "is anything
   *  actually being sent?" must be answerable without hunting for a panel. */
  useEffect(() => {
    let cancelled = false;
    cartsAPI.getSettings()
      .then((v: any) => { if (!cancelled) setCartSettings(v); })
      .catch(() => { /* banner simply stays hidden; the list still works */ });
    return () => { cancelled = true; };
  }, []);

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
    <div className="space-y-4">
      <ListHeader
        title="Abandoned carts"
        purpose="Carts that went quiet before checkout — who they belong to, what was in them, and whether a nudge brought them back."
        aside={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-soft lg:inline">
              Last recovery message: <span className="font-medium text-ink">{lastMessageSummary}</span>
            </span>
            <Button variant="outline" size="sm" onClick={fetchCarts} disabled={loading} aria-label="Refresh">
              {loading ? <ButtonLoader size="sm" color="current" /> : <FaSyncAlt className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={toggleSettings}>
              <FaCog className="mr-1.5 h-3.5 w-3.5" /> {showSettings ? 'Hide timing' : 'Cart timing'}
            </Button>
          </div>
        }
        action={
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <FaDownload className="mr-1.5 h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      {/* Automation state, stated plainly at the top. This is the answer to
          "why has nothing been sent" — the engine tracks and snapshots carts
          regardless, but SENDING stays off until a human arms it, so that
          fixing a data gap can never turn into a mass send nobody chose. */}
      {cartSettings && (
        cartSettings.recoveryAutomationEnabled === true ? (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 text-white">
              AUTOMATION ON
            </span>
            <span className="text-sm text-emerald-900">
              Reminder → Persuasion → Discount messages go out automatically on the 15-minute sweep.
            </span>
            <Link to="/settings/cart-recovery-automation" className="ml-auto shrink-0 text-sm font-medium text-emerald-800 hover:underline">
              Edit flow →
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500 text-white">
              AUTOMATION OFF
            </span>
            <span className="text-sm text-amber-900">
              No automated reminders are being sent. Carts are still tracked and you can still send by hand
              from any cart. Turn it on under <strong>Cart timing</strong>.
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="ml-auto shrink-0 text-sm font-medium text-amber-900 hover:underline"
            >
              Turn on →
            </button>
          </div>
        )
      )}

      {/* ONE toolbar. `converted` stays reachable — it is the proof a nudge worked. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={searchInput} onChange={setSearchInput}
            placeholder="Customer name, phone, cart ID or product" label="Search carts" />
          <span className="text-sm tabular-nums text-ink-soft">
            {(total || carts.length).toLocaleString('en-IN')} cart{(total || carts.length) === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: 'active', label: 'Still shopping', hint: 'Carts with items that are still being shopped' },
            { key: 'abandoned', label: 'Abandoned', hint: 'Idle past the threshold set under Cart timing' },
            { key: 'converted', label: 'Recovered', hint: 'Became an order' },
          ] as const).map((t) => (
            <FilterChip key={t.key} on={status === t.key} tone={t.key === 'converted' ? 'good' : undefined}
              onClick={() => { setStatus(t.key); setPage(1); }}>
              <span title={t.hint}>{t.label}</span>
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={includeGuests} onClick={() => { setIncludeGuests(!includeGuests); setPage(1); }}>
            Include guest carts
          </FilterChip>
          <InfoTip text="A guest cart has no phone or email on file, so it cannot be contacted. Hidden unless you include it." />
        </div>
      </div>

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
                <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Cart
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  Value &amp; items
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider hidden xl:table-cell">
                  Timeline
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">
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
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-ink">
                      {search || includeGuests ? 'Nothing matches those filters' : status === 'converted' ? 'No recovered carts yet' : 'No carts here'}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {search || includeGuests
                        ? 'Clear the search, or switch between Still shopping, Abandoned and Recovered.'
                        : 'A cart appears here once a shopper adds something and leaves.'}
                    </p>
                  </td>
                </tr>
              ) : (
                carts.map((cart) => {
                  // Ensure _id and recoveryToken are strings before calling slice
                  const cartIdStr = String(cart._id || '');
                  // The list endpoint returns each line's price and quantity but
                  // never a cart total, so the value of a cart — the number you
                  // actually triage on — was nowhere on this screen. Derive it
                  // here rather than adding a column the API would have to keep
                  // in step with the detail page's own total.
                  const lines = Array.isArray(cart.items) ? cart.items : [];
                  const itemCount = lines.length;
                  const savedTotal = itemCount
                    ? lines.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0)
                    : null;
                  // The number to triage on is what the shopper PAYS: priced
                  // by the server for them, cached on the cart. The saved line
                  // prices are shown under it when the two differ (a B2B price
                  // book runs ~25% under retail), so neither figure surprises
                  // anyone on the checkout screen.
                  const customerTotal = typeof cart.customerTotal === 'number' ? cart.customerTotal : null;
                  const cartTotal = customerTotal ?? savedTotal;
                  const differs = customerTotal != null && savedTotal != null
                    && Math.abs(customerTotal - savedTotal) >= 1;
                  const itemSummary = lines.slice(0, 2).map((i) => i.productName).join(', ')
                    + (itemCount > 2 ? ` +${itemCount - 2} more` : '');
                  
                  return (
                  <tr key={cartIdStr} className="hover:bg-gray-50">
                    <td className="px-3 py-2 align-top">
                      <Link
                        to={`/orders/abandoned-carts/${cartIdStr}`}
                        className="block text-sm font-semibold text-blue-600 hover:underline truncate max-w-[11rem]"
                        title={cart.cartId || cartIdStr}
                      >
                        {cart.cartId || cartIdStr.slice(-8)}
                      </Link>
                      {/* Badge and status share ONE line. The token and the
                          repeated short id are gone — neither is scanned, and
                          together they were three of this cell's five rows. */}
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          cart.isGuest ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {cart.isGuest ? 'Guest' : 'Signed in'}
                        </span>
                        <span className="text-[11px] text-slate-500 capitalize">{cart.status}</span>
                      </div>
                      {/* A recovered cart names the order it became — the tab's
                          claim is only meaningful with the evidence beside it. */}
                      {cart.orderId && (
                        <div className="mt-1 space-y-0.5">
                          <Link
                            to={`/orders/${cart.orderId}`}
                            className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            → {cart.orderId}
                          </Link>
                          {cart.hasUnorderedItems && (
                            <div className="text-[11px] text-amber-700">
                              + items added after this order — not part of it
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            {cart.salesAgentName ? (
                              <>Credited: <span className="font-medium text-gray-700">{cart.salesAgentName}</span>
                                {cart.salesClaimStatus === 'contested' && (
                                  <span className="ml-1 text-amber-600">(contested)</span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400">Unassisted — nobody worked this cart</span>
                            )}
                          </div>
                        </div>
                      )}

                    </td>
                    <td className="px-3 py-2 align-top">
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
                      {cart.notChaseableReason && (
                        <div className="mt-1 text-xs text-amber-700" title="Automatic recovery skips this cart. You can still send a message by hand from the cart's own page.">
                          Not messaged: {cart.notChaseableReason}
                        </div>
                      )}
                    </td>
                    {/* Value first, then WHAT is in the cart on one line. The
                        old cell stacked three products vertically with a second
                        line each, so one cart cost ~200px and five filled a
                        screen — and the cart's own TOTAL, the number you
                        actually triage on, was never shown at all. */}
                    <td className="px-3 py-2 align-top">
                      <div className="text-sm font-semibold text-slate-900 tabular-nums">
                        {cartTotal != null ? formatMoney(cartTotal) : '—'}
                      </div>
                      {differs && (
                        <div className="text-xs text-slate-500" title={`Priced for this customer${cart.priceBasis === 'b2b' ? ' on their B2B price book' : ''}. Saved line prices add up to ${formatMoney(savedTotal)}.`}>
                          {cart.priceBasis === 'b2b' && (
                            <span className="mr-1 inline-flex items-center rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-medium text-indigo-800">B2B price</span>
                          )}
                          <span className="line-through">{formatMoney(savedTotal)}</span> list
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        {itemCount} {itemCount === 1 ? 'line' : 'lines'}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[22rem]" title={itemSummary}>
                        {itemSummary || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-600 whitespace-nowrap hidden xl:table-cell">
                      <div>
                        <span className="text-slate-400">Active</span>{' '}
                        {formatDate(cart.lastActiveAt)}
                      </div>
                      {/* These two used to read "Recovered:" and "Recovery SMS:",
                          which meant something different from the "Recovered"
                          TAB right above them (that tab means "an order was
                          placed from this cart"). This one is only ever "the
                          shopper opened the recovery link" — and the send may
                          have been WhatsApp or email, not SMS. */}
                      <div>
                        <span className="text-slate-400">Opened</span>{' '}
                        {formatDate(cart.lastRecoveredAt)}
                      </div>
                      <div>
                        <span className="text-slate-400">Msg</span>{' '}
                        {formatDate(cart.lastRecoverySmsAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-right w-px whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          to={`/orders/abandoned-carts/${cartIdStr}`}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                        >
                          <FaEye className="mr-1.5" />
                          View
                        </Link>
                        <button
                          onClick={() => handleSendRecovery(cart)}
                          disabled={sendingSmsIds.has(cartIdStr)}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
                          title="Send a recovery message now"
                        >
                          <FaSms className="mr-1.5" />
                          {sendingSmsIds.has(cartIdStr) ? 'Sending…' : 'Send'}
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

        {/* Same footer shape as the admin Orders and Customers lists. Hidden
            when everything already fits on one page, so a store with 12 carts
            never sees paging controls it has no use for. */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
            <span className="text-xs text-slate-500 tabular-nums">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} carts
            </span>
            {total > PAGE_SIZE && <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500 tabular-nums">
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AbandonedCarts;


