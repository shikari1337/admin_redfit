import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InfoTip from '../common/InfoTip';
import { useAuth } from '../../contexts/AuthContext';
import { erpApi, errorText, isNotServed, retryOrderPushById, type OrderErpPush } from '../../lib/v2/erp';

/**
 * ERP INVOICE — this order on its way to the ERP and the invoice number that comes back
 * (ERP-ORDER-1, `GET /api/v2/erp/orders/{order_id}/push`).
 *
 * The owner's rule (2 Nov 2026): every B2C order goes to the ERP under the one customer set on
 * the ERP connection; a B2B order goes under the BUYER's own ERP customer, which staff type here
 * — saving it is what lets the order go and earn its invoice. A failed send can be retried
 * (the ledger's retry route, `settings.manage`); the ERP is asked before anything is sent again,
 * so an order is never placed twice.
 */

interface Props {
  /** The order's uuid (`orders.id`), not its number. */
  orderId: string;
}

type Tone = 'gray' | 'amber' | 'blue' | 'green' | 'red';

const CHIP: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
};

/** Each state in plain words: the chip, and the sentence under it. */
function describe(p: OrderErpPush): { label: string; tone: Tone; text: string } {
  switch (p.state) {
    case 'off':
      return { label: 'Not sent', tone: 'gray', text: 'Orders are not sent to the ERP from this store: no ERP connection has sending orders switched on.' };
    case 'not_sent':
      return p.b2b
        ? { label: 'Not sent', tone: 'gray', text: 'This B2B order has not gone to the ERP. Type the buyer’s ERP customer code below to send it for its invoice.' }
        : { label: 'Not sent', tone: 'gray', text: 'This order has not gone to the ERP.' };
    case 'waiting_customer_code':
      return {
        label: 'Needs customer code', tone: 'amber',
        text: 'Waiting for the buyer’s ERP customer code. A B2B order is invoiced to the buyer’s own account in the ERP, so it goes once that code is saved below.',
      };
    case 'queued':
      return { label: 'Queued', tone: 'blue', text: 'Queued: it is placed in the ERP within a few minutes.' };
    case 'sent':
    case 'confirmed': // the ledger's word once an invoice echoed the order
      return p.invoice_number
        ? { label: 'Invoiced', tone: 'green', text: 'Placed in the ERP, and the ERP has issued its invoice.' }
        : { label: 'Sent', tone: 'green', text: 'Placed in the ERP. Waiting for the ERP to issue the invoice; its number appears here when it comes back.' };
    case 'failed':
      return { label: 'Failed', tone: 'red', text: 'Sending this order to the ERP did not work.' };
    case 'refused':
      return { label: 'Refused', tone: 'red', text: 'The ERP refused this order. It is not sent again by itself.' };
    case 'unknown':
      return {
        label: 'Not known', tone: 'amber',
        text: 'It is not known whether the ERP received this order: the last attempt got no clear answer. The ERP is asked before anything is sent again, so it is never placed twice.',
      };
    default:
      return { label: p.state, tone: 'gray', text: `Where it stands: ${p.state}.` };
  }
}

const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="flex items-baseline gap-2 text-sm">
    <span className="w-[86px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
    <span className="min-w-0 flex-1 break-words text-slate-700">{children}</span>
  </div>
);

