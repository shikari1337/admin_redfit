/**
 * Shared pieces of the money-in screens (Payments · Settlements · Payment analytics; lane ADMIN-PAY-1):
 * the "not on this server yet" notice, the error line, URL-kept filters, the date range, the recon badge,
 * the transactions table and the payment detail drawer. Built from the admin's own kit (`@/components/erp`,
 * `components/ui/sheet`, `InfoTip`) — no new UI library.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CloudOff, ExternalLink, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Btn, Chip, DrillLink, EmptyRow, EmptyState, Field, TableShell, TBody, Td, TextInput, Th, THead, Tr, TableSkeleton,
  type CsvColumn,
} from '@/components/erp';
import InfoTip from '@/components/common/InfoTip';
import RecoverPaymentModal from '@/components/order/RecoverPaymentModal';
import { INTENTS_LINK, intentLink } from './intentsData';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime, formatDay, isoDaysFromToday, todayIso } from '@/utils/date';
import { cn } from '@/lib/utils';
import {
  LINK, METHOD_LABEL, RECON_HELP, RECON_LABEL, RECON_TONE, SOURCE_LABEL, STATUS_LABEL, STATUS_TONE,
  failureOf, feePct, label, money, orderLinkOf, plainMajor, storePaymentsAPI,
  type LoadFailure, type Transaction, type TransactionDetail,
} from './data';

/* ── notices ──────────────────────────────────────────────────────────────── */

export const GapNotice: React.FC<{ what: string; className?: string }> = ({ what, className }) => (
  <div role="status" className={cn('rounded-lg border border-gray-200 bg-gray-50 px-4 py-3', className)}>
    <div className="flex items-start gap-2.5">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-gray-900">Not available on this server yet</p>
        <p className="mt-0.5 text-gray-600">{what}</p>
      </div>
    </div>
  </div>
);

export const ErrorNotice: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
    <span className="min-w-0 flex-1">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="rounded px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:no-underline">
        Try again
      </button>
    )}
  </div>
);

/** A failed read in plain words: not deployed, not allowed, or the server's own reason. */
export const FailureNotice: React.FC<{ failure: LoadFailure; what: string; onRetry?: () => void }> = ({ failure, what, onRetry }) => {
  if (failure.gap) return <GapNotice what={what} />;
  if (failure.forbidden) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>You don’t have access to this. Ask the store owner for the “view orders” permission.</span>
      </div>
    );
  }
  return <ErrorNotice message={`Couldn’t load this: ${failure.message}`} onRetry={onRetry} />;
};

/** A heading/label with its plain-words meaning on hover and keyboard focus. */
export const Hint: React.FC<{ children: React.ReactNode; tip: React.ReactNode; className?: string }> = ({ children, tip, className }) => (
  <span className={cn('inline-flex items-center gap-1', className)}>{children}<InfoTip text={tip} /></span>
);

export const TIPS = {
  amount: 'What the customer paid.',
  fee: 'Fee (incl. GST): what the payment gateway kept for this payment, GST on the fee included.',
  tax: 'GST on fee: the GST part of the gateway’s fee (already inside the fee, not charged again).',
  net: 'Net = amount − fee. What the gateway pays into your bank for this payment.',
  effective: 'Effective fee % = fee (incl. GST) ÷ amount paid.',
  settlement: 'The gateway’s payout that carried this payment to your bank, with its bank reference (UTR).',
  recon: 'Whether this payment has reached your bank and agrees with its order.',
  unknownFee: 'The gateway has not told us the fee yet; it fills in after the settlement report is read.',
};

/* ── URL-kept filters ─────────────────────────────────────────────────────── */

/**
 * Filters live in the address bar, so a link like "12 not paid out" opens exactly the filtered table and a
 * reload keeps it. Empty values are removed from the URL.
 */
export function useUrlFilters<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = {}) {
  const [sp, setSp] = useSearchParams();
  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of keys) out[k] = sp.get(k) ?? defaults[k] ?? '';
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, keys.join('|')]);
  const set = useCallback((patch: Partial<Record<K, string>>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch) as Array<[K, string | undefined]>) {
      if (v === undefined || v === null || v === '' || v === defaults[k]) next.delete(k); else next.set(k, v);
    }
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, setSp]);
  return [values, set] as const;
}

