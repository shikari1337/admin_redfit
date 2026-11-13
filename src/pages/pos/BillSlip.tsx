import React, { useState } from 'react';
import { fmtRupees } from '../../lib/money';
import { formatDateTime, formatDay } from '../../utils/date';
import { TENDER_METHODS, getBill, minorOf, say, voidBill } from './posApi';
import type { Bill, TenderMethod } from './posApi';

/** Only the slip prints, at 80 mm (the counter's receipt roll). */
export const PRINT_CSS = '@media print { body * { visibility: hidden; } #pos-receipt, #pos-receipt * { visibility: visible; } #pos-receipt { position: absolute; left: 0; top: 0; width: 80mm; box-shadow: none; border: 0; } }';

const methodWord = (m: string) => (m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1));

/**
 * A rung bill as printed, reprinted and voided. Everything on it is the server's record
 * (`GET /pos/bills/{n}`): the lines with the batch each unit came out of, the totals the bill was
 * charged with, the tender legs and change, any refunds and the void stamp. A void is a manager's
 * act: the bill is never edited, the money and stock come back through a refund and the void is
 * stamped on it.
 */
const BillSlip: React.FC<{
  bill: Bill;
  isManager: boolean;
  outletId: string | null;
  onClose: () => void;
  closeLabel: string;
}> = ({ bill: first, isManager, outletId, onClose, closeLabel }) => {
  const [bill, setBill] = useState<Bill>(first);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<TenderMethod>((TENDER_METHODS as string[]).includes(first.payment_method) ? first.payment_method as TenderMethod : 'cash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const t = bill.totals;
  const inclusive = t ? minorOf(t.subtotal) - minorOf(t.discount) === minorOf(t.total) : true;
  const notes = [...bill.warnings, ...bill.oversell.map((o) => `Shelf was short by ${o.shortfall} for one line: count that stock.`)];

  const doVoid = async () => {
    if (busy) return;
    if (reason.trim().length < 3) { setMsg({ ok: false, text: 'Say why the bill is voided (at least 3 characters).' }); return; }
    setBusy(true); setMsg(null);
    try {
      const out = await voidBill(bill.receipt_number, reason, method, outletId);
      setMsg({ ok: true, text: `Voided. ${fmtRupees(out.refund.amount)} back by ${methodWord(out.refund.method)} on ${out.refund.refund_number}.` });
      setVoiding(false); setReason('');
      try { setBill(await getBill(bill.receipt_number)); } catch { /* the stamp shows on the next open */ }
    } catch (e) {
      setMsg({ ok: false, text: say(e) });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <style>{PRINT_CSS}</style>
      {bill.replayed && (
        <div className="mx-auto mb-3 max-w-xs rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">This bill was already rung. Here it is again; nothing was charged twice.</div>
      )}
      <div id="pos-receipt" className="mx-auto max-w-xs rounded-lg border bg-white p-4 font-mono text-xs shadow-sm">
        {bill.outlet?.name && <div className="text-center text-sm font-bold">{bill.outlet.name}</div>}
        {(bill.outlet?.address || bill.outlet?.city) && (
          <div className="text-center text-[10px]">{[bill.outlet?.address, bill.outlet?.city, bill.outlet?.state].filter(Boolean).join(', ')}</div>
        )}
        {bill.outlet?.phone && <div className="text-center text-[10px]">Phone {bill.outlet.phone}</div>}
        {bill.outlet?.gstin && <div className="text-center text-[10px]">GSTIN {bill.outlet.gstin}</div>}
        <div className="mt-2 text-center text-sm font-bold">SALE RECEIPT</div>
        <div className="text-center text-[11px] font-bold">{bill.receipt_number}</div>
        <div className="text-center text-[10px]">{formatDateTime(bill.created_at)}{bill.order_number ? ` | ${bill.order_number}` : ''}</div>
        {bill.queued_offline && <div className="text-center text-[10px]">Rung offline {formatDateTime(bill.captured_at)}</div>}
        {bill.voided_at && <div className="my-1 border-2 border-red-700 text-center text-sm font-bold text-red-700">VOIDED {formatDateTime(bill.voided_at)}</div>}
        <div className="my-2 border-t border-dashed" />
        {bill.items.map((l, i) => (
          <div key={`${l.variation_id ?? i}`} className="mb-1">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 flex-1 break-words">{l.name ?? l.sku} x{l.quantity}</span>
              <span>{fmtRupees(l.line_total)}</span>
            </div>
            <div className="text-[10px] text-gray-600">
              {fmtRupees(l.unit_price)} each{l.mrp != null && minorOf(l.mrp) > minorOf(l.unit_price) ? ` (MRP ${fmtRupees(l.mrp)})` : ''}
            </div>
            {l.batches.map((b, j) => (
              <div key={j} className="text-[10px] text-gray-600">
                Batch {b.batch_number ?? '-'}{b.expiry_date ? `, exp ${formatDay(b.expiry_date)}` : ''}{l.batches.length > 1 ? `, ${b.qty}` : ''}
              </div>
            ))}
          </div>
        ))}
        <div className="my-2 border-t border-dashed" />
        {t && (
          <>
            <div className="flex justify-between"><span>Subtotal</span><span>{fmtRupees(t.subtotal)}</span></div>
            {minorOf(t.discount) > 0 && (
              <div className="flex justify-between"><span>Discount{t.discount_reason ? ` (${t.discount_reason})` : ''}</span><span>-{fmtRupees(t.discount)}</span></div>
            )}
            {minorOf(t.tax) > 0 && (
              <div className="flex justify-between"><span>{inclusive ? 'Includes GST' : 'GST'}</span><span>{fmtRupees(t.tax)}</span></div>
            )}
          </>
        )}
        <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{fmtRupees(bill.total)}</span></div>
        <div className="my-2 border-t border-dashed" />
        {bill.tenders.map((p, i) => (
          <div key={i}>
            <div className="flex justify-between"><span>{methodWord(p.method)}{p.reference ? ` ${p.reference}` : ''}</span><span>{fmtRupees(p.amount)}</span></div>
            {p.method === 'cash' && p.tendered != null && minorOf(p.tendered) > minorOf(p.amount) && (
              <div className="flex justify-between text-[10px]"><span>Handed over {fmtRupees(p.tendered)}</span><span>Change {fmtRupees(p.change ?? 0)}</span></div>
            )}
          </div>
        ))}
        {bill.refunds.length > 0 && (
          <>
            <div className="my-2 border-t border-dashed" />
            {bill.refunds.map((r) => (
              <div key={r.refund_number} className="flex justify-between text-[10px]">
                <span>Refund {r.refund_number}</span><span>-{fmtRupees(r.amount)}</span>
              </div>
            ))}
          </>
        )}
        <div className="mt-2 text-center text-[10px]">Thank you</div>
      </div>

      {notes.length > 0 && (
        <ul className="mx-auto mt-3 max-w-xs space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {msg && <div className={`mx-auto mt-3 max-w-xs rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {voiding && (
        <div className="mx-auto mt-3 max-w-xs space-y-2 rounded-lg border-2 border-red-200 bg-white p-3">
          <div className="text-sm font-bold">Void {bill.receipt_number}</div>
          <p className="text-xs text-gray-600">
            {bill.refunds.length > 0
              ? 'Everything not refunded yet is paid back and its stock returns to the shelf.'
              : `The whole bill comes back: ${fmtRupees(bill.total)} is paid back and the stock returns to the shelf.`}
          </p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={300}
                 className="w-full rounded-md border-2 border-gray-200 px-2 py-2 text-sm" />
          <div className="flex gap-1">
            {TENDER_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                      className={`flex-1 rounded-md border-2 py-2 text-sm font-semibold ${method === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200'}`}>
                {methodWord(m)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={doVoid} disabled={busy}
                    className="flex-1 rounded-md bg-red-600 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Voiding...' : 'Void bill'}</button>
            <button type="button" onClick={() => setVoiding(false)} className="rounded-md border-2 px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="mx-auto mt-4 flex max-w-xs flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="flex-1 rounded-lg bg-gray-900 py-3 font-semibold text-white">Print</button>
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border-2 bg-white py-3 font-semibold">{closeLabel}</button>
        {isManager && !bill.voided_at && !voiding && (
          <button type="button" onClick={() => { setVoiding(true); setMsg(null); }} className="w-full rounded-lg border-2 border-red-200 bg-white py-2 text-sm font-semibold text-red-700">
            Void this bill
          </button>
        )}
      </div>
    </div>
  );
};

export default BillSlip;
