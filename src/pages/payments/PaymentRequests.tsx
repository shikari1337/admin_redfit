/**
 * PAYMENT REQUESTS — what the store ASKED payers to pay through Growcord Payments (owned intents, PAY-1 /
 * DEC-074): one request per order / checkout link / domain / top-up, its gateway orders (attempts) and its
 * timeline, linked to the order and to the payment the gateway took (Payments page) both ways.
 * Filters live in the URL; `?id=` opens one request.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Page, PageHeader, Btn, Chip, DrillLink, EmptyRow, EmptyState, ExportMenu, Field, FilterBar, FilterChips, SearchInput,
  TableShell, TableSkeleton, TBody, Td, Th, THead, Tr, type ChipGroup, type CsvColumn,
} from '@/components/erp';
import { formatDateTime } from '@/utils/date';
import { LINK, failureOf, label, money, plainMajor, type LoadFailure } from './data';
import { DEFAULT_FROM, DEFAULT_TO, FailureNotice, Hint, RangeFields, useDrawerParam, useUrlFilters } from './common';
import {
  ATTEMPT_STATUS_LABEL, CANCEL_REASON, INTENT_SOURCE_LABEL, INTENT_STATUS_HELP, INTENT_STATUS_LABEL, INTENT_STATUS_TONE,
  eventText, intentsAPI, ownerLink, type Intent, type IntentDetail,
} from './intentsData';

const KEYS = ['from', 'to', 'status', 'source', 'q'] as const;
const PAGE = 50;
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, l]) => ({ value, label: l }));
const linkBtn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50';

const CSV: CsvColumn<Intent>[] = [
  { key: 'created_at', label: 'Asked at', format: (i) => i.created_at ?? '' },
  { key: 'source', label: 'For', format: (i) => label(INTENT_SOURCE_LABEL, i.source) },
  { key: 'source_number', label: 'Number', format: (i) => i.source_number ?? '' },
  { key: 'status', label: 'Status', format: (i) => label(INTENT_STATUS_LABEL, i.status) },
  { key: 'currency', label: 'Currency' },
  { key: 'amount_minor', label: 'Asked', format: (i) => plainMajor(i.amount_minor, i.currency) },
  { key: 'captured_minor', label: 'Paid', format: (i) => plainMajor(i.captured_minor, i.currency) },
  { key: 'refunded_minor', label: 'Refunded', format: (i) => plainMajor(i.refunded_minor, i.currency) },
  { key: 'provider', label: 'Gateway', format: (i) => i.provider ?? '' },
  { key: 'gateway_ref', label: 'Gateway order', format: (i) => i.gateway_ref ?? '' },
  { key: 'payment_ref', label: 'Payment id', format: (i) => i.payment_ref ?? '' },
  { key: 'captured_at', label: 'Paid at', format: (i) => i.captured_at ?? '' },
  { key: 'cancel_reason', label: 'Why closed', format: (i) => (i.cancel_reason ? CANCEL_REASON[i.cancel_reason] ?? i.cancel_reason : '') },
];

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
  <span title={INTENT_STATUS_HELP[status]}><Chip tone={INTENT_STATUS_TONE[status] ?? 'neutral'}>{label(INTENT_STATUS_LABEL, status)}</Chip></span>
);

const PaymentRequests: React.FC = () => {
  const defaults = useMemo(() => ({ from: DEFAULT_FROM(), to: DEFAULT_TO() }), []);
  const [f, setF] = useUrlFilters(KEYS, defaults);
  const [drawer, setDrawer] = useDrawerParam();
  const [rows, setRows] = useState<Intent[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [q, setQ] = useState(f.q);
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    if (q === f.q) return undefined;
    const t = setTimeout(() => setF({ q: q.trim() }), 450);
    return () => clearTimeout(t);
  }, [q, f.q, setF]);

  const seq = useRef(0);
  const query = useMemo(() => ({ from: f.from, to: f.to, status: f.status, source: f.source, q: f.q }), [f.from, f.to, f.status, f.source, f.q]);
  const load = useCallback(() => {
    const n = ++seq.current;
    setRows(null); setFail(null); setCursor(null);
    intentsAPI.list({ ...query, limit: PAGE })
      .then((r) => { if (n === seq.current) { setRows(r.items); setCursor(r.next_cursor); } })
      .catch((e) => { if (n === seq.current) { setRows([]); setFail(failureOf(e, 'the payment requests could not be read')); } });
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try { const r = await intentsAPI.list({ ...query, cursor, limit: PAGE }); setRows((p) => [...(p ?? []), ...r.items]); setCursor(r.next_cursor); }
    catch (e) { setFail(failureOf(e, 'more requests could not be read')); }
    finally { setMore(false); }
  };

  const chips: ChipGroup[] = [
    { key: 'status', label: 'Status', value: f.status, onChange: (v) => setF({ status: v }), options: opts(INTENT_STATUS_LABEL) },
    { key: 'source', label: 'For', value: f.source, onChange: (v) => setF({ source: v }), options: opts(INTENT_SOURCE_LABEL), help: 'What the payer was asked to pay for.' },
  ];
  const filtered = !!(f.status || f.source || f.q);
  const clearAll = () => setF({ status: '', source: '', q: '' });

  return (
    <Page>
      <PageHeader
        title="Payment requests"
        icon={ClipboardList}
        description="Every payment your store asked for through Growcord Payments: for which order, how much, the gateway orders opened, and whether the money came in."
        actions={(
          <>
            <Link to={LINK.transactions} className={linkBtn}><CreditCard className="h-4 w-4" />Payments</Link>
            <ExportMenu filename={`payment-requests-${f.from}-to-${f.to}`} columns={CSV} rows={rows ?? []} disabled={!rows?.length} />
          </>
        )}
      />
      <FilterBar>
        <RangeFields from={f.from} to={f.to} onChange={(r) => setF(r)} />
        <Field label="Search" className="min-w-[16rem] flex-1">
          <form role="search" onSubmit={(e) => { e.preventDefault(); setF({ q: q.trim() }); }}>
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, order_… or pay_…" aria-label="Search payment requests" />
          </form>
        </Field>
      </FilterBar>
      <FilterChips groups={chips} onClearAll={clearAll} />

      {fail && <FailureNotice failure={fail} what="Payment requests (Growcord Payments) are not on this server yet." onRetry={load} />}

      <TableShell maxHeight="70vh">
        <table className="w-full text-sm">
          <THead>
            <Th>Asked at</Th><Th>For</Th><Th>Status</Th>
            <Th num><Hint tip="What the payer was asked to pay.">Asked</Hint></Th>
            <Th num><Hint tip="What the gateway actually took on this request.">Paid</Hint></Th>
            <Th>Gateway order</Th><Th>Payment</Th>
          </THead>
          {rows === null ? <TableSkeleton cols={7} rows={8} /> : (
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>{fail ? 'Nothing to show.' : (
                  <EmptyState title={filtered ? 'No requests match these filters' : 'No payment requests in this period'}
                    description={filtered ? 'Try a wider date range or clear a filter.' : 'When your store takes payments through Growcord Payments, each order’s request to pay appears here.'} />
                )}</EmptyRow>
              ) : rows.map((i) => {
                const to = ownerLink(i);
                return (
                  <Tr key={i.id} className="cursor-pointer" tabIndex={0} onClick={() => setDrawer(i.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(i.id); } }}>
                    <Td className="whitespace-nowrap">{formatDateTime(i.created_at)}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      {to ? <DrillLink to={to}>{i.source_number ?? label(INTENT_SOURCE_LABEL, i.source)}</DrillLink> : <span>{i.source_number ?? '—'}</span>}
                      <span className="block text-xs text-gray-500">{label(INTENT_SOURCE_LABEL, i.source)}</span>
                    </Td>
                    <Td><StatusChip status={i.status} />{i.late_capture && <span className="ml-1 text-xs text-amber-700" title="Money arrived after the request was closed">late</span>}</Td>
                    <Td num>{money(i.amount_minor, i.currency)}</Td>
                    <Td num className={(i.captured_minor ?? 0) > 0 ? 'font-medium' : 'text-gray-400'}>{money(i.captured_minor, i.currency)}</Td>
                    <Td className="font-mono text-xs">{i.gateway_ref ?? '—'}<span className="block text-gray-400">{i.provider ?? ''}</span></Td>
                    <Td className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      {i.payment_ref ? <DrillLink to={LINK.filtered({ q: i.payment_ref, from: '', to: '' })} title="Open the payment in Payments">{i.payment_ref}</DrillLink> : '—'}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          )}
        </table>
      </TableShell>
      {cursor && <div className="flex justify-center"><Btn variant="outline" onClick={loadMore} disabled={more}>{more && <Loader2 className="h-4 w-4 animate-spin" />}Show more</Btn></div>}

      <IntentDrawer id={drawer} onClose={() => setDrawer(null)} />
    </Page>
  );
};

const Row: React.FC<{ k: React.ReactNode; children: React.ReactNode; mono?: boolean }> = ({ k, children, mono }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
    <dt className="text-gray-500">{k}</dt>
    <dd className={mono ? 'min-w-0 break-words font-mono text-xs text-gray-900' : 'min-w-0 break-words text-gray-900'}>{children}</dd>
  </div>
);

const IntentDrawer: React.FC<{ id: string | null; onClose: () => void }> = ({ id, onClose }) => {
  const [d, setD] = useState<IntentDetail | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const load = useCallback(() => {
    if (!id) return;
    setD(null); setFail(null);
    intentsAPI.get(id).then(setD).catch((e) => setFail(failureOf(e, 'the payment request could not be read')));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const i = d?.intent;
  const owner = i ? ownerLink(i, d?.links.order_id) : null;

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Payment request {i ? money(i.amount_minor, i.currency) : ''}</SheetTitle>
          <SheetDescription>What the payer was asked to pay, every gateway order opened for it, and what happened.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {fail && <FailureNotice failure={fail} what="Payment requests are not on this server yet." onRetry={load} />}
          {!d && !fail && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((n) => <span key={n} className="block h-3 animate-pulse rounded bg-gray-100" />)}</div>}
          {d && i && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={i.status} />
                {i.mode === 'test' && <Chip tone="blue">Test mode</Chip>}
                {i.late_capture && <Chip tone="amber">Paid after it closed</Chip>}
              </div>
              <p className="text-xs text-gray-500">{INTENT_STATUS_HELP[i.status] ?? ''}{i.cancel_reason ? ` Closed because ${CANCEL_REASON[i.cancel_reason] ?? i.cancel_reason}.` : ''}</p>

              <dl className="divide-y divide-gray-100">
                <Row k="For">
                  {owner ? <Link to={owner} className="inline-flex items-center gap-1 font-medium underline decoration-dotted underline-offset-2">{d.links.order_number ?? i.source_number ?? label(INTENT_SOURCE_LABEL, i.source)}<ExternalLink className="h-3 w-3" aria-hidden /></Link>
                    : (i.source_number ?? '—')}
                  <span className="block text-xs text-gray-500">{label(INTENT_SOURCE_LABEL, i.source)}</span>
                </Row>
                <Row k="Asked">{money(i.amount_minor, i.currency)}</Row>
                <Row k="Paid">{money(i.captured_minor, i.currency)}{i.captured_at ? <span className="block text-xs text-gray-500">{formatDateTime(i.captured_at)}</span> : null}</Row>
                {(i.refunded_minor ?? 0) > 0 && <Row k="Refunded">{money(i.refunded_minor, i.currency)}</Row>}
                <Row k="Payment taken">
                  {d.links.transaction_id ? (
                    <Link to={LINK.filtered({ id: d.links.transaction_id, q: i.payment_ref ?? undefined })} className="inline-flex items-center gap-1 font-medium underline decoration-dotted underline-offset-2">
                      Open in Payments<ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : <span className="text-gray-500">{i.status === 'captured' ? 'Not in the payment ledger yet (it is linked on the next reconciliation).' : 'No payment taken.'}</span>}
                  {i.payment_ref && <span className="block font-mono text-xs text-gray-500">{i.payment_ref}</span>}
                </Row>
                <Row k="Asked at">{formatDateTime(i.created_at)}</Row>
                <Row k="Request id" mono>{i.id}</Row>
              </dl>

              <section aria-label="Gateway orders">
                <h3 className="mb-1 text-sm font-semibold text-gray-800">Gateway orders ({d.attempts.length})</h3>
                {d.attempts.length === 0 ? <p className="text-sm text-gray-500">No payment window was opened at a gateway.</p> : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                    {d.attempts.map((a) => (
                      <li key={a.id} className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs">{a.gateway_ref ?? '—'}</span>
                          <Chip tone={INTENT_STATUS_TONE[a.status] ?? 'neutral'}>{label(ATTEMPT_STATUS_LABEL, a.status)}</Chip>
                        </div>
                        <div className="text-xs text-gray-500">
                          {a.provider}{a.method ? ` · ${a.method}` : ''} · {money(a.amount_minor, a.currency)} · {formatDateTime(a.created_at)}
                          {a.account_source ? ` · ${a.account_source === 'store' ? 'your own account' : a.account_source}` : ''}
                        </div>
                        {a.payment_ref && <div className="font-mono text-[11px] text-gray-500">{a.payment_ref}</div>}
                        {a.failure_reason && <div className="text-xs text-red-700">{a.failure_reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {d.refunds.length > 0 && (
                <section aria-label="Refunds">
                  <h3 className="mb-1 text-sm font-semibold text-gray-800">Refunds</h3>
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
                    {d.refunds.map((r) => (
                      <li key={r.id} className="px-3 py-2">
                        <div className="flex justify-between gap-2"><strong>{money(r.amount_minor, r.currency)}</strong><span className="text-xs text-gray-500">{r.status}</span></div>
                        <div className="text-xs text-gray-500">{formatDateTime(r.processed_at ?? r.created_at)}{r.reason ? ` · ${r.reason}` : ''}</div>
                        {r.failure_reason && <div className="text-xs text-red-700">{r.failure_reason}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-label="Timeline">
                <h3 className="mb-1 text-sm font-semibold text-gray-800">What happened</h3>
                {d.timeline.length === 0 ? <p className="text-sm text-gray-500">Nothing recorded yet.</p> : (
                  <ol className="space-y-1.5 border-l border-gray-200 pl-3 text-sm">
                    {d.timeline.map((e, n) => (
                      <li key={n}>
                        <span className="text-gray-900">{eventText(e)}</span>
                        <span className="block text-xs text-gray-500">{formatDateTime(e.at)}{e.actor ? ` · ${e.actor}` : ''}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PaymentRequests;
