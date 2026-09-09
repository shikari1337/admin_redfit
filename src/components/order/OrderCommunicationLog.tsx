/**
 * Every message actually sent for this order — order confirmation, shipping
 * updates, OTPs, manual notify sends — newest first.
 *
 * Before this there was no record at all of what had been sent to a customer
 * about their order short of re-reading `notes`. `GET /orders/:id/communications`
 * is backed by a real append-only log (`recordCommunication()`, hooked into
 * `notifyCustomer()`), so every channel/provider/message-id/error it already
 * resolves is finally visible on the order itself.
 *
 * Honesty rule (COMMON_MISTAKES, cart_communication_log_2026_09_04): a
 * provider accepting a message is not proof it reached the customer — WhatsApp
 * and SMS gateways don't report delivery back to us. This renders whatever
 * status the provider actually returned, labelled plainly, and never upgrades
 * "sent"/"accepted" to "Delivered".
 *
 * Self-fetches off `orderId` (like `OrderLinksCard`) so the order page doesn't
 * have to plumb a second payload through, and so `OrderNavigator` moving
 * between orders without remounting this card still shows the right log.
 */
import React, { useEffect, useState } from 'react';
import { FaWhatsapp, FaSms, FaEnvelope, FaBell } from 'react-icons/fa';
import { MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ordersAPI, type OrderCommunicationEntry } from '../../services/api';
import { formatDateTime } from '../../utils/date';

interface Props {
  /** Internal order UUID — what `/orders/:id/communications` is called with. */
  orderId: string;
}

const CHANNEL: Record<string, { Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  whatsapp: { Icon: FaWhatsapp, tone: 'text-green-600' },
  sms: { Icon: FaSms, tone: 'text-sky-600' },
  email: { Icon: FaEnvelope, tone: 'text-purple-600' },
  push: { Icon: FaBell, tone: 'text-amber-600' },
};

/** The provider's OWN word, in plain English — never "Delivered" unless the
 *  provider genuinely said so. Anything unrecognised renders as-is. */
const STATUS_LABEL: Record<string, string> = {
  sent: 'Sent (accepted by provider)',
  accepted: 'Accepted by provider',
  queued: 'Queued',
  pending: 'Queued',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  error: 'Failed',
  undelivered: "Didn't reach the provider",
};

const STATUS_VARIANT = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const s = status.toLowerCase();
  if (s === 'failed' || s === 'error' || s === 'undelivered') return 'destructive';
  if (s === 'delivered' || s === 'read') return 'default';
  if (s === 'sent' || s === 'accepted' || s === 'queued' || s === 'pending') return 'secondary';
  return 'outline';
};

/** "order_confirmation" → "Order confirmation" — a humanised fallback for
 *  event names we don't have a specific label for yet. */
const humanizeEvent = (event: string): string => {
  const words = String(event || '').replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Message';
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

const OrderCommunicationLog: React.FC<Props> = ({ orderId }) => {
  const [rows, setRows] = useState<OrderCommunicationEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    ordersAPI.communications(orderId)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.response?.data?.message || 'Could not load the communication log'))
      .finally(() => setLoading(false));
  };

  // `orderId` in the dependency list, not `[]` — OrderNavigator moves between
  // orders without remounting this card, so a stale previous-order log must
  // not linger under the new order's number.
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    setLoading(true);
    ordersAPI.communications(orderId)
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.message || 'Could not load the communication log'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-slate-50/80 px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> Communication log
        </CardTitle>
        <Button type="button" variant="outline" size="sm" className="h-7" disabled={loading} onClick={load}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Every message sent for this order. A provider accepting a message is not proof it was
          delivered — WhatsApp and SMS don&apos;t report that back to us.
        </p>

        {loading && !rows && (
          <p className="py-3 text-center text-sm font-semibold text-slate-400">Loading…</p>
        )}

        {!loading && error && (
          <p className="rounded border-2 border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700">{error}</p>
        )}

        {!error && rows && rows.length === 0 && (
          <p className="py-3 text-center text-sm font-semibold text-slate-400">
            No messages sent for this order yet.
          </p>
        )}

        {!error && rows && rows.length > 0 && (
          <ol className="divide-y divide-slate-100">
            {rows.map((row) => {
              const ch = CHANNEL[String(row.channel || '').toLowerCase()] ?? { Icon: FaBell, tone: 'text-slate-400' };
              const statusKey = String(row.status || '').toLowerCase();
              const label = STATUS_LABEL[statusKey] ?? (row.status || 'Unknown');
              const failed = statusKey === 'failed' || statusKey === 'error' || statusKey === 'undelivered';
              return (
                <li key={row.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <ch.Icon className={`h-3.5 w-3.5 shrink-0 ${ch.tone}`} />
                    <span className="font-semibold text-slate-800">{humanizeEvent(row.event)}</span>
                    <Badge variant={STATUS_VARIANT(row.status || '')}>{label}</Badge>
                    <span className="whitespace-nowrap text-xs font-bold tabular-nums text-slate-500">
                      {formatDateTime(row.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {row.recipient && <span>To {row.recipient}</span>}
                    {row.provider && <span>via {row.provider}</span>}
                    <span>{row.is_automated ? 'Automated' : (row.actor_name ? `by ${row.actor_name}` : 'by staff')}</span>
                  </div>
                  {/* The provider's OWN words on a failure, not a generic "error". */}
                  {failed && row.error && (
                    <p className="mt-1 rounded bg-destructive/10 p-1.5 text-xs text-destructive">{row.error}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderCommunicationLog;
