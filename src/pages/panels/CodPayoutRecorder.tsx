/**
 * Record a courier's COD payout against the parcels it pays for (owner, 23 Nov 2026: "where would I enter COD
 * payout against orders"). Choose who paid, the day, the bank reference and the amount received; the form lists
 * that courier's delivered COD parcels no payout names yet, each with its COD amount, its shipping charge and
 * what the courier kept from it, and sets the expected net against the amount received (short, over or equal).
 * Saving creates the payout through the same route as before (`POST /logistics/cod-remittances`), and the server
 * matches every line exactly; nothing here decides a match.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Btn, EmptyRow, Field, FilterBar, SearchInput, TableShell, TBody, Td, Th, THead, TextInput, Tr, DrillLink,
} from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';
import { formatDay, todayIso } from '../../utils/date';
import { majorToMinor, minorToMajor } from '@/lib/v2/money';
import { providerLabel } from '../../components/shipments/shipmentFacts';
import {
  LINK, codPayoutsAPI, money, type CodAwaitingParcel, type CodPayer,
} from '../payments/data';

/** How a payer is named on the payout and in the list (a provider code spelled out; a carrier as most often typed). */
export const payerName = (p: Pick<CodPayer, 'provider' | 'label' | 'key'>): string =>
  p.provider && p.provider !== 'manual' ? providerLabel(p.provider) : (p.label || p.key);

/** One ticked parcel: what the courier collected and kept, as typed (rupees). */
interface Draft { collected: string; codCharge: string; freight: string }
/** A parcel the list does not hold (not marked delivered yet, or booked elsewhere), typed by hand. */
interface Extra { awb: string; orderNumber: string; collected: string }

const rupees = (minor: number | null | undefined): string => (minor === null || minor === undefined ? '' : String(minorToMajor(minor, 'INR')));
const toMinor = (v: string): number | null => (v.trim() === '' ? 0 : majorToMinor(v.trim(), 'INR'));
const AMOUNT = /^\d+(\.\d{1,2})?$/;

interface Props {
  payers: CodPayer[];
  /** A payer to open with (its key), e.g. from the "awaiting payout" panel. */
  initialPayer?: string | null;
  /** An order to find and tick (from the order page). */
  initialOrderId?: string | null;
  onCreated: (remittanceId: string | null) => void;
  onCancel: () => void;
}

