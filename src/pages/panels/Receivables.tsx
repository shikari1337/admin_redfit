import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Field, TextInput, Chip, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, inr,
  FilterBar, SelectInput, SearchInput,
  ExportMenu, Pagination, DrillLink, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * Receivables (AR) — "Money owed to you".
 *
 * Outstanding table sorted by amount owed, with ageing chips (90+ = red). Click a
 * customer to open their statement of account (period picker + Download PDF/CSV) —
 * the printable page an accountant sends a B2B buyer to chase money.
 * All figures are computed from orders; the backend never exposes global PII.
 */

const today = () => new Date().toISOString().slice(0, 10);

interface Ageing { d0_30: number; d31_60: number; d61_90: number; d90_plus: number; }
interface Customer {
  customer_id: string; name: string | null; company: string | null; phone: string | null;
  email: string | null; gstin: string | null; order_count: number; unpaid_count: number;
  total_billed: number; total_collected: number; total_refunded: number; outstanding: number;
  oldest_unpaid_date: string | null; oldest_unpaid_age_days: number | null; ageing: Ageing;
}

const AgeChips: React.FC<{ a: Ageing }> = ({ a }) => {
  const chips: Array<[string, number, 'green' | 'amber' | 'red']> = [
    ['0-30', a.d0_30, 'green'],
    ['31-60', a.d31_60, 'amber'],
    ['61-90', a.d61_90, 'amber'],
    ['90+', a.d90_plus, 'red'],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {chips.filter(([, v]) => v > 0.005).map(([label, v, tone]) => (
        <Chip key={label} tone={tone}>{label}: {inr(v)}</Chip>
      ))}
    </div>
  );
};

// Client-side CSV columns for the outstanding list (mirrors the server CSV).
const listCsvCols: CsvColumn<Customer>[] = [
  { key: 'name', label: 'Customer', format: (c) => c.name ?? '' },
  { key: 'company', label: 'Company', format: (c) => c.company ?? '' },
  { key: 'phone', label: 'Phone', format: (c) => c.phone ?? '' },
  { key: 'gstin', label: 'GSTIN', format: (c) => c.gstin ?? '' },
  { key: 'order_count', label: 'Orders' },
  { key: 'unpaid_count', label: 'Unpaid' },
  { key: 'total_billed', label: 'Total Billed', format: (c) => (c.total_billed ?? 0).toFixed(2) },
  { key: 'total_collected', label: 'Total Collected', format: (c) => (c.total_collected ?? 0).toFixed(2) },
  { key: 'outstanding', label: 'Outstanding', format: (c) => (c.outstanding ?? 0).toFixed(2) },
  { key: 'oldest_unpaid_date', label: 'Oldest Unpaid', format: (c) => c.oldest_unpaid_date ?? '' },
  { key: 'oldest_unpaid_age_days', label: 'Age (days)', format: (c) => c.oldest_unpaid_age_days ?? '' },
  { key: 'd0_30', label: '0-30', format: (c) => c.ageing.d0_30.toFixed(2) },
  { key: 'd31_60', label: '31-60', format: (c) => c.ageing.d31_60.toFixed(2) },
  { key: 'd61_90', label: '61-90', format: (c) => c.ageing.d61_90.toFixed(2) },
  { key: 'd90_plus', label: '90+', format: (c) => c.ageing.d90_plus.toFixed(2) },
];

