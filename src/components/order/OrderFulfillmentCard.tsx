import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from '../../utils/date';

interface FulfillmentLine {
  sku: string;
  name: string;
  ordered: number;
  shipped: number;
  remaining: number;
}

interface OrderShipmentRow {
  id: string;
  shipmentNumber?: string;
  shipment_number?: string;
  status: string;
  shippingProvider?: string;
  shipping_provider?: string;
  trackingUrl?: string;
  tracking_url?: string;
  awb?: string | null;
  courier?: string | null;
  items?: Array<{ sku: string; name: string; quantity: number }> | null;
  isPartial?: boolean;
  is_partial?: boolean;
  createdAt?: string;
  created_at?: string;
}

interface Props {
  fulfillment?: {
    total_qty: number;
    shipped_qty: number;
    fully_shipped: boolean;
    partially_shipped: boolean;
    lines: FulfillmentLine[];
  } | null;
  /** Omit to render the progress summary alone — the parcels live elsewhere. */
  shipments?: OrderShipmentRow[] | null;
  sla?: {
    hours: number;
    expectedShipBy?: string;
    expected_ship_by?: string;
    pending: boolean;
    breached: boolean;
  } | null;
  /**
   * `inline` drops the Card chrome so this can sit as one column of the
   * addresses footer strip, beside "Invoiced by".
   */
  variant?: 'card' | 'inline';
}

/**
 * Fulfillment picture for one order: how many units are on their way, which
 * parcel carries what, and whether the store is inside its dispatch SLA.
 */
