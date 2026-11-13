import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Pause, Play, X, CloudOff } from 'lucide-react';
import { fmtRupees } from '../../lib/money';
import { formatDay, formatTime } from '../../utils/date';
import ScanInput, { scanFeedback } from '../scanner/ScanInput';
import BillSlip, { PRINT_CSS } from './BillSlip';
import ReturnFlow from './ReturnFlow';
import TenderPanel, { leg, tenderState } from './TenderPanel';
import { CloseDrawer, ShiftCard } from './ShiftReport';
import {
  customerByPhone, emptyBuyer, getBill, loadCounter, minorOf, newRef, openDrawer, quoteBasket, readHeld, readQueue,
  ringBill, rupeesOf, saveOutlet, savedOutlet, say, searchCounter, sessionBills, shiftReport, syncQueue, unreachable,
  writeHeld, writeQueue,
} from './posApi';
import type {
  Bill, Buyer, CartLine, Closed, CounterConfig, HeldBill, Hit, QueuedBill, Quote, ReceiptRow, TenderDraft, TenderMethod, ZReport,
} from './posApi';

/**
 * POS: the shop counter, full screen, on the ONE bill path (`/api/v2/retail`).
 *
 * Boot is one call (`/pos/config`: outlets, the open drawer, the counter rules, the caller's
 * manager flag, the currency's notes). Scan or search (`/pos/search`: an exact barcode or SKU comes
 * back alone and is added at once) builds the basket; `/pos/quote` prices it with the same
 * computation `/pos/bills` charges with, including the coupon, a buyer's GSTIN, B2B prices for a
 * known customer, the outlet's place of supply, the expiry check and the manager gate. The bill
 * takes split tenders; the server checks they add up to the paisa. A bill rung while the network is
 * down is queued on this device with its own reference and numbered when it syncs.
 */

const methodWord = (m: string) => (m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1));

type View = 'sell' | 'return' | 'bills' | 'shift';

