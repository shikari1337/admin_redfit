import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, MapPin, Phone, RotateCcw, Undo2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, shipmentsAPI, errorText } from '../../services/api';
import { usePincodeLookup } from '../../hooks/usePincodeLookup';
import { isoDaysFromToday } from '../../utils/date';
import {
  type NdrAction, customerAnswerLine, ndrActionsFor, ndrRefusal, ndrCustomerAnswerOf, ndrDetailsOf, ndrOutcome, ndrPhoneOf, shipmentAwb,
} from './shipmentFacts';

/**
 * A failed delivery's answers (SHIP-NDR, owner 25 Nov 2026: "NDR management properly for all"): one button per answer
 * the carrier takes, and one dialog that asks what each answer needs (a phone, an address, a day, a reason), sends it
 * and says honestly whether the courier was told. Used on the board's rows and in the shipment drawer.
 */

export const NDR_BUTTONS: Record<NdrAction, { label: string; title: string; icon: React.ElementType; tone: string }> = {
  reattempt: { label: 'Re-attempt', title: 'Re-attempt delivery', icon: RotateCcw, tone: 'text-orange-700 hover:text-orange-800 hover:bg-orange-50' },
  reschedule: { label: 'Another day', title: 'Ask the courier to deliver on a day you choose', icon: CalendarClock, tone: 'text-amber-800 hover:text-amber-900 hover:bg-amber-50' },
  change_phone: { label: 'New phone', title: 'Update the delivery phone number', icon: Phone, tone: 'text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50' },
  change_address: { label: 'New address', title: 'Correct the delivery address', icon: MapPin, tone: 'text-blue-700 hover:text-blue-800 hover:bg-blue-50' },
  rto: { label: 'Return', title: 'Stop delivery and return the parcel', icon: Undo2, tone: 'text-red-700 hover:text-red-800 hover:bg-red-50' },
};

