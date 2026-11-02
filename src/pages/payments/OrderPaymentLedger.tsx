/**
 * The order page's view of its money in (PAY-0 §5; lane ADMIN-PAY-1), shown inside the Payment Information
 * card: per gateway payment of this order — fee (incl. GST), GST on fee, net, settlement/UTR, the
 * reconciliation state and a link to the payment in Payments; for a COD order, the courier payout line
 * and its result, linked to COD payouts.
 *
 * Reads `transactions/by-source/checkout_order/{order_id}` (and the COD line by order). An older backend
 * that does not serve them answers 404/empty: the section simply does not render — never an error on the
 * order page.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Landmark, Truck } from 'lucide-react';
import { Chip } from '@/components/erp';
import InfoTip from '@/components/common/InfoTip';
import { formatDay } from '@/utils/date';
import {
  COD_MATCH_LABEL, COD_MATCH_TONE, LINK, RECON_HELP, RECON_LABEL, RECON_TONE, codPayoutsAPI, codReason, feePct, label, money,
  storePaymentsAPI, type CodOrderLink, type Transaction,
} from './data';

const Line: React.FC<{ k: React.ReactNode; children: React.ReactNode }> = ({ k, children }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
    <span className="text-gray-600">{k}</span>
    <span className="min-w-0 text-right tabular-nums text-gray-900">{children}</span>
  </div>
);

const tip = (t: string) => <InfoTip text={t} />;

const OrderPaymentLedger: React.FC<{ orderId: string; isCod?: boolean }> = ({ orderId, isCod }) => {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [cod, setCod] = useState<CodOrderLink | null>(null);

  useEffect(() => {
    let live = true;
    setTxns([]); setCod(null);
    storePaymentsAPI.bySource('checkout_order', orderId)
      .then((rows) => { if (live) setTxns(rows); })
      .catch(() => { /* older backend: no ledger, nothing to show */ });
    if (isCod) {
      codPayoutsAPI.byOrder(orderId)
        .then((r) => { if (live) setCod(r); })
        .catch(() => { /* not served yet: no COD line */ });
    }
    return () => { live = false; };
  }, [orderId, isCod]);

  const codLine = cod?.line ?? null;
  const rem = cod?.remittance ?? null;
  if (txns.length === 0 && !codLine && !rem) return null;

  return (
    <div className="space-y-3 border-t pt-3" data-testid="order-payment-ledger">
      {txns.map((t) => (
        <div key={t.id} className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Landmark className="h-4 w-4 text-gray-400" aria-hidden />Money received</p>
            <span title={t.recon_note || RECON_HELP[t.recon_status] || undefined}>
              <Chip tone={RECON_TONE[t.recon_status] ?? 'neutral'}>{label(RECON_LABEL, t.recon_status)}</Chip>
            </span>
          </div>
          <Line k="Customer paid">{money(t.amount_minor, t.currency)}</Line>
          <Line k={<span className="inline-flex items-center gap-1">Fee (incl. GST) {tip('What the payment gateway kept for this payment, GST on the fee included.')}</span>}>
            {t.fee_minor === null ? <span className="text-xs text-gray-500">not known yet</span> : <>− {money(t.fee_minor, t.currency)} <span className="text-xs text-gray-500">({feePct(t.fee_minor, t.amount_minor)})</span></>}
          </Line>
          <Line k={<span className="inline-flex items-center gap-1">GST on fee {tip('The GST part of the gateway’s fee (already inside the fee).')}</span>}>{t.fee_minor === null ? '—' : money(t.tax_minor, t.currency)}</Line>
          <Line k={<span className="inline-flex items-center gap-1 font-medium text-gray-800">Net {tip('Net = amount − fee: what the gateway pays into your bank.')}</span>}><strong>{t.net_minor === null ? '—' : money(t.net_minor, t.currency)}</strong></Line>
          {(t.refunded_minor ?? 0) > 0 && <Line k="Refunded">{money(t.refunded_minor, t.currency)}</Line>}
          <Line k="Settlement">
            {t.settlement_id ? (
              <Link to={LINK.settlement(t.settlement_id)} className="font-mono text-xs underline decoration-dotted underline-offset-2">
                {t.settlement_utr ? `UTR ${t.settlement_utr}` : t.settlement_id}
              </Link>
            ) : <span className="text-xs text-gray-500">Not paid out yet</span>}
            {t.settled_at && <span className="block text-xs text-gray-500">on {formatDay(t.settled_at)}</span>}
          </Line>
          {t.recon_note && t.recon_status !== 'settled' && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{t.recon_note}</p>}
          <Link to={LINK.filtered({ id: t.id, q: t.payment_ref })} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
            Open in Payments <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ))}

      {(codLine || rem) && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700"><Truck className="h-4 w-4 text-gray-400" aria-hidden />Courier COD payout</p>
            {codLine && <Chip tone={COD_MATCH_TONE[codLine.match_status] ?? 'neutral'}>{COD_MATCH_LABEL[codLine.match_status] ?? codLine.match_status}</Chip>}
          </div>
          {codLine ? (
            <>
              <Line k="COD due">{money(codLine.expected_minor, codLine.currency)}</Line>
              <Line k="Collected by courier">{money(codLine.collected_minor, codLine.currency)}</Line>
              {codLine.courier_cod_charge_minor !== null && <Line k="Courier COD charge">− {money(codLine.courier_cod_charge_minor, codLine.currency)}</Line>}
              {codLine.freight_deducted_minor !== null && <Line k="Freight deducted">− {money(codLine.freight_deducted_minor, codLine.currency)}</Line>}
              {codLine.other_deductions_minor !== null && <Line k="Other deductions">− {money(codLine.other_deductions_minor, codLine.currency)}</Line>}
              {codLine.net_remitted_minor !== null && <Line k="Net remitted">{money(codLine.net_remitted_minor, codLine.currency)}</Line>}
              <p className="mt-1 text-xs text-gray-600">{codReason(codLine)}</p>
            </>
          ) : <p className="text-xs text-gray-500">This order is not on a courier payout yet.</p>}
          {rem && (
            <Line k="Payout">
              {rem.courier ?? 'Courier'}{rem.remitted_at ? ` · ${formatDay(rem.remitted_at)}` : ''}
              {rem.utr && <span className="block font-mono text-xs text-gray-500">UTR {rem.utr}</span>}
              {rem.status && <span className="block text-xs text-gray-500">{rem.status === 'reconciled' ? 'Reconciled' : rem.status === 'open' ? 'Open — not reconciled yet' : rem.status === 'cancelled' ? 'Cancelled' : rem.status}</span>}
            </Line>
          )}
          <Link to={rem ? `${LINK.cod}?remittance=${encodeURIComponent(rem.id)}` : LINK.cod} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
            {rem ? 'Open this payout' : 'Open COD payouts'} <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
};

export default OrderPaymentLedger;