const PosSurface: React.FC = () => {
  const navigate = useNavigate();

  // ── boot: one call, per outlet ──────────────────────────────────────────────────────────────
  const [outletId, setOutletId] = useState<string | null>(savedOutlet);
  const [boot, setBoot] = useState<CounterConfig | null>(null);
  const [bootError, setBootError] = useState('');
  const reload = async (oid: string | null = outletId) => {
    try { setBoot(await loadCounter(oid)); setBootError(''); } catch (e) { setBootError(say(e, 'The counter could not load.')); }
  };
  useEffect(() => { reload(outletId); }, [outletId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A remembered outlet that no longer exists is forgotten, so the drawer screen asks again.
    if (boot && outletId && boot.outlets.length && !boot.outlets.some((o) => o.id === outletId)) pickOutlet(null);
  }, [boot]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickOutlet = (id: string | null) => { setOutletId(id); saveOutlet(id); };

  const [view, setView] = useState<View>('sell');
  const [slip, setSlip] = useState<{ bill: Bill; closeLabel: string } | null>(null);
  const [queuedSlip, setQueuedSlip] = useState<QueuedBill | null>(null);

  // ── the basket ──────────────────────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<CartLine[]>([]);
  const [buyer, setBuyer] = useState<Buyer>(emptyBuyer);
  const [couponDraft, setCouponDraft] = useState('');
  const [gstinDraft, setGstinDraft] = useState('');
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [results, setResults] = useState<Hit[]>([]);
  const [searchMsg, setSearchMsg] = useState<{ warn: boolean; text: string } | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = useRef(0);

  const [legs, setLegs] = useState<TenderDraft[]>([]);
  const lastMethod = useRef<TenderMethod>('cash');
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState('');

  // ── device: offline queue and held bills ────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueuedBill[]>(readQueue);
  const queueRef = useRef(queue);
  const [syncNote, setSyncNote] = useState('');
  const [held, setHeld] = useState<HeldBill[]>(readHeld);
  const [showHeld, setShowHeld] = useState(false);

  // ── till ────────────────────────────────────────────────────────────────────────────────────
  const [floatText, setFloatText] = useState('');
  const [opening, setOpening] = useState(false);
  const [drawerMsg, setDrawerMsg] = useState('');
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<Closed | null>(null);
  const [shift, setShift] = useState<ZReport | null>(null);
  const [bills, setBills] = useState<ReceiptRow[] | null>(null);
  const [billNumber, setBillNumber] = useState('');
  const [listMsg, setListMsg] = useState('');

  const resetBasket = () => {
    setLines([]); setBuyer(emptyBuyer()); setCouponDraft(''); setGstinDraft(''); setNotes(''); setOverrideReason('');
    setQuote(null); setQuoteError(''); setLegs([]); setChargeError(''); setResults([]); setSearchMsg(null);
  };

  // ── search and scan ─────────────────────────────────────────────────────────────────────────
  const addHit = (h: Hit) => {
    scanFeedback(true);
    setResults([]);
    if (h.available <= 0) setSearchMsg({ warn: true, text: `${h.name}: the system shows none in stock here. The bill will note the shortfall.` });
    else setSearchMsg(null);
    setLines((c) => {
      const at = c.findIndex((l) => l.variationId === h.variation_id);
      if (at >= 0) return c.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { variationId: h.variation_id, productId: h.product_id ?? null, sku: h.sku ?? '', name: h.name, qty: 1, hint: h.price }];
    });
  };

  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearch = (q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const r = await searchCounter(term, outletId);
        if (seq === searchSeq.current) setResults(r.exact ? [r.exact] : r.items);
      } catch { /* keep the last results */ }
    }, 250);
  };

  /** Enter (a scanner gun's key): an exact code is added with no click; one result is added too. */
  const onScan = async (code: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    setSearchMsg(null);
    try {
      const r = await searchCounter(code, outletId);
      if (seq !== searchSeq.current) return;
      if (r.exact) { addHit(r.exact); return; }
      if (r.items.length === 1 && r.items[0].available > 0) { addHit(r.items[0]); return; }
      setResults(r.items);
      if (!r.items.length) { scanFeedback(false); setSearchMsg({ warn: false, text: `Nothing matches "${code}".` }); }
    } catch (e) {
      scanFeedback(false);
      setSearchMsg({ warn: false, text: say(e) });
    }
  };

  const setQty = (variationId: string, qty: number) =>
    setLines((c) => (qty <= 0 ? c.filter((l) => l.variationId !== variationId) : c.map((l) => (l.variationId === variationId ? { ...l, qty } : l))));

  // ── the price always comes from the server ──────────────────────────────────────────────────
  useEffect(() => {
    if (!lines.length) { setQuote(null); setQuoteError(''); setQuoting(false); return; }
    const mine = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteBasket(outletId, lines, buyer);
        if (mine === quoteSeq.current) { setQuote(q); setQuoteError(''); }
      } catch (e) {
        if (mine !== quoteSeq.current) return;
        setQuote(null);
        setQuoteError(unreachable(e) ? 'No network: the basket cannot be priced until it is back.' : say(e));
      } finally { if (mine === quoteSeq.current) setQuoting(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [lines, outletId, buyer.customerId, buyer.coupon, buyer.gstin]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalMinor = quote ? minorOf(quote.total) : 0;
  // A new total starts the payment again: one leg, the method used last, for the whole bill.
  useEffect(() => { setLegs(quote ? [leg(lastMethod.current, totalMinor)] : []); }, [quote ? totalMinor : null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (legs[0]) lastMethod.current = legs[0].method; }, [legs]);

  const priced = (variationId: string) => quote?.lines.find((l) => l.variation_id === variationId) ?? null;
  const st = quote ? tenderState(legs, totalMinor) : null;
  const blocked = (quote?.blocked ?? []).filter((b) => b.blocked);
  const managerNeeded = !!quote?.needs_manager;
  const managerBlocks = managerNeeded && !boot?.is_manager;
  const reasonMissing = managerNeeded && !!boot?.is_manager && !overrideReason.trim();
  const canCharge = !!quote && !quoting && !blocked.length && !managerBlocks && !reasonMissing && !!st?.ready && !charging;

  const charge = async () => {
    if (!canCharge || !quote) return;
    setCharging(true); setChargeError('');
    const clientRef = newRef();
    try {
      const bill = await ringBill({ outletId, lines, buyer, tenders: legs, notes, overrideReason, clientRef });
      scanFeedback(true);
      setSlip({ bill, closeLabel: 'New sale' });
      resetBasket();
      reload();
    } catch (e) {
      if (!unreachable(e)) { scanFeedback(false); setChargeError(say(e)); return; }
      if (buyer.gstin.trim()) { setChargeError('No network. A bill with a business GSTIN has to be rung online.'); return; }
      // Nobody answered: keep the bill on this device under its own reference. It has no number yet.
      const q: QueuedBill = { clientRef, capturedAt: new Date().toISOString(), outletId, lines, buyer, tenders: legs, notes, total: quote.total };
      const next = [...queueRef.current, q];
      queueRef.current = next; setQueue(next); writeQueue(next);
      setQueuedSlip(q);
      resetBasket();
    } finally { setCharging(false); }
  };

  const syncNow = async () => {
    const pending = queueRef.current;
    if (!pending.length) return;
    setSyncNote('Sending the queued bills...');
    try {
      const out = await syncQueue(pending);
      const ok = new Set(out.results.filter((r) => r.ok).map((r) => r.client_ref));
      const left = queueRef.current.filter((b) => !ok.has(b.clientRef));
      queueRef.current = left; setQueue(left); writeQueue(left);
      const numbers = out.results.filter((r) => r.ok && r.receipt_number).map((r) => r.receipt_number);
      const failed = out.results.filter((r) => !r.ok);
      setSyncNote([
        ok.size ? `${ok.size} bill${ok.size === 1 ? '' : 's'} numbered${numbers.length ? `: ${numbers.join(', ')}` : ''}.` : '',
        failed.length ? `${failed.length} still waiting: ${failed.map((f) => f.error ?? 'refused').join('; ')}` : '',
      ].filter(Boolean).join(' '));
      reload();
    } catch (e) {
      setSyncNote(unreachable(e) ? 'Still offline. The queued bills are kept on this device.' : say(e));
    }
  };
  useEffect(() => {
    const on = () => { syncNow(); };
    window.addEventListener('online', on);
    if (queueRef.current.length && typeof navigator !== 'undefined' && navigator.onLine) syncNow();
    return () => window.removeEventListener('online', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── hold and recall (this device) ───────────────────────────────────────────────────────────
  const parkCurrent = (list: HeldBill[]): HeldBill[] =>
    lines.length ? [...list, { id: newRef(), at: new Date().toISOString(), lines, buyer }] : list;
  const hold = () => {
    if (!lines.length) return;
    const next = parkCurrent(held);
    setHeld(next); writeHeld(next); resetBasket();
  };
  const recall = (h: HeldBill) => {
    const next = parkCurrent(held.filter((x) => x.id !== h.id));
    setHeld(next); writeHeld(next);
    resetBasket();
    setLines(h.lines); setBuyer(h.buyer); setCouponDraft(h.buyer.coupon); setGstinDraft(h.buyer.gstin);
    setShowHeld(false);
  };
  const dropHeld = (id: string) => { const next = held.filter((x) => x.id !== id); setHeld(next); writeHeld(next); };

  // ── till actions ────────────────────────────────────────────────────────────────────────────
  const doOpen = async () => {
    if (opening) return;
    setDrawerMsg('');
    if (boot?.outlets.length && !outletId) { setDrawerMsg('Pick which shop counter this drawer is for.'); return; }
    if (floatText.trim() === '' || !Number.isFinite(Number(floatText)) || Number(floatText) < 0) { setDrawerMsg('Enter the cash in the drawer now, 0 if empty.'); return; }
    setOpening(true);
    try {
      await openDrawer(rupeesOf(minorOf(floatText)), outletId);
      setFloatText(''); setClosed(null);
      await reload();
    } catch (e) { setDrawerMsg(say(e)); } finally { setOpening(false); }
  };

  const openBills = async () => {
    if (!boot?.session) return;
    setView('bills'); setBills(null); setListMsg('');
    try { setBills(await sessionBills(boot.session.id)); } catch (e) { setBills([]); setListMsg(say(e)); }
  };
  const openBill = async (n: string) => {
    const num = n.trim();
    if (!num) return;
    setListMsg('');
    try { setSlip({ bill: await getBill(num), closeLabel: 'Back' }); } catch (e) { setListMsg(say(e, 'No bill found for that number.')); }
  };
  const openShift = async () => {
    if (!boot?.session) return;
    setView('shift'); setShift(null); setListMsg('');
    try { setShift(await shiftReport(boot.session.id)); } catch (e) { setListMsg(say(e)); }
  };

  // ── screens ─────────────────────────────────────────────────────────────────────────────────
  const shell = (title: React.ReactNode, right: React.ReactNode, children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-gray-900 px-4 py-3 text-white">
        <span className="flex min-w-0 items-center gap-2 text-base font-semibold">{title}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs">{right}</span>
      </header>
      {children}
    </div>
  );
  const headBtn = 'rounded border border-white/20 px-2 py-1 hover:bg-white/10';
  const exit = <button type="button" onClick={() => navigate('/')} className={headBtn}>Exit</button>;

  if (slip) {
    return <BillSlip bill={slip.bill} isManager={!!boot?.is_manager} outletId={outletId} closeLabel={slip.closeLabel}
                     onClose={() => { setSlip(null); if (slip.closeLabel === 'Back' && view === 'bills') openBills(); }} />;
  }

  if (queuedSlip) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <style>{PRINT_CSS}</style>
        <div className="mx-auto mb-3 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The network is down. This bill is kept on this device and gets its number when the network is back.
        </div>
        <div id="pos-receipt" className="mx-auto max-w-xs rounded-lg border bg-white p-4 font-mono text-xs shadow-sm">
          <div className="text-center text-sm font-bold">SALE (NUMBER TO FOLLOW)</div>
          <div className="text-center text-[10px]">{formatDay(queuedSlip.capturedAt)} {formatTime(queuedSlip.capturedAt)}</div>
          <div className="my-2 border-t border-dashed" />
          {queuedSlip.lines.map((l) => (
            <div key={l.variationId} className="flex justify-between gap-2"><span className="min-w-0 flex-1 break-words">{l.name} x{l.qty}</span></div>
          ))}
          <div className="my-2 border-t border-dashed" />
          <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{fmtRupees(queuedSlip.total)}</span></div>
          {queuedSlip.tenders.map((t, i) => (
            <div key={i} className="flex justify-between"><span>{methodWord(t.method)}</span><span>{fmtRupees(rupeesOf(minorOf(t.amount)))}</span></div>
          ))}
        </div>
        <div className="mx-auto mt-4 flex max-w-xs gap-2">
          <button type="button" onClick={() => window.print()} className="flex-1 rounded-lg bg-gray-900 py-3 font-semibold text-white">Print</button>
          <button type="button" onClick={() => setQueuedSlip(null)} className="flex-1 rounded-lg border-2 bg-white py-3 font-semibold">New sale</button>
        </div>
      </div>
    );
  }

  if (!boot) {
    return shell(<><Store className="h-5 w-5 text-gray-300" /> Point of Sale</>, exit, (
      <main className="mx-auto w-full max-w-sm flex-1 space-y-3 p-6 text-center">
        {bootError
          ? <>
              <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{bootError}</div>
              <button type="button" onClick={() => reload()} className="w-full rounded-lg bg-gray-900 py-3 font-semibold text-white">Try again</button>
            </>
          : <div className="py-10 text-gray-500">Loading the counter...</div>}
      </main>
    ));
  }

  const session = boot.session;
  const outletName = session?.outlet_name || boot.outlets.find((o) => o.id === outletId)?.name || null;
  const syncBtn = queue.length > 0 && (
    <button type="button" onClick={syncNow} className="flex items-center gap-1 rounded border border-amber-300 bg-amber-500/20 px-2 py-1 text-amber-100">
      <CloudOff className="h-3.5 w-3.5" /> Sync {queue.length}
    </button>
  );
  const syncLine = syncNote && <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">{syncNote}</div>;

  // ── no open drawer: open one (and show the Z-report of the one just closed) ────────────────
  if (!session) {
    return shell(<><Store className="h-5 w-5 text-gray-300" /> Point of Sale</>, <>{syncBtn}{exit}</>, (
      <>
        {syncLine}
        <main className="mx-auto w-full max-w-sm flex-1 space-y-4 p-4 sm:p-6">
          {closed && <ShiftCard z={closed.z_report} journal={closed.journal} printable />}
          {queue.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {queue.length} bill{queue.length === 1 ? '' : 's'} rung offline still need a number. Open the drawer, then Sync.
            </div>
          )}
          <h2 className="text-lg font-bold">Open the drawer to start selling</h2>
          {drawerMsg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{drawerMsg}</div>}
          {boot.outlets.length > 0 && (
            <label className="block space-y-1">
              <span className="block text-sm text-gray-600">Which shop counter is this drawer for?</span>
              <select value={outletId ?? ''} onChange={(e) => pickOutlet(e.target.value || null)}
                      className="w-full rounded-lg border-2 bg-white px-3 py-3 text-lg font-semibold">
                <option value="">Select an outlet</option>
                {boot.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}{o.code ? ` (${o.code})` : ''}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="block text-sm text-gray-600">Cash in the drawer now (opening float)</span>
            <input inputMode="decimal" value={floatText} onChange={(e) => setFloatText(e.target.value)} placeholder="0"
                   onKeyDown={(e) => { if (e.key === 'Enter') doOpen(); }}
                   className="w-full rounded-lg border-2 px-3 py-3 text-center text-2xl font-bold" />
          </label>
          <button type="button" onClick={doOpen} disabled={opening} className="w-full rounded-lg bg-gray-900 py-4 text-lg font-bold text-white disabled:opacity-50">
            {opening ? 'Opening...' : 'Open drawer'}
          </button>
        </main>
      </>
    ));
  }

  if (view === 'return') {
    return <ReturnFlow outletId={outletId} onExit={() => { setView('sell'); reload(); }} />;
  }

  const back = <button type="button" onClick={() => { setView('sell'); reload(); }} className={headBtn}>Back to sale</button>;

  if (view === 'bills') {
    return shell(<>Bills this shift{outletName && <span className="rounded bg-white/15 px-2 py-0.5 text-xs">{outletName}</span>}</>, back, (
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-4">
        <div className="flex gap-2">
          <input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') openBill(billNumber); }}
                 placeholder="Any bill number, to reprint" aria-label="Bill number" className="min-w-0 flex-1 rounded-lg border-2 px-3 py-2" />
          <button type="button" onClick={() => openBill(billNumber)} className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Open</button>
        </div>
        {listMsg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{listMsg}</div>}
        {bills === null ? <div className="py-6 text-center text-gray-500">Loading...</div>
          : bills.length === 0 ? <div className="rounded-xl bg-white p-6 text-center text-gray-500 shadow-sm">No bills yet this shift.</div>
          : (
            <ul className="divide-y rounded-xl border bg-white shadow-sm">
              {bills.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => openBill(b.receipt_number)} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-semibold">{b.receipt_number}</span>
                      <span className="block text-xs text-gray-500">
                        {formatTime(b.created_at)} | {methodWord(b.payment_method)}{b.queued_offline ? ' | rung offline' : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`block font-bold ${b.voided_at ? 'text-gray-400 line-through' : ''}`}>{fmtRupees(b.total ?? b.amount)}</span>
                      {b.voided_at && <span className="block text-xs font-semibold text-red-700">Voided</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </main>
    ));
  }

  if (view === 'shift') {
    return shell(<>Shift so far{outletName && <span className="rounded bg-white/15 px-2 py-0.5 text-xs">{outletName}</span>}</>, back, (
      <main className="mx-auto w-full max-w-sm flex-1 space-y-3 p-4">
        {listMsg && <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{listMsg}</div>}
        {shift ? <ShiftCard z={shift} printable /> : !listMsg && <div className="py-6 text-center text-gray-500">Loading...</div>}
        {boot.is_manager && (
          <div className="space-y-1 rounded-xl border bg-white p-4 text-sm shadow-sm">
            <div className="font-bold">Counter rules</div>
            <div className="text-gray-600">
              Cashier discount limit {boot.config.max_cashier_discount != null ? `${boot.config.max_cashier_discount}%` : 'none'}.
              Drawer may be out by {fmtRupees(boot.config.variance_tolerance)} without a manager.
              Warn {boot.config.near_expiry_days} days before expiry.
              When in-date stock runs short and expired units are on record, the bill is {boot.config.allow_expired_fallback ? 'allowed' : 'stopped'}.
            </div>
            <button type="button" onClick={() => navigate('/settings?key=posConfig')} className="font-semibold text-blue-700 hover:underline">Change rules</button>
          </div>
        )}
      </main>
    ));
  }

  // ── selling ─────────────────────────────────────────────────────────────────────────────────
  const title = (
    <>
      <Store className="h-5 w-5 shrink-0 text-gray-300" /> <span className="truncate">Point of Sale</span>
      {outletName && <span className="truncate rounded bg-white/15 px-2 py-0.5 text-xs font-medium">{outletName}</span>}
    </>
  );
  const right = (
    <>
      <span className="hidden sm:inline">{session.receipt_count} bills | cash {fmtRupees(session.cash_taken)} | UPI and card {fmtRupees(session.digital_taken)}</span>
      {syncBtn}
      <button type="button" onClick={openBills} className={headBtn}>Bills</button>
      <button type="button" onClick={() => setView('return')} className={headBtn}>Return</button>
      <button type="button" onClick={openShift} className={headBtn}>Shift</button>
      <button type="button" onClick={() => setClosing((v) => !v)} className={headBtn}>Close drawer</button>
      {exit}
    </>
  );

  return shell(title, right, (
    <>
      {syncLine}
      {closing && (
        <CloseDrawer boot={boot} outletId={outletId} onCancel={() => setClosing(false)}
                     onClosed={(c) => { setClosed(c); setClosing(false); resetBasket(); reload(); }} />
      )}
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Scan or search</h2>
            {held.length > 0 && (
              <button type="button" onClick={() => setShowHeld((v) => !v)} className="flex items-center gap-1 rounded-lg border-2 bg-white px-3 py-1.5 text-sm font-semibold">
                <Play className="h-4 w-4" /> Held ({held.length})
              </button>
            )}
          </div>
          {showHeld && (
            <ul className="divide-y rounded-xl border bg-white shadow-sm">
              {held.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" onClick={() => recall(h)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{h.buyer.name || h.buyer.phone || 'Walk-in'}, {h.lines.reduce((s, l) => s + l.qty, 0)} items</span>
                    <span className="block truncate text-xs text-gray-500">Held at {formatTime(h.at)}: {h.lines.map((l) => l.name).join(', ')}</span>
                  </button>
                  <button type="button" onClick={() => dropHeld(h.id)} aria-label="Discard this held bill" className="rounded p-1 text-gray-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <ScanInput placeholder="Scan a barcode, or type a name, brand or SKU" onScan={onScan} onQueryChange={liveSearch} />
          {searchMsg && <div className={`rounded-lg px-4 py-3 ${searchMsg.warn ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>{searchMsg.text}</div>}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {results.map((r) => {
              const none = r.available <= 0;
              return (
                <button type="button" key={r.variation_id} onClick={() => addHit(r)} disabled={none}
                        className={`block w-full rounded-xl border-2 bg-white p-3 text-left shadow-sm active:border-gray-900 ${none ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="truncate font-mono text-xs text-gray-500">
                        {[r.sku, r.batch_number ? `batch ${r.batch_number}` : null, r.batch_expiry ? `exp ${formatDay(r.batch_expiry)}` : null].filter(Boolean).join(' | ')}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold">{fmtRupees(r.price)}</div>
                      {r.mrp != null && minorOf(r.mrp) > minorOf(r.price) && <div className="text-[11px] text-gray-400 line-through">{fmtRupees(r.mrp)}</div>}
                      <div className={`text-[11px] ${none ? 'text-red-600' : 'text-gray-400'}`}>{none ? 'none in stock' : `${r.available} in stock`}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Bill</h2>
            {lines.length > 0 && (
              <button type="button" onClick={hold} className="flex items-center gap-1 rounded-lg border-2 bg-white px-3 py-1.5 text-sm font-semibold">
                <Pause className="h-4 w-4" /> Hold
              </button>
            )}
          </div>
          {lines.length === 0 && <div className="rounded-xl bg-white p-6 text-center text-gray-500 shadow-sm">Scan something to start the sale.</div>}

          {/* What stops the bill comes first. */}
          {blocked.map((b) => <div key={b.variation_id + b.message} className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{b.message}</div>)}
          {managerBlocks && quote && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              This bill takes {quote.discount_percent}% off, above what a cashier may give
              {boot.config.max_cashier_discount != null ? ` (${boot.config.max_cashier_discount}%)` : ''}. A manager has to ring it.
            </div>
          )}
          {quoteError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{quoteError}</div>}
          {(quote?.warnings ?? []).map((w, i) => <div key={i} className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{w}</div>)}

          {lines.map((l) => {
            const p = priced(l.variationId);
            return (
              <div key={l.variationId} className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{l.name}</div>
                    <div className="truncate font-mono text-xs text-gray-500">
                      {l.sku}{p ? ` | ${fmtRupees(p.unit_price)}` : ''}{p?.mrp != null && minorOf(p.mrp) > minorOf(p.unit_price) ? ` (MRP ${fmtRupees(p.mrp)})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setQty(l.variationId, l.qty - 1)} aria-label="One less" className="h-10 w-10 rounded-lg border-2 text-lg font-bold">-</button>
                    <span className="w-8 text-center text-lg font-bold">{l.qty}</span>
                    <button type="button" onClick={() => setQty(l.variationId, l.qty + 1)} aria-label="One more" className="h-10 w-10 rounded-lg border-2 text-lg font-bold">+</button>
                  </div>
                  <div className="w-20 text-right font-bold">{p ? fmtRupees(p.line_total) : '...'}</div>
                </div>
              </div>
            );
          })}

          {lines.length > 0 && (
            <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
              {quote && minorOf(quote.discount) > 0 && (
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>Discount{quote.discount_reason ? ` (${quote.discount_reason})` : ''}</span><span>-{fmtRupees(quote.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{quote && !quoting ? fmtRupees(quote.total) : '...'}</span>
              </div>
              {quote && minorOf(quote.tax) > 0 && <div className="-mt-2 text-right text-xs text-gray-500">GST {fmtRupees(quote.tax)}</div>}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input placeholder="Customer name (optional)" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                       className="min-w-0 rounded-lg border-2 px-3 py-2" />
                <input placeholder="Phone (optional)" inputMode="tel" value={buyer.phone}
                       onChange={(e) => setBuyer({ ...buyer, phone: e.target.value, customerId: null })}
                       onBlur={async () => {
                         const hit = await customerByPhone(buyer.phone);
                         if (hit) setBuyer((b) => ({ ...b, customerId: hit.id, name: b.name.trim() ? b.name : hit.name ?? b.name }));
                       }}
                       className={`min-w-0 rounded-lg border-2 px-3 py-2 ${buyer.customerId ? 'border-emerald-500' : ''}`} />
                <div className="flex gap-1">
                  <input placeholder="Coupon" value={couponDraft} onChange={(e) => setCouponDraft(e.target.value)}
                         className="min-w-0 flex-1 rounded-lg border-2 px-3 py-2 uppercase" />
                  <button type="button" onClick={() => setBuyer({ ...buyer, coupon: buyer.coupon ? '' : couponDraft.trim() })}
                          disabled={!buyer.coupon && !couponDraft.trim()}
                          className="rounded-lg border-2 px-3 text-sm font-semibold disabled:opacity-40">{buyer.coupon ? 'Remove' : 'Apply'}</button>
                </div>
                <div className="flex gap-1">
                  <input placeholder="Business GSTIN (optional)" value={gstinDraft} onChange={(e) => setGstinDraft(e.target.value)}
                         className="min-w-0 flex-1 rounded-lg border-2 px-3 py-2 uppercase" />
                  <button type="button" onClick={() => setBuyer({ ...buyer, gstin: buyer.gstin ? '' : gstinDraft.trim() })}
                          disabled={!buyer.gstin && !gstinDraft.trim()}
                          className="rounded-lg border-2 px-3 text-sm font-semibold disabled:opacity-40">{buyer.gstin ? 'Remove' : 'Apply'}</button>
                </div>
              </div>

              {quote && <TenderPanel legs={legs} onChange={setLegs} totalMinor={totalMinor} denominations={boot.denominations} />}

              {managerNeeded && boot.is_manager && (
                <input placeholder={`Why ${quote?.discount_percent ?? ''}% off (kept on the bill)`} value={overrideReason} maxLength={200}
                       onChange={(e) => setOverrideReason(e.target.value)} className="w-full rounded-lg border-2 border-amber-400 px-3 py-2" />
              )}
              <input placeholder="Note on the bill (optional)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)}
                     className="w-full rounded-lg border-2 px-3 py-2 text-sm" />
              {chargeError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{chargeError}</div>}
              <button type="button" onClick={charge} disabled={!canCharge}
                      className="w-full rounded-lg bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {charging ? 'Charging...' : quote ? `Charge ${fmtRupees(quote.total)}` : 'Charge'}
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  ));
};

export default PosSurface;
