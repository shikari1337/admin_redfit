import { useState, useEffect } from 'react';
import { packageBoxesAPI } from '../services/api';

interface PackageBox {
  _id: string;
  name: string;
  length: number;
  breadth: number;
  height: number;
  weight?: number;
  description?: string;
  isDefault?: boolean;
}

const emptyForm = { name: '', length: '', breadth: '', height: '', weight: '', description: '' };

export default function PackageBoxes() {
  const [boxes, setBoxes] = useState<PackageBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBoxes = async () => {
    try {
      setLoading(true);
      const data = await packageBoxesAPI.getAll();
      setBoxes(Array.isArray(data) ? data : data?.packages ?? data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load package boxes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBoxes(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (box: PackageBox) => {
    setEditId(box._id);
    setForm({
      name: box.name,
      length: String(box.length),
      breadth: String(box.breadth),
      height: String(box.height),
      weight: box.weight != null ? String(box.weight) : '',
      description: box.description ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.length || !form.breadth || !form.height) {
      setError('Name, length, breadth and height are required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        length: Number(form.length),
        breadth: Number(form.breadth),
        height: Number(form.height),
        ...(form.weight ? { weight: Number(form.weight) } : {}),
        ...(form.description ? { description: form.description.trim() } : {}),
      };
      if (editId) {
        await packageBoxesAPI.update(editId, payload);
        setSuccess('Package box updated.');
      } else {
        await packageBoxesAPI.create(payload);
        setSuccess('Package box created.');
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      setTimeout(() => setSuccess(null), 3000);
      loadBoxes();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to save package box');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this package box?')) return;
    try {
      setDeletingId(id);
      await packageBoxesAPI.delete(id);
      setBoxes(prev => prev.filter(b => b._id !== id));
      setSuccess('Package box deleted.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to delete package box');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="pkg-page">
      <div className="page-header">
        <div>
          <h1>Package Boxes</h1>
          <p className="subtitle">Define box dimensions used when creating shipments.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Box</button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Edit Package Box' : 'Add Package Box'}</h2>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-row full">
                <label>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Small Box, Large Mailer"
                  required
                />
              </div>
              <div className="form-row">
                <label>Length (cm) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.length}
                  onChange={e => setForm(f => ({ ...f, length: e.target.value }))}
                  required
                />
              </div>
              <div className="form-row">
                <label>Breadth (cm) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.breadth}
                  onChange={e => setForm(f => ({ ...f, breadth: e.target.value }))}
                  required
                />
              </div>
              <div className="form-row">
                <label>Height (cm) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.height}
                  onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                  required
                />
              </div>
              <div className="form-row">
                <label>Dead Weight (kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                />
              </div>
              <div className="form-row full">
                <label>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editId ? 'Update Box' : 'Create Box'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /><p>Loading…</p></div>
      ) : boxes.length === 0 ? (
        <div className="empty">
          <p>No package boxes yet.</p>
          <button className="btn btn-primary" onClick={openCreate}>Add your first box</button>
        </div>
      ) : (
        <div className="boxes-grid">
          {boxes.map(box => (
            <div key={box._id} className="box-card">
              <div className="box-info">
                <span className="box-name">{box.name}</span>
                {box.isDefault && <span className="badge-default">Default</span>}
                <div className="box-dims">
                  <span>{box.length} × {box.breadth} × {box.height} cm</span>
                  {box.weight != null && <span> · {box.weight} kg</span>}
                </div>
                {box.description && <p className="box-desc">{box.description}</p>}
              </div>
              <div className="box-actions">
                <button className="btn-icon" title="Edit" onClick={() => openEdit(box)}>✏️</button>
                <button
                  className="btn-icon btn-danger"
                  title="Delete"
                  disabled={deletingId === box._id}
                  onClick={() => handleDelete(box._id)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .pkg-page { padding: 24px; max-width: 900px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: #666; font-size: 0.875rem; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-primary { background: #4f46e5; color: #fff; }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }
        .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading, .empty { text-align: center; padding: 60px 20px; color: #666; }
        .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .boxes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .box-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .box-info { flex: 1; }
        .box-name { font-weight: 600; font-size: 0.95rem; display: block; margin-bottom: 4px; }
        .badge-default { font-size: 0.7rem; background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
        .box-dims { font-size: 0.82rem; color: #4b5563; margin-bottom: 4px; }
        .box-desc { font-size: 0.8rem; color: #9ca3af; margin: 4px 0 0; }
        .box-actions { display: flex; gap: 8px; }
        .btn-icon { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 4px; }
        .btn-icon:hover { background: #f3f4f6; }
        .btn-danger:hover { background: #fef2f2; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: #fff; border-radius: 12px; padding: 24px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-header h2 { margin: 0; font-size: 1.2rem; }
        .close-btn { background: none; border: none; cursor: pointer; font-size: 1.4rem; color: #6b7280; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row.full { grid-column: 1 / -1; }
        .form-row label { font-size: 0.8rem; font-weight: 500; color: #374151; }
        .form-row input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
        .form-row input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        .form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
      `}</style>
    </div>
  );
}
