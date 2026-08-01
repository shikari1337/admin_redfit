import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

/**
 * Inventory & ERP panel for ONE variation, mounted on the product-editing
 * surfaces (VariationEditPage). Bridges the product side of the admin to the
 * ERP side, which were previously completely disjoint:
 *
 *  - live stock summary (on hand / reserved / available) — GET /inventory/:id
 *  - ledgered quick adjust (POST /inventory/adjust — never a raw column write)
 *  - batches of this SKU + standalone batch create (POST /purchasing/batches)
 *  - incoming (on-order) units from open POs (GET /purchasing/incoming)
 *  - recent TRUE-ledger movements (GET /reports/movements?variationId=)
 *
 * Every block is permission-aware: a 403 renders a short "needs X permission"
 * note instead of an empty table, so junior roles see WHY it's blank.
 */

interface Props {
  variationId: string;
  sku?: string;
  /** notify the parent (e.g. to refresh its stock field) after a ledgered write */
  onStockChanged?: (newStock: number) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The services/api axios instance unwraps {success,data} envelopes; siblings
// like {success, rows} pass through. Handle both (COMMON_MISTAKES #30/#40).
const rowsOf = (r: any): any[] => r?.data?.rows ?? r?.rows ?? (Array.isArray(r?.data) ? r.data : []) ?? [];
const dataOf = (r: any): any => r?.data?.data ?? r?.data ?? r;

const is403 = (e: any) => e?.response?.status === 403;

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div className="pt-3 border-t first:pt-0 first:border-t-0">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h4>
      {action}
    </div>
    {children}
  </div>
);

const DeniedNote: React.FC<{ perm: string }> = ({ perm }) => (
  <p className="text-xs text-gray-400">Your role doesn't include <span className="font-mono">{perm}</span> — ask your store admin if you need this.</p>
);

