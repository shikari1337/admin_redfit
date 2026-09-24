import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Boxes, MapPin, PackageCheck, Printer, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { ordersAPI } from '../../services/api';
import type { FulfilmentGuidance, FulfilmentGuidanceLine } from '../../services/api';
import { localeDateTime } from '../../utils/date';

/**
 * THE WAREHOUSE CARD — "where is this order, physically?"
 *
 * ⚠️ NOT to be confused with `OrderFulfillmentCard.tsx` (double "l", American
 * spelling), which is the SHIPMENT picture: how many units are on their way,
 * which parcel carries what, and the dispatch SLA. Both are real and both
 * belong on this page; they answer different questions. This one is the FLOOR:
 * has it been picked, has it been packed, what is it in, how much does it
 * weigh, where on the shelves are its goods, and can I print the label again.
 * The two names differing by one letter is a genuine hazard — the component
 * exported here is called `WarehouseFulfilmentCard` so no import can be
 * ambiguous (see WS-D.md §5).
 *
 * ── IT ASKS, IT DOES NOT CLAIM ──────────────────────────────────────────────
 * `GET /orders/:id/fulfilment-guidance` takes no lock and writes nothing, so
 * opening an order never reserves its stock. Only raising a pick list does.
 *
 * ── IT SAYS "NOT BINNED" OUT LOUD ───────────────────────────────────────────
 * This store has no bin data (0 rows of `bin_stock`, live), so the honest answer
 * for nearly every line today is *"not binned; stock is in the general pool"*.
 * That sentence is printed, with the pooled figure beside it — never an empty
 * row and never a bin that was guessed at.
 */

interface Props {
  orderId: string;
  /** The floor's own home, for a "work on this" link. Absent = no link shown. */
  wmsUrl?: string | null;
}

const kg = (g?: number | null) => (g == null ? null : `${(Number(g) / 1000).toFixed(3)} kg`);

