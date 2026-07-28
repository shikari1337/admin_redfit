import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, TabBar, StatCard, Btn, StatusChip, Chip, FilterBar, Field,
  TextInput, SelectInput, SearchInput, TableShell, THead, Th, TBody, Tr, Td, inr, num,
} from '../../components/erp';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

/**
 * Reports (Part VI "Reports" — slice 1). Built for a non-technical store owner:
 * big readable numbers, plain-language headers, a one-line "what is this?", and
 * a one-click Download CSV on every report. All data is read-only.
 *
 * Admin axios unwraps {success,data} but passes {success,rows,total} through —
 * so list tabs read res.data.rows and the valuation tab uses payload().
 */

// Plain-language names for the stock-ledger movement types.
const MOVEMENT_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  purchase_receipt: 'Goods received',
  sales_issue: 'Sold',
  transfer_out: 'Transferred out',
  transfer_in: 'Transferred in',
  adjustment: 'Manual adjustment',
  sales_return: 'Customer return',
  purchase_return: 'Returned to supplier',
  cycle_count_correction: 'Stock-count correction',
  damage: 'Damaged',
  expiry_write_off: 'Expired (written off)',
  rto_receipt: 'Delivery returned (RTO)',
};
const moveLabel = (t: string) => MOVEMENT_LABELS[t] ?? t;

async function downloadCsv(path: string, params: Record<string, any>, filename: string) {
  const res = await api.get(path, { params: { ...params, format: 'csv' }, responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data as any], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const DownloadCsvButton: React.FC<{ path: string; params: Record<string, any>; filename: string }> =
  ({ path, params, filename }) => {
    const [busy, setBusy] = useState(false);
    return (
      <Btn
        variant="success"
        size="lg"
        onClick={async () => {
          setBusy(true);
          try { await downloadCsv(path, params, filename); }
          catch (e) { /* surfaced by the page's error state on next load */ }
          finally { setBusy(false); }
        }}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Download CSV
      </Btn>
    );
  };

const Explain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="max-w-3xl text-sm text-gray-600">
    <span className="font-semibold text-gray-800">What is this? </span>{children}
  </p>
);

const ErrorBar: React.FC<{ msg: string }> = ({ msg }) =>
  msg ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div> : null;

// ── Tab 1: Stock summary ─────────────────────────────────────────────────────

const StockSummaryTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const PAGE = 50;

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/reports/stock-summary', {
        params: { search: search || undefined, inStockOnly, limit: PAGE, offset: page * PAGE },
      });
      setRows(res.data.rows ?? []);
      setTotal(res.data.total ?? 0);
      setTotals(res.data.totals ?? null);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, inStockOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Stock on hand</h2>
          <Explain>How much of every product you have right now — the amount in stock, the amount
            already reserved for open orders, and what's left to sell — with each item's average
            cost and total value.</Explain>
        </div>
        <DownloadCsvButton path="/reports/stock-summary" params={{ search: search || undefined, inStockOnly }} filename="stock-summary.csv" />
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Products in stock" value={num(total)} />
          <StatCard label="Units on hand" value={num(totals.on_hand)} />
          <StatCard label="Units available to sell" value={num(totals.available)} tone="good" />
          <StatCard label="Total stock value" value={inr(totals.stock_value)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setPage(0); load(); }} className="flex items-center gap-2">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU…" className="w-64" />
          <Btn variant="outline" type="submit">Search</Btn>
        </form>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => { setPage(0); setInStockOnly(e.target.checked); }} />
          Only items currently in stock
        </label>
      </div>

      <ErrorBar msg={error} />
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Product</Th><Th>SKU</Th>
            <Th num>On hand</Th><Th num>Reserved</Th><Th num>Available</Th>
            <Th num>Avg cost</Th><Th num>Stock value</Th>
          </THead>
          <TBody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No stock to show.</td></tr>
            )}
            {rows.map((r) => (
              <Tr key={r.variation_id}>
                <Td>{r.product_name}{r.variation_name ? <span className="text-gray-400"> · {r.variation_name}</span> : ''}</Td>
                <Td className="font-mono text-xs">{r.sku}</Td>
                <Td num>{num(r.on_hand)}</Td>
                <Td num>{num(r.reserved)}</Td>
                <Td num className="font-semibold">{num(r.available)}</Td>
                <Td num>{inr(r.avg_cost)}</Td>
                <Td num>{inr(r.stock_value)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} loading={loading} />
    </div>
  );
};

// ── Tab 2: Valuation tie-out ─────────────────────────────────────────────────

const ValuationTab: React.FC = () => {
  const [v, setV] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setV(payload(await api.get('/reports/valuation'))); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Inventory value check</h2>
          <Explain>Does the value of the stock sitting on your shelves match what your accounts say
            your inventory is worth? If the two don't match, the gap is shown here honestly — along
            with how many units don't have a cost recorded yet.</Explain>
        </div>
        <DownloadCsvButton path="/reports/valuation" params={{}} filename="inventory-valuation.csv" />
      </div>

      <ErrorBar msg={error} />
      {v && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Value of stock on the shelf" value={inr(v.stock_value)} />
            <StatCard label="What the books say it's worth" value={inr(v.gl_inventory_value)} />
            <StatCard label="Difference"
              value={inr(v.difference)}
              tone={v.matches ? 'good' : 'bad'} />
          </div>
          <div className={`rounded-xl border p-4 ${v.matches ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="text-sm font-semibold text-gray-900">
              {v.matches ? '✓ Everything balances' : '⚠ There is a difference to look into'}
            </div>
            <p className="mt-1 text-sm text-gray-700">
              {v.matches
                ? 'The value of your stock matches your accounting records exactly.'
                : `Your stock value and your accounting records differ by ${inr(Math.abs(v.difference))}. This is usually because some goods received haven't been costed yet, or an entry is pending.`}
              {' '}
              {Number(v.uncosted_units) > 0
                ? <><strong>{num(v.uncosted_units)}</strong> unit(s) have no cost recorded yet and are not counted in the stock value above (shown honestly, never guessed).</>
                : 'Every unit in stock has a recorded cost.'}
            </p>
          </div>
        </>
      )}
      {loading && !v && <div className="text-sm text-gray-500">Loading…</div>}
    </div>
  );
};