const OrderFulfillmentCard: React.FC<Props> = ({ fulfillment, shipments, sla, variant = 'card' }) => {
  if (!fulfillment && !(shipments?.length) && !sla) return null;
  const f = fulfillment;
  const pct = f && f.total_qty > 0 ? Math.round((f.shipped_qty / f.total_qty) * 100) : 0;
  const expectedShipBy = sla?.expectedShipBy ?? sla?.expected_ship_by;

  if (variant === 'inline') {
    return (
      <div>
        <h3 className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Fulfilment
          {f && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
              f.fully_shipped ? 'bg-emerald-100 text-emerald-700'
                : f.partially_shipped ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'}`}>
              {f.fully_shipped ? 'Fully shipped' : f.partially_shipped ? 'Part shipped' : 'Not shipped'}
            </span>
          )}
        </h3>
        {f && f.total_qty > 0 && (
          <>
            <p className="font-semibold tabular-nums text-slate-900">
              {f.shipped_qty} of {f.total_qty} units shipped
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </>
        )}
        {sla?.pending && (
          <p className={`mt-1 font-medium ${sla.breached ? 'text-red-700' : 'text-emerald-700'}`}>
            {sla.breached ? 'Dispatch SLA breached — ' : ''}
            ship by {formatDate(expectedShipBy, 'dd MMM, HH:mm', 'N/A')}
          </p>
        )}
        {(shipments?.length ?? 0) > 0 && (
          <div className="mt-1 space-y-0.5">
            {shipments!.map((sh) => {
              const trackingUrl = sh.trackingUrl ?? sh.tracking_url;
              return (
                <p key={sh.id} className="text-slate-600">
                  <span className="font-medium text-slate-800">{sh.shipmentNumber ?? sh.shipment_number ?? sh.id}</span>
                  <span className="capitalize"> · {String(sh.status).replace(/_/g, ' ')}</span>
                  {sh.awb && (trackingUrl
                    ? <> · <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-blue-700 hover:underline">{sh.awb}</a></>
                    : <> · <span className="font-mono">{sh.awb}</span></>)}
                </p>
              );
            })}
          </div>
        )}
        {/* Lines still waiting — the actual question a part-shipped order raises. */}
        {f?.partially_shipped && (
          <div className="mt-1 space-y-0.5 text-slate-500">
            {f.lines.filter((l) => l.remaining > 0).map((l) => (
              <p key={l.sku || l.name}>Awaiting: {l.name} × {l.remaining}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="px-4 py-2.5 border-b">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Fulfillment</span>
          {f && (
            <Badge className={f.fully_shipped
              ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25'
              : f.partially_shipped
                ? 'bg-blue-500/15 text-blue-700 border-blue-200 hover:bg-blue-500/25'
                : 'bg-yellow-500/15 text-yellow-700 border-yellow-200 hover:bg-yellow-500/25'}>
              {f.fully_shipped ? 'Fully shipped' : f.partially_shipped ? 'Partially shipped' : 'Not shipped'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {f && f.total_qty > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Units shipped</span>
              <span className="font-semibold">{f.shipped_qty} of {f.total_qty}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            {/* ── LINE BY LINE ────────────────────────────────────────────
                What shipped and what is still owed, per item. The old version
                printed only a list of "Awaiting shipment: X × 2" lines, so a
                part-shipped order never showed what HAD gone — you could see
                the debt but not the delivery. Rendered whenever anything has
                shipped, not only on a partial, because "all 3 of 3 went in
                parcel 1" is the answer to the same question. */}
            {f.lines.length > 0 && (f.partially_shipped || f.shipped_qty > 0) && (
              <div className="mt-3 overflow-hidden rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">Item</th>
                      <th className="px-2 py-1.5 text-center font-semibold">Ordered</th>
                      <th className="px-2 py-1.5 text-center font-semibold">Shipped</th>
                      <th className="px-2 py-1.5 text-center font-semibold">To ship</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {f.lines.map((l) => (
                      <tr key={l.sku || l.name} className={l.remaining > 0 ? '' : 'text-muted-foreground'}>
                        <td className="px-2 py-1.5">
                          <span className="font-medium text-foreground">{l.name}</span>
                          {l.sku && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{l.sku}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{l.ordered}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{l.shipped || '—'}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">
                          {l.remaining > 0
                            ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{l.remaining}</span>
                            : <span className="font-semibold text-green-600" title="Fully shipped">✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {sla && (
          <div className={`text-sm rounded-md px-3 py-2 ${
            !sla.pending ? 'bg-muted text-muted-foreground'
            : sla.breached ? 'bg-red-50 text-red-700'
            : 'bg-green-50 text-green-700'
          }`}>
            {sla.pending ? (
              <>
                {sla.breached ? '⚠ Dispatch SLA breached — ' : ''}
                Ship by <span className="font-semibold">{formatDate(expectedShipBy, 'MMM dd, yyyy HH:mm', 'N/A')}</span>
                <span className="text-xs"> ({sla.hours}h SLA)</span>
              </>
            ) : (
              <>Dispatch SLA: {sla.hours}h — met</>
            )}
          </div>
        )}

        {(shipments?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Parcels ({shipments!.length})</p>
            {shipments!.map((s) => {
              const number = s.shipmentNumber ?? s.shipment_number ?? s.id;
              const provider = s.shippingProvider ?? s.shipping_provider ?? '';
              const trackingUrl = s.trackingUrl ?? s.tracking_url;
              const created = s.createdAt ?? s.created_at;
              const partial = s.isPartial ?? s.is_partial;
              return (
                <div key={s.id} className="border rounded-md px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{number}</span>
                    <span className="flex items-center gap-2">
                      {partial && <Badge variant="outline" className="text-[10px]">PART</Badge>}
                      <Badge variant="secondary" className="capitalize text-[10px]">{String(s.status).replace(/_/g, ' ')}</Badge>
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    <span className="capitalize">{provider}{s.courier ? ` · ${s.courier}` : ''}</span>
                    {s.awb && (
                      trackingUrl
                        ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">{s.awb}</a>
                        : <span className="font-mono">{s.awb}</span>
                    )}
                    {created && <span>{formatDate(created, 'MMM dd, HH:mm', '')}</span>}
                  </div>
                  {Array.isArray(s.items) && s.items.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderFulfillmentCard;
