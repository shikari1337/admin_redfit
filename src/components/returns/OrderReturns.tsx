import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inrMinor, Chip } from '../../components/erp';
import { formatDate, formatDateTime } from '../../utils/date';
import ReturnPhotos, { type ReturnPhoto } from './ReturnPhotos';
import ReturnCharges from './ReturnCharges';
import { TrackingLink, carrierOf, spaced, type ReturnPickupView } from './ReturnPickup';
import { RESOLUTION_META, STATUS_LABEL, STATUS_TONE, wordsFor } from './returnWords';

/**
 * THE ORDER'S RETURNS (RET-PICKUP-2 §3, owner 17 Nov 2026: "on order detail page it should show the detials of
 * returns too"). `GET /orders/{id}/returns` answers every return raised on the order, newest first, each the
 * desk's own view: lines, reason, photos, the collection, the charges and the settlement. The return number opens
 * it on the returns desk; the collection's tracking events sit with the order's parcels (OrderFulfillmentCard).
 */

/** The order's returns, read once per order. A refusal (returns off, no permission) is kept as `error`. */
export function useOrderReturns(orderRef: string | null | undefined, enabled = true) {
  const [items, setItems] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const ref = (orderRef ?? '').trim();
    if (!enabled || !ref) { setItems([]); setError(''); return; }
    setLoading(true); setError('');
    try {
      const d = payload<any>(await api.get(`/orders/${encodeURIComponent(ref)}/returns`));
      const list = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
      setItems(list);
      // The words for reasons and goods outcomes, only when there is a return to word.
      if (list.length > 0) api.get('/returns/meta').then((r) => setMeta(payload<any>(r))).catch(() => setMeta(null));
    } catch (e: any) {
      setItems([]);
      setError(e?.response?.data?.message || e?.message || 'Could not read the returns on this order.');
    } finally { setLoading(false); }
  }, [orderRef, enabled]);

  useEffect(() => { load(); }, [load]);
  return { items, meta, loading, error, reload: load };
}

/** Every collection attempt of the order's returns, as parcels for the order's package picture. */
export interface ReturnParcel { returnId: string; returnNumber: string; pickup: ReturnPickupView }
export const returnParcelsOf = (returns: any[]): ReturnParcel[] =>
  (returns ?? []).flatMap((r) => {
    const all: ReturnPickupView[] = Array.isArray(r?.pickups) && r.pickups.length ? r.pickups : r?.pickup ? [r.pickup] : [];
    return all.map((p) => ({ returnId: String(r.id), returnNumber: r.return_number ?? String(r.id ?? '').slice(0, 8), pickup: p }));
  });

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium break-words">{children}</dd>
  </div>
);

const short = (id?: string | null) => (id ? `${String(id).slice(0, 8)}...` : null);

/** One return on the order page. */
const OrderReturnItem: React.FC<{ r: any; meta: any }> = ({ r, meta }) => {
  const res = RESOLUTION_META[r.resolution] ?? RESOLUTION_META.undecided;
  const reasons: any[] = meta?.return_reasons ?? meta?.returnReasons ?? [];
  const reasonWords = (code?: string | null, text?: string | null) =>
    reasons.find((x) => x.code === code)?.label ?? text ?? spaced(code) ?? '';
  const lines: any[] = Array.isArray(r.lines) ? r.lines : [];
  const photos: ReturnPhoto[] = [
    ...(Array.isArray(r.photos) ? r.photos : []),
    ...lines.flatMap((l) => (Array.isArray(l?.photos) ? l.photos : [])),
  ];
  const p: ReturnPickupView | null = r.pickup ?? null;
  const settled = !!r.credit_note_id || !!r.settled_at;

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/returns?open=${encodeURIComponent(String(r.id))}`}
                className="font-mono text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
            {r.return_number ?? short(r.id)} <ExternalLink className="h-3 w-3" />
          </Link>
          <Chip tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? spaced(r.status)}</Chip>
          <Chip tone={res.tone}>{res.label}</Chip>
          {r.qc_outcome && (
            <Chip tone="red">Denied after inspection, goods {wordsFor(meta?.qc_outcomes ?? meta?.qcOutcomes, r.qc_outcome).toLowerCase()}</Chip>
          )}
        </div>
        {r.created_at && <span className="text-xs text-muted-foreground">Raised {formatDate(r.created_at, 'dd MMM yyyy')}</span>}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <Row label="Reason">{reasonWords(r.reason_code, r.reason) || 'Not given'}</Row>
        <Row label="Items">
          {lines.length === 0 ? 'None listed' : (
            <ul className="space-y-0.5">
              {lines.map((l) => (
                <li key={l.id} className="font-normal">
                  {l.name ?? l.sku ?? 'Item'} x {l.qty_expected ?? 0}
                  {Number(l.qty_received) > 0 && <span className="text-muted-foreground">, {l.qty_received} received</span>}
                  {l.reason_code && l.reason_code !== r.reason_code && (
                    <span className="text-muted-foreground">, {reasonWords(l.reason_code)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Row>
      </dl>

      {photos.length > 0 && <ReturnPhotos photos={photos} size="sm" label="Photos" />}

      <div className="rounded-md border border-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground mb-1">Collection</p>
        {p ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
            <Row label="Carrier"><span className="capitalize">{carrierOf(p) || 'Not known yet'}</span></Row>
            <Row label="AWB">{p.awb ? <span className="font-mono">{p.awb}</span> : 'Not assigned yet'}</Row>
            <Row label="Tracking">{p.tracking_url ? <TrackingLink url={p.tracking_url} /> : 'No link yet'}</Row>
            <Row label="Status">
              <span className="capitalize">{spaced(p.tracking_status || p.status) || 'No update yet'}</span>
            </Row>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No collection booked.</p>
        )}
      </div>

      {(Array.isArray(r.charges) && r.charges.length > 0) && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Charges</p>
          <ReturnCharges returnId={String(r.id)} charges={r.charges} totalMinor={r.charges_total_minor} editable={false} />
        </div>
      )}

      <div className="rounded-md border border-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground mb-1">Settlement</p>
        {settled ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
            <Row label="Credit note">{short(r.credit_note_id) ?? 'None'}</Row>
            <Row label="Refund request">{short(r.refund_request_id) ?? 'None, no cash moved'}</Row>
            <Row label="Replacement order">
              {r.replacement_order_id
                ? <Link to={`/orders/${r.replacement_order_id}`} className="text-primary hover:underline">View order</Link>
                : 'None'}
            </Row>
            <Row label="Net amount">{r.refund_amount_minor != null ? inrMinor(Number(r.refund_amount_minor)) : 'Not recorded'}</Row>
            {r.settled_at && <Row label="Settled">{formatDateTime(r.settled_at)}</Row>}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {r.qc_outcome ? 'Denied: nothing is credited or refunded.' : 'Not settled yet.'}
          </p>
        )}
      </div>
    </div>
  );
};

/** The order page's card. Nothing is drawn while the order has no returns. */
export const OrderReturnsCard: React.FC<{ items: any[]; meta?: any; loading?: boolean; error?: string }> = ({
  items, meta, loading, error,
}) => {
  if (!loading && !error && items.length === 0) return null;
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Returns on this order{items.length > 0 ? ` (${items.length})` : ''}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each return raised on this order: what is coming back and why, the collection, the charges and the settlement.
        </p>
      </div>
      {loading ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">Reading the returns on this order.</p>
      ) : error ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">The returns could not be read: {error}</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((r) => <OrderReturnItem key={r.id} r={r} meta={meta} />)}
        </div>
      )}
    </section>
  );
};
