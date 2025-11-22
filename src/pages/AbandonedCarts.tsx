import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { FaDownload, FaSearch, FaSms, FaSyncAlt } from 'react-icons/fa';
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
  const [error, setError] = useState<string | null>(null);

  const fetchCarts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Fetching carts with params:', { status, search });
      
      const data = await cartsAPI.listAdmin({ status, search });
      console.log('📦 Received carts data:', { 
        isArray: Array.isArray(data), 
        hasData: !!data?.data,
        dataLength: Array.isArray(data) ? data.length : data?.data?.length || 0,
        fullData: data 
      });
      
      const cartsData = Array.isArray(data) ? data : data?.data || [];
      
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
  }, [status, search]);

  useEffect(() => {
    fetchCarts();
  }, [fetchCarts]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchCarts();
  };

  const handleStatusChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = event.target.value as typeof status;
    setStatus(newStatus);
    // fetchCarts will be called automatically by useEffect when status changes
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const rows = await cartsAPI.exportAdmin();
      const header = [
        'Cart ID',
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
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
          >
            <FaDownload className="mr-2" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
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
          <select
            value={status}
            onChange={handleStatusChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
          >
            <option value="abandoned">Abandoned</option>
            <option value="active">Active</option>
            <option value="converted">Converted</option>
          </select>
        </div>
      </form>

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
                      <div className="text-sm font-semibold text-gray-900">
                        Cart ID: {cart.cartId || cartIdStr.slice(-8)}
                      </div>
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
                      <div>
                        <span className="font-medium text-gray-700">Recovered:</span>{' '}
                        {formatDate(cart.lastRecoveredAt)}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Recovery SMS:</span>{' '}
                        {formatDate(cart.lastRecoverySmsAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      <button
                        onClick={() => handleSendRecovery(cart)}
                        disabled={sendingSmsIds.has(cartIdStr)}
                        className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
                      >
                        <FaSms className="mr-2" />
                        {sendingSmsIds.has(cartIdStr) ? 'Sending...' : 'Send Recovery'}
                      </button>
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