export const DEFAULT_FROM = () => isoDaysFromToday(-29);
export const DEFAULT_TO = () => todayIso();

/** The from/to pair with quick ranges. Dates are the store's calendar days. */
export const RangeFields: React.FC<{ from: string; to: string; onChange: (r: { from: string; to: string }) => void }> = ({ from, to, onChange }) => {
  const quick = [
    { k: '7', label: '7 days', from: isoDaysFromToday(-6) },
    { k: '30', label: '30 days', from: isoDaysFromToday(-29) },
    { k: '90', label: '90 days', from: isoDaysFromToday(-89) },
  ];
  return (
    <>
      <Field label="From"><TextInput type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date" /></Field>
      <Field label="To"><TextInput type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date" /></Field>
      <div className="flex items-end gap-1 pb-0.5" role="group" aria-label="Quick date ranges">
        {quick.map((q) => (
          <button key={q.k} type="button" onClick={() => onChange({ from: q.from, to: todayIso() })}
            className={cn('h-8 rounded-full border px-3 text-xs font-medium',
              from === q.from && to === todayIso() ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900')}>
            {q.label}
          </button>
        ))}
      </div>
    </>
  );
};

/* ── badges + cells ───────────────────────────────────────────────────────── */

export const ReconBadge: React.FC<{ status: string; note?: string | null }> = ({ status, note }) => (
  <span title={note || RECON_HELP[status] || undefined}>
    <Chip tone={RECON_TONE[status] ?? 'neutral'}>{label(RECON_LABEL, status)}</Chip>
  </span>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{label(STATUS_LABEL, status)}</Chip>
);

export const methodText = (t: Pick<Transaction, 'method' | 'instrument' | 'international'>): string =>
  [label(METHOD_LABEL, t.method), t.instrument, t.international ? 'international' : null].filter(Boolean).join(' · ');

/** A fee figure, or the plain "not known yet" when the gateway has not told us. */
export const FeeCell: React.FC<{ minor: number | null; currency: string }> = ({ minor, currency }) =>
  minor === null ? <span className="text-xs text-gray-400" title={TIPS.unknownFee}>not known yet</span> : <>{money(minor, currency)}</>;

/* ── the transactions table ───────────────────────────────────────────────── */

export const TXN_CSV: CsvColumn<Transaction>[] = [
  { key: 'captured_at', label: 'Paid at', format: (t) => t.captured_at ?? t.created_at ?? '' },
  { key: 'source_number', label: 'Order / reference', format: (t) => t.source_number ?? '' },
  { key: 'source', label: 'From', format: (t) => label(SOURCE_LABEL, t.source) },
  { key: 'customer_name', label: 'Customer', format: (t) => t.customer_name ?? '' },
  { key: 'method', label: 'Method', format: (t) => methodText(t) },
  { key: 'payment_ref', label: 'Payment id' },
  { key: 'currency', label: 'Currency' },
  { key: 'amount_minor', label: 'Amount', format: (t) => plainMajor(t.amount_minor, t.currency) },
  { key: 'fee_minor', label: 'Fee (incl. GST)', format: (t) => plainMajor(t.fee_minor, t.currency) },
  { key: 'tax_minor', label: 'GST on fee', format: (t) => plainMajor(t.tax_minor, t.currency) },
  { key: 'net_minor', label: 'Net', format: (t) => plainMajor(t.net_minor, t.currency) },
  { key: 'refunded_minor', label: 'Refunded', format: (t) => plainMajor(t.refunded_minor, t.currency) },
  { key: 'status', label: 'Status', format: (t) => label(STATUS_LABEL, t.status) },
  { key: 'settlement_id', label: 'Settlement', format: (t) => t.settlement_id ?? '' },
  { key: 'settlement_utr', label: 'UTR', format: (t) => t.settlement_utr ?? '' },
  { key: 'settled_at', label: 'Settled at', format: (t) => t.settled_at ?? '' },
  { key: 'recon_status', label: 'Reconciliation', format: (t) => label(RECON_LABEL, t.recon_status) },
  { key: 'recon_note', label: 'Reason', format: (t) => t.recon_note ?? '' },
];

export const TxnTable: React.FC<{
  rows: Transaction[] | null;
  onOpen: (id: string) => void;
  empty?: React.ReactNode;
  /** The settlement column is noise inside one settlement. */
  hideSettlement?: boolean;
}> = ({ rows, onOpen, empty, hideSettlement }) => {
  const cols = hideSettlement ? 10 : 11;
  return (
    <TableShell maxHeight="70vh">
      <table className="w-full text-sm">
        <THead>
          <Th>Paid at</Th>
          <Th>Order</Th>
          <Th>Customer</Th>
          <Th>Method</Th>
          <Th num><Hint tip={TIPS.amount}>Amount</Hint></Th>
          <Th num><Hint tip={TIPS.fee}>Fee (incl. GST)</Hint></Th>
          <Th num><Hint tip={TIPS.tax}>GST on fee</Hint></Th>
          <Th num><Hint tip={TIPS.net}>Net</Hint></Th>
          <Th>Status</Th>
          {!hideSettlement && <Th><Hint tip={TIPS.settlement}>Settlement</Hint></Th>}
          <Th><Hint tip={TIPS.recon}>Bank</Hint></Th>
        </THead>
        {rows === null ? <TableSkeleton cols={cols} rows={8} /> : (
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={cols}>{empty ?? 'No payments match.'}</EmptyRow>
            ) : rows.map((t) => {
              const orderTo = orderLinkOf(t);
              return (
                <Tr key={t.id} className="cursor-pointer" onClick={() => onOpen(t.id)}
                  tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }}
                  aria-label={`Payment ${t.payment_ref}`}>
                  <Td className="whitespace-nowrap">{formatDateTime(t.captured_at ?? t.created_at)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {orderTo ? <DrillLink to={orderTo}>{t.source_number ?? 'Open order'}</DrillLink>
                      : <span className={t.source === 'unknown' ? 'text-red-700' : ''}>{t.source_number ?? label(SOURCE_LABEL, t.source)}</span>}
                    <span className="block font-mono text-[11px] text-gray-400">{t.payment_ref}</span>
                  </Td>
                  <Td muted>{t.customer_name ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{methodText(t)}</Td>
                  <Td num className="font-medium">{money(t.amount_minor, t.currency)}</Td>
                  <Td num><FeeCell minor={t.fee_minor} currency={t.currency} /></Td>
                  <Td num muted>{t.fee_minor === null ? '—' : money(t.tax_minor, t.currency)}</Td>
                  <Td num>{t.net_minor === null ? '—' : money(t.net_minor, t.currency)}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  {!hideSettlement && (
                    <Td onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                      {t.settlement_id ? (
                        <DrillLink to={LINK.settlement(t.settlement_id)} title="Open this payout">{t.settlement_utr ?? t.settlement_id}</DrillLink>
                      ) : <span className="text-gray-400">—</span>}
                    </Td>
                  )}
                  <Td><ReconBadge status={t.recon_status} note={t.recon_note} /></Td>
                </Tr>
              );
            })}
          </TBody>
        )}
      </table>
    </TableShell>
  );
};

