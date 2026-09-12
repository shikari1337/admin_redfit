import React, { useState } from 'react';
import { X, Loader2, AlertTriangle, PackageCheck } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';

/**
 * BOOK THE GOODS IN — the dock step (migration 154) that had no screen at all.
 *
 * Everything received lands in QUARANTINE: counted, on the books, and NOT
 * sellable until a human says what it is. That is stated on the screen rather
 * than left as a surprise, because "I received it, why is it not back in stock"
 * is otherwise the next support ticket.
 *
 * A line that does not line up with the order is refused by the server unless
 * an exception reason is supplied — the goods are on the dock either way, so
 * the answer is to record WHY they were accepted, never to accept silently.
 */

interface Line {
  id: string; sku?: string | null; name?: string | null;
  qty_expected: number; qty_received: number; status: string;
  exception_reason?: string | null; variation_id?: string | null;
  batch_number?: string | null;
}

interface Props {
  returnDoc: any;
  exceptions: Array<{ code: string; label: string }>;
  onClose: () => void;
  onReceived: (doc: any) => void;
}

const ReceiveGoodsModal: React.FC<Props> = ({ returnDoc, exceptions, onClose, onReceived }) => {
  const lines: Line[] = (returnDoc?.lines ?? []).filter((l: Line) => l.status !== 'dispositioned' && l.status !== 'cancelled');
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id,
      String(Math.max(0, Number(l.qty_expected) - Number(l.qty_received)))])));
  const [batch, setBatch] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [warehouse] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The server refuses a mismatched line without a reason. Pre-flag the ones we
  // already know will need one, so the operator is not bounced by a 422.
  const needsReason = (l: Line) =>
    !!returnDoc?.is_exception || !!l.exception_reason
    || (Number(l.qty_received) + (Number(qty[l.id]) || 0)) > Number(l.qty_expected);

  const submit = async () => {
    const payloadLines = lines
      .map((l) => ({
        itemId: l.id,
        qtyReceived: Math.max(0, Math.round(Number(qty[l.id]) || 0)),
        batchNumber: batch[l.id]?.trim() || null,
        expiryDate: expiry[l.id] || null,
        exceptionReason: reason[l.id] || null,
      }))
      .filter((l) => l.qtyReceived > 0);

    if (payloadLines.length === 0) { setError('Enter how many units actually arrived.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post(`/returns/${returnDoc.id}/receive`, { lines: payloadLines, warehouseId: warehouse || null }, {
        // A replayed dock scan must never book the same goods in twice.
        headers: { 'X-Idempotency-Key': `recv-${returnDoc.id}-${payloadLines.map((l) => `${l.itemId}:${l.qtyReceived}`).join(',')}` },
      });
      onReceived(payload<any>(res));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not book these goods in.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" /> Book the goods in
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {returnDoc?.return_number ?? ''} · order {returnDoc?.order_number ?? '—'}
            </p>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Everything you book in is held in <strong>quarantine</strong> — counted and on the
              books, but <strong>not on sale</strong>. Decide what each item actually is
              (good / damaged / destroy) afterwards, and only then does good stock go back on sale.
            </span>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Expected</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Arrived</th>
                  <th className="text-left font-medium px-3 py-2 w-40">Batch</th>
                  <th className="text-left font-medium px-3 py-2 w-36">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l) => (
                  <React.Fragment key={l.id}>
                    <tr>
                      <td className="px-3 py-2">
                        <div className="font-medium truncate max-w-[220px]">{l.name ?? 'Item'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{l.sku ?? '—'}</div>
                        {!l.variation_id && (
                          <div className="text-xs text-amber-700 mt-0.5">
                            Not matched to a SKU — this line cannot be added to stock.
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {l.qty_expected}
                        {Number(l.qty_received) > 0 && (
                          <div className="text-xs">({l.qty_received} already in)</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min={0}
                          value={qty[l.id] ?? ''}
                          disabled={!l.variation_id}
                          onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-right
                                     tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text" placeholder="optional"
                          value={batch[l.id] ?? ''}
                          disabled={!l.variation_id}
                          onChange={(e) => setBatch((b) => ({ ...b, [l.id]: e.target.value }))}
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={expiry[l.id] ?? ''}
                          disabled={!l.variation_id}
                          onChange={(e) => setExpiry((x) => ({ ...x, [l.id]: e.target.value }))}
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                    {needsReason(l) && (Number(qty[l.id]) || 0) > 0 && (
                      <tr className="bg-amber-50/60">
                        <td colSpan={5} className="px-3 py-2">
                          <label className="text-xs text-amber-900 font-medium block mb-1">
                            This line does not line up with the order — say why you are accepting it:
                          </label>
                          <select
                            value={reason[l.id] ?? ''}
                            onChange={(e) => setReason((r) => ({ ...r, [l.id]: e.target.value }))}
                            className="w-full max-w-md rounded-md border border-amber-300 bg-background px-2 py-1 text-sm"
                          >
                            <option value="">Choose a reason…</option>
                            {exceptions.map((x) => (
                              <option key={x.code} value={x.code}>{x.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            A batch number is worth entering when the pack has one: it decides whether these units
            may ever be resold (an expired batch never can).
          </p>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border bg-muted/30 sticky bottom-0">
          <button onClick={onClose} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium
                             hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Book in to quarantine
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiveGoodsModal;
