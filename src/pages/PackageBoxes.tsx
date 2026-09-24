import { useState, useEffect } from 'react';
import { packageBoxesAPI } from '../services/api';

/**
 * THE BOX CATALOGUE — the boxes the packing bench actually has on the shelf.
 *
 * One store, two doors: this page and the WMS pack bench
 * (`/wms/pack/boxes`) read and write the SAME `package_boxes` setting through
 * the same normaliser (`backend/src/services/wms/boxCatalogue.ts`), so a box
 * added in either place is a box everywhere — including the courier booking
 * screen and the weight-dispute maths, which have always read this list.
 *
 * ── WHAT IS NEW HERE, AND WHY EACH ONE EARNS ITS FIELD ──────────────────────
 *   Code            what is painted on the stack, so a packer can find it.
 *   INNER size, mm  what a product has to fit THROUGH. Not derivable from the
 *                   outer size — the difference is the wall thickness, and a
 *                   derived inner would be precisely wrong on every box.
 *   Empty weight, g the box on the scale with nothing in it. This is what makes
 *                   a NET weight possible at all: the bench records the gross,
 *                   and gross − tare is the only honest net there is.
 *   Can carry, kg   what the carton is rated for; the bench warns above it.
 *   Costs           packaging is a real cost per parcel.
 * Every one of them is OPTIONAL, and blank means "not measured" — never zero.
 * A box whose capacity is unknown and a box that holds nothing are different
 * facts, and only one of them is a reason to stop packing.
 *
 * ── A BUG THIS PAGE CARRIED ─────────────────────────────────────────────────
 * It read `box._id`. The API has always returned `id`, so `editId` and the
 * delete id were `undefined` on every row: Edit re-opened as a blank create and
 * Delete could not have worked. Now `id` with an `_id` fallback, and the row is
 * not offered an Edit/Delete button at all when neither resolves — better a
 * missing button than one that silently does nothing.
 */

interface PackageBox {
  id?: string;
  _id?: string;
  code?: string | null;
  name: string;
  length?: number | null;
  breadth?: number | null;
  height?: number | null;
  weight?: number | null;
  inner_length_mm?: number | null;
  inner_breadth_mm?: number | null;
  inner_height_mm?: number | null;
  tare_g?: number | null;
  max_weight_g?: number | null;
  cost_minor?: number | null;
  is_active?: boolean;
  description?: string;
  isDefault?: boolean;
}

/** The API returns `id`; older callers wrote `_id`. Accept both, trust neither. */
const boxId = (b: PackageBox): string => String(b.id ?? b._id ?? '');

