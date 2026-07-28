import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, Field, TextInput, Chip, StatCard, StatGrid,
  TableShell, THead, Th, TBody, Tr, Td, inr,
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

// Download a blob response as a file.
async function download(url: string, params: any, filename: string) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  const href = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(href);
}

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

const Receivables: React.FC = () => {
  const [asOf, setAsOf] = useState(today());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

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

  if (selected) return <Statement customer={selected} onBack={() => setSelected(null)} />;

  return (
    <Page>
      <PageHeader
        title="Receivables (AR)"
        description="Money owed to you — who owes what, since when. Click a customer for a printable statement to send them."
        actions={
          <div className="flex items-end gap-2">
            <Field label="As of"><TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
            <Btn variant="outline" onClick={() => download('/ar/outstanding', { asOf, format: 'csv' }, `receivables-${asOf}.csv`)}>Export CSV</Btn>
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
            {customers.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nothing outstanding — every customer is settled. 🎉</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {customers.map((c) => (
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
    </Page>
  );
};

// ── Statement of account view ────────────────────────────────────────────────
const Statement: React.FC<{ customer: Customer; onBack: () => void }> = ({ customer, onBack }) => {
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
            <Btn onClick={() => download(`/ar/statement/${customer.customer_id}/pdf`, params(), `statement-${label}.pdf`)}>Download PDF</Btn>
            <Btn variant="outline" onClick={() => download(`/ar/statement/${customer.customer_id}`, { ...params(), format: 'csv' }, `statement-${label}.csv`)}>CSV</Btn>
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
                    <Td className="font-mono text-xs">{r.document}</Td>
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