/* ── the payment detail drawer ────────────────────────────────────────────── */

const Row: React.FC<{ k: React.ReactNode; children: React.ReactNode; mono?: boolean }> = ({ k, children, mono }) => (
  <div className="grid grid-cols-[9.5rem_1fr] gap-2 py-1.5 text-sm">
    <dt className="text-gray-500">{k}</dt>
    <dd className={cn('min-w-0 break-words text-gray-900', mono && 'font-mono text-xs')}>{children}</dd>
  </div>
);

/** One payment, every field — opened from `?id=` so the drawer is linkable. */
/** A mismatch whose reason says the order was never created: the existing Recover payment action applies. */
const needsRecovery = (t: Transaction): boolean =>
  t.recon_status === 'mismatch' && !t.source_id && /not (been )?created|no order|never created|order (is )?missing/i.test(t.recon_note ?? '');

export const TxnDrawer: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const { hasPerm } = useAuth();
  const canRecover = hasPerm('orders.manage');
  const [recovering, setRecovering] = useState(false);
  const [t, setT] = useState<TransactionDetail | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const load = useCallback(() => {
    if (!id) return;
    setT(null); setFail(null);
    storePaymentsAPI.transaction(id).then(setT).catch((e) => setFail(failureOf(e, 'the payment could not be read')));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Payment {t ? money(t.amount_minor, t.currency) : ''}</SheetTitle>
          <SheetDescription>Where this payment came from, what the gateway kept and when it reached your bank.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {fail && <FailureNotice failure={fail} what="This server does not keep the store’s payment ledger yet." onRetry={load} />}
          {!t && !fail && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="block h-3 animate-pulse rounded bg-gray-100" />)}</div>}
          {t && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                <ReconBadge status={t.recon_status} note={t.recon_note} />
                {t.mode === 'test' && <Chip tone="blue">Test mode</Chip>}
              </div>
              {t.recon_note && (
                <p className={cn('rounded-lg border px-3 py-2 text-sm', t.recon_status === 'settled' ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-red-200 bg-red-50 text-red-800')}>
                  {t.recon_note}
                </p>
              )}
              {!t.recon_note && RECON_HELP[t.recon_status] && <p className="text-xs text-gray-500">{RECON_HELP[t.recon_status]}</p>}
              {needsRecovery(t) && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p>The customer paid but the order was never created (their browser dropped before checkout finished). Recovering checks the payment with the gateway and creates the order.</p>
                  <p className="text-xs">Paste these into the form: gateway order id <code className="rounded bg-white px-1 font-mono">{t.intent_ref ?? '—'}</code> and payment id <code className="rounded bg-white px-1 font-mono">{t.payment_ref}</code>.</p>
                  {canRecover ? (
                    <Btn size="sm" variant="outline" onClick={() => { setRecovering(true); onClose(); }}>Recover payment</Btn>
                  ) : <p className="text-xs">Recovering needs the “manage orders” permission.</p>}
                </div>
              )}

              <section aria-label="Money" className="rounded-xl border border-gray-200 p-3">
                <dl className="divide-y divide-gray-100">
                  <Row k={<Hint tip={TIPS.amount}>Customer paid</Hint>}><strong>{money(t.amount_minor, t.currency)}</strong></Row>
                  <Row k={<Hint tip={TIPS.fee}>Fee (incl. GST)</Hint>}>
                    {t.fee_minor === null ? <span className="text-gray-500">{TIPS.unknownFee}</span> : <>− {money(t.fee_minor, t.currency)} <span className="text-xs text-gray-500">({feePct(t.fee_minor, t.amount_minor)})</span></>}
                  </Row>
                  <Row k={<Hint tip={TIPS.tax}>of which GST on fee</Hint>}>{t.fee_minor === null ? '—' : money(t.tax_minor, t.currency)}</Row>
                  <Row k={<Hint tip={TIPS.net}>Net to bank</Hint>}><strong>{t.net_minor === null ? '—' : money(t.net_minor, t.currency)}</strong></Row>
                  {(t.refunded_minor ?? 0) > 0 && <Row k="Refunded">{money(t.refunded_minor, t.currency)}</Row>}
                  {t.fee_source && <Row k="Fee read from">{t.fee_source === 'settlement' ? 'the settlement report' : 'the payment itself'}</Row>}
                </dl>
              </section>

              <dl className="divide-y divide-gray-100">
                <Row k="From">{label(SOURCE_LABEL, t.source)}</Row>
                <Row k="Order">
                  {t.links.order_id ? (
                    <Link to={LINK.order(t.links.order_id)} className="inline-flex items-center gap-1 font-medium text-gray-900 underline decoration-dotted underline-offset-2">
                      {t.links.order_number ?? 'Open order'} <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : (t.links.order_number ?? t.source_number ?? <span className="text-gray-500">No order — {t.source === 'unknown' ? 'this payment did not come through the store’s checkout' : 'not linked'}</span>)}
                </Row>
                {t.customer_name && <Row k="Customer">{t.customer_name}</Row>}
                <Row k="Method">{methodText(t)}</Row>
                <Row k="Paid at">{formatDateTime(t.captured_at ?? t.created_at)}</Row>
                <Row k="Gateway">{t.provider || '—'}{t.mode ? ` · ${t.mode}` : ''}{t.account_ref ? ` · ${t.account_ref}` : ''}</Row>
                <Row k="Payment id" mono>{t.payment_ref}</Row>
                {t.intent_ref && <Row k="Gateway order id" mono>{t.intent_ref}</Row>}
                <Row k={<Hint tip={TIPS.settlement}>Settlement</Hint>}>
                  {t.links.settlement_id ? (
                    <Link to={LINK.settlement(t.links.settlement_id)} className="font-medium text-gray-900 underline decoration-dotted underline-offset-2">
                      {t.links.settlement_id}
                    </Link>
                  ) : <span className="text-gray-500">Not paid out yet</span>}
                </Row>
                {t.settlement_utr && <Row k="Bank reference (UTR)" mono>{t.settlement_utr}</Row>}
                {t.settled_at && <Row k="Settled on">{formatDay(t.settled_at)}</Row>}
                <Row k="Payment request">
                  {t.intent_id ? (
                    <Link to={intentLink(t.intent_id)} className="font-medium text-gray-900 underline decoration-dotted underline-offset-2">Open the request</Link>
                  ) : (
                    <Link to={`${INTENTS_LINK}?q=${encodeURIComponent(t.payment_ref)}`} className="text-gray-600 underline decoration-dotted underline-offset-2">Find its request</Link>
                  )}
                </Row>
                <Row k="Fee in the books">{t.fee_journal_id ? 'Posted' : 'Not posted yet'}</Row>
              </dl>

              <section aria-label="Refunds">
                <h3 className="mb-1 text-sm font-semibold text-gray-800">Refunds</h3>
                {t.refunds.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    {(t.refunded_minor ?? 0) > 0
                      ? <>Refunded in total: <strong className="text-gray-900">{money(t.refunded_minor, t.currency)}</strong> of {money(t.amount_minor, t.currency)}.</>
                      : 'No refund on this payment.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                    {t.refunds.map((r, i) => (
                      <li key={r.id ?? i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-medium">{money(r.amount_minor, t.currency)}</span>
                          {r.status && <span className="ml-2 text-gray-500">{r.status}</span>}
                          {r.refund_ref && <span className="block font-mono text-[11px] text-gray-400">{r.refund_ref}</span>}
                          {r.note && <span className="block text-xs text-gray-500">{r.note}</span>}
                        </span>
                        <span className="text-xs text-gray-500">{formatDateTime(r.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
    {/* Outside the sheet: the drawer closes first, so its focus trap never holds the form. */}
    <RecoverPaymentModal isOpen={recovering} onClose={() => setRecovering(false)} onRecovered={() => undefined} />
    </>
  );
};

/** The drawer bound to `?id=` on the current page. */
export function useDrawerParam(): [string | null, (id: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const id = sp.get('id');
  const set = useCallback((next: string | null) => {
    const q = new URLSearchParams(sp);
    if (next) q.set('id', next); else q.delete('id');
    setSp(q, { replace: false });
  }, [sp, setSp]);
  return [id, set];
}

export const NoPayments: React.FC<{ filtered: boolean; onClear?: () => void }> = ({ filtered, onClear }) => (
  <EmptyState
    title={filtered ? 'No payments match these filters' : 'No online payments in this period'}
    description={filtered
      ? 'Try a wider date range or clear a filter.'
      : 'Payments customers make through your payment gateway appear here with the fee the gateway kept and when it reached your bank.'}
    action={filtered && onClear ? <button type="button" onClick={onClear} className="text-sm font-medium text-gray-900 underline underline-offset-2">Clear filters</button> : undefined}
  />
);
