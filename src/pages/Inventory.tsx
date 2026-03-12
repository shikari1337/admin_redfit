import { useState, useEffect, useCallback } from 'react';
import { inventoryAPI } from '../services/api';

interface InventoryItem {
  _id: string;
  name: string;
  sku?: string;
  slug?: string;
  stock?: number;
  reservedStock?: number;
  availableStock?: number;
  variations?: Array<{
    _id?: string;
    attributes?: Record<string, string>;
    stock?: number;
    reservedStock?: number;
    sku?: string;
  }>;
  images?: string[];
  category?: { name?: string } | string;
  isActive?: boolean;
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editStock, setEditStock] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const LIMIT = 20;

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryAPI.list({
        page,
        limit: LIMIT,
        search: search || undefined,
        lowStock: filter === 'low',
        outOfStock: filter === 'out',
      });
      const list = Array.isArray(data) ? data : data?.products ?? data?.data ?? [];
      setItems(list);
      setTotal(data?.total ?? data?.pagination?.total ?? list.length);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInventory();
  };

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setEditStock(String(item.stock ?? 0));
    setEditReason('');
  };

  const handleSaveStock = async () => {
    if (!editItem) return;
    const newStock = parseInt(editStock, 10);
    if (isNaN(newStock) || newStock < 0) {
      setError('Please enter a valid stock quantity.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await inventoryAPI.updateStock(editItem._id, {
        stock: newStock,
        ...(editReason ? { reason: editReason } : {}),
      });
      setSuccess('Stock updated successfully.');
      setEditItem(null);
      setTimeout(() => setSuccess(null), 3000);
      loadInventory();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to update stock');
    } finally {
      setSaving(false);
    }
  };

  const getAvailableStock = (item: InventoryItem): number => {
    const s = item.availableStock ?? (item.stock ?? 0) - (item.reservedStock ?? 0);
    return Math.max(0, s);
  };

  const getStockStatus = (item: InventoryItem) => {
    const avail = getAvailableStock(item);
    if (avail <= 0) return { label: 'Out of Stock', color: '#dc2626', bg: '#fef2f2' };
    if (avail <= 5) return { label: 'Low Stock', color: '#d97706', bg: '#fffbeb' };
    return { label: 'In Stock', color: '#16a34a', bg: '#f0fdf4' };
  };

  const getCategoryName = (cat: any): string => {
    if (!cat) return '—';
    if (typeof cat === 'string') return cat;
    return cat.name ?? '—';
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="inv-page">
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p className="subtitle">Monitor and manage stock levels across all products.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        <div className="filter-group">
          {(['all', 'low', 'out'] as const).map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No products found.</p>
          {filter !== 'all' && (
            <button className="btn btn-secondary" onClick={() => setFilter('all')}>Show all</button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Total Stock</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const status = getStockStatus(item);
                  return (
                    <tr key={item._id}>
                      <td>
                        <div className="product-cell">
                          {item.images?.[0] && (
                            <img src={item.images[0]} alt={item.name} className="product-thumb" />
                          )}
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td>{item.sku ?? '—'}</td>
                      <td>{getCategoryName(item.category)}</td>
                      <td>{item.stock ?? 0}</td>
                      <td>{item.reservedStock ?? 0}</td>
                      <td><strong>{getAvailableStock(item)}</strong></td>
                      <td>
                        <span className="status-pill" style={{ background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                          Update Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-secondary btn-sm">
                ← Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-secondary btn-sm">
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Update Stock</h2>
              <button className="close-btn" onClick={() => setEditItem(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="product-name">{editItem.name}</p>
              <div className="current-stock">
                <span>Current stock: <strong>{editItem.stock ?? 0}</strong></span>
                {(editItem.reservedStock ?? 0) > 0 && (
                  <span className="reserved-note"> ({editItem.reservedStock} reserved)</span>
                )}
              </div>
              <div className="form-row">
                <label>New Stock Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={editStock}
                  onChange={e => setEditStock(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-row">
                <label>Reason (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. restock, damage, correction"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSaveStock}>
                {saving ? 'Saving…' : 'Update Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .inv-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: #666; font-size: 0.875rem; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .search-form { display: flex; gap: 8px; flex: 1; min-width: 200px; max-width: 400px; }
        .search-form input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
        .filter-group { display: flex; gap: 4px; }
        .filter-btn { padding: 6px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.8rem; color: #374151; }
        .filter-btn.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-sm { padding: 4px 12px; font-size: 0.8rem; }
        .btn-primary { background: #4f46e5; color: #fff; }
        .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }
        .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading, .empty { text-align: center; padding: 60px 20px; color: #666; }
        .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th { padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        tr:hover td { background: #fafafa; }
        .product-cell { display: flex; align-items: center; gap: 10px; }
        .product-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
        .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
        .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 20px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: #fff; border-radius: 12px; width: 100%; max-width: 420px; overflow: hidden; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 0; }
        .modal-header h2 { margin: 0; font-size: 1.1rem; }
        .close-btn { background: none; border: none; cursor: pointer; font-size: 1.4rem; color: #6b7280; }
        .modal-body { padding: 20px 24px; }
        .product-name { font-weight: 600; margin: 0 0 8px; }
        .current-stock { font-size: 0.875rem; color: #6b7280; margin-bottom: 16px; }
        .reserved-note { color: #f59e0b; }
        .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .form-row label { font-size: 0.8rem; font-weight: 500; color: #374151; }
        .form-row input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
        .form-row input:focus { outline: none; border-color: #4f46e5; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #f3f4f6; }
      `}</style>
    </div>
  );
}