const OrderErpInvoiceCard: React.FC<Props> = ({ orderId }) => {
  const { hasPerm } = useAuth();
  // The ledger's retry route is `manage` (settings.manage) on the Rust side.
  const canRetry = hasPerm('settings.manage');
  const [push, setPush] = useState<OrderErpPush | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'retry'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const p = await erpApi.orderPush(orderId);
      if (mine === seq.current) setPush(p);
    } catch (e) {
      if (mine === seq.current) { setLoadError(e); setPush(null); }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [orderId]);

  // Another order (the navigator) starts afresh.
  useEffect(() => {
    setCode('');
    setNote(null);
    void load();
  }, [load]);

  const saveCode = async () => {
    const typed = code.trim();
    if (!typed) return;
    setBusy('save');
    setNote(null);
    try {
      await erpApi.setOrderCustomerCode(orderId, typed);
      setCode('');
      setNote({ ok: true, text: `Saved: the order goes to the ERP under ${typed}.` });
      await load();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy('');
    }
  };

  const retry = async () => {
    if (!push?.push_id) return;
    setBusy('retry');
    setNote(null);
    try {
      await retryOrderPushById(push.push_id);
      setNote({ ok: true, text: 'Tried again: it goes to the ERP within a few minutes.' });
      await load();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy('');
    }
  };

  const d = push ? describe(push) : null;
  const askCode = !!push && push.b2b && (push.state === 'waiting_customer_code' || push.state === 'not_sent');

  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b border-line px-4 py-2.5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          <span className="flex items-center gap-1.5">
            ERP invoice
            <InfoTip text="This order on its way to the store's ERP, and the invoice number the ERP issues for it. B2C orders go under the one ERP customer set on the ERP connection; a B2B order goes under the buyer's own ERP customer code, typed here." />
          </span>
          <span className="flex items-center gap-1.5">
            {d && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CHIP[d.tone]}`}>{d.label}</span>}
            <Button
              variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
              onClick={() => void load()} disabled={loading} aria-label="Read the ERP state again" title="Read it again"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {loading && !push && !loadError && <p className="text-sm text-slate-500">Reading…</p>}

        {!!loadError && (isNotServed(loadError) ? (
          <p className="text-sm text-slate-500">Not available on this server yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-700">{errorText(loadError)}</p>
            <Button size="sm" variant="outline" className="h-8" onClick={() => void load()}>Try again</Button>
          </div>
        ))}

        {push && d && (
          <>
            <p className="text-sm text-slate-700">{d.text}</p>
            {push.invoice_number && (
              <Row k="ERP invoice"><span className="font-mono font-medium text-slate-900">{push.invoice_number}</span></Row>
            )}
            {push.customer_code && (
              <Row k={push.b2b ? 'Buyer code' : 'Booked to'}><span className="font-mono text-slate-900">{push.customer_code}</span></Row>
            )}
            {push.error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <span className="font-semibold">What went wrong: </span>{push.error}
              </div>
            )}

            {askCode && (
              <form
                className="space-y-1.5 border-t pt-3"
                onSubmit={(e) => { e.preventDefault(); void saveCode(); }}
              >
                <label htmlFor={`erp-code-${orderId}`} className="text-xs font-medium text-slate-600">Buyer’s ERP customer code</label>
                <div className="flex gap-2">
                  <Input
                    id={`erp-code-${orderId}`}
                    className="h-8 font-mono text-sm"
                    value={code}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="as the ERP lists the buyer"
                    disabled={!!busy}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <Button type="submit" size="sm" className="h-8 shrink-0" disabled={!code.trim() || !!busy}>
                    {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">The order is sent to the ERP under this customer, and the ERP invoices the buyer.</p>
              </form>
            )}

            {push.state === 'failed' && push.push_id && (
              <div className="border-t pt-3">
                <Button
                  size="sm" variant="outline" className="h-8"
                  disabled={!canRetry || !!busy}
                  title={canRetry ? 'Send this order to the ERP again' : 'You need the Manage settings permission.'}
                  onClick={() => void retry()}
                >
                  {busy === 'retry' ? 'Trying…' : 'Try again'}
                </Button>
                {!canRetry && <p className="mt-1 text-[11px] text-slate-500">An admin with the Manage settings permission can retry it.</p>}
              </div>
            )}
          </>
        )}

        {note && <p className={`text-sm ${note.ok ? 'text-emerald-700' : 'text-red-700'}`} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
      </CardContent>
    </Card>
  );
};

export default OrderErpInvoiceCard;
