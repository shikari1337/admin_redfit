import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inventoryAPI, batchesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { todayIso } from '../../utils/date';
import { movementLabel } from './ledgerLabels';

/**
 * UPDATE STOCK — every way a SKU's quantity legitimately changes, in one place.
 *
 * The old dialog had ONE control: type a new total. On a batch-tracked SKU that
 * is the wrong tool — it moves the pool without telling any lot, so the lots
 * (expiry, printed MRP) stop adding up to the total. Each tab here is the
 * RIGHT tool for one real situation, and each goes through an endpoint that
 * already writes the stock ledger:
 *
 *   Receive      new units in — into a lot (POST /purchasing/batches) or loose
 *                (POST /inventory/adjust, a delta, never an overwrite)
 *   Remove       damaged / expired / lost — from a lot (PUT …/quantity with
 *                the reason) or from loose stock (adjust, negative delta)
 *   Count a lot  a physical count of one lot
 *   Label loose  put units already on hand into a lot (no stock moves)
 *   Edit lot     prices, dates, references — never the quantity
 *   Set total    for SKUs with no lots; refuses to go below what lots hold
 *
 * Every tab states BEFORE → AFTER and the movement the ledger will record,
 * because each of these becomes a permanent, chained ledger entry (migration
 * 215) — a mistake is corrected by another entry, not erased.
 *
 * The dialog loads the SKU itself (GET /inventory/:id/detail) so it always acts
 * on current figures, not the ones a table row was rendered with.
 */

type TabKey = 'receive' | 'remove' | 'count' | 'label' | 'edit' | 'total';

export interface UpdateStockDialogProps {
  variationId: string | null;
  /** Shown while the SKU loads. */
  name?: string;
  initialTab?: TabKey;
  initialLotId?: string | null;
  onClose: () => void;
  /** Called after a successful write with a one-line summary. */
  onDone: (message: string) => void;
}