const ProductInventoryPanel: React.FC<Props> = ({ variationId, sku, onStockChanged }) => {
  const [summary, setSummary] = useState<any | null>(null);
  const [summaryDenied, setSummaryDenied] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);
  const [batchesDenied, setBatchesDenied] = useState(false);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [incomingDenied, setIncomingDenied] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsDenied, setMovementsDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  // quick adjust
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  // batch create
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchNumber, setBatchNumber] = useState('');
  const [batchQty, setBatchQty] = useState('');
  const [batchExpiry, setBatchExpiry] = useState('');
  const [batchMrp, setBatchMrp] = useState('');
  const [batchCost, setBatchCost] = useState('');
  const [batchMode, setBatchMode] = useState<'receive' | 'assign'>('receive');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');

  const valid = UUID_RE.test(String(variationId || ''));

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    const [sum, bat, inc, mov] = await Promise.allSettled([
      api.get(`/inventory/${variationId}`),
      api.get('/purchasing/batches', { params: { variationId } }),
      api.get('/purchasing/incoming', { params: { variationId } }),
      api.get('/reports/movements', { params: { variationId, limit: 8 } }),
    ]);
    if (sum.status === 'fulfilled') { setSummary(dataOf(sum.value)); setSummaryDenied(false); }
    else setSummaryDenied(is403(sum.reason));
    if (bat.status === 'fulfilled') { setBatches(rowsOf(bat.value)); setBatchesDenied(false); }
    else setBatchesDenied(is403(bat.reason));
    if (inc.status === 'fulfilled') { setIncoming(rowsOf(inc.value)); setIncomingDenied(false); }
    else setIncomingDenied(is403(inc.reason));
    if (mov.status === 'fulfilled') { setMovements(rowsOf(mov.value)); setMovementsDenied(false); }
    else setMovementsDenied(is403(mov.reason));
    setLoading(false);
  }, [variationId, valid]);

  useEffect(() => { load(); }, [load]);

  if (!valid) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Inventory &amp; ERP</h2>
        <p className="text-xs text-gray-400 mt-2">Save this variation first — stock, batches and movement history attach once it exists.</p>
      </div>
    );
  }

  const submitAdjust = async () => {
    const delta = parseInt(adjustDelta, 10);
    if (!delta) return;
    setAdjustBusy(true);
    try {
      const r = await api.post('/inventory/adjust', {
        variation_id: variationId,
        product_id: summary?.product_id,
        qty_delta: delta,
        movement_type: 'adjustment',
        notes: (adjustNote || 'product page adjust').slice(0, 40),
      });
      const newStock = dataOf(r)?.new_stock;
      if (typeof newStock === 'number' && onStockChanged) onStockChanged(newStock);
      setAdjustOpen(false); setAdjustDelta(''); setAdjustNote('');
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.response?.data?.error?.message || 'Adjustment failed');
    } finally { setAdjustBusy(false); }
  };

  const submitBatch = async () => {
    setBatchError('');
    const qty = parseInt(batchQty, 10);
    if (!batchNumber.trim() || !qty || qty <= 0) { setBatchError('Batch number and a quantity above 0 are required.'); return; }
    setBatchBusy(true);
    try {
      await api.post('/purchasing/batches', {
        variationId,
        batchNumber: batchNumber.trim(),
        qty,
        mode: batchMode,
        expiryDate: batchExpiry || undefined,
        mrp: batchMrp || undefined,
        unitCostRupees: batchMode === 'receive' && batchCost ? batchCost : undefined,
      });
      setBatchOpen(false);
      setBatchNumber(''); setBatchQty(''); setBatchExpiry(''); setBatchMrp(''); setBatchCost('');
      await load();
      if (batchMode === 'receive' && onStockChanged && summary) {
        onStockChanged((Number(summary.stock) || 0) + qty);
      }
    } catch (e: any) {
      setBatchError(e?.response?.data?.message || e?.response?.data?.error?.message || 'Could not save the batch');
    } finally { setBatchBusy(false); }
  };

  const totalIncoming = incoming.reduce((s, r) => s + (Number(r.qty_incoming) || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Inventory &amp; ERP {sku ? <span className="ml-1 font-mono text-xs font-normal text-gray-500">{sku}</span> : null}</h2>
        <div className="flex items-center gap-3 text-xs">
          <Link to="/inventory" className="text-blue-600 hover:text-blue-800">Inventory</Link>
          <Link to="/panel/inventory/batches" className="text-blue-600 hover:text-blue-800">Batches</Link>
          <Link to="/panel/inventory/purchasing" className="text-blue-600 hover:text-blue-800">Purchasing</Link>
        </div>
      </div>

      {loading ? <p className="text-xs text-gray-400">Loading inventory…</p> : (
        <>
          {/* Stock summary + ledgered quick adjust */}
          <Section
            title="Stock"
            action={!summaryDenied && (
              <button type="button" onClick={() => setAdjustOpen(o => !o)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">{adjustOpen ? 'Cancel' : 'Adjust stock'}</button>
            )}
          >
            {summaryDenied ? <DeniedNote perm="inventory.read" /> : (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'On hand', value: summary?.stock ?? 0 },
                  { label: 'Reserved', value: summary?.reserved_stock ?? 0 },
                  { label: 'Available', value: summary?.available_stock ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md bg-gray-50 border border-gray-200 px-2 py-1.5">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{Number(value) || 0}</div>
                    <div className="text-[11px] text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
            )}
            {adjustOpen && (
              <div className="mt-2 p-2.5 rounded-md bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input type="number" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                    placeholder="+5 / -2" className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} maxLength={40}
                    placeholder="Reason (max 40 chars)" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <button type="button" onClick={submitAdjust} disabled={adjustBusy || !parseInt(adjustDelta, 10)}
                    className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded disabled:opacity-50">
                    {adjustBusy ? 'Saving…' : 'Apply'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">Booked through the stock ledger as a manual adjustment — it will appear in movement history.</p>
              </div>
            )}
          </Section>

          {/* Incoming from open POs */}
          <Section title={`Incoming${totalIncoming ? ` — ${totalIncoming} unit(s) on order` : ''}`}>
            {incomingDenied ? <DeniedNote perm="purchasing.read" /> : incoming.length === 0 ? (
              <p className="text-xs text-gray-400">Nothing on order for this SKU.</p>
            ) : (
              <ul className="space-y-1">
                {incoming.map((r: any, i: number) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-700">
                    <span className="font-mono">{r.po_number || 'Draft PO'}</span>
                    <span>{r.vendor_name}</span>
                    <span>{r.expected_date ? `ETA ${r.expected_date}` : 'no ETA'}</span>
                    <span className="font-semibold tabular-nums">+{r.qty_incoming}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Batches */}
          <Section
            title="Batches"
            action={!batchesDenied && (
              <button type="button" onClick={() => setBatchOpen(o => !o)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">{batchOpen ? 'Cancel' : '+ Add batch'}</button>
            )}
          >
            {batchesDenied ? <DeniedNote perm="inventory.read" /> : batches.length === 0 && !batchOpen ? (
              <p className="text-xs text-gray-400">No batches — add one here, or capture batch/expiry while receiving a PO.</p>
            ) : (
              <ul className="space-y-1">
                {batches.map((b: any) => (
                  <li key={b.id} className="flex items-center justify-between text-xs text-gray-700">
                    <span className="font-mono">{b.batch_number}</span>
                    <span>{b.expiry_date ? `Exp ${b.expiry_date}` : 'no expiry'}</span>
                    <span className={b.days_to_expiry != null && b.days_to_expiry <= 90 ? 'text-amber-700' : 'text-gray-400'}>
                      {b.days_to_expiry != null ? `${b.days_to_expiry}d left` : ''}
                    </span>
                    <span className="font-semibold tabular-nums">{b.qty_on_hand}</span>
                  </li>
                ))}
              </ul>
            )}
            {batchOpen && (
              <div className="mt-2 p-2.5 rounded-md bg-gray-50 border border-gray-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)}
                    placeholder="Batch number *" className="px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
                  <input type="number" min="1" value={batchQty} onChange={e => setBatchQty(e.target.value)}
                    placeholder="Quantity *" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="date" value={batchExpiry} onChange={e => setBatchExpiry(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm" title="Expiry date" />
                  <input type="number" step="0.01" value={batchMrp} onChange={e => setBatchMrp(e.target.value)}
                    placeholder="MRP ₹ (optional)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={batchMode === 'receive'} onChange={() => setBatchMode('receive')} />
                    New stock (adds {batchQty || 'N'} to hand, ledgered)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={batchMode === 'assign'} onChange={() => setBatchMode('assign')} />
                    Label existing stock (no quantity change)
                  </label>
                </div>
                {batchMode === 'receive' && (
                  <input type="number" step="0.01" value={batchCost} onChange={e => setBatchCost(e.target.value)}
                    placeholder="Unit cost ₹ (optional — feeds average cost)" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                )}
                {batchError && <p className="text-xs text-red-600">{batchError}</p>}
                <button type="button" onClick={submitBatch} disabled={batchBusy}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded disabled:opacity-50">
                  {batchBusy ? 'Saving…' : 'Save batch'}
                </button>
              </div>
            )}
          </Section>

          {/* Recent ledger movements */}
          <Section title="Recent movements">
            {movementsDenied ? <DeniedNote perm="reports.read" /> : movements.length === 0 ? (
              <p className="text-xs text-gray-400">No ledger movements yet.</p>
            ) : (
              <ul className="space-y-1">
                {movements.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between text-xs text-gray-700">
                    <span className="text-gray-500">{m.occurred_at}</span>
                    <span>{String(m.movement_type || '').replace(/_/g, ' ')}</span>
                    <span className={`font-semibold tabular-nums ${Number(m.qty_delta) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {Number(m.qty_delta) > 0 ? `+${m.qty_delta}` : m.qty_delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
};

export default ProductInventoryPanel;