const emptyForm = {
  name: '', code: '', length: '', breadth: '', height: '',
  innerLength: '', innerBreadth: '', innerHeight: '',
  tare: '', maxWeightKg: '', cost: '', description: '', isActive: true,
};

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

  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

  const openEdit = (box: PackageBox) => {
    setEditId(boxId(box));
    setForm({
      name: box.name ?? '',
      code: str(box.code),
      length: str(box.length),
      breadth: str(box.breadth),
      height: str(box.height),
      innerLength: str(box.inner_length_mm),
      innerBreadth: str(box.inner_breadth_mm),
      innerHeight: str(box.inner_height_mm),
      tare: str(box.tare_g),
      maxWeightKg: box.max_weight_g ? String(box.max_weight_g / 1000) : '',
      cost: box.cost_minor ? String(box.cost_minor / 100) : '',
      description: box.description ?? '',
      isActive: box.is_active !== false,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Give the box a name — what the packers call it.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        is_active: form.isActive,
        ...(form.code.trim() ? { code: form.code.trim() } : {}),
        ...(form.length ? { length: Number(form.length) } : {}),
        ...(form.breadth ? { breadth: Number(form.breadth) } : {}),
        ...(form.height ? { height: Number(form.height) } : {}),
        ...(form.innerLength ? { inner_length_mm: Math.round(Number(form.innerLength)) } : {}),
        ...(form.innerBreadth ? { inner_breadth_mm: Math.round(Number(form.innerBreadth)) } : {}),
        ...(form.innerHeight ? { inner_height_mm: Math.round(Number(form.innerHeight)) } : {}),
        ...(form.maxWeightKg ? { max_weight_g: Math.round(Number(form.maxWeightKg) * 1000) } : {}),
        ...(form.cost ? { cost_minor: Math.round(Number(form.cost) * 100) } : {}),
        ...(form.description ? { description: form.description.trim() } : {}),
      };
      // The empty weight is stored in grams AND mirrored into the legacy
      // kilograms field, because the courier booking screen and the
      // weight-dispute maths both read `weight`. Writing one without the other
      // is how two screens start disagreeing about the same box.
      if (form.tare.trim() !== '') {
        const tareG = Math.round(Number(form.tare));
        payload.tare_g = tareG;
        payload.weight = tareG / 1000;
      }

      if (editId) {
        await packageBoxesAPI.update(editId, payload);
        setSuccess('Box saved.');
      } else {
        await packageBoxesAPI.create(payload);
        setSuccess('Box added. It is available at the packing bench straight away.');
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      setTimeout(() => setSuccess(null), 4000);
      loadBoxes();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to save the box');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    if (!confirm('Remove this box? Parcels already packed in it keep the name and size they recorded at the time, so nothing already shipped changes.')) return;
    try {
      setDeletingId(id);
      await packageBoxesAPI.delete(id);
      setBoxes(prev => prev.filter(b => boxId(b) !== id));
      setSuccess('Box removed.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to remove the box');
    } finally {
      setDeletingId(null);
    }
  };

  const unmeasured = boxes.filter(b => !(b.inner_length_mm && b.inner_breadth_mm && b.inner_height_mm)).length;
  const noTare = boxes.filter(b => !b.tare_g && !b.weight).length;

  return (
    <div className="pkg-page">
      <div className="page-header">
        <div>
          <h1>Package Boxes</h1>
          <p className="subtitle">
            The boxes on the packing bench. The same list the pack bench, the courier booking screen and the
            volumetric-weight calculation all read.
          </p>
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

      {!loading && boxes.length > 0 && (unmeasured > 0 || noTare > 0) && (
        <div className="alert alert-info">
          <span>
            {noTare > 0 && <>{noTare} box{noTare === 1 ? '' : 'es'} {noTare === 1 ? 'has' : 'have'} no empty weight on file, so the bench can only show a gross weight for {noTare === 1 ? 'it' : 'them'}. </>}
            {unmeasured > 0 && <>{unmeasured} {unmeasured === 1 ? 'has' : 'have'} no inner size, so nothing can say whether an item will fit.</>}
          </span>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Edit box' : 'Add a box'}</h2>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className="form-grid">
              <div className="form-row">
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
                <label>Code</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="What is painted on the stack"
                />
              </div>

              <p className="section-note">Outer size, in centimetres — what the courier charges on.</p>
              <div className="form-row">
                <label>Length (cm)</label>
                <input type="number" min="0.1" step="0.1" value={form.length}
                  onChange={e => setForm(f => ({ ...f, length: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Breadth (cm)</label>
                <input type="number" min="0.1" step="0.1" value={form.breadth}
                  onChange={e => setForm(f => ({ ...f, breadth: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Height (cm)</label>
                <input type="number" min="0.1" step="0.1" value={form.height}
                  onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Empty weight (g)</label>
                <input type="number" min="0" step="1" value={form.tare}
                  onChange={e => setForm(f => ({ ...f, tare: e.target.value }))}
                  placeholder="The box, flat, on the scale" />
              </div>

              <p className="section-note">
                Inner size, in millimetres — measured inside the walls, so it can say what fits. Leave blank if nobody
                has measured it; blank reads as “not measured”, a zero would read as “holds nothing”.
              </p>
              <div className="form-row">
                <label>Inner length (mm)</label>
                <input type="number" min="1" step="1" value={form.innerLength}
                  onChange={e => setForm(f => ({ ...f, innerLength: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Inner breadth (mm)</label>
                <input type="number" min="1" step="1" value={form.innerBreadth}
                  onChange={e => setForm(f => ({ ...f, innerBreadth: e.target.value }))} />
              </div>
              <div className="form-row">
                <label>Inner height (mm)</label>
                <input type="number" min="1" step="1" value={form.innerHeight}
                  onChange={e => setForm(f => ({ ...f, innerHeight: e.target.value }))} />
              </div>

              <div className="form-row">
                <label>Can carry (kg)</label>
                <input type="number" min="0" step="0.1" value={form.maxWeightKg}
                  onChange={e => setForm(f => ({ ...f, maxWeightKg: e.target.value }))}
                  placeholder="What the carton is rated for" />
              </div>
              <div className="form-row">
                <label>Costs (₹ each)</label>
                <input type="number" min="0" step="0.01" value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
              </div>
              <div className="form-row full">
                <label>Notes</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Anything the packer should know"
                />
              </div>
              <div className="form-row full">
                <label className="inline">
                  <input type="checkbox" checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  <span>Offer this box at the packing bench</span>
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editId ? 'Save the box' : 'Add the box'}
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
          <p>No box has been fed into the system yet.</p>
          <p className="subtitle">Add the ones on the bench and a packer can pick one instead of typing three numbers.</p>
          <button className="btn btn-primary" onClick={openCreate}>Add your first box</button>
        </div>
      ) : (
        <div className="boxes-grid">
          {boxes.map(box => {
            const id = boxId(box);
            const tare = box.tare_g ?? (box.weight != null ? Math.round(box.weight * 1000) : null);
            const innerKnown = !!(box.inner_length_mm && box.inner_breadth_mm && box.inner_height_mm);
            return (
              <div key={id || box.name} className="box-card">
                <div className="box-info">
                  <span className="box-name">{box.name}</span>
                  {box.code && <span className="badge-code">{box.code}</span>}
                  {box.is_active === false && <span className="badge-off">not in use</span>}
                  {box.isDefault && <span className="badge-default">Default</span>}
                  <div className="box-dims">
                    {box.length && box.breadth && box.height
                      ? <span>{box.length} × {box.breadth} × {box.height} cm outer</span>
                      : <span className="muted">no outer size</span>}
                    {tare != null && <span> · {tare} g empty</span>}
                  </div>
                  <div className="box-dims">
                    {innerKnown
                      ? <span>{box.inner_length_mm} × {box.inner_breadth_mm} × {box.inner_height_mm} mm inside</span>
                      : <span className="muted">inner size not measured</span>}
                    {box.max_weight_g ? <span> · carries {(box.max_weight_g / 1000).toFixed(1)} kg</span> : null}
                    {box.cost_minor ? <span> · ₹{(box.cost_minor / 100).toFixed(2)} each</span> : null}
                  </div>
                  {box.description && <p className="box-desc">{box.description}</p>}
                </div>
                <div className="box-actions">
                  {id ? (
                    <>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(box)}>✏️</button>
                      <button
                        className="btn-icon btn-danger"
                        title="Remove"
                        disabled={deletingId === id}
                        onClick={() => handleDelete(id)}
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <span className="muted" title="This row has no id, so it cannot be edited from here.">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .pkg-page { padding: 24px; max-width: 980px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: var(--n-500); font-size: 0.875rem; max-width: 62ch; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-primary { background: var(--accent); color: var(--surface); }
        .btn-primary:hover { background: var(--b-700); }
        .btn-secondary { background: var(--n-100); color: var(--n-700); border: 1px solid var(--n-300); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: var(--d-50); border: 1px solid var(--d-300); color: var(--d-600); }
        .alert-success { background: var(--g-50); border: 1px solid var(--g-300); color: var(--g-600); }
        .alert-info { background: var(--w-50); border: 1px solid var(--w-300); color: var(--w-800); }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading, .empty { text-align: center; padding: 60px 20px; color: var(--n-500); }
        .empty .subtitle { margin: 6px auto 16px; }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--n-200); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .boxes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .box-card { background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .box-info { flex: 1; min-width: 0; }
        .box-name { font-weight: 600; font-size: 0.95rem; margin-right: 6px; }
        .badge-default { font-size: 0.7rem; background: var(--i-100); color: var(--i-700); padding: 2px 8px; border-radius: 999px; }
        .badge-code { font-size: 0.7rem; background: var(--n-100); color: var(--n-700); padding: 2px 8px; border-radius: 999px; font-family: ui-monospace, monospace; }
        .badge-off { font-size: 0.7rem; background: var(--n-100); color: var(--n-500); padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
        .box-dims { font-size: 0.82rem; color: var(--n-600); margin-top: 4px; }
        .muted { color: var(--n-400); }
        .box-desc { font-size: 0.8rem; color: var(--n-400); margin: 4px 0 0; }
        .box-actions { display: flex; gap: 8px; }
        .btn-icon { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 4px; }
        .btn-icon:hover { background: var(--n-100); }
        .btn-danger:hover { background: var(--d-50); }
        .modal-overlay { position: fixed; inset: 0; background: var(--scrim); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--surface); border-radius: 12px; padding: 24px; width: 100%; max-width: 620px; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-header h2 { margin: 0; font-size: 1.2rem; }
        .close-btn { background: none; border: none; cursor: pointer; font-size: 1.4rem; color: var(--n-500); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .section-note { grid-column: 1 / -1; margin: 4px 0 -6px; font-size: 0.8rem; color: var(--n-500); }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row.full { grid-column: 1 / -1; }
        .form-row label { font-size: 0.8rem; font-weight: 500; color: var(--n-700); }
        .form-row label.inline { flex-direction: row; display: flex; align-items: center; gap: 8px; font-weight: 400; }
        .form-row input { padding: 8px 12px; border: 1px solid var(--n-300); border-radius: 6px; font-size: 0.875rem; }
        .form-row input[type="checkbox"] { width: auto; }
        .form-row input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
        .form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
        @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
