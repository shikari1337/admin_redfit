/**
 * PAYMENT ANALYTICS — for each rupee customers paid online: what the gateway kept (fee incl. GST, and the
 * GST part), what reached the bank, by day and by method; prepaid against COD; and the payments that need
 * a look (not paid out, not from our checkout, mismatched), each count linking to the filtered Payments
 * table. "Run reconciliation" (settings.manage) re-reads the gateway's settlement report for the range.
 * PAY-0 §2 routes 1, 4, 7 + §3 COD summary; lane ADMIN-PAY-1.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CreditCard, Landmark, LineChart, Loader2, RefreshCw, Truck } from 'lucide-react';
import { Page, PageHeader, Btn, FilterBar, StatCard, StatGrid, SectionCard, DrillLink } from '@/components/erp';
import { ChartCard, TimeSeries } from '@/components/panelAnalytics/Kit';
import { SERIES } from '@/components/panelAnalytics/vizTheme';
import { useAuth } from '@/contexts/AuthContext';
import { minorToMajor } from '@/lib/v2/money';
import {
  LINK, METHOD_LABEL, SOURCE_LABEL, codPayoutsAPI, failureOf, feePct, label, money, storePaymentsAPI,
  type CodSummary, type LoadFailure, type ReconResult, type Summary,
} from './data';
import { HeldFeesPanel } from './feeVendors/FeeVendors';
import { DEFAULT_FROM, DEFAULT_TO, ErrorNotice, FailureNotice, GapNotice, Hint, RangeFields, TIPS, useUrlFilters } from './common';

type Count = { n: number; more: boolean } | null;

const linkBtn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50';

/** One step of the gross → fee → GST → net flow. */
const Step: React.FC<{ label: React.ReactNode; value: string; sub?: string; tone?: 'minus' | 'result' | 'part' }> = ({ label: l, value, sub, tone }) => (
  <div className={tone === 'result' ? 'rounded-lg bg-emerald-50 px-3 py-2' : tone === 'part' ? 'rounded-lg bg-gray-50 px-3 py-2 sm:ml-4' : 'rounded-lg px-3 py-2'}>
    <div className="text-xs font-medium text-gray-500">{l}</div>
    <div className={tone === 'result' ? 'text-xl font-bold tabular-nums text-emerald-800' : 'text-xl font-semibold tabular-nums text-gray-900'}>{value}</div>
    {sub && <div className="text-xs text-gray-500">{sub}</div>}
  </div>
);

