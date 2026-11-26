import React, { useEffect, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { packagesAPI, errorText } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtRupees } from '@/lib/money';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, SectionCard, TableShell, THead, Th, TBody, Tr, Td, EmptyRow, Btn, Field, SelectInput, TextInput, Chip,
} from '../../components/erp';
import {
  growshipAPI, gramsText, isNotEnabled, paiseToRupees, type GsLocation, type GsQuote, type GsRateCard,
} from '@/lib/v2/growship';

const PIN = /^\d{6}$/;

/**
 * Price a parcel before booking it (owner 26 Nov 2026: Growcord Ship's own rate calculator): from a pickup
 * address or any pincode to a pincode, its weight and box, prepaid or cash on delivery, courier by courier with
 * each price's parts, from Growcord Ship's own quote (`POST /api/v2/ship/quote`, nothing is saved). Below it,
 * the rate cards this store's account is priced on.
 */
const GrowshipRates: React.FC = () => {
  const { hasPerm } = useAuth();
  const canQuote = hasPerm('shipments.manage');
  const [locations, setLocations] = useState<GsLocation[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [cards, setCards] = useState<GsRateCard[] | null>(null);
  const [cardsError, setCardsError] = useState<string | null>(null);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [weightKg, setWeightKg] = useState('0.5');
  const [boxId, setBoxId] = useState('');
  const [dims, setDims] = useState({ l: '', b: '', h: '' });
  const [mode, setMode] = useState<'prepaid' | 'cod'>('prepaid');
  const [cod, setCod] = useState('');
  const [declared, setDeclared] = useState('');

  const [quote, setQuote] = useState<GsQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    growshipAPI.locations()
      .then((l) => {
        const active = l.filter((x) => x.is_active !== false && x.pincode);
        setLocations(active);
        if (active[0]?.pincode) setOrigin(String(active[0].pincode));
      })
      .catch(() => setLocations([]));
    growshipAPI.rateCards()
      .then(setCards)
      .catch((e) => { setCards([]); setCardsError(isNotEnabled(e) ? 'Growcord Ship is not switched on for this store yet.' : errorText(e, 'The rate cards could not be read.')); });
    packagesAPI.getAll()
      .then((r: any) => setBoxes(Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : []))
      .catch(() => setBoxes([]));
  }, []);

  const pickBox = (id: string) => {
    setBoxId(id);
    const b = boxes.find((x) => String(x._id ?? x.id) === id);
    if (b) setDims({ l: String(b.length ?? b.lengthCm ?? ''), b: String(b.breadth ?? b.widthCm ?? ''), h: String(b.height ?? b.heightCm ?? '') });
  };

  const ready = PIN.test(origin) && PIN.test(destination) && parseFloat(weightKg) > 0 && (mode === 'prepaid' || parseFloat(cod) > 0);

  const run = async () => {
    if (!ready) return;
    setBusy(true); setError(null); setQuote(null);
    const cm = (v: string) => (parseFloat(v) > 0 ? parseFloat(v) * 10 : undefined);
    try {
      setQuote(await growshipAPI.quote({
        origin_pincode: origin,
        destination_pincode: destination,
        weight_g: parseFloat(weightKg) * 1000,
        length_mm: cm(dims.l), breadth_mm: cm(dims.b), height_mm: cm(dims.h),
        payment_mode: mode,
        cod_amount: mode === 'cod' ? parseFloat(cod) : undefined,
        declared_value: parseFloat(declared) > 0 ? parseFloat(declared) : undefined,
      }));
    } catch (e) {
      setError(isNotEnabled(e) ? 'Growcord Ship is not switched on for this store yet. Switch it on in Shipping settings.' : errorText(e, 'Growcord Ship could not price this parcel.'));
    } finally {
      setBusy(false);
    }
  };

  const options = [...(quote?.options ?? [])].sort((a, b) => (Number(a.sell_with_gst) || 0) - (Number(b.sell_with_gst) || 0));
  const refused = [...(quote?.not_serviceable ?? []), ...(quote?.rejected ?? [])];

  return (
    <Page>
      <PageHeader
        icon={Calculator}
        title="Rate calculator"
        description="What a parcel costs with Growcord Ship, courier by courier, before you book it. Nothing is booked or saved here."
      />

      <SectionCard title="The parcel">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From pincode">
            <div className="space-y-1">
              {locations.length > 0 && (
                <SelectInput value={locations.some((l) => l.pincode === origin) ? origin : ''} onChange={(e) => setOrigin(e.target.value)} aria-label="Pickup address">
                  <option value="">Type a pincode below</option>
                  {locations.map((l) => <option key={l.id} value={String(l.pincode)}>{[l.label || l.code, l.city, l.pincode].filter(Boolean).join(', ')}</option>)}
                </SelectInput>
              )}
              <TextInput inputMode="numeric" maxLength={6} value={origin} onChange={(e) => setOrigin(e.target.value.replace(/\D/g, ''))} placeholder="6 digits" aria-label="From pincode" />
            </div>
          </Field>
          <Field label="To pincode">
            <TextInput inputMode="numeric" maxLength={6} value={destination} onChange={(e) => setDestination(e.target.value.replace(/\D/g, ''))} placeholder="6 digits" aria-label="To pincode" />
          </Field>
          <Field label="Weight (kg)">
            <TextInput inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} aria-label="Weight in kg" />
          </Field>
          <Field label="Box">
            <SelectInput value={boxId} onChange={(e) => pickBox(e.target.value)} aria-label="Box">
              <option value="">Type the size</option>
              {boxes.map((b) => <option key={b._id ?? b.id} value={String(b._id ?? b.id)}>{b.name || 'Box'}, {b.length ?? b.lengthCm} x {b.breadth ?? b.widthCm} x {b.height ?? b.heightCm} cm</option>)}
            </SelectInput>
          </Field>
          <Field label="Length, breadth, height (cm)">
            <div className="flex gap-1">
              {(['l', 'b', 'h'] as const).map((k) => (
                <TextInput key={k} inputMode="decimal" className="w-20" value={dims[k]} placeholder={k === 'l' ? 'L' : k === 'b' ? 'B' : 'H'}
                  aria-label={k === 'l' ? 'Length in cm' : k === 'b' ? 'Breadth in cm' : 'Height in cm'}
                  onChange={(e) => { setBoxId(''); setDims((d) => ({ ...d, [k]: e.target.value })); }} />
              ))}
            </div>
          </Field>
          <Field label="Payment">
            <SelectInput value={mode} onChange={(e) => setMode(e.target.value as 'prepaid' | 'cod')} aria-label="Payment">
              <option value="prepaid">Prepaid</option>
              <option value="cod">Cash on delivery</option>
            </SelectInput>
          </Field>
          {mode === 'cod' && (
            <Field label="COD amount (Rs)">
              <TextInput inputMode="decimal" value={cod} onChange={(e) => setCod(e.target.value)} aria-label="Cash to collect in rupees" />
            </Field>
          )}
          <Field label="Parcel value (Rs, optional)">
            <TextInput inputMode="decimal" value={declared} onChange={(e) => setDeclared(e.target.value)} aria-label="Parcel value in rupees" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn onClick={run} disabled={!ready || busy || !canQuote}>
            {busy ? <Loader2 className="animate-spin" /> : <Calculator />} Get prices
          </Btn>
          {!canQuote && <span className="text-sm text-amber-800">Pricing needs the shipments.manage permission, the same as booking.</span>}
          {canQuote && !ready && <span className="text-sm text-gray-500">Enter both pincodes, the weight{mode === 'cod' ? ' and the COD amount' : ''}.</span>}
        </div>
      </SectionCard>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {quote && (
        <SectionCard
          flush
          title={`Prices${quote.zone_code ? `, zone ${quote.zone_code}` : ''}${quote.chargeable_weight_g ? `, charged as ${gramsText(quote.chargeable_weight_g)}` : ''}`}
          description={quote.allocation_reason ? `When you let Growcord Ship choose: ${quote.allocation_reason}` : undefined}
        >
          <TableShell className="rounded-none border-0 shadow-none">
            <table className="w-full text-sm">
              <THead>
                <Th>Courier</Th><Th>Mode</Th><Th num>Days</Th><Th>Charged weight</Th><Th>Price parts</Th><Th num>Before GST</Th><Th num>GST</Th><Th num>Total</Th>
              </THead>
              <TBody>
                {options.length === 0 && <EmptyRow colSpan={8}>{quote.empty_reason || 'No courier can take this parcel on this lane.'}</EmptyRow>}
                {options.map((o, i) => (
                  <Tr key={o.offer_id ?? `${o.courier_code}-${o.service_code}-${i}`}>
                    <Td>
                      <div className="font-medium">{o.courier_name || o.courier_code}</div>
                      <div className="text-xs text-gray-500">{o.service_name || o.service_code}</div>
                      {i === 0 && <Chip tone="green">Cheapest</Chip>}
                    </Td>
                    <Td className="capitalize">{o.mode || ''}</Td>
                    <Td num>{o.tat_days ? o.tat_days : ''}</Td>
                    <Td className="text-xs">
                      {gramsText(o.chargeable_weight_g)}
                      {o.volumetric_weight_g && o.dead_weight_g && o.volumetric_weight_g > o.dead_weight_g ? <div className="text-gray-500">by size ({gramsText(o.volumetric_weight_g)})</div> : null}
                    </Td>
                    <Td className="text-xs">
                      {(o.sell_lines ?? []).map((l, j) => (
                        <div key={j} title={l.basis ?? undefined}>
                          {l.label || String(l.kind ?? '').replace(/_/g, ' ')}: {fmtRupees(paiseToRupees(l.amount_minor) ?? 0)}
                        </div>
                      ))}
                    </Td>
                    <Td num>{o.sell != null ? fmtRupees(o.sell) : ''}</Td>
                    <Td num>{o.gst != null ? fmtRupees(o.gst) : ''}</Td>
                    <Td num className="font-semibold">{o.sell_with_gst != null ? fmtRupees(o.sell_with_gst) : ''}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          {refused.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-600">
              <p className="mb-1 font-semibold text-gray-700">Not offered on this lane</p>
              {refused.map((r, i) => (
                <div key={i}>{[r.courier_code, r.service_code].filter(Boolean).join(' ')}: {r.reason}</div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard flush title="Your rate cards" description="The prices your Growcord Ship plan uses.">
        <TableShell className="rounded-none border-0 shadow-none">
          <table className="w-full text-sm">
            <THead><Th>Card</Th><Th>Plan</Th><Th>How it prices</Th><Th>GST</Th><Th>Valid</Th></THead>
            <TBody>
              {cards === null && <EmptyRow colSpan={5}>Reading...</EmptyRow>}
              {cards && cards.length === 0 && <EmptyRow colSpan={5}>{cardsError || 'No rate card is set for this account. Prices come from the plan.'}</EmptyRow>}
              {(cards ?? []).map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.name || 'Rate card'}</Td>
                  <Td>{c.plan_code || ''}</Td>
                  <Td>{c.basis || (c.pricing === 'tariff' ? 'Fixed tariff' : 'Priced per parcel at booking')}</Td>
                  <Td>{c.prices_include_gst ? 'Included' : 'Added'}</Td>
                  <Td className="text-xs">{[formatDate(c.valid_from, 'dd MMM yyyy', ''), c.valid_to ? formatDate(c.valid_to, 'dd MMM yyyy', '') : 'no end'].filter(Boolean).join(' to ')}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>
    </Page>
  );
};

export default GrowshipRates;