const CodPayoutRecorder: React.FC<Props> = ({ payers, initialPayer, initialOrderId, onCreated, onCancel }) => {
  const [payer, setPayer] = useState<string>(initialPayer ?? '');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [deducts, setDeducts] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [parcels, setParcels] = useState<CodAwaitingParcel[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadMsg, setLoadMsg] = useState('');
  const [ticked, setTicked] = useState<Record<string, Draft>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const chosen = payers.find((p) => p.key === payer) ?? null;

  // From the order page: find that order's parcel, open its payer, and tick it.
  useEffect(() => {
    if (!initialOrderId) return;
    let live = true;
    codPayoutsAPI.awaiting({ order_id: initialOrderId })
      .then((a) => {
        if (!live) return;
        const first = a.items[0];
        if (!first) { setLoadMsg('That order has no delivered COD parcel waiting for a payout (it may already be on one, or not be marked delivered yet).'); return; }
        if (first.payer_key) setPayer(first.payer_key);
        setTicked((t) => ({ ...t, [first.shipment_id]: draftOf(first, false) }));
        setSearch(first.order_number ?? '');
      })
      .catch((e) => { if (live) setLoadMsg(e?.response?.data?.message ?? e.message); });
    return () => { live = false; };
  }, [initialOrderId]);

  const load = useCallback(() => {
    if (!payer) { setParcels(null); return; }
    setParcels(null); setLoadMsg('');
    codPayoutsAPI.awaiting({ courier: payer, from: from || undefined, to: to || undefined, limit: 500 })
      .then((a) => { setParcels(a.items); setTotal(a.total); })
      .catch((e) => { setParcels([]); setLoadMsg(e?.response?.data?.message ?? e.message); });
  }, [payer, from, to]);
  useEffect(() => { load(); }, [load]);

  /** A parcel's default figures: collected = its COD amount; the courier's charges only when it keeps them. */
  function draftOf(p: CodAwaitingParcel, keeps: boolean): Draft {
    const cod = p.ship_charge_cod_minor ?? 0;
    const freight = p.ship_charge_minor !== null ? Math.max(0, p.ship_charge_minor - cod) : 0;
    return {
      collected: rupees(p.cod_minor),
      codCharge: keeps ? rupees(cod) : '0',
      freight: keeps ? rupees(freight) : '0',
    };
  }

  const setDeductsAll = (keeps: boolean) => {
    setDeducts(keeps);
    const byId = new Map((parcels ?? []).map((p) => [p.shipment_id, p]));
    setTicked((t) => Object.fromEntries(Object.entries(t).map(([id, d]) => {
      const p = byId.get(id);
      return [id, p ? { ...draftOf(p, keeps), collected: d.collected } : d];
    })));
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = parcels ?? [];
    return q ? list.filter((p) => [p.order_number, p.awb, p.shipment_number].some((v) => String(v ?? '').toLowerCase().includes(q))) : list;
  }, [parcels, search]);

  const toggle = (p: CodAwaitingParcel, on: boolean) => setTicked((t) => {
    const n = { ...t };
    if (on) n[p.shipment_id] = draftOf(p, deducts); else delete n[p.shipment_id];
    return n;
  });
  const tickShown = (on: boolean) => setTicked((t) => {
    const n = { ...t };
    for (const p of shown) { if (on) n[p.shipment_id] = n[p.shipment_id] ?? draftOf(p, deducts); else delete n[p.shipment_id]; }
    return n;
  });
  const edit = (id: string, patch: Partial<Draft>) => setTicked((t) => ({ ...t, [id]: { ...t[id], ...patch } }));

  // The money: every figure in paise, from what is typed (never a float product).
  const lines = useMemo(() => {
    const byId = new Map((parcels ?? []).map((p) => [p.shipment_id, p]));
    return Object.entries(ticked).map(([id, d]) => {
      const p = byId.get(id) ?? null;
      const collected = toMinor(d.collected); const codCharge = toMinor(d.codCharge); const freight = toMinor(d.freight);
      const ok = collected !== null && codCharge !== null && freight !== null && [d.collected, d.codCharge, d.freight].every((v) => v.trim() === '' || AMOUNT.test(v.trim()));
      return { id, p, d, ok, collected: collected ?? 0, codCharge: codCharge ?? 0, freight: freight ?? 0, net: (collected ?? 0) - (codCharge ?? 0) - (freight ?? 0) };
    });
  }, [ticked, parcels]);
  const extraLines = extras.map((x) => ({ x, ok: (x.awb.trim() || x.orderNumber.trim()) !== '' && AMOUNT.test(x.collected.trim()), collected: toMinor(x.collected) ?? 0 }));
  const sum = (f: (l: typeof lines[number]) => number) => lines.reduce((a, l) => a + f(l), 0);
  const collectedTotal = sum((l) => l.collected) + extraLines.reduce((a, l) => a + l.collected, 0);
  const keptTotal = sum((l) => l.codCharge + l.freight);
  const expected = collectedTotal - keptTotal;
  const shipTotal = lines.reduce((a, l) => a + (l.p?.ship_charge_minor ?? 0), 0);
  const received = AMOUNT.test(amount.trim()) ? majorToMinor(amount.trim(), 'INR') : null;
  const diff = received === null ? null : received - expected;
  const count = lines.length + extraLines.length;

  const save = async () => {
    setMsg('');
    if (!payer && extras.length === 0) { setMsg('Choose who paid this payout.'); return; }
    if (!paidOn) { setMsg('Enter the day the money reached your bank.'); return; }
    if (received === null) { setMsg('Enter the amount received in rupees, as on the bank credit (for example 12450.50).'); return; }
    if (count === 0) { setMsg('Tick the parcels this payout covers, or add one by hand.'); return; }
    if (lines.some((l) => !l.ok) || extraLines.some((l) => !l.ok)) { setMsg('Every amount must be in rupees with at most two decimals, and every hand-typed line needs an AWB or order number.'); return; }
    if (lines.some((l) => l.net < 0)) { setMsg('A parcel cannot keep more in charges than the cash collected on it.'); return; }
    setBusy(true);
    try {
      // Who paid: the chosen courier, else the first ticked parcel's (its provider, or its carrier's name).
      const first = lines[0]?.p ?? null;
      const courierName = chosen ? payerName(chosen)
        : first ? (first.provider && first.provider !== 'manual' ? providerLabel(first.provider) : (first.courier_name ?? 'Other'))
          : 'Other';
      const body = {
        courier: courierName,
        reference: reference.trim() || null,
        remittedOn: paidOn,
        remittedAmount: String(minorToMajor(received, 'INR')),
        note: note.trim() || null,
        lines: [
          ...lines.map((l) => ({
            awb: l.p?.awb ?? null,
            orderNumber: l.p?.order_number ?? null,
            codAmount: String(minorToMajor(l.collected, 'INR')),
            courierCodCharge: String(minorToMajor(l.codCharge, 'INR')),
            freightDeducted: String(minorToMajor(l.freight, 'INR')),
          })),
          ...extraLines.map((l) => ({
            awb: l.x.awb.trim() || null,
            orderNumber: l.x.orderNumber.trim() || null,
            codAmount: String(minorToMajor(l.collected, 'INR')),
          })),
        ],
      };
      const r = payload<{ id?: string }>(await api.post('/logistics/cod-remittances', body));
      onCreated(r?.id ?? null);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? e.message);
    } finally {
      setBusy(false);
    }
  };

  const allShownTicked = shown.length > 0 && shown.every((p) => ticked[p.shipment_id]);

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Record a COD payout</h3>
        <Btn variant="ghost" onClick={onCancel}><X className="h-4 w-4" />Close</Btn>
      </div>
      <p className="text-xs text-gray-500">
        Pick who paid you, then tick the parcels this payout covers. Each line starts at the parcel&apos;s COD amount; if the courier kept its charges from the money, tick the box and check what it kept per parcel.
      </p>

      <FilterBar>
        <Field label="Paid by *">
          <select value={payer} onChange={(e) => { setPayer(e.target.value); setTicked({}); setSearch(''); }}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 pr-8 text-sm" aria-label="Who paid this payout">
            <option value="">Choose the courier</option>
            {payers.map((p) => (
              <option key={p.key} value={p.key}>{payerName(p)} ({p.parcels} parcel{p.parcels === 1 ? '' : 's'}, {money(p.cod_minor, 'INR')} waiting)</option>
            ))}
          </select>
        </Field>
        <Field label="Received on *"><TextInput type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="Bank reference / UTR"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="as on the bank credit" /></Field>
        <Field label="Amount received (Rs) *"><TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={amount.trim() && !AMOUNT.test(amount.trim()) ? 'border-red-400' : ''} /></Field>
      </FilterBar>

      {payer && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={deducts} onChange={(e) => setDeductsAll(e.target.checked)} />
              The courier kept its charges from this payout
              <InfoTip text="Ticked: each parcel's freight and COD charge (from its shipping charge) are taken off what it pays you. Leave it off when the charges are billed separately, as with a prepaid wallet." />
            </label>
            <Field label="Delivered from"><TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Delivered to"><TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="Find" className="min-w-[12rem] flex-1"><SearchInput value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Order number or AWB" /></Field>
          </div>

          {loadMsg && <p className="text-xs text-amber-700">{loadMsg}</p>}
          {parcels && total > parcels.length && (
            <p className="text-xs text-amber-700">Showing the oldest {parcels.length} of {total} parcels waiting. Narrow the delivery dates to reach the rest.</p>
          )}

          <TableShell maxHeight="55vh">
            <table className="w-full text-sm">
              <THead>
                <Th><input type="checkbox" checked={allShownTicked} onChange={(e) => tickShown(e.target.checked)} aria-label="Tick every parcel shown" /></Th>
                <Th>Order / AWB</Th><Th>Delivered</Th>
                <Th num><span className="inline-flex items-center gap-1">Shipping charge <InfoTip text="What the parcel cost to ship: its courier quote at booking, or what was entered for your own carrier." /></span></Th>
                <Th num>Cash collected</Th>
                <Th num>COD charge kept</Th>
                <Th num>Freight kept</Th>
                <Th num>Net expected</Th>
              </THead>
              <TBody>
                {parcels === null ? (
                  <EmptyRow colSpan={8}>Loading the parcels waiting for a payout...</EmptyRow>
                ) : shown.length === 0 ? (
                  <EmptyRow colSpan={8}>{parcels.length === 0 ? 'No delivered COD parcel of this courier is waiting for a payout.' : 'Nothing matches the search.'}</EmptyRow>
                ) : shown.map((p) => {
                  const d = ticked[p.shipment_id];
                  const l = d ? lines.find((x) => x.id === p.shipment_id) : null;
                  const cell = (k: keyof Draft, label: string) => (
                    <TextInput inputMode="decimal" className={`w-24 text-right ${d && d[k].trim() && !AMOUNT.test(d[k].trim()) ? 'border-red-400' : ''}`}
                      value={d ? d[k] : ''} disabled={!d} onChange={(e) => edit(p.shipment_id, { [k]: e.target.value } as Partial<Draft>)} aria-label={`${label}, ${p.order_number ?? p.awb ?? ''}`} />
                  );
                  return (
                    <Tr key={p.shipment_id} className={d ? 'bg-emerald-50/40' : ''}>
                      <Td><input type="checkbox" checked={!!d} onChange={(e) => toggle(p, e.target.checked)} aria-label={`Tick ${p.order_number ?? p.awb ?? p.shipment_number}`} /></Td>
                      <Td>
                        {p.order_id ? <DrillLink to={LINK.order(p.order_id)}>{p.order_number ?? 'Open order'}</DrillLink> : <span>{p.order_number ?? 'No order'}</span>}
                        {p.awb && <span className="block font-mono text-[11px] text-gray-400">{p.awb}</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-gray-600">{p.delivered_at ? formatDay(p.delivered_at) : 'Not dated'}</Td>
                      <Td num muted>
                        {p.ship_charge_minor !== null ? money(p.ship_charge_minor, 'INR') : 'Not recorded'}
                        {p.ship_charge_cod_minor !== null && <span className="block text-[11px]">incl. COD {money(p.ship_charge_cod_minor, 'INR')}</span>}
                      </Td>
                      <Td num>{d ? cell('collected', 'Cash collected') : money(p.cod_minor, 'INR')}</Td>
                      <Td num>{d ? cell('codCharge', 'COD charge kept') : ''}</Td>
                      <Td num>{d ? cell('freight', 'Freight kept') : ''}</Td>
                      <Td num className="font-medium">{l ? money(l.net, 'INR') : ''}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>
        </>
      )}

      {/* A parcel the list does not hold: not marked delivered yet, or booked in a courier's own panel. */}
      {extras.length > 0 && (
        <TableShell>
          <table className="w-full text-sm">
            <THead><Th>Tracking / AWB</Th><Th>or Order number</Th><Th num>Cash collected (Rs)</Th><Th> </Th></THead>
            <TBody>
              {extras.map((x, i) => (
                <Tr key={i}>
                  <Td><TextInput value={x.awb} onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, awb: e.target.value } : y)))} placeholder="courier AWB" aria-label={`Extra parcel ${i + 1} tracking number`} /></Td>
                  <Td><TextInput value={x.orderNumber} onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, orderNumber: e.target.value } : y)))} placeholder="order number" aria-label={`Extra parcel ${i + 1} order number`} /></Td>
                  <Td num><TextInput inputMode="decimal" className="w-28 text-right" value={x.collected} onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, collected: e.target.value } : y)))} placeholder="0.00" aria-label={`Extra parcel ${i + 1} cash collected`} /></Td>
                  <Td><Btn variant="ghost" aria-label="Remove this line" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Btn></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}

      {/* The tie-out before saving: what the ticked parcels should bring in, against what reached the bank. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <span>{count} parcel{count === 1 ? '' : 's'}</span>
        <span>Collected <strong className="tabular-nums">{money(collectedTotal, 'INR')}</strong></span>
        <span>Courier kept <strong className="tabular-nums">{money(keptTotal, 'INR')}</strong></span>
        <span>Expected net <strong className="tabular-nums">{money(expected, 'INR')}</strong></span>
        <span>Received <strong className="tabular-nums">{received === null ? 'not entered' : money(received, 'INR')}</strong></span>
        {diff !== null && count > 0 && (
          diff === 0
            ? <span className="font-medium text-emerald-700">Matches to the paisa</span>
            : <span className="font-medium text-red-700">{diff < 0 ? `Short by ${money(-diff, 'INR')}` : `Over by ${money(diff, 'INR')}`}</span>
        )}
        {shipTotal > 0 && <span className="text-gray-500">Shipping charges on these parcels: {money(shipTotal, 'INR')}</span>}
      </div>

      <FilterBar>
        <Field label="Note" className="min-w-[14rem] flex-1"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field>
      </FilterBar>

      {msg && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="outline" onClick={() => setExtras((xs) => [...xs, { awb: '', orderNumber: '', collected: '' }])}><Plus className="h-4 w-4" />Add a parcel by hand</Btn>
        <Btn variant="success" disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save payout and match</Btn>
        {diff !== null && diff !== 0 && count > 0 && (
          <span className="text-xs text-amber-700">It can be saved and checked; it is reconciled only once it ties out.</span>
        )}
        {paidOn && <span className="text-xs text-gray-500">Received {formatDay(paidOn)}</span>}
      </div>
    </div>
  );
};

export default CodPayoutRecorder;
