import React, { useState } from 'react';
import { fmtRupees } from '../../lib/money';
import { formatDateTime } from '../../utils/date';
import { PRINT_CSS } from './BillSlip';
import { closeDrawer, minorOf, rupeesOf, say } from './posApi';
import type { Closed, CounterConfig, ZReport } from './posApi';

const methodWord = (m: string) => (m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1));

const Row: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-2 ${strong ? 'font-bold' : ''}`}><span>{label}</span><span>{value}</span></div>
);

/**
 * A shift in numbers: live while the drawer is open (an X-report, `frozen: false`) and frozen at
 * close (the Z-report, the record). The expected cash, the count and the variance are a manager's
 * view only: a cashier closes blind.
 */
export const ShiftCard: React.FC<{ z: ZReport; journal?: Closed['journal'] | null; printable?: boolean }> = ({ z, journal, printable }) => {
  const variance = z.variance ?? null;
  const out = variance != null && minorOf(variance) !== 0;
  return (
    <div>
      {printable && <style>{PRINT_CSS}</style>}
      <div id={printable ? 'pos-receipt' : undefined} className="space-y-1 rounded-xl border bg-white p-4 font-mono text-xs shadow-sm">
        <div className="text-center text-sm font-bold">{z.frozen ? 'DAY END (Z) REPORT' : 'SHIFT SO FAR (X)'}</div>
        <div className="text-center text-[10px]">{formatDateTime(z.opened_at)}{z.closed_at ? ` to ${formatDateTime(z.closed_at)}` : ', still open'}</div>
        {variance != null && (
          <div className={`my-2 rounded-md px-2 py-1 text-center text-sm font-bold ${out ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {out ? `Drawer out by ${fmtRupees(variance)}` : 'Drawer matches'}
          </div>
        )}
        <div className="my-2 border-t border-dashed" />
        <Row label={`Bills (${z.bills})`} value={fmtRupees(z.gross)} />
        <Row label={`Refunds (${z.refund_count})`} value={`-${fmtRupees(z.refunds)}`} />
        <Row label="Net sales" value={fmtRupees(z.net_sales)} strong />
        <Row label="GST in sales" value={fmtRupees(z.tax)} />
        <div className="my-2 border-t border-dashed" />
        {z.tender_mix.map((m) => <Row key={m.method} label={`${methodWord(m.method)} (${m.legs})`} value={fmtRupees(m.amount)} />)}
        <div className="my-2 border-t border-dashed" />
        <Row label="Opening float" value={fmtRupees(z.opening_float)} />
        <Row label="Cash taken" value={fmtRupees(z.cash)} />
        <Row label="Cash refunds" value={`-${fmtRupees(z.cash_refunds)}`} />
        {z.expected_cash != null && <Row label="Drawer should hold" value={fmtRupees(z.expected_cash)} strong />}
        {z.counted_cash != null && <Row label="Counted" value={fmtRupees(z.counted_cash)} strong />}
        {(z.denominations ?? []).filter((d) => d.count > 0).length > 0 && (
          <>
            <div className="my-2 border-t border-dashed" />
            {(z.denominations ?? []).filter((d) => d.count > 0).map((d) => (
              <Row key={d.face} label={`${fmtRupees(d.face)} x ${d.count}`} value={fmtRupees(rupeesOf(minorOf(d.face) * d.count))} />
            ))}
          </>
        )}
        {(z.z_journal_number || journal) && (
          <div className="pt-2 text-center text-[10px]">
            {z.z_journal_number || journal?.journal_number
              ? `Books journal ${z.z_journal_number ?? journal?.journal_number}`
              : journal?.reason ?? 'Not posted to the books'}
          </div>
        )}
      </div>
      {printable && (
        <button type="button" onClick={() => window.print()} className="mt-2 w-full rounded-lg border-2 bg-white py-2 text-sm font-semibold">Print report</button>
      )}
    </div>
  );
};

/**
 * Close the drawer blind: count what is physically there, note by note, before seeing what it
 * should hold. The server compares, records the variance (never absorbs it) and refuses a variance
 * beyond the store's tolerance unless a manager closes (`POST /pos/session/z-close`).
 */
export const CloseDrawer: React.FC<{
  boot: CounterConfig;
  outletId: string | null;
  onClosed: (c: Closed) => void;
  onCancel: () => void;
}> = ({ boot, outletId, onClosed, onCancel }) => {
  const ladder = boot.denominations;
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const countedMinor = ladder.length
    ? ladder.reduce((s, face) => s + minorOf(face) * (parseInt(counts[String(face)] || '0', 10) || 0), 0)
    : minorOf(typed);

  const submit = async () => {
    if (busy) return;
    if (!ladder.length && typed.trim() === '') { setMsg('Enter the cash counted in the drawer, 0 if empty.'); return; }
    setBusy(true); setMsg('');
    try {
      const sheet = ladder.length
        ? Object.fromEntries(ladder
          .map((face) => [String(minorOf(face)), parseInt(counts[String(face)] || '0', 10) || 0] as [string, number])
          .filter(([, n]) => n > 0))
        : null;
      onClosed(await closeDrawer(sheet, ladder.length ? null : rupeesOf(minorOf(typed)), notes, outletId));
    } catch (e) {
      setMsg(say(e));
    } finally { setBusy(false); }
  };

  const expected = boot.session?.expected_cash;
  return (
    <div className="border-b bg-amber-50 px-4 py-3">
      <div className="mx-auto max-w-xl space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">Count the drawer</span>
          {boot.is_manager && expected != null && <span className="text-gray-700">Should hold {fmtRupees(expected)}</span>}
        </div>
        {ladder.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ladder.map((face) => (
              <label key={face} className="flex items-center justify-between gap-2 rounded-md border bg-white px-2 py-1">
                <span className="font-semibold">{fmtRupees(face)}</span>
                <input inputMode="numeric" value={counts[String(face)] ?? ''} aria-label={`How many of ${fmtRupees(face)}`}
                       onChange={(e) => setCounts((c) => ({ ...c, [String(face)]: e.target.value.replace(/\D/g, '') }))}
                       placeholder="0" className="w-14 rounded border-2 px-1 py-0.5 text-right font-bold" />
              </label>
            ))}
          </div>
        ) : (
          <input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Cash counted"
                 className="w-40 rounded border-2 px-2 py-1 text-right font-bold" aria-label="Cash counted" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">Counted {fmtRupees(rupeesOf(countedMinor))}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (why it is out, if it is)"
                 className="min-w-0 flex-1 rounded border-2 px-2 py-1" maxLength={500} />
        </div>
        {msg && <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">{msg}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={submit} disabled={busy} className="rounded bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {busy ? 'Closing...' : 'Close drawer'}
          </button>
          <button type="button" onClick={onCancel} className="rounded border bg-white px-4 py-2">Cancel</button>
        </div>
      </div>
    </div>
  );
};
