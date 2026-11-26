import React, { useEffect, useState } from 'react';
import { errorText } from '../../services/api';
import { fmtRupees } from '@/lib/money';
import { formatDate } from '../../utils/date';
import {
  STAGE_LABEL, chargeSplit, consignmentForShipment, gramsText, gsStatusText, paiseToRupees, type GsConsignment,
} from '@/lib/v2/growship';

const when = (d: unknown) => formatDate(d, 'dd MMM yyyy, HH:mm', '');

const Row: React.FC<{ k: React.ReactNode; v: React.ReactNode; strong?: boolean }> = ({ k, v, strong }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-muted-foreground">{k}</span>
    <span className={`tabular-nums text-right ${strong ? 'font-semibold' : ''}`}>{v}</span>
  </div>
);

/**
 * A Growcord Ship parcel inside the shipment drawer: what Growcord Ship charged for it, line by line
 * (freight, COD fee, return charges, adjustments, GST), and its own timeline of courier events. Read from
 * the shipper's door (`GET /api/v2/ship/consignments/{id}`) only while the drawer shows this parcel.
 */
const GrowshipParcelPanel: React.FC<{ shipment: any; awb: string | null }> = ({ shipment, awb }) => {
  const [parcel, setParcel] = useState<GsConsignment | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const shipmentId = shipment?._id ?? shipment?.id;

  useEffect(() => {
    let live = true;
    setParcel(undefined); setError(null);
    consignmentForShipment(shipment, awb)
      .then((c) => { if (live) setParcel(c); })
      .catch((e) => { if (live) { setParcel(null); setError(errorText(e, 'Growcord Ship could not be read for this parcel.')); } });
    return () => { live = false; };
    // The parcel is read again when another shipment opens, not on every render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, awb]);

  if (parcel === undefined && !error) {
    return <p className="text-sm text-muted-foreground">Reading Growcord Ship...</p>;
  }
  if (!parcel) {
    return <p className="text-sm text-muted-foreground">{error || 'Growcord Ship has no parcel for this shipment yet.'}</p>;
  }

  const charges = Array.isArray(parcel.charges) ? parcel.charges : [];
  const split = chargeSplit(charges);
  const events = Array.isArray(parcel.events) ? parcel.events : [];
  const change = parcel.final_sell != null && parcel.sell_with_gst != null
    ? Math.round((parcel.final_sell - parcel.sell_with_gst) * 100) / 100 : null;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground">Growcord Ship number</p>
          <p className="font-mono font-medium">{parcel.consignment_number || 'Not given'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Status there</p>
          <p className="font-medium">{gsStatusText(parcel.board_status || parcel.status)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Charged weight</p>
          <p className="font-medium">{gramsText(parcel.chargeable_weight_g) || 'Not given'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Zone</p>
          <p className="font-medium">{parcel.zone_code || 'Not given'}</p>
        </div>
      </div>

      <div className="space-y-1 rounded-md border p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">What Growcord Ship charged</p>
        {split.freight != null && <Row k="Freight" v={fmtRupees(split.freight)} />}
        {split.cod != null && <Row k="COD fee" v={fmtRupees(split.cod)} />}
        {split.rto != null && <Row k="Return (RTO)" v={fmtRupees(split.rto)} />}
        {split.other != null && <Row k="Other" v={fmtRupees(split.other)} />}
        {parcel.gst != null && <Row k="GST" v={fmtRupees(parcel.gst)} />}
        {parcel.sell_with_gst != null && <Row k="At booking, with GST" v={fmtRupees(parcel.sell_with_gst)} />}
        {parcel.final_sell != null && <Row k="Final" v={fmtRupees(parcel.final_sell)} strong />}
        {change != null && change !== 0 && (
          <p className="text-xs text-amber-800">
            {change > 0 ? `${fmtRupees(change)} more than at booking` : `${fmtRupees(-change)} less than at booking`} (weight, return or cancellation).
          </p>
        )}
        {charges.length === 0 && <p className="text-xs text-muted-foreground">No charge lines recorded on this parcel.</p>}
      </div>

      {charges.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Charge lines</p>
          <div className="space-y-1">
            {charges.map((c, i) => (
              <div key={c.id ?? i} className="flex items-start justify-between gap-3 border-l-2 border-slate-200 pl-2 text-xs">
                <span className="min-w-0">
                  <span className="font-medium">{c.label || String(c.kind ?? 'Charge').replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">, {STAGE_LABEL[String(c.stage ?? '')] ?? String(c.stage ?? '').replace(/_/g, ' ')}</span>
                  {c.basis && <span className="block text-muted-foreground">{c.basis}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{fmtRupees(paiseToRupees(c.amount_minor) ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Growcord Ship timeline</p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">No courier events yet.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((e, i) => (
              <li key={e.id ?? i} className="border-l-2 border-blue-200 pl-2 text-xs">
                <span className="font-medium">{e.label || gsStatusText(e.status)}</span>
                {e.location && <span className="text-muted-foreground">, {e.location}</span>}
                {e.description && <span className="block">{e.description}</span>}
                <span className="block text-muted-foreground">{[when(e.occurred_at), e.by].filter(Boolean).join(', ')}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default GrowshipParcelPanel;