const WarehouseFulfilmentCard: React.FC<Props> = ({ orderId, wmsUrl }) => {
  const [data, setData] = useState<FulfilmentGuidance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await ordersAPI.fulfilmentGuidance(orderId));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not read where this order’s goods are.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { if (orderId) void load(); }, [orderId, load]);

  // Pick state and parcels ride the SAME response as the guidance — one call,
  // one picture, no second endpoint to fall out of step with it.
  const pick = data?.pick ?? null;
  const sealed = (data?.parcels ?? []).filter((p) => p.status !== 'packing');

  const print = async (parcelId: string) => {
    setPrinting(parcelId);
    setPrintError(null);
    const problem = await ordersAPI.openParcelLabel(parcelId);
    if (problem) setPrintError(problem);
    setPrinting(null);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          Fulfilment
        </CardTitle>
        <div className="flex items-center gap-1">
          {wmsUrl && (
            <a
              href={wmsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Open the floor
            </a>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* ── the three states of an order on the floor ───────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <Stage
            label="Picked"
            done={pick?.status === 'completed'}
            detail={
              pick?.status === 'completed'
                ? (pick.reference || (pick.completed_at ? localeDateTime(pick.completed_at) : 'done'))
                : pick?.status
                  ? `pick list ${pick.status}`
                  : 'no pick list'
            }
          />
          <Stage
            label="Packed"
            done={sealed.length > 0}
            detail={sealed.length ? `${sealed.length} parcel${sealed.length === 1 ? '' : 's'}` : 'not boxed yet'}
          />
          <Stage
            label="Labelled"
            done={sealed.some((p) => (p.label_print_count ?? 0) > 0)}
            detail={
              sealed.some((p) => (p.label_print_count ?? 0) > 0)
                ? 'printed'
                : sealed.length ? 'not printed' : '—'
            }
          />
        </div>

        {/* ── the parcels ─────────────────────────────────────────────────── */}
        {sealed.length > 0 && (
          <div className="space-y-2">
            {sealed.map((p) => {
              const net = p.weight_g != null && p.tare_g != null ? p.weight_g - p.tare_g : null;
              return (
                <div key={p.id} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{p.parcel_code}</span>
                    {p.awb
                      ? <Badge variant="secondary" className="text-[10px]">{p.awb}</Badge>
                      : p.shipment_number
                        ? <Badge variant="secondary" className="text-[10px]">{p.shipment_number}</Badge>
                        : <Badge variant="outline" className="text-[10px]">no courier — self delivery</Badge>}
                    <span className="ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={printing === p.id}
                        onClick={() => void print(p.id)}
                      >
                        {printing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                        {(p.label_print_count ?? 0) > 0 ? 'Reprint label' : 'Print label'}
                      </Button>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.box_name || p.box_code || 'no box recorded'}
                    {p.length_cm && p.breadth_cm && p.height_cm ? ` · ${p.length_cm}×${p.breadth_cm}×${p.height_cm} cm` : ''}
                    {p.weight_g ? ` · ${kg(p.weight_g)} gross` : ' · not weighed'}
                    {net != null ? ` · ${kg(net)} net` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.packed_by_name ? `Packed by ${p.packed_by_name}` : 'Packed'}
                    {p.packed_at ? ` · ${localeDateTime(p.packed_at)}` : ''}
                    {(p.label_print_count ?? 0) > 1
                      ? ` · label printed ${p.label_print_count} times${p.label_printed_at ? `, last ${localeDateTime(p.label_printed_at)}` : ''}`
                      : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {printError && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {printError}
          </p>
        )}

        {/* ── where the goods are ─────────────────────────────────────────── */}
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Where to find it
          </div>

          {loading && <p className="text-xs text-muted-foreground">Reading the shelves…</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}

          {data && (
            <>
              <p className="text-xs text-muted-foreground">
                {data.summary}
                {data.warehouse_name ? ` · ${data.warehouse_name}` : ''}
              </p>
              {data.withheld.map((w) => (
                <p key={w} className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w}
                </p>
              ))}
              <div className="mt-2 space-y-2">
                {data.lines.map((l) => <GuidanceLine key={l.order_item_id ?? l.sku} line={l} />)}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Reading this page does not reserve anything — only raising a pick list does.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

function Stage({ label, done, detail }: { label: string; done: boolean; detail: string }) {
  return (
    <div className={`rounded-md border p-2 ${done ? 'border-emerald-200 bg-emerald-50' : 'bg-muted/30'}`}>
      <div className="flex items-center gap-1 text-xs font-semibold">
        <PackageCheck className={`h-3.5 w-3.5 ${done ? 'text-emerald-600' : 'text-muted-foreground'}`} />
        {label}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function GuidanceLine({ line }: { line: FulfilmentGuidanceLine }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-xs font-semibold">{line.sku}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{line.name}</span>
        <span className="text-xs">× {line.ordered}</span>
      </div>

      {line.state === 'binned' ? (
        <ul className="mt-1 space-y-0.5">
          {line.locations.map((loc) => (
            <li key={`${loc.location_id}-${loc.batch_id ?? 'nobatch'}`} className="text-xs">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {loc.walk_order}
              </span>{' '}
              <span className="font-mono font-semibold">{loc.bin_code}</span>
              {loc.aisle_code ? <span className="text-muted-foreground"> · aisle {loc.aisle_code}</span> : null}
              <span className="text-muted-foreground">
                {' '}· take {loc.take} of {loc.qty_here}
                {loc.batch_number ? ` · batch ${loc.batch_number}` : ' · no batch'}
                {loc.expiry_date ? ` · expires ${loc.expiry_date}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {line.note}
          {line.pool_available != null && line.state === 'pool' ? (
            <> — {line.pool_available} available{line.pool_source === 'legacy_column' ? ' (not ledgered yet)' : ''}</>
          ) : null}
        </p>
      )}

      {line.note && line.state === 'binned' && (
        <p className="mt-1 text-xs text-amber-700">{line.note}</p>
      )}
      {line.short > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {line.short} unit{line.short === 1 ? '' : 's'} cannot be covered from stock anywhere.
        </p>
      )}
    </div>
  );
}

export default WarehouseFulfilmentCard;
export { WarehouseFulfilmentCard };
