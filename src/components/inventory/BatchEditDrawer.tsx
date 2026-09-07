import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { batchesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Btn } from '../erp';

/**
 * Edit one batch: its prices, its dates, and — through the ledger — its quantity.
 *
 * Two things are deliberately NOT here, and the drawer says so rather than
 * leaving the merchant hunting:
 *   • Quantity is not a field you type over. It has its own "count" action that
 *     goes through the stock ledger, because a quantity is MOVED, never edited.
 *   • Status (quarantine / damaged / expired) belongs to the stock-condition
 *     register; a second door into it is a known one-way trap.
 */

export interface BatchRecord {
  id: string;
  batch_number: string;
  qty_on_hand: number;
  mrp: number | string | null;
  selling_price: number | string | null;
  mfg_date: string | null;
  expiry_date: string | null;
  purchase_date: string | null;
  purchase_ref: string | null;
  supplier_batch_ref: string | null;
  status: string;
  sku: string;
  product_name: string;
  days_to_expiry: number | null;
  catalogue_mrp?: number | string | null;
  catalogue_selling_price?: number | string | null;
}

const money = (v: number | string | null | undefined) =>
  v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const str = (v: any) => (v == null ? '' : String(v));

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] leading-snug text-gray-500">{hint}</span>}
  </label>
);

const input =
  'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm shadow-sm ' +
  'focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:bg-gray-50';

