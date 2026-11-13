import React from 'react';
import { Plus, X } from 'lucide-react';
import { fmtRupees } from '../../lib/money';
import { TENDER_METHODS, minorOf, rupeesOf } from './posApi';
import type { TenderDraft, TenderMethod } from './posApi';

/**
 * How the bill is paid: one leg or several (cash, UPI, card). The server checks the same rules
 * (retail domain/tenders.rs): the legs add up to the bill to the paisa, cash handed over covers its
 * leg (the rest is change), and a UPI or card leg counts only once the cashier confirms the money
 * arrived and types its reference. This panel makes those rules visible before Charge is pressed.
 */

const LABEL: Record<TenderMethod, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };
const REF_HINT: Record<TenderMethod, string> = { cash: '', upi: 'UPI reference or UTR', card: 'Approval code or last 4 digits' };

/** Where the legs stand against the bill, in minor units. */
export function tenderState(legs: TenderDraft[], totalMinor: number) {
  const applied = legs.reduce((s, t) => s + minorOf(t.amount), 0);
  const change = legs.reduce((s, t) => (t.method === 'cash' && t.tendered.trim() ? s + Math.max(0, minorOf(t.tendered) - minorOf(t.amount)) : s), 0);
  const shortCash = legs.some((t) => t.method === 'cash' && t.tendered.trim() !== '' && minorOf(t.tendered) < minorOf(t.amount));
  const unconfirmed = legs.some((t) => t.method !== 'cash' && (!t.confirmed || !t.reference.trim()));
  const zeroLeg = legs.some((t) => minorOf(t.amount) <= 0);
  const left = totalMinor - applied;
  return { applied, change, left, shortCash, unconfirmed, zeroLeg, ready: legs.length > 0 && left === 0 && !shortCash && !unconfirmed && !zeroLeg };
}

export const leg = (method: TenderMethod, amountMinor: number): TenderDraft => ({
  method, amount: amountMinor > 0 ? String(rupeesOf(amountMinor)) : '', tendered: '', reference: '', confirmed: false,
});

const TenderPanel: React.FC<{
  legs: TenderDraft[];
  onChange: (legs: TenderDraft[]) => void;
  totalMinor: number;
  /** The store currency's notes and coins (rupees), from the server; offered as one-tap "cash handed over". */
  denominations: number[];
}> = ({ legs, onChange, totalMinor, denominations }) => {
  const st = tenderState(legs, totalMinor);
  const patch = (i: number, p: Partial<TenderDraft>) => onChange(legs.map((t, n) => (n === i ? { ...t, ...p } : t)));
  const remove = (i: number) => onChange(legs.filter((_, n) => n !== i));
  const split = () => onChange([...legs, leg(legs.some((t) => t.method === 'cash') ? 'upi' : 'cash', Math.max(0, st.left))]);

  return (
    <div className="space-y-2">
      {legs.map((t, i) => {
        const amountMinor = minorOf(t.amount);
        const notes = denominations.filter((d) => minorOf(d) > amountMinor).sort((a, b) => a - b).slice(0, 3);
        const change = t.tendered.trim() ? minorOf(t.tendered) - amountMinor : 0;
        return (
          <div key={i} className="space-y-2 rounded-lg border-2 border-gray-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1" role="radiogroup" aria-label="Paid by">
                {TENDER_METHODS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={t.method === m}
                          onClick={() => patch(i, { method: m, confirmed: false })}
                          className={`rounded-md border-2 px-3 py-2 text-sm font-semibold ${t.method === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white'}`}>
                    {LABEL[m]}
                  </button>
                ))}
              </div>
              <input inputMode="decimal" value={t.amount} onChange={(e) => patch(i, { amount: e.target.value })}
                     aria-label={`${LABEL[t.method]} amount`}
                     className="w-28 min-w-0 flex-1 rounded-md border-2 border-gray-200 px-2 py-2 text-right font-bold" />
              {legs.length > 1 && (
                <button type="button" onClick={() => remove(i)} aria-label="Remove this payment"
                        className="rounded-md border-2 border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><X className="h-4 w-4" /></button>
              )}
            </div>
            {t.method === 'cash' ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-600">Handed over</span>
                <input inputMode="decimal" value={t.tendered} onChange={(e) => patch(i, { tendered: e.target.value })}
                       placeholder={t.amount || '0'} aria-label="Cash handed over"
                       className="w-24 rounded-md border-2 border-gray-200 px-2 py-1 text-right" />
                {notes.map((d) => (
                  <button key={d} type="button" onClick={() => patch(i, { tendered: String(d) })}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-50">
                    {fmtRupees(d)}
                  </button>
                ))}
                {t.tendered.trim() !== '' && (
                  change >= 0
                    ? <span className="ml-auto font-bold text-emerald-700">Change {fmtRupees(rupeesOf(change))}</span>
                    : <span className="ml-auto font-bold text-red-700">Short {fmtRupees(rupeesOf(-change))}</span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input value={t.reference} onChange={(e) => patch(i, { reference: e.target.value })}
                       placeholder={REF_HINT[t.method]} aria-label={REF_HINT[t.method]}
                       className="min-w-0 flex-1 rounded-md border-2 border-gray-200 px-2 py-1" />
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={t.confirmed} onChange={(e) => patch(i, { confirmed: e.target.checked })}
                         className="h-5 w-5" />
                  Money received
                </label>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-sm">
        <button type="button" onClick={split} disabled={st.left <= 0}
                className="flex items-center gap-1 rounded-md border-2 border-gray-200 px-3 py-1.5 font-semibold disabled:opacity-40">
          <Plus className="h-4 w-4" /> Split payment
        </button>
        {st.left > 0 && <span className="font-bold text-red-700">Left to pay {fmtRupees(rupeesOf(st.left))}</span>}
        {st.left < 0 && <span className="font-bold text-red-700">Over by {fmtRupees(rupeesOf(-st.left))}: put extra cash in Handed over</span>}
        {st.left === 0 && st.change > 0 && <span className="font-bold text-emerald-700">Give back {fmtRupees(rupeesOf(st.change))}</span>}
      </div>
      {st.unconfirmed && <p className="text-xs text-amber-700">A UPI or card payment counts once the money has arrived: type its reference and tick Money received.</p>}
    </div>
  );
};

export default TenderPanel;
