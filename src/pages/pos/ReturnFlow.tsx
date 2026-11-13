import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { fmtRupees } from '../../lib/money';
import { scanFeedback } from '../scanner/ScanInput';
import { PRINT_CSS } from './BillSlip';
import { TENDER_METHODS, findSale, minorOf, newRef, refundSale, rupeesOf, say } from './posApi';
import type { Refund, ReturnableSale, TenderMethod } from './posApi';

const methodWord = (m: string) => (m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1));

/**
 * A counter return: find the sale by the number printed on it, pick what is coming back, pay it
 * back and print the credit note. The client names only which lines and how many; the server
 * prices the refund from the original sale, caps each line at what is still returnable and keeps
 * the refund within the receipt (`POST /pos/refunds`, one idempotency key per press).
 */
const ReturnFlow: React.FC<{ outletId: string | null; onExit: () => void }> = ({ outletId, onExit }) => {
  const [step, setStep] = useState<'find' | 'pick' | 'done'>('find');
  const [number, setNumber] = useState('');
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<TenderMethod>('cash');
  const [refund, setRefund] = useState<{ refund: Refund; lines: { name: string; qty: number }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ref, setRef] = useState(newRef);

  const restart = () => {
    setStep('find'); setNumber(''); setSale(null); setQty({}); setReason(''); setMethod('cash');
    setRefund(null); setMsg(''); setRef(newRef());
  };

  const find = async () => {
    const n = number.trim();
    if (!n) { setMsg('Type or scan the receipt number.'); return; }
    setBusy(true); setMsg('');
    try {
      const s = await findSale(n);
      if (!s.items?.length) { setMsg('That sale has no lines to return.'); scanFeedback(false); return; }
      scanFeedback(true);
      setSale(s); setQty({});
      const paid = s.receipt.payment_method;
      setMethod((TENDER_METHODS as string[]).includes(paid) ? paid as TenderMethod : 'cash');
      setStep('pick');
    } catch (e) {
      scanFeedback(false);
      setMsg(say(e, 'No sale found for that receipt number.'));
    } finally { setBusy(false); }
  };

  const lineKey = (it: ReturnableSale['items'][number], i: number) => it.variation_id ?? `line-${i}`;
  const estimate = (sale?.items ?? []).reduce((s, it, i) => s + (qty[lineKey(it, i)] ?? 0) * minorOf(it.unit_price), 0);
  const capped = sale ? Math.min(estimate, minorOf(sale.refundable)) : 0;

  const submit = async () => {
    if (!sale || busy) return;
    const items = sale.items
      .map((it, i) => ({ variationId: it.variation_id ?? '', qty: qty[lineKey(it, i)] ?? 0 }))
      .filter((l) => l.variationId && l.qty > 0);
    if (!items.length) { setMsg('Pick at least one item to return.'); return; }
    if (!reason.trim()) { setMsg('Say why it is coming back.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await refundSale(sale.receipt.receipt_number, method, reason, items, outletId, ref);
      scanFeedback(true);
      setRefund({
        refund: r,
        lines: sale.items
          .map((it, i) => ({ name: it.name ?? it.sku ?? 'Item', qty: qty[lineKey(it, i)] ?? 0 }))
          .filter((l) => l.qty > 0),
      });
      setStep('done');
    } catch (e) {
      scanFeedback(false);
      setMsg(say(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="flex items-center justify-between bg-gray-900 px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-base font-semibold"><RotateCcw className="h-5 w-5 text-gray-300" /> Return</span>
        <button type="button" onClick={onExit} className="rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10">
          {step === 'done' ? 'Done' : 'Cancel'}
        </button>
      </header>

      {step === 'find' && (
        <main className="mx-auto w-full max-w-sm flex-1 space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-bold">Scan or type the receipt number</h2>
          <p className="text-sm text-gray-500">It is printed at the top of the customer's receipt.</p>
          {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
          <input autoFocus value={number} onChange={(e) => setNumber(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') find(); }}
                 className="w-full rounded-lg border-2 px-3 py-3 text-center text-xl font-bold" aria-label="Receipt number" />
          <button type="button" onClick={find} disabled={busy} className="w-full rounded-lg bg-gray-900 py-4 text-lg font-bold text-white disabled:opacity-50">
            {busy ? 'Finding...' : 'Find sale'}
          </button>
        </main>
      )}

      {step === 'pick' && sale && (
        <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">What is coming back?</h2>
            <span className="font-mono text-xs text-gray-500">{sale.receipt.receipt_number}{sale.order_number ? ` | ${sale.order_number}` : ''}</span>
          </div>
          {minorOf(sale.refunded) > 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Already refunded {fmtRupees(sale.refunded)}. Still refundable {fmtRupees(sale.refundable)}.
            </div>
          )}
          {msg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{msg}</div>}
          {sale.items.map((it, i) => {
            const k = lineKey(it, i);
            const max = it.returnable_qty;
            const q = qty[k] ?? 0;
            const put = (n: number) => setQty((m) => ({ ...m, [k]: Math.max(0, Math.min(n, max)) }));
            return (
              <div key={k} className={`rounded-xl border bg-white p-3 shadow-sm ${max <= 0 ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{it.name ?? it.sku}</div>
                    <div className="font-mono text-xs text-gray-500">
                      {[it.sku, `${fmtRupees(it.unit_price)} each`, `bought ${it.quantity}`, it.refunded_qty > 0 ? `returned ${it.refunded_qty}` : null].filter(Boolean).join(' | ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={max <= 0} onClick={() => put(q - 1)} aria-label="One less"
                            className="h-11 w-11 rounded-lg border-2 text-xl font-bold disabled:opacity-40">-</button>
                    <span className="w-8 text-center text-lg font-bold">{q}</span>
                    <button type="button" disabled={max <= 0} onClick={() => put(q + 1)} aria-label="One more"
                            className="h-11 w-11 rounded-lg border-2 text-xl font-bold disabled:opacity-40">+</button>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex justify-between text-lg font-bold">
              <span>Refund, about</span><span>{fmtRupees(rupeesOf(capped))}</span>
            </div>
            <p className="text-xs text-gray-500">The exact figure comes from the original sale prices and is printed on the credit note.</p>
            <input placeholder="Reason for the return (required)" value={reason} maxLength={300}
                   onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border-2 px-3 py-2" />
            <div className="flex gap-2">
              {TENDER_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                        className={`flex-1 rounded-lg border-2 py-3 font-semibold ${method === m ? 'border-gray-900 bg-gray-900 text-white' : ''}`}>
                  {methodWord(m)}
                </button>
              ))}
            </div>
            <button type="button" onClick={submit} disabled={busy || capped <= 0}
                    className="w-full rounded-lg bg-red-600 py-4 text-lg font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Refunding...' : `Refund by ${methodWord(method)}`}
            </button>
          </div>
        </main>
      )}

      {step === 'done' && refund && (
        <main className="flex-1 p-4">
          <style>{PRINT_CSS}</style>
          <div id="pos-receipt" className="mx-auto max-w-xs rounded-lg border bg-white p-4 font-mono text-xs shadow-sm">
            <div className="text-center text-sm font-bold">REFUND</div>
            <div className="text-center text-lg font-bold">{refund.refund.refund_number}</div>
            <div className="text-center text-[10px]">Against {sale?.receipt.receipt_number}</div>
            <div className="my-2 border-t border-dashed" />
            {refund.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 break-words">{l.name} x{l.qty}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed" />
            <div className="flex justify-between text-sm font-bold"><span>REFUNDED</span><span>{fmtRupees(refund.refund.amount)}</span></div>
            <div className="mt-1 text-center text-[10px]">Paid back by {methodWord(refund.refund.method)}. {refund.refund.reason ?? ''}</div>
          </div>
          <div className="mx-auto mt-4 flex max-w-xs flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="flex-1 rounded-lg bg-gray-900 py-3 font-semibold text-white">Print</button>
            <button type="button" onClick={restart} className="flex-1 rounded-lg border-2 bg-white py-3 font-semibold">Another return</button>
            <button type="button" onClick={onExit} className="w-full rounded-lg border-2 bg-white py-3 font-semibold">Back to sale</button>
          </div>
        </main>
      )}
    </div>
  );
};

export default ReturnFlow;