const BatchEditDrawer: React.FC<{
  batch: BatchRecord | null;
  onClose: () => void;
  onSaved: () => void;
  /** Live batch pricing mode, so the drawer can say whether these prices bill. */
  pricingMode?: 'off' | 'mrp_only' | 'full';
}> = ({ batch, onClose, onSaved, pricingMode = 'off' }) => {
  const { hasPerm } = useAuth();
  const canEdit = hasPerm('inventory.adjust');

  const [form, setForm] = useState<Record<string, string>>({});
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'count'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!batch) return;
    setForm({
      batchNumber: str(batch.batch_number),
      mrp: str(batch.mrp),
      sellingPrice: str(batch.selling_price),
      mfgDate: str(batch.mfg_date),
      expiryDate: str(batch.expiry_date),
      purchaseDate: str(batch.purchase_date),
      purchaseRef: str(batch.purchase_ref),
      supplierBatchRef: str(batch.supplier_batch_ref),
    });
    setQty(String(batch.qty_on_hand ?? 0));
    setError(''); setNote('');
  }, [batch]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  /**
   * The form is populated by an effect, so the FIRST render after a batch is
   * selected still holds the previous (empty) state — reading `form.mrp` there
   * yields undefined and React logs "changing an uncontrolled input to be
   * controlled". Coalescing at the read site keeps every input controlled from
   * its very first render.
   */
  const val = (k: string) => form[k] ?? '';

  // A selling price above this pack's own printed MRP is a typo or an illegal
  // sale — caught here as well as server-side so it never costs a round trip.
  const priceWarning = useMemo(() => {
    const m = Number(form.mrp), s = Number(form.sellingPrice);
    if (form.mrp && form.sellingPrice && Number.isFinite(m) && Number.isFinite(s) && m > 0 && s > m) {
      return `Selling price ₹${s} is above this batch's own MRP ₹${m}.`;
    }
    return '';
  }, [form.mrp, form.sellingPrice]);

  const expiryWarning = useMemo(() => {
    if (!form.expiryDate) return '';
    const d = new Date(`${form.expiryDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    if (d.getTime() < Date.now()) return 'This expiry is in the past — the batch will stop being sold or priced from.';
    return '';
  }, [form.expiryDate]);

  if (!batch) return null;

  const save = async () => {
    if (priceWarning) { setError(priceWarning); return; }
    setBusy('save'); setError(''); setNote('');
    try {
      // Empty string means "clear this field", which the API expresses as null —
      // distinct from omitting the key, which means "leave it alone".
      await batchesAPI.update(batch.id, {
        batchNumber: form.batchNumber.trim(),
        mrp: form.mrp === '' ? null : Number(form.mrp),
        sellingPrice: form.sellingPrice === '' ? null : Number(form.sellingPrice),
        mfgDate: form.mfgDate || null,
        expiryDate: form.expiryDate || null,
        purchaseDate: form.purchaseDate || null,
        purchaseRef: form.purchaseRef.trim() || null,
        supplierBatchRef: form.supplierBatchRef.trim() || null,
      });
      setNote('Saved.');
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? 'Could not save.');
    } finally { setBusy(''); }
  };

  const count = async () => {
    const n = parseInt(qty, 10);
    if (!Number.isFinite(n) || n < 0) { setError('Enter a whole quantity of 0 or more.'); return; }
    if (n === batch.qty_on_hand) { setNote('That is already the quantity on record.'); return; }
    setBusy('count'); setError(''); setNote('');
    try {
      const res = await batchesAPI.setQuantity(batch.id, n);
      const d = res?.data ?? res;
      setNote(`Counted: ${d?.before} → ${d?.after} (${d?.delta > 0 ? '+' : ''}${d?.delta}). Recorded in the stock ledger.`);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not update the quantity.');
    } finally { setBusy(''); }
  };

  const pricingLine =
    pricingMode === 'off'
      ? 'Batch pricing is off, so these prices are recorded but do not bill. Turn it on above to use them.'
      : pricingMode === 'mrp_only'
        ? 'Batch pricing is on (MRP only): this MRP shows on the bill; the catalogue price is charged.'
        : 'Batch pricing is on (full): this batch’s selling price is what customers are charged.';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit batch">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{batch.product_name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
              <span className="font-mono">{batch.sku}</span>
              <span>·</span>
              <span className="font-mono font-medium text-gray-700">{batch.batch_number}</span>
              <span>·</span>
              <span>{batch.qty_on_hand} on hand</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4">
          {!canEdit && (
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              You can view this batch but not change it — editing needs the “adjust inventory” permission.
            </div>
          )}

          {/* ── Prices ───────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">This batch’s prices</h3>
            <p className="mb-2.5 text-[11px] leading-snug text-gray-500">{pricingLine}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch MRP" hint={`Printed on the pack. Catalogue: ${money(batch.catalogue_mrp)}`}>
                <input className={input} type="number" step="0.01" min="0" inputMode="decimal"
                  value={val('mrp')} onChange={set('mrp')} disabled={!canEdit} placeholder="—" />
              </Field>
              <Field label="Batch selling price" hint={`Blank ⇒ sells at the Batch MRP. Catalogue: ${money(batch.catalogue_selling_price)}`}>
                <input className={input} type="number" step="0.01" min="0" inputMode="decimal"
                  value={val('sellingPrice')} onChange={set('sellingPrice')} disabled={!canEdit} placeholder="—" />
              </Field>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-500">
              Price order: <strong>batch selling price → batch MRP → catalogue selling price →
              catalogue MRP</strong>. Leave the selling price blank and this batch sells at its own
              printed MRP. Nothing is worked out as a percentage of anything else.
            </p>
            {priceWarning && (
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{priceWarning}
              </div>
            )}
          </section>

          {/* ── Dates ────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Dates</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase date" hint="When these units were bought in.">
                <input className={input} type="date" value={val('purchaseDate')} onChange={set('purchaseDate')} disabled={!canEdit} />
              </Field>
              <Field label="Manufactured">
                <input className={input} type="date" value={val('mfgDate')} onChange={set('mfgDate')} disabled={!canEdit} />
              </Field>
              <Field label="Expiry"
                hint={batch.days_to_expiry == null ? 'No expiry set.'
                  : batch.days_to_expiry < 0 ? `Expired ${Math.abs(batch.days_to_expiry)} days ago.`
                  : `${batch.days_to_expiry} days left.`}>
                <input className={input} type="date" value={val('expiryDate')} onChange={set('expiryDate')} disabled={!canEdit} />
              </Field>
              <Field label="Purchase / bill ref" hint="The vendor invoice these arrived on.">
                <input className={input} value={val('purchaseRef')} onChange={set('purchaseRef')} disabled={!canEdit} placeholder="INV-4471" />
              </Field>
            </div>
            {expiryWarning && (
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{expiryWarning}
              </div>
            )}
          </section>

          {/* ── Identity ─────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Identity</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch number">
                <input className={input} value={val('batchNumber')} onChange={set('batchNumber')} disabled={!canEdit} />
              </Field>
              <Field label="Supplier’s batch code" hint="If the vendor calls it something else.">
                <input className={input} value={val('supplierBatchRef')} onChange={set('supplierBatchRef')} disabled={!canEdit} />
              </Field>
            </div>
          </section>

          {/* ── Quantity (ledgered) ──────────────────────────────────── */}
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Physical count</h3>
            <p className="mt-1 text-[11px] leading-snug text-gray-500">
              A quantity is moved, never typed over. Entering the counted figure records the
              difference in the stock ledger as a count correction — the same as everywhere else
              stock moves.
            </p>
            <div className="mt-2.5 flex items-end gap-2">
              <div className="w-32">
                <Field label="Counted quantity">
                  <input className={input} type="number" min="0" step="1" inputMode="numeric"
                    value={qty} onChange={(e) => setQty(e.target.value)} disabled={!canEdit} />
                </Field>
              </div>
              <Btn variant="outline" onClick={count} disabled={!canEdit || !!busy}>
                {busy === 'count' ? 'Recording…' : 'Record count'}
              </Btn>
            </div>
          </section>

          <p className="text-[11px] leading-snug text-gray-500">
            Quarantined, damaged and expired stock is moved on the Stock Condition screen, not here —
            so the units always have exactly one home.
          </p>
        </div>

        <div className="sticky bottom-0 space-y-2 border-t border-gray-200 bg-white px-5 py-3">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          {note && !error && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{note}</div>}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            <Btn onClick={save} disabled={!canEdit || !!busy}>{busy === 'save' ? 'Saving…' : 'Save details'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchEditDrawer;