/** The answers this parcel's carrier takes, as small labelled buttons; nothing when none apply. */
export const NdrActionButtons: React.FC<{ shipment: any; onPick: (action: NdrAction) => void; className?: string }> = ({ shipment, onPick, className }) => {
  const acts = ndrActionsFor(shipment);
  if (acts.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {acts.map((a) => {
        const b = NDR_BUTTONS[a];
        const Icon = b.icon;
        const refused = ndrRefusal(shipment, a);
        return (
          <Button key={a} type="button" variant="outline" size="sm" onClick={() => onPick(a)} disabled={refused !== null} title={refused ?? b.title} className={`h-7 gap-1 px-2 text-xs ${b.tone}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {b.label}
          </Button>
        );
      })}
    </div>
  );
};

export interface NdrTarget { shipment: any; action: NdrAction }

interface Addr { name: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string }
const EMPTY_ADDR: Addr = { name: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };

const TITLES: Record<NdrAction, string> = {
  reattempt: 'Re-attempt delivery',
  reschedule: 'Deliver on another day',
  change_phone: 'New delivery phone',
  change_address: 'Correct the delivery address',
  rto: 'Return the parcel',
};
const SUBMIT: Record<NdrAction, string> = {
  reattempt: 'Re-attempt',
  reschedule: 'Deliver on this day',
  change_phone: 'Save phone',
  change_address: 'Save address',
  rto: 'Return the parcel',
};

const firstText = (...vals: unknown[]): string => {
  for (const v of vals) { if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number') return String(v); }
  return '';
};

const isIndia = (country: string | null | undefined): boolean => !country || /^(IN|IND|INDIA)$/i.test(country.trim());

interface NdrActionDialogProps {
  /** The parcel and the answer picked; null when closed. */
  target: NdrTarget | null;
  onClose: () => void;
  /** Called after the server took the answer, so the screen behind can reload. */
  onDone?: () => void;
}

export const NdrActionDialog: React.FC<NdrActionDialogProps> = ({ target, onClose, onDone }) => {
  const shipment = target?.shipment ?? null;
  const action = target?.action ?? null;
  const id: string = shipment ? String(shipment._id ?? shipment.id ?? '') : '';
  const dest: string | null = shipment ? (shipment.destinationCountry ?? shipment.destination_country ?? null) : null;
  const india = isIndia(dest);
  const ndr = ndrDetailsOf(shipment);
  const answer = ndrCustomerAnswerOf(shipment);

  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [addr, setAddr] = useState<Addr>(EMPTY_ADDR);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const pinEdited = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ notified: boolean; text: string; detail: string | null } | null>(null);

  // A fresh form for every parcel and answer, filled with what is already known.
  useEffect(() => {
    if (!target) return;
    const s = target.shipment;
    const ans = ndrCustomerAnswerOf(s);
    setError(null); setOutcome(null); setSubmitting(false); setRemarks(''); setPrefillNote(null);
    pinEdited.current = false;
    setPhone(ndrPhoneOf(s) ?? (ans?.action === 'change_phone' ? ans.phone ?? '' : ''));
    setDate(isoDaysFromToday(1));
    const fromAnswer = ans?.action === 'change_address' && !!ans.address;
    setAddr({ ...EMPTY_ADDR, line1: fromAnswer ? ans!.address ?? '' : '', landmark: fromAnswer ? ans!.landmark ?? '' : '' });
    if (target.action !== 'change_address') return;
    const orders: any[] = Array.isArray(s?.orders) ? s.orders : [];
    const first = orders[0];
    const orderId = first && typeof first === 'object' ? (first._id ?? first.id) : first;
    if (!orderId) {
      if (fromAnswer) setPrefillNote('Filled from the customer\'s answer. Add the rest.');
      return;
    }
    let live = true;
    setPrefilling(true);
    api.get(`/orders/${orderId}`)
      .then((res: any) => {
        if (!live) return;
        const o = res?.data?.data ?? res?.data ?? {};
        const a = o.shippingAddress ?? o.shipping_address;
        if (!a || typeof a !== 'object') return;
        setAddr((cur) => ({
          name: cur.name || firstText(a.fullName, a.full_name, a.name, o.customerName),
          line1: cur.line1 || firstText(a.address, a.line1, a.addressLine1, a.address_line1),
          line2: cur.line2 || firstText(a.addressLine2, a.address_line2, a.line2),
          landmark: cur.landmark || firstText(a.landmark),
          city: cur.city || firstText(a.city, a.district),
          state: cur.state || firstText(a.state),
          pincode: cur.pincode || firstText(a.pincode, a.postalCode, a.postal_code),
        }));
        setPrefillNote(fromAnswer
          ? 'Filled from the customer\'s answer and the order\'s address. Check it before saving.'
          : 'Filled from the order\'s address. Correct what is wrong.');
      })
      .catch(() => { if (live && fromAnswer) setPrefillNote('Filled from the customer\'s answer. Add the rest.'); })
      .finally(() => { if (live) setPrefilling(false); });
    return () => { live = false; };
  }, [target]);

  // A PIN code typed here fills its district and state (India Post through the backend, as every address form does).
  const pin = usePincodeLookup(addr.pincode, !!target && action === 'change_address' && india);
  useEffect(() => {
    const r = pin.result;
    if (!r) return;
    setAddr((cur) => ({
      ...cur,
      city: pinEdited.current || !cur.city ? (r.district || cur.city) : cur.city,
      state: pinEdited.current || !cur.state ? (r.state || cur.state) : cur.state,
    }));
  }, [pin.result]);

  const setField = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (k === 'pincode') pinEdited.current = true;
    const v = e.target.value;
    setAddr((cur) => ({ ...cur, [k]: v }));
  };

  const submit = async () => {
    if (!id || !action) return;
    setError(null);
    let call: () => Promise<any>;
    switch (action) {
      case 'reattempt':
        call = () => shipmentsAPI.ndrReattempt(id);
        break;
      case 'reschedule':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Pick the day the courier should deliver.'); return; }
        if (date < isoDaysFromToday(1)) { setError('Pick a day from tomorrow on.'); return; }
        call = () => shipmentsAPI.ndrReschedule(id, date, remarks.trim() || undefined);
        break;
      case 'change_phone': {
        const p = phone.replace(/[\s-]/g, '');
        if (!/^\+?\d{8,15}$/.test(p)) { setError('Enter the phone number with 8 to 15 digits, for example 9876543210 or +919876543210.'); return; }
        call = () => shipmentsAPI.ndrUpdatePhone(id, p);
        break;
      }
      case 'change_address': {
        const a = Object.fromEntries(Object.entries(addr).map(([k, v]) => [k, v.trim()])) as unknown as Addr;
        if (!a.line1) { setError('Enter the address line the courier should deliver to.'); return; }
        if (!a.pincode) { setError(india ? 'Enter the 6-digit PIN code.' : 'Enter the postal code.'); return; }
        if (india && !/^\d{6}$/.test(a.pincode)) { setError('A PIN code has 6 digits.'); return; }
        if (!a.city) { setError('Enter the city or district.'); return; }
        if (!a.state) { setError('Enter the state.'); return; }
        call = () => shipmentsAPI.ndrChangeAddress(id, {
          name: a.name || undefined, line1: a.line1, line2: a.line2 || undefined, landmark: a.landmark || undefined,
          city: a.city, state: a.state, pincode: a.pincode,
        });
        break;
      }
      case 'rto':
        if (!remarks.trim()) { setError('Say why the parcel goes back; the reason is kept in its history and sent to the courier.'); return; }
        call = () => shipmentsAPI.ndrRequestRto(id, remarks.trim());
        break;
      default:
        return;
    }
    setSubmitting(true);
    try {
      const res = await call();
      setOutcome(ndrOutcome(res, action));
      onDone?.();
    } catch (e: any) {
      setError(errorText(e, 'The courier\'s answer could not be sent.'));
    } finally {
      setSubmitting(false);
    }
  };

  const awb = shipment ? shipmentAwb(shipment) : null;

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        {action && shipment && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLES[action]}</DialogTitle>
              <DialogDescription>
                {[shipment.shipmentNumber ?? shipment.shipment_number, awb ? `AWB ${awb}` : null].filter(Boolean).join(', ')}
              </DialogDescription>
            </DialogHeader>

            {outcome ? (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-3 text-sm ${outcome.notified ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
                {outcome.notified ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                <div className="space-y-1">
                  <p className="font-medium">{outcome.text}</p>
                  {outcome.detail && <p className="text-xs opacity-80">{outcome.detail}</p>}
                  {!outcome.notified && <p className="text-xs">Call the courier and give them the same answer, so the parcel is not sent back.</p>}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 py-1 text-sm">
                {(ndr?.reason || answer) && (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-0.5">
                    {ndr?.reason && <p><span className="text-muted-foreground">Courier's reason: </span>{ndr.reason}{ndr.attempts != null ? `, attempt ${ndr.attempts}` : ''}</p>}
                    {answer && <p><span className="text-muted-foreground">Customer answered: </span>{customerAnswerLine(answer)}</p>}
                  </div>
                )}

                {action === 'reattempt' && (
                  <p className="text-muted-foreground">The courier tries to deliver this parcel again, and it moves back to In Transit.</p>
                )}

                {action === 'reschedule' && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-date">Deliver on *</Label>
                      <Input id="ndr-date" type="date" value={date} min={isoDaysFromToday(1)} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-remarks">Note for the courier</Label>
                      <Textarea id="ndr-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional, for example: customer is home after 5 pm" />
                    </div>
                  </>
                )}

                {action === 'change_phone' && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="ndr-phone">Phone the courier should call *</Label>
                    <Input id="ndr-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
                    <p className="text-xs text-muted-foreground">Kept on the shipment either way; the courier is told when it takes phone changes.</p>
                  </div>
                )}

                {action === 'change_address' && (
                  <>
                    {prefilling && <p className="text-xs text-muted-foreground">Reading the order's address...</p>}
                    {!prefilling && prefillNote && <p className="text-xs text-muted-foreground">{prefillNote}</p>}
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-name">Name</Label>
                      <Input id="ndr-name" value={addr.name} onChange={setField('name')} autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-line1">Address *</Label>
                      <Input id="ndr-line1" value={addr.line1} onChange={setField('line1')} placeholder="House, street, area" autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-line2">Address line 2</Label>
                      <Input id="ndr-line2" value={addr.line2} onChange={setField('line2')} autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-landmark">Landmark</Label>
                      <Input id="ndr-landmark" value={addr.landmark} onChange={setField('landmark')} autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="ndr-pin">{india ? 'PIN code *' : 'Postal code *'}</Label>
                        <Input id="ndr-pin" value={addr.pincode} onChange={setField('pincode')} inputMode={india ? 'numeric' : 'text'} maxLength={india ? 6 : 12} autoComplete="off" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="ndr-city">City *</Label>
                        <Input id="ndr-city" value={addr.city} onChange={setField('city')} autoComplete="off" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="ndr-state">State *</Label>
                        <Input id="ndr-state" value={addr.state} onChange={setField('state')} autoComplete="off" />
                      </div>
                    </div>
                    {india && pin.loading && <p className="text-xs text-muted-foreground">Looking up the PIN code...</p>}
                    {india && pin.error && <p className="text-xs text-amber-700">{pin.error} Fill the city and state yourself.</p>}
                  </>
                )}

                {action === 'rto' && (
                  <>
                    <p className="text-muted-foreground">The courier stops trying to deliver it and returns it to you.</p>
                    <div className="grid gap-1.5">
                      <Label htmlFor="ndr-rto">Why it goes back *</Label>
                      <Textarea id="ndr-rto" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="For example: the customer refused the parcel" />
                      {ndr?.reason && !remarks.trim() && (
                        <button type="button" className="justify-self-start text-xs text-blue-700 hover:underline" onClick={() => setRemarks(ndr.reason ?? '')}>
                          Use the courier's reason: {ndr.reason}
                        </button>
                      )}
                    </div>
                  </>
                )}

                {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
              </div>
            )}

            <DialogFooter>
              {outcome ? (
                <Button type="button" onClick={onClose}>Close</Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
                  <Button type="button" variant={action === 'rto' ? 'destructive' : 'default'} onClick={submit} disabled={submitting || (action === 'change_address' && prefilling)}>
                    {submitting ? 'Sending...' : SUBMIT[action]}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NdrActionDialog;
