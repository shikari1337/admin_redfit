import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Layers, PackageCheck, Tag } from 'lucide-react';
import { productsAPI, inventoryAPI, batchesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, TableShell, THead, Th, TBody, Td, EmptyRow, StatusChip,
  TextInput, SelectInput, Btn, SectionCard, StatCard, StatGrid,
} from '../../components/erp';
import BatchBulkBar from '../../components/inventory/BatchBulkBar';
import BatchEditDrawer, { type BatchRecord } from '../../components/inventory/BatchEditDrawer';

/**
 * Batches & Expiry.
 *
 * A batch is a physical lot: its own quantity, its own dates, and — since
 * migration 157 — its OWN printed MRP and selling price. When batch pricing is
 * switched on, the batch a sale is served from (first to expire) is what prices
 * it, falling back to the catalogue for any SKU with no batch on hand.
 *
 * The screen is built around the three questions a merchant actually asks:
 *   "what is about to expire?"   → the expiry filter + the days-left column
 *   "what will this sell for?"   → batch price vs catalogue price, side by side
 *   "how do I fix one?"          → row click opens the editor; bulk via Excel
 */

type PricingMode = 'off' | 'mrp_only' | 'full';
interface PricingConfig {
  mode: PricingMode;
  neverExceedBatchMrp: boolean;
  priced_batches?: number;
  priced_skus?: number;
}

const money = (v: any) =>
  v == null || v === '' ? null : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const MODE_COPY: Record<PricingMode, { title: string; body: string; tone: string }> = {
  off: {
    title: 'Batch pricing is off',
    body: 'Every sale is priced from the catalogue. Batch MRPs and prices are still recorded, and appear on batch labels — they just do not affect what a customer is charged.',
    tone: 'border-gray-200 bg-gray-50',
  },
  mrp_only: {
    title: 'Batch pricing: printed MRP only',
    body: 'The MRP printed on the pack being served shows on the bill and the invoice. What the customer is charged still comes from the catalogue.',
    tone: 'border-blue-200 bg-blue-50',
  },
  full: {
    title: 'Batch pricing: full',
    body: 'A sale is priced from the batch it is served from — first to expire. A batch with no price of its own falls back to the catalogue for that field. Nothing is worked out as a percentage.',
    tone: 'border-emerald-200 bg-emerald-50',
  },
};