const n = (v: any) => (v == null || v === '' ? null : Number(v));
const fmt = (v: any) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
const rupees = (v: any) => (v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

/** The server's words, translated where the raw text would mean nothing to a merchant. */
function errorText(e: any, fallback: string): string {
  const raw: string = e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || '';
  if (e?.response?.status === 403 && /module|purchasing/i.test(raw)) {
    return 'Lots are managed by the Purchasing module, which is switched off for this store. Stock without lots can still be changed on the Set total and loose-stock options.';
  }
  if (/duplicate key|already exists/i.test(raw) && /batch/i.test(raw)) {
    return 'This store keeps one lot per batch number, and that number is already in use at a different MRP. Receive it at the existing lot\'s MRP, or give the new lot its own number.';
  }
  return raw || fallback;
}

const REMOVE_REASONS: Array<{ key: string; label: string; lot: 'damage' | 'expiry_write_off' | 'adjustment'; loose: string }> = [
  { key: 'damage', label: 'Damaged / broken', lot: 'damage', loose: 'damage' },
  { key: 'expiry', label: 'Expired', lot: 'expiry_write_off', loose: 'expiry' },
  { key: 'loss', label: 'Lost / missing', lot: 'adjustment', loose: 'loss' },
  { key: 'adjustment', label: 'Other correction', lot: 'adjustment', loose: 'adjustment' },
];

const TOTAL_REASONS: Array<{ key: string; label: string; ledger: string }> = [
  { key: 'count', label: 'Physical count', ledger: 'cycle_count_correction' },
  { key: 'received', label: 'New stock received', ledger: 'purchase_receipt' },
  { key: 'returned', label: 'Customer return', ledger: 'sales_return' },
  { key: 'damage', label: 'Damaged', ledger: 'damage' },
  { key: 'expiry', label: 'Expired', ledger: 'expiry_write_off' },
  { key: 'loss', label: 'Lost / missing', ledger: 'adjustment' },
  { key: 'adjustment', label: 'Other correction', ledger: 'adjustment' },
];

/* Module-level on purpose: a component declared INSIDE the dialog's render is a
   new type on every render, so React would remount its inputs on each
   keystroke and the cursor would leave the field. */
function Preview({ rows, records }: { rows: Array<[string, string, string]>; records: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1" data-testid="usd-preview">
      {rows.map(([k, a, b]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{k}</span>
          <span className="tabular-nums font-medium">{a} <span className="text-muted-foreground">→</span> {b}</span>
        </div>
      ))}
      <div className="pt-1 text-xs text-muted-foreground">
        Recorded in the stock ledger as <strong>{records}</strong> — a permanent, linked entry. A mistake
        is corrected by another entry, never erased.
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export default function UpdateStockDialog({
  variationId, name, initialTab, initialLotId, onClose, onDone,
}: UpdateStockDialogProps) {
  const { hasPerm, canAccess } = useAuth();
  const canAdjust = hasPerm('inventory.adjust');
  const lotsEnabled = canAccess('purchasing');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'receive');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One form state per tab, so switching tabs never loses what was typed —
  // and all of it reset when the dialog opens for a different SKU.
  const blankRcv = () => ({
    intoLot: true, batchNumber: '', qty: '', mrp: '', sellingPrice: '', mfgDate: '', expiryDate: '',
    purchaseDate: todayIso(), purchaseRef: '', supplierBatchRef: '', unitCost: '', note: '',
  });
  const blankLbl = () => ({ batchNumber: '', qty: '', mrp: '', sellingPrice: '', mfgDate: '', expiryDate: '', supplierBatchRef: '' });
  const [rcv, setRcv] = useState(blankRcv);
  const [rem, setRem] = useState({ source: '', qty: '', reason: 'damage', note: '' });
  const [cnt, setCnt] = useState({ lotId: '', qty: '', note: '' });
  const [lbl, setLbl] = useState(blankLbl);
  const [edt, setEdt] = useState<any>({ lotId: '' });
  const [tot, setTot] = useState({ total: '', reason: 'count', note: '' });

  const load = async () => {
    if (!variationId) return;
    setLoading(true); setLoadError(null);
    try { setData(await inventoryAPI.detail(variationId)); }
    catch (e: any) { setLoadError(errorText(e, 'Could not load this SKU.')); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!variationId) { setData(null); return; }
    setTab(initialTab ?? 'receive'); setError(null); setData(null);
    setRcv(blankRcv()); setLbl(blankLbl());
    setRem({ source: '', qty: '', reason: 'damage', note: '' });
    setCnt({ lotId: '', qty: '', note: '' });
    setEdt({ lotId: '' });
    setTot({ total: '', reason: 'count', note: '' });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variationId]);

  const sku = data?.sku;
  const lots: any[] = useMemo(() => (data?.lots ?? []).filter((l: any) => Number(l.qty_on_hand) > 0), [data]);
  const onHand = Number(sku?.on_hand ?? 0);
  const batched = Number(sku?.batched_qty ?? 0);
  const loose = Number(sku?.unbatched_qty ?? onHand - batched);
  const reserved = Number(sku?.reserved_stock ?? 0);

  // Sensible starting points once the SKU is known.
  useEffect(() => {
    if (!sku) return;
    const first = lots.find((l) => l.id === initialLotId) ?? lots[0];
    // A SKU already kept in lots receives into a lot; one that never was receives
    // loose (the non-pharma case) — either can be switched.
    setRcv((r) => ({ ...r, intoLot: lotsEnabled && lots.length > 0, mrp: r.mrp || (sku.mrp ? String(sku.mrp) : '') }));
    setRem((r) => ({ ...r, source: initialLotId ?? (first ? first.id : loose > 0 ? 'loose' : '') }));
    setCnt((c) => ({ ...c, lotId: first?.id ?? '', qty: first ? String(first.qty_on_hand) : '' }));
    if (first) {
      setEdt({
        lotId: first.id, batchNumber: first.batch_number ?? '', mrp: first.mrp ?? '', sellingPrice: first.selling_price ?? '',
        mfgDate: first.mfg_date ?? '', expiryDate: first.expiry_date ?? '', purchaseDate: first.purchase_date ?? '',
        purchaseRef: first.purchase_ref ?? '', supplierBatchRef: first.supplier_batch_ref ?? '',
      });
    }
    setTot((t) => ({ ...t, total: String(onHand) }));
    setLbl((l) => ({ ...l, mrp: l.mrp || (sku.mrp ? String(sku.mrp) : ''), qty: loose > 0 ? String(loose) : '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku?.id, data]);

  const lotById = (id: string) => lots.find((l) => l.id === id);

  const finish = async (message: string) => {
    onDone(message);
    onClose();
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(null);
    try { await finish(await fn()); }
    catch (e: any) { setError(errorText(e, 'That did not save.')); }
    finally { setBusy(false); }
  };

  /* ── Receive ─────────────────────────────────────────────────────────── */
  const rcvQty = Math.round(Number(rcv.qty) || 0);
  const rcvMatch = rcv.batchNumber.trim()
    ? (data?.lots ?? []).filter((l: any) => String(l.batch_number).trim().toLowerCase() === rcv.batchNumber.trim().toLowerCase())
    : [];
  const rcvSameMrp = rcvMatch.find((l: any) => rcv.mrp === '' || Number(l.mrp) === Number(rcv.mrp));
  const submitReceive = () => run(async () => {
    if (rcvQty <= 0) throw new Error('Enter how many units arrived.');
    if (rcv.intoLot) {
      if (!rcv.batchNumber.trim()) throw new Error('Enter the batch number printed on the pack.');
      await batchesAPI.create({
        variationId, batchNumber: rcv.batchNumber.trim(), qty: rcvQty, mode: 'receive',
        mrp: n(rcv.mrp) ?? undefined, sellingPrice: n(rcv.sellingPrice) ?? undefined,
        mfgDate: rcv.mfgDate || undefined, expiryDate: rcv.expiryDate || undefined,
        purchaseDate: rcv.purchaseDate || undefined, purchaseRef: rcv.purchaseRef.trim() || undefined,
        supplierBatchRef: rcv.supplierBatchRef.trim() || undefined,
        unitCostRupees: n(rcv.unitCost) ?? undefined,
      });
      return `Received ${rcvQty} into lot ${rcv.batchNumber.trim()} — on hand ${fmt(onHand)} → ${fmt(onHand + rcvQty)}.`;
    }
    await inventoryAPI.adjust({
      variation_id: variationId!, product_id: sku.product_id, qty_delta: rcvQty,
      reason_type: 'received', notes: (rcv.note || rcv.purchaseRef || 'received').slice(0, 40),
      reference: rcv.purchaseRef.trim() || undefined,
    });
    return `Received ${rcvQty} loose units — on hand ${fmt(onHand)} → ${fmt(onHand + rcvQty)}.`;
  });

  /* ── Remove / write off ──────────────────────────────────────────────── */
  const remQty = Math.round(Number(rem.qty) || 0);
  const remLot = rem.source && rem.source !== 'loose' ? lotById(rem.source) : null;
  const remAvail = remLot ? Number(remLot.qty_on_hand) : Math.max(0, loose);
  const remReason = REMOVE_REASONS.find((r) => r.key === rem.reason) ?? REMOVE_REASONS[0];
  const submitRemove = () => run(async () => {
    if (remQty <= 0) throw new Error('Enter how many units to remove.');
    if (remQty > remAvail) throw new Error(`Only ${remAvail} unit(s) are in ${remLot ? `lot ${remLot.batch_number}` : 'loose stock'}.`);
    const note = (rem.note || remReason.label).slice(0, 40);
    if (remLot) {
      await batchesAPI.setQuantity(remLot.id, Number(remLot.qty_on_hand) - remQty, note, remReason.lot);
      return `Removed ${remQty} from lot ${remLot.batch_number} (${remReason.label.toLowerCase()}) — on hand ${fmt(onHand)} → ${fmt(onHand - remQty)}.`;
    }
    await inventoryAPI.adjust({
      variation_id: variationId!, product_id: sku.product_id, qty_delta: -remQty,
      reason_type: remReason.loose, notes: note,
    });
    return `Removed ${remQty} loose units (${remReason.label.toLowerCase()}) — on hand ${fmt(onHand)} → ${fmt(onHand - remQty)}.`;
  });

  /* ── Count a lot ─────────────────────────────────────────────────────── */
  const cntLot = lotById(cnt.lotId);
  const cntQty = cnt.qty === '' ? null : Math.round(Number(cnt.qty));
  const cntDelta = cntLot && cntQty != null ? cntQty - Number(cntLot.qty_on_hand) : 0;
  const submitCount = () => run(async () => {
    if (!cntLot) throw new Error('Pick the lot you counted.');
    if (cntQty == null || cntQty < 0 || Number.isNaN(cntQty)) throw new Error('Enter the counted quantity (0 or more).');
    if (cntDelta === 0) throw new Error('The count matches what is recorded — nothing to change.');
    await batchesAPI.setQuantity(cntLot.id, cntQty, (cnt.note || 'physical count').slice(0, 40), 'cycle_count_correction');
    return `Lot ${cntLot.batch_number} counted at ${cntQty} (${cntDelta > 0 ? '+' : ''}${cntDelta}) — on hand ${fmt(onHand)} → ${fmt(onHand + cntDelta)}.`;
  });

  /* ── Label loose stock as a lot ──────────────────────────────────────── */
  const lblQty = Math.round(Number(lbl.qty) || 0);
  const submitLabel = () => run(async () => {
    if (!lbl.batchNumber.trim()) throw new Error('Enter the batch number printed on these packs.');
    if (lblQty <= 0) throw new Error('Enter how many loose units belong to this lot.');
    if (lblQty > loose) throw new Error(`Only ${Math.max(0, loose)} unit(s) are loose.`);
    await batchesAPI.create({
      variationId, batchNumber: lbl.batchNumber.trim(), qty: lblQty, mode: 'assign',
      mrp: n(lbl.mrp) ?? undefined, sellingPrice: n(lbl.sellingPrice) ?? undefined,
      mfgDate: lbl.mfgDate || undefined, expiryDate: lbl.expiryDate || undefined,
      supplierBatchRef: lbl.supplierBatchRef.trim() || undefined,
    });
    return `${lblQty} loose unit(s) labelled as lot ${lbl.batchNumber.trim()} — on hand unchanged at ${fmt(onHand)}.`;
  });

  /* ── Edit lot details ────────────────────────────────────────────────── */
  const edtLot = lotById(edt.lotId);
  const pickEditLot = (id: string) => {
    const l = lotById(id);
    if (!l) return;
    setEdt({
      lotId: l.id, batchNumber: l.batch_number ?? '', mrp: l.mrp ?? '', sellingPrice: l.selling_price ?? '',
      mfgDate: l.mfg_date ?? '', expiryDate: l.expiry_date ?? '', purchaseDate: l.purchase_date ?? '',
      purchaseRef: l.purchase_ref ?? '', supplierBatchRef: l.supplier_batch_ref ?? '',
    });
  };
  const submitEdit = () => run(async () => {
    if (!edtLot) throw new Error('Pick the lot to edit.');
    // Only what actually changed is sent — an untouched field is left alone,
    // and a field emptied on purpose is sent as null ("clear it").
    const patch: Record<string, any> = {};
    const cmp = (key: string, cur: any, next: any, numeric = false) => {
      const a = cur == null ? '' : String(cur);
      const b = next == null ? '' : String(next);
      if (a === b) return;
      patch[key] = b === '' ? null : numeric ? Number(b) : b;
    };
    cmp('batchNumber', edtLot.batch_number, edt.batchNumber);
    cmp('mrp', edtLot.mrp, edt.mrp, true);
    cmp('sellingPrice', edtLot.selling_price, edt.sellingPrice, true);
    cmp('mfgDate', edtLot.mfg_date, edt.mfgDate);
    cmp('expiryDate', edtLot.expiry_date, edt.expiryDate);
    cmp('purchaseDate', edtLot.purchase_date, edt.purchaseDate);
    cmp('purchaseRef', edtLot.purchase_ref, edt.purchaseRef);
    cmp('supplierBatchRef', edtLot.supplier_batch_ref, edt.supplierBatchRef);
    if (patch.batchNumber === null) throw new Error('A lot must keep a batch number.');
    if (!Object.keys(patch).length) throw new Error('Nothing has changed.');
    await batchesAPI.update(edtLot.id, patch);
    return `Lot ${edt.batchNumber || edtLot.batch_number} updated (${Object.keys(patch).length} field(s)).`;
  });

  /* ── Set total ───────────────────────────────────────────────────────── */
  const totVal = tot.total === '' ? null : Math.round(Number(tot.total));
  const totReason = TOTAL_REASONS.find((r) => r.key === tot.reason) ?? TOTAL_REASONS[0];
  const totBelowLots = lots.length > 0 && totVal != null && totVal < batched;
  const submitTotal = () => run(async () => {
    if (totVal == null || totVal < 0 || Number.isNaN(totVal)) throw new Error('Enter the new total (0 or more).');
    if (totVal === onHand) throw new Error('That is already the total — nothing to change.');
    if (totBelowLots) throw new Error(`Lots hold ${batched} unit(s). Remove from a lot first, so the ledger knows which lot the units left.`);
    await inventoryAPI.updateStock(variationId!, {
      stock: totVal, reason_type: totReason.key, reason: (tot.note || totReason.label).slice(0, 40),
    });
    return `Total set to ${fmt(totVal)} (${totReason.label.toLowerCase()}) — was ${fmt(onHand)}.`;
  });

  /* ── Render helpers ──────────────────────────────────────────────────── */
  const lotOption = (l: any) =>
    `${l.batch_number} · ${fmt(l.qty_on_hand)} units${l.mrp != null ? ` · MRP ${rupees(l.mrp)}` : ''}${l.expiry_date ? ` · exp ${l.expiry_date}` : ''}`;

  // Lot work goes through /purchasing, which the Purchasing module gates.
  const needsLots = tab === 'count' || tab === 'label' || tab === 'edit'
    || (tab === 'receive' && rcv.intoLot) || (tab === 'remove' && rem.source !== 'loose');

  const tabs: Array<[TabKey, string, boolean]> = [
    ['receive', 'Receive', true],
    ['remove', 'Remove / write off', lots.length > 0 || loose > 0],
    ['count', 'Count a lot', lots.length > 0],
    ['label', 'Label loose stock', loose > 0],
    ['edit', 'Edit lot details', lots.length > 0],
    ['total', 'Set total', true],
  ];

  return (
    <Dialog open={!!variationId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="update-stock-dialog">
        <DialogHeader>
          <DialogTitle>Update stock</DialogTitle>
          <DialogDescription>
            {sku ? (
              <span>
                <strong className="text-foreground">{sku.name}</strong> · SKU {sku.sku ?? '—'}
                <br />
                On hand <strong className="text-foreground tabular-nums">{fmt(onHand)}</strong>
                {sku.stock_source === 'legacy' ? ' (older column — not ledgered yet)' : ''}
                {' · '}in {lots.length} lot(s) <strong className="text-foreground tabular-nums">{fmt(batched)}</strong>
                {' · '}loose <strong className={`tabular-nums ${loose < 0 ? 'text-red-600' : 'text-foreground'}`}>{fmt(loose)}</strong>
                {reserved > 0 ? ` · ${fmt(reserved)} reserved for orders` : ''}
              </span>
            ) : loading ? `Loading ${name ?? 'SKU'}…` : (name ?? '')}
          </DialogDescription>
        </DialogHeader>

        {loadError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}
        {!canAdjust && sku && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            You can view stock but not change it — that needs the <strong>inventory.adjust</strong> permission.
          </div>
        )}
        {loose < 0 && sku && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Lots claim <strong>{fmt(batched)}</strong> units but only <strong>{fmt(onHand)}</strong> are on hand —
            {' '}{fmt(-loose)} unit(s) in the lots do not exist. Count the lots (or remove the missing units from
            the lot they were recorded in) so the lots and the total agree again.
          </div>
        )}

        {sku && (
          <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setError(null); }}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              {tabs.filter(([, , show]) => show).map(([k, label]) => (
                <TabsTrigger key={k} value={k} className="text-xs">{label}</TabsTrigger>
              ))}
            </TabsList>

            {/* ── Receive ── */}
            <TabsContent value="receive" className="space-y-3 pt-2">
              <div className="flex gap-2 text-sm">
                <Button type="button" size="sm" variant={rcv.intoLot ? 'default' : 'outline'}
                  onClick={() => setRcv({ ...rcv, intoLot: true })} disabled={!lotsEnabled}>Into a lot (batch)</Button>
                <Button type="button" size="sm" variant={!rcv.intoLot ? 'default' : 'outline'}
                  onClick={() => setRcv({ ...rcv, intoLot: false })}>As loose stock (no batch)</Button>
              </div>
              {!lotsEnabled && (
                <p className="text-xs text-muted-foreground">Lots need the Purchasing module, which is off for this store.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {rcv.intoLot && (
                  <Field label="Batch number *" hint={rcvMatch.length
                    ? (rcvSameMrp ? `Adds to the existing lot ${rcvSameMrp.batch_number} (${fmt(rcvSameMrp.qty_on_hand)} units).`
                                  : 'This number exists at a different MRP — it will be a separate lot.')
                    : 'A new lot.'}>
                    <Input list="usd-lot-numbers" value={rcv.batchNumber} onChange={(e) => setRcv({ ...rcv, batchNumber: e.target.value })} autoFocus />
                    <datalist id="usd-lot-numbers">
                      {(data?.lots ?? []).map((l: any) => <option key={l.id} value={l.batch_number}>{lotOption(l)}</option>)}
                    </datalist>
                  </Field>
                )}
                <Field label="Quantity received *">
                  <Input type="number" min={1} value={rcv.qty} onChange={(e) => setRcv({ ...rcv, qty: e.target.value })} autoFocus={!rcv.intoLot} />
                </Field>
                {rcv.intoLot && (
                  <>
                    <Field label="Batch MRP (printed on pack)"><Input type="number" min={0} step="0.01" value={rcv.mrp} onChange={(e) => setRcv({ ...rcv, mrp: e.target.value })} /></Field>
                    <Field label="Batch selling price" hint="Leave blank to sell at the catalogue price.">
                      <Input type="number" min={0} step="0.01" value={rcv.sellingPrice} onChange={(e) => setRcv({ ...rcv, sellingPrice: e.target.value })} />
                    </Field>
                    <Field label="Mfg date"><Input type="date" value={rcv.mfgDate} onChange={(e) => setRcv({ ...rcv, mfgDate: e.target.value })} /></Field>
                    <Field label="Expiry date"><Input type="date" value={rcv.expiryDate} onChange={(e) => setRcv({ ...rcv, expiryDate: e.target.value })} /></Field>
                    <Field label="Purchase date"><Input type="date" value={rcv.purchaseDate} onChange={(e) => setRcv({ ...rcv, purchaseDate: e.target.value })} /></Field>
                    <Field label="Supplier's batch ref"><Input value={rcv.supplierBatchRef} onChange={(e) => setRcv({ ...rcv, supplierBatchRef: e.target.value })} /></Field>
                    <Field label="Unit cost (₹)" hint="Given → recorded as a purchase and folded into average cost.">
                      <Input type="number" min={0} step="0.01" value={rcv.unitCost} onChange={(e) => setRcv({ ...rcv, unitCost: e.target.value })} />
                    </Field>
                  </>
                )}
                <Field label="Supplier invoice / reference">
                  <Input value={rcv.purchaseRef} maxLength={60} onChange={(e) => setRcv({ ...rcv, purchaseRef: e.target.value })} />
                </Field>
              </div>
              <Preview
                rows={[
                  ['On hand', fmt(onHand), fmt(onHand + rcvQty)],
                  ...(rcv.intoLot
                    ? [[rcvSameMrp ? `Lot ${rcvSameMrp.batch_number}` : `Lot ${rcv.batchNumber || '(new)'}`,
                        fmt(rcvSameMrp ? rcvSameMrp.qty_on_hand : 0),
                        fmt((rcvSameMrp ? Number(rcvSameMrp.qty_on_hand) : 0) + rcvQty)] as [string, string, string]]
                    : [['Loose', fmt(loose), fmt(loose + rcvQty)] as [string, string, string]]),
                ]}
                records={rcv.intoLot ? (n(rcv.unitCost) != null ? movementLabel('purchase_receipt') : movementLabel('adjustment')) : movementLabel('purchase_receipt')}
              />
            </TabsContent>

            {/* ── Remove / write off ── */}
            <TabsContent value="remove" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Take from">
                  <select className={selectCls} value={rem.source} onChange={(e) => setRem({ ...rem, source: e.target.value })}>
                    {lots.map((l) => <option key={l.id} value={l.id}>Lot {lotOption(l)}</option>)}
                    {loose > 0 && <option value="loose">Loose stock · {fmt(loose)} units (no batch)</option>}
                  </select>
                </Field>
                <Field label="Why">
                  <select className={selectCls} value={rem.reason} onChange={(e) => setRem({ ...rem, reason: e.target.value })}>
                    {REMOVE_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label={`Quantity to remove * (up to ${fmt(remAvail)})`}>
                  <Input type="number" min={1} max={remAvail} value={rem.qty} onChange={(e) => setRem({ ...rem, qty: e.target.value })} autoFocus />
                </Field>
                <Field label="Note" hint="Up to 40 characters, kept on the ledger entry.">
                  <Input value={rem.note} maxLength={40} onChange={(e) => setRem({ ...rem, note: e.target.value })} placeholder="e.g. carton crushed in transit" />
                </Field>
              </div>
              {reserved > 0 && onHand - remQty < reserved && (
                <p className="text-xs text-amber-700">
                  {fmt(reserved)} unit(s) are reserved for open orders — after this only {fmt(Math.max(0, onHand - remQty))} remain for them.
                </p>
              )}
              <Preview
                rows={[
                  ['On hand', fmt(onHand), fmt(onHand - remQty)],
                  [remLot ? `Lot ${remLot.batch_number}` : 'Loose', fmt(remAvail), fmt(remAvail - remQty)],
                ]}
                records={movementLabel(remLot ? remReason.lot : (TOTAL_REASONS.find((r) => r.key === remReason.loose)?.ledger ?? 'adjustment'))}
              />
            </TabsContent>

            {/* ── Count a lot ── */}
            <TabsContent value="count" className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lot counted">
                  <select className={selectCls} value={cnt.lotId}
                    onChange={(e) => { const l = lotById(e.target.value); setCnt({ ...cnt, lotId: e.target.value, qty: l ? String(l.qty_on_hand) : '' }); }}>
                    {lots.map((l) => <option key={l.id} value={l.id}>{lotOption(l)}</option>)}
                  </select>
                </Field>
                <Field label="Counted quantity *">
                  <Input type="number" min={0} value={cnt.qty} onChange={(e) => setCnt({ ...cnt, qty: e.target.value })} autoFocus />
                </Field>
                <Field label="Note"><Input value={cnt.note} maxLength={40} onChange={(e) => setCnt({ ...cnt, note: e.target.value })} placeholder="e.g. monthly count, shelf A3" /></Field>
              </div>
              <Preview
                rows={[
                  [`Lot ${cntLot?.batch_number ?? ''}`, fmt(cntLot?.qty_on_hand), fmt(cntQty ?? cntLot?.qty_on_hand)],
                  ['On hand', fmt(onHand), fmt(onHand + cntDelta)],
                ]}
                records={movementLabel('cycle_count_correction')}
              />
            </TabsContent>

            {/* ── Label loose stock ── */}
            <TabsContent value="label" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {fmt(loose)} unit(s) are on hand but in no lot, so they carry no expiry and no printed price.
                Labelling them moves no stock — it records which lot they are.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Batch number *"><Input value={lbl.batchNumber} onChange={(e) => setLbl({ ...lbl, batchNumber: e.target.value })} autoFocus /></Field>
                <Field label={`Units in this lot * (up to ${fmt(loose)})`}><Input type="number" min={1} max={loose} value={lbl.qty} onChange={(e) => setLbl({ ...lbl, qty: e.target.value })} /></Field>
                <Field label="Batch MRP"><Input type="number" min={0} step="0.01" value={lbl.mrp} onChange={(e) => setLbl({ ...lbl, mrp: e.target.value })} /></Field>
                <Field label="Batch selling price"><Input type="number" min={0} step="0.01" value={lbl.sellingPrice} onChange={(e) => setLbl({ ...lbl, sellingPrice: e.target.value })} /></Field>
                <Field label="Mfg date"><Input type="date" value={lbl.mfgDate} onChange={(e) => setLbl({ ...lbl, mfgDate: e.target.value })} /></Field>
                <Field label="Expiry date"><Input type="date" value={lbl.expiryDate} onChange={(e) => setLbl({ ...lbl, expiryDate: e.target.value })} /></Field>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                On hand stays <strong className="tabular-nums">{fmt(onHand)}</strong> · loose {fmt(loose)} → {fmt(loose - lblQty)} ·
                {' '}in lots {fmt(batched)} → {fmt(batched + lblQty)}. No ledger entry — no unit moved.
              </div>
            </TabsContent>

            {/* ── Edit lot details ── */}
            <TabsContent value="edit" className="space-y-3 pt-2">
              <Field label="Lot">
                <select className={selectCls} value={edt.lotId} onChange={(e) => pickEditLot(e.target.value)}>
                  {lots.map((l) => <option key={l.id} value={l.id}>{lotOption(l)}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Batch number"><Input value={edt.batchNumber ?? ''} onChange={(e) => setEdt({ ...edt, batchNumber: e.target.value })} /></Field>
                <Field label="Batch MRP"><Input type="number" min={0} step="0.01" value={edt.mrp ?? ''} onChange={(e) => setEdt({ ...edt, mrp: e.target.value })} /></Field>
                <Field label="Batch selling price" hint="Blank = sell at the catalogue price."><Input type="number" min={0} step="0.01" value={edt.sellingPrice ?? ''} onChange={(e) => setEdt({ ...edt, sellingPrice: e.target.value })} /></Field>
                <Field label="Mfg date"><Input type="date" value={edt.mfgDate ?? ''} onChange={(e) => setEdt({ ...edt, mfgDate: e.target.value })} /></Field>
                <Field label="Expiry date"><Input type="date" value={edt.expiryDate ?? ''} onChange={(e) => setEdt({ ...edt, expiryDate: e.target.value })} /></Field>
                <Field label="Purchase date"><Input type="date" value={edt.purchaseDate ?? ''} onChange={(e) => setEdt({ ...edt, purchaseDate: e.target.value })} /></Field>
                <Field label="Supplier invoice / reference"><Input value={edt.purchaseRef ?? ''} maxLength={60} onChange={(e) => setEdt({ ...edt, purchaseRef: e.target.value })} /></Field>
                <Field label="Supplier's batch ref"><Input value={edt.supplierBatchRef ?? ''} maxLength={60} onChange={(e) => setEdt({ ...edt, supplierBatchRef: e.target.value })} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Details only — a lot's quantity is changed by <em>Count a lot</em> or <em>Remove</em>, so the ledger records why.
              </p>
            </TabsContent>

            {/* ── Set total ── */}
            <TabsContent value="total" className="space-y-3 pt-2">
              {lots.length > 0 && (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  This SKU is held in <strong>{lots.length} lot(s)</strong> ({fmt(batched)} units). A total cannot say
                  which lot changed — prefer <strong>Receive</strong>, <strong>Remove</strong> or <strong>Count a lot</strong>.
                  The total here can only change the {fmt(Math.max(0, loose))} loose unit(s), so it cannot go below {fmt(batched)}.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="New total on hand *"><Input type="number" min={lots.length ? batched : 0} value={tot.total} onChange={(e) => setTot({ ...tot, total: e.target.value })} autoFocus /></Field>
                <Field label="Why">
                  <select className={selectCls} value={tot.reason} onChange={(e) => setTot({ ...tot, reason: e.target.value })}>
                    {TOTAL_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Note"><Input value={tot.note} maxLength={40} onChange={(e) => setTot({ ...tot, note: e.target.value })} /></Field>
              </div>
              {totBelowLots && <p className="text-xs text-red-600">Below what the lots hold ({fmt(batched)}). Remove from a lot instead.</p>}
              <Preview rows={[['On hand', fmt(onHand), fmt(totVal ?? onHand)]]} records={movementLabel(totReason.ledger)} />
            </TabsContent>
          </Tabs>
        )}

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {sku && (
            <Button
              data-testid="update-stock-save"
              disabled={busy || !canAdjust || (needsLots && !lotsEnabled)}
              onClick={() => ({
                receive: submitReceive, remove: submitRemove, count: submitCount,
                label: submitLabel, edit: submitEdit, total: submitTotal,
              } as Record<TabKey, () => void>)[tab]()}
            >
              {busy ? 'Saving…' : ({
                receive: 'Receive stock', remove: 'Remove stock', count: 'Save count',
                label: 'Label as lot', edit: 'Save lot details', total: 'Set total',
              } as Record<TabKey, string>)[tab]}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
