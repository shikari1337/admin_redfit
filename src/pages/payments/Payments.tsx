/**
 * PAYMENTS — every online payment that reached the store's own gateway account, from any Growcord product,
 * with what the gateway kept (fee incl. GST, the GST part), what reached the bank (net), under which
 * settlement/UTR, and anything wrong (PAY-0 §2, §5; lane ADMIN-PAY-1).
 *
 * Filters live in the URL, so "12 not paid out" on Payment analytics opens exactly that list, and `?id=`
 * opens one payment's drawer (the order page links here). Pages by cursor ("Show more").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, CreditCard, Landmark, LineChart, Loader2 } from 'lucide-react';
import { INTENTS_LINK } from './intentsData';
import {
  Page, PageHeader, Btn, FilterBar, Field, SearchInput, FilterChips, ExportMenu, type ChipGroup,
} from '@/components/erp';
import {
  LINK, METHOD_LABEL, RECON_LABEL, SOURCE_LABEL, STATUS_LABEL, failureOf, money, storePaymentsAPI,
  type LoadFailure, type Transaction,
} from './data';
import {
  DEFAULT_FROM, DEFAULT_TO, FailureNotice, NoPayments, RangeFields, TXN_CSV, TxnDrawer, TxnTable,
  useDrawerParam, useUrlFilters,
} from './common';

const KEYS = ['from', 'to', 'status', 'recon_status', 'method', 'source', 'q'] as const;
const PAGE = 50;

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, l]) => ({ value, label: l }));

const Payments: React.FC = () => {
  const defaults = useMemo(() => ({ from: DEFAULT_FROM(), to: DEFAULT_TO() }), []);
  const [f, setF] = useUrlFilters(KEYS, defaults);
  const [drawer, setDrawer] = useDrawerParam();

  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [fail, setFail] = useState<LoadFailure | null>(null);
  const [q, setQ] = useState(f.q);
  useEffect(() => { setQ(f.q); }, [f.q]);

  const seq = useRef(0);
  const query = useMemo(() => ({
    from: f.from, to: f.to, status: f.status, recon_status: f.recon_status, method: f.method, source: f.source, q: f.q,
  }), [f.from, f.to, f.status, f.recon_status, f.method, f.source, f.q]);

  const load = useCallback(() => {
    const n = ++seq.current;
    setRows(null); setFail(null); setCursor(null);
    storePaymentsAPI.transactions({ ...query, limit: PAGE })
      .then((r) => { if (n === seq.current) { setRows(r.items); setCursor(r.next_cursor); } })
      .catch((e) => { if (n === seq.current) { setRows([]); setFail(failureOf(e, 'the payments could not be read')); } });
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const r = await storePaymentsAPI.transactions({ ...query, cursor, limit: PAGE });
      setRows((prev) => [...(prev ?? []), ...r.items]);
      setCursor(r.next_cursor);
    } catch (e) { setFail(failureOf(e, 'more payments could not be read')); }
    finally { setMore(false); }
  };

  // Search on Enter or after a short pause, not on every key.
  useEffect(() => {
    if (q === f.q) return undefined;
    const t = setTimeout(() => setF({ q: q.trim() }), 450);
    return () => clearTimeout(t);
  }, [q, f.q, setF]);

  const chips: ChipGroup[] = [
    { key: 'recon_status', label: 'Bank', value: f.recon_status, onChange: (v) => setF({ recon_status: v }), options: opts(RECON_LABEL), help: 'Has the money reached your bank, and does it agree with the order?' },
    { key: 'status', label: 'Status', value: f.status, onChange: (v) => setF({ status: v }), options: opts(STATUS_LABEL) },
    { key: 'method', label: 'Method', value: f.method, onChange: (v) => setF({ method: v }), options: opts(Object.fromEntries(Object.entries(METHOD_LABEL).filter(([k]) => k !== 'cod' && k !== 'unknown'))) },
    { key: 'source', label: 'From', value: f.source, onChange: (v) => setF({ source: v }), options: opts(SOURCE_LABEL), help: 'Which Growcord product took the payment.' },
  ];
  const filtered = !!(f.status || f.recon_status || f.method || f.source || f.q);
  const clearAll = () => setF({ status: '', recon_status: '', method: '', source: '', q: '' });

  // The visible rows' sums, per currency (never a float sum: minor integers).
  const sums = useMemo(() => {
    const by = new Map<string, { n: number; gross: number; fee: number; net: number; unknown: number }>();
    for (const t of rows ?? []) {
      const s = by.get(t.currency) ?? { n: 0, gross: 0, fee: 0, net: 0, unknown: 0 };
      s.n += 1; s.gross += t.amount_minor ?? 0;
      if (t.fee_minor === null) s.unknown += 1; else { s.fee += t.fee_minor; s.net += t.net_minor ?? 0; }
      by.set(t.currency, s);
    }
    return [...by.entries()];
  }, [rows]);

  return (
    <Page>
      <PageHeader
        title="Payments"
        icon={CreditCard}
        description="Every online payment into your gateway account: what the customer paid, what the gateway kept, and what reached your bank."
        actions={(
          <>
            <Link to={LINK.analytics} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><LineChart className="h-4 w-4" />Analytics</Link>
            <Link to={LINK.settlements} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><Landmark className="h-4 w-4" />Settlements</Link>
            <Link to={INTENTS_LINK} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"><ClipboardList className="h-4 w-4" />Requests</Link>
            <ExportMenu filename={`payments-${f.from}-to-${f.to}`} columns={TXN_CSV} rows={rows ?? []} disabled={!rows?.length} />
          </>
        )}
      />

      <FilterBar>
        <RangeFields from={f.from} to={f.to} onChange={(r) => setF(r)} />
        <Field label="Search" className="min-w-[16rem] flex-1">
          <form role="search" onSubmit={(e) => { e.preventDefault(); setF({ q: q.trim() }); }}>
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, pay_… or UTR" aria-label="Search by order number, payment id or UTR" />
          </form>
        </Field>
      </FilterBar>
      <FilterChips groups={chips} onClearAll={clearAll} />

      {fail && <FailureNotice failure={fail} what="This server does not keep the store’s payment ledger yet. Payments still show on each order." onRetry={load} />}

      {rows && rows.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600" aria-live="polite">
          {sums.map(([cur, s]) => (
            <span key={cur}>
              Showing <strong className="text-gray-900">{s.n}{cursor ? '+' : ''}</strong> payments · paid <strong className="text-gray-900">{money(s.gross, cur)}</strong>
              {' '}· fees <strong className="text-gray-900">{money(s.fee, cur)}</strong> · net <strong className="text-gray-900">{money(s.net, cur)}</strong>
              {s.unknown > 0 && <span className="text-gray-500"> · {s.unknown} fee{s.unknown === 1 ? '' : 's'} not known yet</span>}
            </span>
          ))}
        </div>
      )}

      <TxnTable rows={fail && !rows?.length ? [] : rows} onOpen={(id) => setDrawer(id)}
        empty={fail ? 'Nothing to show.' : <NoPayments filtered={filtered} onClear={clearAll} />} />

      {cursor && (
        <div className="flex justify-center">
          <Btn variant="outline" onClick={loadMore} disabled={more}>{more && <Loader2 className="h-4 w-4 animate-spin" />}Show more</Btn>
        </div>
      )}

      <TxnDrawer id={drawer} onClose={() => setDrawer(null)} />
    </Page>
  );
};

export default Payments;