const Batches: React.FC = () => {
  const { hasPerm } = useAuth();
  const canAdjust = hasPerm('inventory.adjust');
  const canConfigure = hasPerm('settings.manage');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'all' | 'expiring' | 'expired' | 'unpriced'>('all');
  const [days, setDays] = useState(90);
  const [sort, setSort] = useState<'expiry' | 'qty' | 'product'>('expiry');

  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [savingPricing, setSavingPricing] = useState(false);

  const [editing, setEditing] = useState<BatchRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      // Ask for the whole register; the view/search filters below are client-side
      // so switching between them is instant and never re-queries.
      setRows(await batchesAPI.list({ limit: 500 }));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message ?? 'Could not load batches.');
    } finally { setLoading(false); }
  }, []);

  const loadPricing = useCallback(async () => {
    try { setPricing(await inventoryAPI.getBatchPricing()); } catch { /* read-only extra */ }
  }, []);

  useEffect(() => { load(); loadPricing(); }, [load, loadPricing]);

  const setMode = async (mode: PricingMode) => {
    if (!pricing || !canConfigure) return;
    setSavingPricing(true); setError('');
    try {
      const next = await inventoryAPI.setBatchPricing({ mode, neverExceedBatchMrp: pricing.neverExceedBatchMrp });
      setPricing((p) => ({ ...(p ?? {} as PricingConfig), ...next }));
      await loadPricing();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not change batch pricing.');
    } finally { setSavingPricing(false); }
  };

  const toggleCeiling = async () => {
    if (!pricing || !canConfigure) return;
    setSavingPricing(true);
    try {
      const next = await inventoryAPI.setBatchPricing({
        mode: pricing.mode, neverExceedBatchMrp: !pricing.neverExceedBatchMrp,
      });
      setPricing((p) => ({ ...(p ?? {} as PricingConfig), ...next }));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not change that setting.');
    } finally { setSavingPricing(false); }
  };

  // ── Derived views ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let units = 0, expiring = 0, expired = 0, priced = 0, value = 0;
    for (const b of rows) {
      units += Number(b.qty_on_hand) || 0;
      const d = b.days_to_expiry;
      if (d != null && d < 0) expired++;
      else if (d != null && d <= days) expiring++;
      const hasPrice = b.mrp != null || b.selling_price != null;
      if (hasPrice) priced++;
      const unit = Number(b.selling_price ?? b.mrp ?? 0);
      if (unit > 0) value += unit * (Number(b.qty_on_hand) || 0);
    }
    return { units, expiring, expired, priced, value, total: rows.length };
  }, [rows, days]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = rows.filter((b: any) => {
      if (q && ![b.sku, b.product_name, b.batch_number, b.purchase_ref, b.supplier_batch_ref]
        .some((f) => String(f ?? '').toLowerCase().includes(q))) return false;
      const d = b.days_to_expiry;
      if (view === 'expiring') return d != null && d >= 0 && d <= days;
      if (view === 'expired') return d != null && d < 0;
      if (view === 'unpriced') return b.mrp == null && b.selling_price == null;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === 'qty') return (Number(b.qty_on_hand) || 0) - (Number(a.qty_on_hand) || 0);
      if (sort === 'product') return String(a.product_name).localeCompare(String(b.product_name));
      // expiry: soonest first, undated last
      const ax = a.days_to_expiry, bx = b.days_to_expiry;
      if (ax == null && bx == null) return 0;
      if (ax == null) return 1;
      if (bx == null) return -1;
      return ax - bx;
    });
    return out;
  }, [rows, filter, view, days, sort]);

  const exportView = () => {
    const cols: Array<[string, (b: any) => any]> = [
      ['Product', (b) => b.product_name], ['SKU', (b) => b.sku],
      ['Batch Number', (b) => b.batch_number], ['Qty In Batch', (b) => b.qty_on_hand],
      ['Purchase Date', (b) => b.purchase_date ?? ''], ['Purchase Ref', (b) => b.purchase_ref ?? ''],
      ['Mfg Date', (b) => b.mfg_date ?? ''], ['Expiry Date', (b) => b.expiry_date ?? ''],
      ['Days To Expiry', (b) => b.days_to_expiry ?? ''],
      ['Batch MRP', (b) => b.mrp ?? ''], ['Batch Selling Price', (b) => b.selling_price ?? ''],
      ['Catalogue MRP', (b) => b.catalogue_mrp ?? ''],
      ['Catalogue Selling Price', (b) => b.catalogue_selling_price ?? ''],
      ['Status', (b) => b.status],
    ];
    // A leading =+-@ turns a cell into a formula in Excel; prefix it so an
    // exported product name can never execute (the bulk portal's own guard).
    const cell = (v: any) => {
      const t = v == null ? '' : String(v);
      const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const csv = [cols.map((c) => c[0]).join(','),
                 ...visible.map((b) => cols.map(([, get]) => cell(get(b))).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `batches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const expiryClass = (d: number | null) =>
    d == null ? '' : d < 0 ? 'bg-red-50' : d <= 30 ? 'bg-red-50/50' : d <= 90 ? 'bg-amber-50/50' : '';

  const mode: PricingMode = pricing?.mode ?? 'off';
  const copy = MODE_COPY[mode];

  return (
    <Page>
      <PageHeader
        title="Batches & Expiry"
        description="Each batch is a physical lot with its own quantity, dates and — when batch pricing is on — its own printed MRP and selling price. Stock is always sold first-to-expire."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" onClick={exportView} disabled={!visible.length}>
              ⬇ Export this view (CSV)
            </Btn>
            <Btn variant="outline" onClick={() => setBulkOpen((o) => !o)}>
              {bulkOpen ? 'Hide bulk update' : 'Bulk update (Excel)'}
            </Btn>
            {canAdjust && (
              <Btn onClick={() => setCreateOpen((o) => !o)}>{createOpen ? 'Cancel' : '+ Add batch'}</Btn>
            )}
          </div>
        }
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* ── Batch pricing: what it does, and the switch ─────────────────── */}
      <div className={`rounded-xl border ${copy.tone} px-4 py-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">{copy.title}</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">{copy.body}</p>
            {mode !== 'off' && (
              <p className="mt-1.5 text-xs text-gray-600">
                <strong>{pricing?.priced_batches ?? 0}</strong> batch(es) across{' '}
                <strong>{pricing?.priced_skus ?? 0}</strong> SKU(s) currently carry a price of their own.
                Everything else is priced from the catalogue.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SelectInput
              value={mode}
              disabled={!canConfigure || savingPricing}
              onChange={(e) => setMode(e.target.value as PricingMode)}
              className="w-56"
              aria-label="Batch pricing mode"
            >
              <option value="off">Off — catalogue prices only</option>
              <option value="mrp_only">Show the batch’s printed MRP</option>
              <option value="full">Bill from the batch’s own price</option>
            </SelectInput>
            {mode !== 'off' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={!!pricing?.neverExceedBatchMrp}
                  disabled={!canConfigure || savingPricing} onChange={toggleCeiling} />
                Never charge above the printed MRP
              </label>
            )}
            {!canConfigure && <span className="text-[11px] text-gray-500">Needs “manage settings”.</span>}
          </div>
        </div>
      </div>

      <StatGrid>
        <StatCard label="Batches" value={stats.total} icon={Layers}
          sub={`${stats.units.toLocaleString('en-IN')} units on hand`} />
        <StatCard label="Expiring soon" value={stats.expiring} icon={CalendarClock}
          tone={stats.expiring ? 'warn' : 'default'} sub={`within ${days} days`} />
        <StatCard label="Expired" value={stats.expired} icon={AlertTriangle}
          tone={stats.expired ? 'bad' : 'default'} sub="never sold or priced from" />
        <StatCard label="With own price" value={stats.priced} icon={Tag}
          tone={mode !== 'off' && stats.priced === 0 ? 'warn' : 'default'}
          sub={`${stats.total - stats.priced} use the catalogue`} />
        <StatCard label="Stock value" value={money(stats.value) ?? '—'} icon={PackageCheck}
          sub="at batch price, else batch MRP" />
      </StatGrid>

      {bulkOpen && <BatchBulkBar onImported={() => { load(); loadPricing(); }} />}

      {createOpen && canAdjust && (
        <AddBatchCard onDone={() => { setCreateOpen(false); load(); loadPricing(); }} />
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <TextInput value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Search product, SKU, batch or bill ref" className="w-72" />
        <SelectInput value={view} onChange={(e) => setView(e.target.value as any)} className="w-48" aria-label="View">
          <option value="all">All batches</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="unpriced">No price of their own</option>
        </SelectInput>
        {(view === 'expiring' || view === 'all') && (
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            within
            <TextInput type="number" min={0} value={days} className="w-20 text-right"
              onChange={(e) => setDays(parseInt(e.target.value) || 0)} />
            days
          </label>
        )}
        <SelectInput value={sort} onChange={(e) => setSort(e.target.value as any)} className="w-44" aria-label="Sort">
          <option value="expiry">Soonest expiry first</option>
          <option value="qty">Largest quantity first</option>
          <option value="product">Product A–Z</option>
        </SelectInput>
        <span className="ml-auto text-sm text-gray-500">
          {loading ? 'Loading…' : `${visible.length} of ${rows.length} batch(es)`}
        </span>
      </div>

      <TableShell>
        <div className="w-0 min-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <THead>
              <Th>Product</Th><Th>SKU</Th><Th>Batch</Th><Th num>Qty in batch</Th>
              <Th>Purchased</Th><Th>Expiry</Th><Th num>Days left</Th>
              <Th num>Batch MRP</Th><Th num>Batch price</Th><Th num>Catalogue price</Th>
              <Th>Status</Th><Th> </Th>
            </THead>
            <TBody>
              {!loading && visible.length === 0 && (
                <EmptyRow colSpan={12}>
                  {rows.length === 0
                    ? 'No batches yet — receive goods in Purchasing, add one above, or load them all at once with the Excel sheet.'
                    : 'No batches match these filters.'}
                </EmptyRow>
              )}
              {visible.map((b: any) => (
                <tr key={b.id} className={`${expiryClass(b.days_to_expiry)} cursor-pointer hover:bg-gray-50`}
                    onClick={() => setEditing(b as BatchRecord)}>
                  <Td className="max-w-[22rem] truncate">{b.product_name}</Td>
                  <Td className="font-mono text-xs">{b.sku}</Td>
                  <Td className="font-mono font-medium">{b.batch_number}</Td>
                  <Td num>{b.qty_on_hand}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-600">{b.purchase_date ?? '—'}</Td>
                  <Td className="whitespace-nowrap">{b.expiry_date ?? '—'}</Td>
                  <Td num className={b.days_to_expiry != null && b.days_to_expiry < 0 ? 'font-semibold text-red-700' : ''}>
                    {b.days_to_expiry ?? '—'}
                  </Td>
                  <Td num>{money(b.mrp) ?? <span className="text-gray-400">—</span>}</Td>
                  <Td num>
                    {money(b.selling_price) ?? <span className="text-gray-400">—</span>}
                  </Td>
                  <Td num className="text-xs text-gray-500">
                    {money(b.catalogue_selling_price) ?? money(b.catalogue_mrp) ?? '—'}
                  </Td>
                  <Td><StatusChip status={b.status} /></Td>
                  <Td>
                    <button className="text-xs font-medium text-blue-600 hover:text-blue-800"
                      onClick={(e) => { e.stopPropagation(); setEditing(b as BatchRecord); }}>
                      {canAdjust ? 'Edit' : 'View'}
                    </button>
                  </Td>
                </tr>
              ))}
            </TBody>
          </table>
        </div>
      </TableShell>

      <p className="text-xs leading-relaxed text-gray-500">
        A line whose quantity spans two batches is priced from the first-to-expire one — an order
        line carries a single unit price. Quarantined, damaged and expired stock is moved on the
        Stock Condition screen so every unit has exactly one home.
      </p>

      <BatchEditDrawer
        batch={editing}
        pricingMode={mode}
        onClose={() => setEditing(null)}
        onSaved={() => { load(); loadPricing(); }}
      />
    </Page>
  );
};

/* ── Add a batch ────────────────────────────────────────────────────────────
 * Kept on this page (rather than in the drawer) because creating a batch also
 * MOVES stock in `receive` mode, which is a different act from editing one.  */
const AddBatchCard: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [f, setF] = useState<Record<string, string>>({
    batchNumber: '', qty: '', expiry: '', mfg: '', purchaseDate: '', purchaseRef: '',
    mrp: '', sellingPrice: '', cost: '', supplierBatchRef: '',
  });
  const [mode, setMode] = useState<'receive' | 'assign'>('receive');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<any>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (skuSearch.trim().length < 3) { setSkuResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { setSkuResults(await productsAPI.searchVariations(skuSearch.trim(), 10)); }
      catch { setSkuResults([]); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [skuSearch]);

  const submit = async () => {
    setErr('');
    const variationId = picked?.variationId ?? picked?.variation_id ?? picked?.id;
    const q = parseInt(f.qty, 10);
    if (!variationId) { setErr('Pick a SKU first.'); return; }
    if (picked?.isVariation === false || picked?.is_variation === false) {
      setErr('This product has no variations — batches attach to a variation (SKU).'); return;
    }
    if (!f.batchNumber.trim() || !q || q <= 0) { setErr('Batch number and a quantity above 0 are required.'); return; }
    if (f.mrp && f.sellingPrice && Number(f.sellingPrice) > Number(f.mrp)) {
      setErr(`Selling price ₹${f.sellingPrice} is above this batch's own MRP ₹${f.mrp}.`); return;
    }
    setBusy(true);
    try {
      await batchesAPI.create({
        variationId, batchNumber: f.batchNumber.trim(), qty: q, mode,
        expiryDate: f.expiry || undefined,
        mfgDate: f.mfg || undefined,
        purchaseDate: f.purchaseDate || undefined,
        purchaseRef: f.purchaseRef.trim() || undefined,
        supplierBatchRef: f.supplierBatchRef.trim() || undefined,
        mrp: f.mrp || undefined,
        sellingPrice: f.sellingPrice || undefined,
        unitCostRupees: mode === 'receive' && f.cost ? f.cost : undefined,
      });
      onDone();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400';

  return (
    <SectionCard title="Add a batch">
      <div className="space-y-3">
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-gray-600">SKU / product</label>
          {picked ? (
            <div className="flex items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
              <span>{picked.name} <span className="ml-1 font-mono text-xs text-gray-500">{picked.sku}</span></span>
              <button type="button" className="text-xs text-blue-600" onClick={() => setPicked(null)}>change</button>
            </div>
          ) : (
            <>
              <TextInput value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Type at least 3 characters — name or SKU" className="w-full" />
              {skuResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg">
                  {skuResults.map((r: any, i: number) => (
                    <li key={i}>
                      <button type="button" onClick={() => { setPicked(r); setSkuResults([]); }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50">
                        {r.name} <span className="ml-1 font-mono text-xs text-gray-500">{r.sku}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Batch number *</span>
            <input className={inputCls} value={f.batchNumber} onChange={set('batchNumber')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Quantity *</span>
            <input className={inputCls} type="number" min={1} value={f.qty} onChange={set('qty')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Printed MRP</span>
            <input className={inputCls} type="number" step="0.01" min="0" value={f.mrp} onChange={set('mrp')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Selling price</span>
            <input className={inputCls} type="number" step="0.01" min="0" value={f.sellingPrice} onChange={set('sellingPrice')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Purchase date</span>
            <input className={inputCls} type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Manufactured</span>
            <input className={inputCls} type="date" value={f.mfg} onChange={set('mfg')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Expiry</span>
            <input className={inputCls} type="date" value={f.expiry} onChange={set('expiry')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Purchase / bill ref</span>
            <input className={inputCls} value={f.purchaseRef} onChange={set('purchaseRef')} placeholder="INV-4471" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Supplier’s batch code</span>
            <input className={inputCls} value={f.supplierBatchRef} onChange={set('supplierBatchRef')} /></label>
          {mode === 'receive' && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Unit cost</span>
              <input className={inputCls} type="number" step="0.01" value={f.cost} onChange={set('cost')}
                title="Optional — folds into the average cost (WAC)" /></label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === 'receive'} onChange={() => setMode('receive')} />
            New stock — adds the quantity to hand (recorded in the stock ledger)
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === 'assign'} onChange={() => setMode('assign')} />
            Label stock you already hold — no quantity change
          </label>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <Btn onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save batch'}</Btn>
      </div>
    </SectionCard>
  );
};

export default Batches;
