import React, { useEffect, useMemo, useState } from 'react';
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
  userId?: string;
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

  const fetchCarts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cartsAPI.listAdmin({ status, search });
      setCarts(Array.isArray(data) ? data : data?.data || []);
    } catch (err: any) {
      console.error('Failed to load carts', err);
      setError(err.message || 'Failed to load carts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    fetchCarts();
  };

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value as typeof status);
    setTimeout(fetchCarts, 0);
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
        ...(Array.isArray(rows) ? rows : []).map((row: any) =>
          [
            row.cartId,
            row.recoveryToken,
            row.status,
            row.lastActiveAt,
            row.lastRecoveredAt,
            row.lastRecoverySmsAt,
            row.itemCount,
            row.total,
          ]
            .map((value) => `"${value ?? ''}"`)
            .join(',')
        ),
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
      setSendingSmsIds((prev) => new Set(prev).add(cart._id));
      await cartsAPI.sendRecovery(cart._id);
      fetchCarts();
    } catch (err: any) {
      console.error('Failed to send recovery message', err);
      alert(err.message || 'Failed to send recovery message');
    } finally {
      setSendingSmsIds((prev) => {
        const next = new Set(prev);
        next.delete(cart._id);
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
                carts.map((cart) => (
                  <tr key={cart._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 align-top">
                      <div className="text-sm font-semibold text-gray-900">#{cart.recoveryToken}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Status:{' '}
                        <span className="font-medium capitalize">
                          {cart.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Cart ID: {cart._id.slice(-6)}
                      </div>
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
                        {cart.items.slice(0, 3).map((item, index) => (
                          <div key={`${cart._id}-item-${index}`}>
                            <span className="font-medium">{item.productName}</span>
                            <div className="text-xs text-gray-500">
                              Qty: {item.quantity} · ₹{item.price} {item.size && `· Size ${item.size}`}
                            </div>
                          </div>
                        ))}
                        {cart.items.length > 3 && (
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
                        disabled={sendingSmsIds.has(cart._id)}
                        className="inline-flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400"
                      >
                        <FaSms className="mr-2" />
                        {sendingSmsIds.has(cart._id) ? 'Sending...' : 'Send Recovery'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AbandonedCarts;