const PaymentAnalytics: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRecon = hasPerm('settings.manage');
  const defaults = useMemo(() => ({ from: DEFAULT_FROM(), to: DEFAULT_TO() }), []);
  const [f, setF] = useUrlFilters(['from', 'to', 'currency'] as const, defaults);
  // Calendar days in the range, inclusive (recon run takes ≤ 31, the COD summary ≤ 366).
  const days = Math.round((Date.parse(`${f.to}T00:00:00Z`) - Date.parse(`${f.from}T00:00:00Z`)) / 86400000) + 1;
  const reconTooLong = !(days > 0 && days <= 31);

  const [byDay, setByDay] = useState<Summary | null>(null);
  const [byMethod, setByMethod] = useState<Summary | null>(null);
  const [bySource, setBySource] = useState<Summary | null>(null);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [cod, setCod] = useState<CodSummary | null>(null);
  const [codFail, setCodFail] = useState<LoadFailure | null>(null);
  const [counts, setCounts] = useState<Record<'unsettled' | 'orphan' | 'mismatch', Count>>({ unsettled: null, orphan: null, mismatch: null });

  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState<ReconResult | null>(null);
  const [runErr, setRunErr] = useState('');

  const load = useCallback(() => {
    const range = { from: f.from, to: f.to };
    const money_ = { ...range, currency: f.currency || undefined };
    setByDay(null); setByMethod(null); setBySource(null); setFail(null); setCod(null); setCodFail(null);
    setCounts({ unsettled: null, orphan: null, mismatch: null });
    storePaymentsAPI.summary({ ...money_, group: 'day' }).then(setByDay).catch((e) => setFail(failureOf(e, 'the payment summary could not be read')));
    storePaymentsAPI.summary({ ...money_, group: 'method' }).then(setByMethod).catch(() => setByMethod({ totals: null as any, rows: [], currencies: [] }));
    storePaymentsAPI.summary({ ...money_, group: 'source' }).then(setBySource).catch(() => setBySource({ totals: null as any, rows: [], currencies: [] }));
    if (days > 366) { setCodFail({ gap: false, forbidden: false, message: 'The COD summary covers at most 366 days — pick a shorter range.' }); return; }
    codPayoutsAPI.summary(range).then(setCod).catch((e) => setCodFail(failureOf(e, 'the COD summary could not be read')));
    // The attention counts read the table itself (limit 100 → "100+"), so a count and its link always agree.
    (['unsettled', 'orphan', 'mismatch'] as const).forEach((k) => {
      storePaymentsAPI.transactions({ ...range, recon_status: k, limit: 100 })
        .then((r) => setCounts((c) => ({ ...c, [k]: { n: r.items.length, more: !!r.next_cursor } })))
        .catch(() => setCounts((c) => ({ ...c, [k]: null })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.from, f.to, f.currency]);
  useEffect(() => { load(); }, [load]);

  const runRecon = async () => {
    setRunning(true); setRunErr(''); setRan(null);
    try { setRan(await storePaymentsAPI.reconRun({ from: f.from, to: f.to })); load(); }
    catch (e: any) { const x = failureOf(e, 'reconciliation could not run'); setRunErr(x.gap ? 'Reconciliation is not available on this server yet.' : x.forbidden ? 'You need the “manage settings” permission to run reconciliation.' : x.message); }
    finally { setRunning(false); }
  };

  const t = byDay?.totals ?? null;
  const cur = t?.currency ?? 'INR';
  const major = (m: number | null) => (m === null ? null : minorToMajor(m, cur));
  const dayRows = useMemo(() => (byDay?.rows ?? []).slice().sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({
    bucket: r.key, gross: major(r.gross_minor), fee: major(r.fee_minor), net: major(r.net_minor),
    _r: r,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [byDay]);
  const orphanBySource = bySource?.rows.find((r) => r.key === 'unknown')?.count ?? null;

  const countText = (c: Count) => (c === null ? '—' : `${c.n}${c.more ? '+' : ''}`);
  const filtered = (recon_status: string) => LINK.filtered({ from: f.from, to: f.to, recon_status });

  return (
    <Page>
      <PageHeader
        title="Payment analytics"
        icon={LineChart}
        description="What customers paid online, what the gateway kept, and what reached your bank — with anything that needs a look."
        actions={(
          <>
            <Link to={LINK.filtered({ from: f.from, to: f.to })} className={linkBtn}><CreditCard className="h-4 w-4" />Payments</Link>
            <Link to={LINK.settlements} className={linkBtn}><Landmark className="h-4 w-4" />Settlements</Link>
            <Btn variant="outline" onClick={runRecon} disabled={!canRecon || running || reconTooLong}
              title={!canRecon ? 'Needs the “manage settings” permission' : reconTooLong ? 'Pick at most 31 days to reconcile' : 'Read the gateway’s settlement report for these dates and match every payment'}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Run reconciliation
            </Btn>
          </>
        )}
      />
      <FilterBar><RangeFields from={f.from} to={f.to} onChange={(r) => setF(r)} /></FilterBar>
      {(byDay?.currencies.length ?? 0) > 1 && (
        <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Currency">
          <span className="text-gray-500">Currency:</span>
          {byDay!.currencies.map((c) => (
            <button key={c} type="button" aria-pressed={(f.currency || byDay!.totals.currency) === c} onClick={() => setF({ currency: c })}
              className={(f.currency || byDay!.totals.currency) === c ? 'h-8 rounded-full border border-gray-900 bg-gray-900 px-3 text-xs font-medium text-white' : 'h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:text-gray-900'}>
              {c}
            </button>
          ))}
          <span className="text-xs text-gray-500">Amounts in different currencies are never added together.</span>
        </div>
      )}
      {!canRecon && <p className="-mt-3 text-xs text-gray-500">Running reconciliation needs the “manage settings” permission; it also runs on its own every night.</p>}
      {canRecon && reconTooLong && <p className="-mt-3 text-xs text-gray-500">Reconciliation runs on at most 31 days at a time — narrow the dates to run it.</p>}

      {ran && (ran.own_account ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Reconciliation done: checked {ran.checked} payments — {ran.settled} now in the bank, {ran.refunds} refunds read, {ran.orphans} not from our checkout, {ran.mismatches} mismatched
          {ran.unchecked > 0 ? `, ${ran.unchecked} not in a settlement report yet (they are checked again on the next run)` : ''}.
        </div>
      ) : (
        <div role="status" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          This store takes payments on Growcord’s account, so there is nothing to reconcile here — Growcord settles those payments to you.
        </div>
      ))}
      {runErr && <ErrorNotice message={runErr} />}
      {/* Gateway fees / courier charges the books are holding (DEC-072), with the fix one click away. */}
      <HeldFeesPanel compact />

      {fail && <FailureNotice failure={fail} what="This server does not keep the store’s payment ledger yet." onRetry={load} />}

      {/* Money flow */}
      {!fail && (
        <SectionCard title="Where each rupee went" description="Online payments in this period, from what customers paid to what reached your bank.">
          {!t ? <div className="h-24 animate-pulse rounded bg-gray-50" aria-busy="true" /> : t.count === 0 ? (
            <p className="text-sm text-gray-500">No online payments in this period.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
              <Step label={<Hint tip={TIPS.amount}>Customers paid</Hint>} value={money(t.gross_minor, cur)} sub={`${t.count} payments`} />
              <ArrowRight className="hidden h-4 w-4 text-gray-300 sm:block" aria-hidden />
              <div>
                <Step label={<Hint tip={TIPS.fee}>Gateway fee (incl. GST)</Hint>} value={`− ${money(t.fee_minor, cur)}`} sub={`Effective fee ${feePct(t.fee_minor, t.gross_minor)}`} tone="minus" />
                <Step label={<Hint tip={TIPS.tax}>of which GST on fee</Hint>} value={money(t.tax_minor, cur)} tone="part" />
              </div>
              <ArrowRight className="hidden h-4 w-4 text-gray-300 sm:block" aria-hidden />
              <Step label={<Hint tip={TIPS.net}>Net to your bank</Hint>} value={money(t.net_minor, cur)} sub={`${money(t.settled_minor, cur)} already in the bank`} tone="result" />
            </div>
          )}
          {t && t.fee_unknown_count > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              The fee is not known yet for {t.fee_unknown_count} payment{t.fee_unknown_count === 1 ? '' : 's'}, so fees and net are partial; they fill in once the settlement report is read.
            </p>
          )}
        </SectionCard>
      )}

      {/* Needs a look */}
      {!fail && (
        <StatGrid cols={4}>
          <Link to={filtered('unsettled')} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
            <StatCard label="Not paid out yet" value={countText(counts.unsettled)} sub={t ? `${money(t.unsettled_minor, cur)} the gateway still owes you` : 'Captured, not yet in the bank'} tone={(counts.unsettled?.n ?? 0) > 0 ? 'warn' : 'default'} />
          </Link>
          <Link to={filtered('orphan')} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
            <StatCard label={<Hint tip="Payments on your gateway account that no order or checkout of ours recorded — money taken outside the store’s checkout.">Not from our checkout</Hint>} value={countText(counts.orphan ?? (orphanBySource !== null ? { n: orphanBySource, more: false } : null))} sub="Open to see each one" tone={(counts.orphan?.n ?? 0) > 0 ? 'bad' : 'default'} />
          </Link>
          <Link to={filtered('mismatch')} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
            <StatCard label={<Hint tip="The gateway took a different amount or currency than the order says.">Mismatched</Hint>} value={countText(counts.mismatch)} sub="Amount or currency differs from the order" tone={(counts.mismatch?.n ?? 0) > 0 ? 'bad' : 'default'} />
          </Link>
          <StatCard label="Refunded" value={t ? money(t.refunded_minor, cur) : '—'} sub="Sent back to customers in this period" />
        </StatGrid>
      )}

      {/* By day */}
      {!fail && (
        <ChartCard title="By day" sub="Paid, fee and net per day (store’s calendar)." dim={!byDay}
          table={{
            columns: [
              { key: 'bucket', label: 'Day', align: 'left' },
              { key: 'count', label: 'Payments', format: (_v, r) => r._r.count },
              { key: 'gross', label: 'Paid', format: (_v, r) => money(r._r.gross_minor, cur) },
              { key: 'fee', label: 'Fee (incl. GST)', format: (_v, r) => money(r._r.fee_minor, cur) },
              { key: 'tax', label: 'GST on fee', format: (_v, r) => money(r._r.tax_minor, cur) },
              { key: 'net', label: 'Net', format: (_v, r) => money(r._r.net_minor, cur) },
              { key: 'pct', label: 'Effective fee', format: (_v, r) => feePct(r._r.fee_minor, r._r.gross_minor) },
            ],
            rows: dayRows,
            empty: 'No payments in this period.',
          }}>
          {dayRows.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{byDay ? 'No payments in this period.' : 'Loading…'}</p> : (
            <TimeSeries data={dayRows} granularity="day" money
              series={[
                { key: 'gross', name: 'Paid', color: SERIES[0], kind: 'bar' },
                { key: 'net', name: 'Net to bank', color: SERIES[1], kind: 'line' },
                { key: 'fee', name: 'Fee (incl. GST)', color: SERIES[2], kind: 'line' },
              ]} />
          )}
        </ChartCard>
      )}

      {/* By method + by source */}
      {!fail && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="By method" description="Which way customers paid, and what each way costs you." flush>
            <SummaryTable rows={byMethod?.rows ?? null} keyLabel="Method" name={(k) => label(METHOD_LABEL, k)} cur={cur} link={(k) => LINK.filtered({ from: f.from, to: f.to, method: k })} />
          </SectionCard>
          <SectionCard title="By product" description="Which Growcord product took the payment." flush>
            <SummaryTable rows={bySource?.rows ?? null} keyLabel="From" name={(k) => label(SOURCE_LABEL, k)} cur={cur} link={(k) => LINK.filtered({ from: f.from, to: f.to, source: k })} />
          </SectionCard>
        </div>
      )}

      {/* Prepaid vs COD */}
      <SectionCard title="Prepaid against cash on delivery" description="Online payments keep a gateway fee; COD keeps a courier charge. Compare what each kept."
        action={<DrillLink to={LINK.cod}>COD payouts</DrillLink>}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><CreditCard className="h-4 w-4" />Prepaid (online)</div>
            {!t ? <p className="text-sm text-gray-500">{fail ? 'Not available.' : 'Loading…'}</p> : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-gray-500">Paid</dt><dd className="text-right tabular-nums">{money(t.gross_minor, cur)}</dd>
                <dt className="text-gray-500">Gateway fee (incl. GST)</dt><dd className="text-right tabular-nums">{money(t.fee_minor, cur)}</dd>
                <dt className="text-gray-500">Kept by the gateway</dt><dd className="text-right tabular-nums">{feePct(t.fee_minor, t.gross_minor)}</dd>
                <dt className="font-medium text-gray-700">Net to you</dt><dd className="text-right font-semibold tabular-nums">{money(t.net_minor, cur)}</dd>
              </dl>
            )}
          </div>
          <div className="space-y-1 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Truck className="h-4 w-4" />Cash on delivery</div>
            {codFail ? (codFail.gap ? <GapNotice what="COD money (collected, remitted, courier charges) is not on this server yet." /> : <p className="text-sm text-red-700">{codFail.message}</p>)
              : !cod ? <p className="text-sm text-gray-500">Loading…</p> : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-gray-500">Delivered COD orders</dt><dd className="text-right tabular-nums">{cod.delivered_cod_count}</dd>
                  <dt className="text-gray-500">Collected at the door</dt><dd className="text-right tabular-nums">{money(cod.collected_minor, cod.currency)}</dd>
                  <dt className="text-gray-500">Courier COD charges</dt><dd className="text-right tabular-nums">{money(cod.courier_cod_charges_minor, cod.currency)}</dd>
                  <dt className="text-gray-500">Kept by the courier</dt><dd className="text-right tabular-nums">{feePct(cod.courier_cod_charges_minor, cod.collected_minor)}</dd>
                  <dt className="text-gray-500"><Hint tip="The COD fee your shoppers paid at checkout, without its GST.">COD fee from shoppers (excl. GST)</Hint></dt><dd className="text-right tabular-nums">{money(cod.cod_fee_from_shoppers_minor, cod.currency)}</dd>
                  <dt className="font-medium text-gray-700"><Hint tip="COD margin = COD fee from shoppers (without GST) − courier COD charges. Negative means COD costs you more than you charge for it.">COD margin (fee excl. GST − courier charges)</Hint></dt>
                  <dd className={`text-right font-semibold tabular-nums ${(cod.cod_margin_minor ?? 0) < 0 ? 'text-red-700' : ''}`}>{money(cod.cod_margin_minor, cod.currency)}</dd>
                  <dt className="text-gray-500">Still to be paid by couriers</dt><dd className="text-right tabular-nums">{money(cod.pending_minor, cod.currency)}</dd>
                </dl>
              )}
            {cod && cod.mismatched_count > 0 && (
              <Link to={LINK.cod} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 underline underline-offset-2">
                <AlertTriangle className="h-3.5 w-3.5" />{cod.mismatched_count} COD line{cod.mismatched_count === 1 ? '' : 's'} do not match
              </Link>
            )}
          </div>
        </div>
      </SectionCard>
    </Page>
  );
};

const SummaryTable: React.FC<{
  rows: Summary['rows'] | null; keyLabel: string; name: (k: string) => string; cur: string; link: (k: string) => string;
}> = ({ rows, keyLabel, name, cur, link }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <tr>
          <th className="px-4 py-2">{keyLabel}</th>
          <th className="px-4 py-2 text-right">Payments</th>
          <th className="px-4 py-2 text-right">Paid</th>
          <th className="px-4 py-2 text-right">Fee (incl. GST)</th>
          <th className="px-4 py-2 text-right">Effective</th>
          <th className="px-4 py-2 text-right">Net</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows === null ? (
          <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No payments in this period.</td></tr>
        ) : rows.slice().sort((a, b) => (b.gross_minor ?? 0) - (a.gross_minor ?? 0)).map((r) => (
          <tr key={r.key}>
            <td className="px-4 py-2"><DrillLink to={link(r.key)}>{name(r.key)}</DrillLink></td>
            <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
            <td className="px-4 py-2 text-right tabular-nums">{money(r.gross_minor, r.currency || cur)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{money(r.fee_minor, r.currency || cur)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{feePct(r.fee_minor, r.gross_minor)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{money(r.net_minor, r.currency || cur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default PaymentAnalytics;