// ── Tab 3: Stock ageing ──────────────────────────────────────────────────────

const AGE_TONES: Record<string, 'good' | 'default' | 'warn' | 'bad'> = {
  '0-30': 'good', '31-60': 'default', '61-90': 'warn', '90+': 'bad',
};

const AgeingTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [bucket, setBucket] = useState<string>('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const PAGE = 50;

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/reports/ageing', {
        params: { bucket: bucket || undefined, limit: PAGE, offset: page * PAGE },
      });
      setRows(res.data.rows ?? []);
      setTotal(res.data.total ?? 0);
      setSummary(res.data.summary ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bucket, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Stock ageing</h2>
          <Explain>How long the stock you're holding has been sitting since it last came in.
            Older stock ties up your cash and — for medicines — is closer to expiring. Click a
            group to see just those items.</Explain>
        </div>
        <DownloadCsvButton path="/reports/ageing" params={{ bucket: bucket || undefined }} filename="stock-ageing.csv" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.filter((s) => s.bucket !== 'unknown').map((s) => (
          <button key={s.bucket} onClick={() => { setPage(0); setBucket(bucket === s.bucket ? '' : s.bucket); }}
            className={`rounded-xl text-left transition ${bucket === s.bucket ? 'ring-2 ring-gray-900 ring-offset-1' : 'hover:ring-1 hover:ring-gray-200'}`}>
            <StatCard
              label={`${s.bucket} days · ${num(s.sku_count)} item(s)`}
              value={inr(s.stock_value)}
              tone={AGE_TONES[s.bucket] ?? 'default'} />
          </button>
        ))}
      </div>
      {bucket && <div className="text-sm text-gray-600">Showing only the <strong>{bucket} days</strong> group. <button onClick={() => { setPage(0); setBucket(''); }} className="font-medium text-gray-900 underline">Show all</button></div>}

      <ErrorBar msg={error} />
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Product</Th><Th>SKU</Th><Th num>On hand</Th>
            <Th>Last received</Th><Th num>Days in stock</Th>
            <Th>Age group</Th><Th num>Stock value</Th>
          </THead>
          <TBody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No stock to show.</td></tr>
            )}
            {rows.map((r) => (
              <Tr key={r.variation_id}>
                <Td>{r.product_name}</Td>
                <Td className="font-mono text-xs">{r.sku}</Td>
                <Td num>{num(r.on_hand)}</Td>
                <Td>{r.last_receipt_date ?? '—'}</Td>
                <Td num>{r.days_since_receipt ?? '—'}</Td>
                <Td>
                  <Chip tone={
                    r.ageing_bucket === '90+' ? 'red'
                    : r.ageing_bucket === '61-90' ? 'amber'
                    : r.ageing_bucket === '0-30' ? 'green' : 'neutral'
                  }>{r.ageing_bucket} days</Chip>
                </Td>
                <Td num>{inr(r.stock_value)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} loading={loading} />
    </div>
  );
};

// ── Tab 4: Batches & expiry ──────────────────────────────────────────────────

const BatchesTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [nearOnly, setNearOnly] = useState(false);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/reports/batches', { params: nearOnly ? { nearExpiryDays: days } : {} });
      setRows(res.data.rows ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [nearOnly, days]);

  const expiryClass = (d: number | null) =>
    d === null ? '' : d < 0 ? 'bg-red-100 text-red-800'
    : d <= 30 ? 'bg-red-50 text-red-700'
    : d <= 90 ? 'bg-amber-50 text-amber-800' : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Batches &amp; expiry</h2>
          <Explain>Every batch of stock you're holding and when it expires. Batches closest to
            expiry are sold first, and expired batches are never sold. Use the filter to see what's
            expiring soon so you can act in time.</Explain>
        </div>
        <DownloadCsvButton path="/reports/batches" params={nearOnly ? { nearExpiryDays: days } : {}} filename="batches-expiry.csv" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-gray-700">
          <input type="checkbox" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} />
          Only batches expiring within
        </label>
        <input type="number" min={0} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 0)}
          disabled={!nearOnly} className="w-20 rounded border px-2 py-1 text-right disabled:opacity-50" />
        <span className="text-gray-700">days</span>
      </div>

      <ErrorBar msg={error} />
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Product</Th><Th>SKU</Th><Th>Batch</Th>
            <Th num>Quantity</Th><Th>Expires</Th>
            <Th num>Days left</Th><Th num>MRP</Th><Th>Status</Th>
          </THead>
          <TBody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                {nearOnly ? `No batches expiring within ${days} days.` : 'No batches yet — capture them when receiving goods in Purchasing.'}
              </td></tr>
            )}
            {rows.map((b) => (
              <Tr key={b.id} className={expiryClass(b.days_to_expiry)}>
                <Td>{b.product_name}</Td>
                <Td className="font-mono text-xs">{b.sku}</Td>
                <Td className="font-mono">{b.batch_number}</Td>
                <Td num>{num(b.qty_on_hand)}</Td>
                <Td>{b.expiry_date ?? '—'}</Td>
                <Td num>{b.days_to_expiry ?? '—'}</Td>
                <Td num>{b.mrp != null ? inr(b.mrp) : '—'}</Td>
                <Td><StatusChip status={b.status} /></Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </div>
  );
};

// ── Tab 5: Movement register ─────────────────────────────────────────────────

const MovementsTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [movementType, setMovementType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const PAGE = 50;

  const params = () => ({
    from: from || undefined, to: to || undefined,
    movementType: movementType || undefined, search: search || undefined,
  });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/reports/movements', { params: { ...params(), limit: PAGE, offset: page * PAGE } });
      setRows(res.data.rows ?? []);
      setTotal(res.data.total ?? 0);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);
  const apply = () => { setPage(0); load(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">Stock movements</h2>
          <Explain>Every change to your stock — goods coming in, sales going out, returns and
            adjustments — with the date, the quantity, and the order or document it relates to.
            Filter by dates, type of movement, or product.</Explain>
        </div>
        <DownloadCsvButton path="/reports/movements" params={params()} filename="movement-register.csv" />
      </div>

      <FilterBar>
        <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Type of movement">
          <SelectInput value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            <option value="">All movements</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Product or SKU">
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        </Field>
        <Btn onClick={apply}>Apply filters</Btn>
      </FilterBar>

      <ErrorBar msg={error} />
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>When</Th><Th>What happened</Th><Th>Product</Th><Th>SKU</Th>
            <Th num>Quantity change</Th><Th>Related to</Th><Th>Reference</Th>
          </THead>
          <TBody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No movements found for these filters.</td></tr>
            )}
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{r.occurred_at}</Td>
                <Td>{moveLabel(r.movement_type)}</Td>
                <Td>{r.product_name ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.sku}</Td>
                <Td num className={`font-semibold ${Number(r.qty_delta) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {Number(r.qty_delta) > 0 ? '+' : ''}{num(r.qty_delta)}
                </Td>
                <Td className="capitalize">{r.ref_doc_type ?? '—'}</Td>
                <Td className="font-mono text-xs">{r.ref_doc_id ?? '—'}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} loading={loading} />
    </div>
  );
};

// ── Shared pager ─────────────────────────────────────────────────────────────

const Pager: React.FC<{ page: number; pageSize: number; total: number; onPage: (p: number) => void; loading: boolean }> =
  ({ page, pageSize, total, onPage, loading }) => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (total <= pageSize) return null;
    return (
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {num(total)}{loading ? ' · loading…' : ''}</span>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Btn>
          <Btn variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</Btn>
        </div>
      </div>
    );
  };

// ── Page shell with tabs ─────────────────────────────────────────────────────

const TABS = [
  { key: 'summary', label: 'Stock on hand' },
  { key: 'valuation', label: 'Value check' },
  { key: 'ageing', label: 'Ageing' },
  { key: 'batches', label: 'Batches & expiry' },
  { key: 'movements', label: 'Movements' },
] as const;

const Reports: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('summary');
  return (
    <Page>
      <PageHeader
        title="Reports"
        icon={FileSpreadsheet}
        description="Clear, plain-language reports on your stock — with a one-click download for your accountant or spreadsheet."
      />
      <TabBar tabs={TABS} active={tab} onChange={(k) => setTab(k as typeof tab)} />
      {tab === 'summary' && <StockSummaryTab />}
      {tab === 'valuation' && <ValuationTab />}
      {tab === 'ageing' && <AgeingTab />}
      {tab === 'batches' && <BatchesTab />}
      {tab === 'movements' && <MovementsTab />}
    </Page>
  );
};

export default Reports;