const Receivables: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');

  const [asOf, setAsOf] = useState(today());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  // Search (customer name/company/GSTIN/phone), ageing filter and pagination are
  // client-side — the /ar/outstanding endpoint returns every owing customer at once.
  const lc = useListControls({ pageSize: 25 });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/ar/outstanding', { params: { asOf } });
      const data = payload<any>(res);
      setCustomers(data.customers ?? []);
      setSummary(data.summary ?? null);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (!selected) load(); /* eslint-disable-next-line */ }, [asOf, selected]);

  const filtered = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    return customers.filter((c) => {
      if (lc.status === 'overdue90' && !((c.ageing?.d90_plus ?? 0) > 0.005)) return false;
      if (!q) return true;
      return [c.name, c.company, c.gstin, c.phone].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [customers, lc.debouncedSearch, lc.status]);

  const pageRows = filtered.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  if (selected) return <Statement customer={selected} onBack={() => setSelected(null)} />;

  return (
    <Page>
      <PageHeader
        title="Receivables (AR)"
        description="Money owed to you — who owes what, since when. Click a customer for a printable statement to send them."
        actions={
          <div className="flex items-end gap-2">
            <Field label="As of"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <ExportMenu
              filename={`receivables-${asOf}`}
              columns={listCsvCols}
              rows={filtered}
              canExport={canRead}
              serverExports={[{ label: 'Server CSV (all customers)', path: '/ar/outstanding', params: { asOf, format: 'csv' }, filename: `receivables-${asOf}.csv` }]}
            />
          </div>
        }
      />

      {summary && (
        <StatGrid cols={4}>
          <StatCard label="Total outstanding" value={inr(summary.total_outstanding)} />
          <StatCard label="Customers owing" value={summary.customer_count} />
          <StatCard label="Billed (all-time)" value={inr(summary.total_billed)} />
          <StatCard label="Overdue 90+ days" value={inr(summary.ageing?.d90_plus)} tone="bad" />
        </StatGrid>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <FilterBar>
        <Field label="Search customer" className="min-w-[220px] flex-1">
          <SearchInput placeholder="Name, company, GSTIN or phone…" value={lc.search} onChange={(e) => lc.setSearch(e.target.value)} />
        </Field>
        <Field label="Ageing">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">All customers</option>
            <option value="overdue90">Overdue 90+ only</option>
          </SelectInput>
        </Field>
      </FilterBar>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Customer</Th>
            <Th>Contact</Th>
            <Th num>Orders</Th>
            <Th>Oldest unpaid</Th>
            <Th>Ageing</Th>
            <Th num>Outstanding</Th>
          </THead>
          <TBody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                {customers.length === 0 ? 'Nothing outstanding — every customer is settled. 🎉' : 'No customers match your filters.'}
              </td></tr>
            )}
            {!loading && pageRows.map((c) => (
              <Tr key={c.customer_id} onClick={() => setSelected(c)} className="cursor-pointer">
                <Td>
                  <div className="font-medium text-gray-900">{c.company || c.name || 'Customer'}</div>
                  {c.company && c.name && <div className="text-xs text-gray-500">{c.name}</div>}
                  {c.gstin && <div className="font-mono text-xs text-gray-400">{c.gstin}</div>}
                </Td>
                <Td muted className="text-xs">{c.phone ?? '—'}</Td>
                <Td num>
                  <span className="font-medium text-red-700">{c.unpaid_count}</span>
                  <span className="text-gray-400"> / {c.order_count}</span>
                </Td>
                <Td className="text-xs">
                  {c.oldest_unpaid_date ?? '—'}
                  {c.oldest_unpaid_age_days != null && (
                    <span className={`ml-1 ${c.oldest_unpaid_age_days > 90 ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                      ({c.oldest_unpaid_age_days}d)
                    </span>
                  )}
                </Td>
                <Td><AgeChips a={c.ageing} /></Td>
                <Td num className="font-mono font-semibold text-gray-900">{inr(c.outstanding)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={filtered.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
    </Page>
  );
};

// Client-side CSV columns for a statement of account (mirrors the server CSV).
const stmtCsvCols: CsvColumn<any>[] = [
  { key: 'date', label: 'Date' },
  { key: 'document', label: 'Document' },
  { key: 'particulars', label: 'Particulars' },
  { key: 'order_type', label: 'Order Type', format: (r) => r.order_type ?? '' },
  { key: 'debit', label: 'Debit', format: (r) => (r.debit ? r.debit.toFixed(2) : '') },
  { key: 'credit', label: 'Credit', format: (r) => (r.credit ? r.credit.toFixed(2) : '') },
  { key: 'running_balance', label: 'Balance', format: (r) => (r.running_balance ?? 0).toFixed(2) },
];

// ── Statement of account view ────────────────────────────────────────────────
const Statement: React.FC<{ customer: Customer; onBack: () => void }> = ({ customer, onBack }) => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('accounting.read');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stmt, setStmt] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const params = () => {
    const p: any = {};
    if (from) p.from = from; if (to) p.to = to;
    return p;
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get(`/ar/statement/${customer.customer_id}`, { params: params() });
      setStmt(payload<any>(res));
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const c = stmt?.customer ?? customer;
  const label = customer.company || customer.name || 'Customer';

  return (
    <Page>
      <button onClick={onBack} className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline">← Back to Receivables</button>

      <PageHeader
        title="Statement of Account"
        description={<><span className="font-medium text-gray-700">{label}</span>
          {c.phone && <span className="text-gray-500"> · {c.phone}</span>}
          {c.gstin && <span className="font-mono text-gray-400"> · {c.gstin}</span>}</>}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <ExportMenu
              filename={`statement-${label}`}
              columns={stmtCsvCols}
              rows={stmt?.rows ?? []}
              canExport={canRead}
              disabled={!stmt}
              serverExports={[
                { label: 'Download PDF', path: `/ar/statement/${customer.customer_id}/pdf`, params: params(), filename: `statement-${label}.pdf` },
                { label: 'Server CSV', path: `/ar/statement/${customer.customer_id}`, params: { ...params(), format: 'csv' }, filename: `statement-${label}.csv` },
              ]}
            />
          </div>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {stmt && (
        <>
          <StatGrid cols={4}>
            <StatCard label="Opening balance" value={inr(stmt.opening_balance)} />
            <StatCard label="Total debit (invoiced)" value={inr(stmt.total_debit)} />
            <StatCard label="Total credit (paid)" value={inr(stmt.total_credit)} />
            <StatCard label="Closing balance due" value={inr(stmt.closing_balance)} tone="info" />
          </StatGrid>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Date</Th><Th>Document</Th><Th>Particulars</Th>
                <Th num>Debit</Th><Th num>Credit</Th><Th num>Balance</Th>
              </THead>
              <TBody>
                <Tr className="text-gray-500">
                  <Td>{stmt.period?.from ?? ''}</Td>
                  <Td></Td>
                  <Td className="italic">Opening balance</Td>
                  <Td num></Td><Td num></Td>
                  <Td num className="font-mono">{inr(stmt.opening_balance)}</Td>
                </Tr>
                {stmt.rows.map((r: any, i: number) => (
                  <Tr key={i}>
                    <Td>{r.date}</Td>
                    <Td className="font-mono text-xs">
                      {r.order_id ? <DrillLink to={`/orders/${r.order_id}`} title="Open this order">{r.document}</DrillLink> : r.document}
                    </Td>
                    <Td>{r.particulars}</Td>
                    <Td num className="font-mono">{r.debit ? inr(r.debit) : ''}</Td>
                    <Td num className="font-mono text-emerald-700">{r.credit ? inr(r.credit) : ''}</Td>
                    <Td num className="font-mono">{inr(r.running_balance)}</Td>
                  </Tr>
                ))}
                {stmt.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No transactions in this period.</td></tr>
                )}
              </TBody>
              <tfoot>
                <tr className="border-t-2 font-semibold text-gray-900">
                  <td className="px-4 py-2.5" colSpan={3}>Closing balance due</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{inr(stmt.total_debit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{inr(stmt.total_credit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-lg">{inr(stmt.closing_balance)}</td>
                </tr>
              </tfoot>
            </table>
          </TableShell>
        </>
      )}
      {loading && !stmt && <div className="text-sm text-gray-500">Loading…</div>}
    </Page>
  );
};

export default Receivables;
