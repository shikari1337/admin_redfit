import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Layers, PackageCheck, Tag } from 'lucide-react';
import { productsAPI, inventoryAPI, batchesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, TableShell, THead, Th, TBody, Td, EmptyRow, StatusChip,
  TextInput, SelectInput, Btn, SectionCard, StatCard, StatGrid,
  FilterChips, downloadCsv, type ChipGroup,
} from '../../components/erp';
import InfoTip from '../../components/common/InfoTip';
import BatchBulkBar from '../../components/inventory/BatchBulkBar';
import SheetsBar from '../../components/inventory/SheetsBar';
import BatchEditDrawer, { lotSaleText, type BatchRecord } from '../../components/inventory/BatchEditDrawer';
import { useInventoryLock } from '../../hooks/useInventoryLock';
import InventoryLockBanner from '../../components/inventory/InventoryLockBanner';

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

/**
 * ONE line on screen per mode; the full explanation lives in the (i) beside it.
 * The three paragraphs used to sit open above the table on every visit.
 */
const MODE_COPY: Record<PricingMode, { title: string; body: string; tone: string }> = {
  off: {
    title: 'Batch pricing is off. Every sale is priced from the catalogue.',
    body: 'Batch MRPs and prices are still recorded, and still print on batch labels. They just do not affect what a customer is charged.',
    tone: 'border-gray-200 bg-gray-50',
  },
  mrp_only: {
    title: 'Showing the printed MRP of the batch being served.',
    body: 'The MRP printed on the pack shows on the bill and the invoice. What the customer is charged still comes from the catalogue.',
    tone: 'border-blue-200 bg-blue-50',
  },
  full: {
    title: 'Sales are billed from the batch they are served from.',
    body: 'The batch is the first to expire. Retail shoppers pay its retail price; B2B accounts pay its B2B price, and a contract, price list or tier price agreed with that buyer still wins. A batch with no price of its own falls back to the catalogue for that field. Nothing is worked out as a percentage.',
    tone: 'border-emerald-200 bg-emerald-50',
  },
};

/** Lots per page: the API's ceiling for any list. */
const PAGE_SIZE = 200;

const Batches: React.FC = () => {
  const { hasPerm } = useAuth();
  const canAdjust = hasPerm('inventory.adjust');
  const canConfigure = hasPerm('settings.manage');

  const [rows, setRows] = useState<any[]>([]);
  // Two shapes of the same register. "By product" answers the question a
  // merchant actually asks — show me this medicine's batches across all its
  // pack sizes — which a flat batch list structurally cannot.
  const [shape, setShape] = useState<'flat' | 'grouped'>('flat');
  const [grouped, setGrouped] = useState<any[]>([]);
  const [openProducts, setOpenProducts] = useState<Record<string, boolean>>({});
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

  // Every lot is paged, searched, filtered and sorted on the server (a store holds
  // tens of thousands of lots; 200 a page is the API's ceiling), and the figures
  // above come from the server's total over EVERY lot, never from one page.
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(filter.trim()), 350);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => { setOffset(0); }, [search, view, days, sort]);

  // Only the newest request's answer is shown (a filter change resets the page,
  // so two loads can be in flight).
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loadSeq.current;
    setError(''); setLoading(true);
    try {
      const [flat, byProd, sum] = await Promise.all([
        batchesAPI.page({
          limit: PAGE_SIZE, offset, search: search || undefined,
          view: view === 'all' ? undefined : view, viewDays: days, sort,
        }),
        batchesAPI.byProduct({ includeDepleted: true, search: search || undefined }).catch(() => []),
        batchesAPI.summary(days).catch(() => null),
      ]);
      if (mine !== loadSeq.current) return;
      setRows(flat.rows);
      setTotal(flat.total);
      setGrouped(byProd);
      setSummary(sum);
    } catch (e: any) {
      if (mine === loadSeq.current) setError(e?.response?.data?.message ?? e.message ?? 'Could not load batches.');
    } finally { if (mine === loadSeq.current) setLoading(false); }
  }, [offset, search, view, days, sort]);

  const loadPricing = useCallback(async () => {
    try { setPricing(await inventoryAPI.getBatchPricing()); } catch { /* read-only extra */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPricing(); }, [loadPricing]);

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
      const hasPrice = b.mrp != null || b.selling_price != null || b.b2b_price != null;
      if (hasPrice) priced++;
      const unit = Number(b.selling_price ?? b.mrp ?? 0);
      if (unit > 0) value += unit * (Number(b.qty_on_hand) || 0);
    }
    if (summary) {
      return {
        units: Number(summary.units) || 0, expiring: Number(summary.expiring) || 0,
        expired: Number(summary.expired) || 0, priced: Number(summary.priced) || 0,
        value: Number(summary.value) || 0, total: Number(summary.lots) || 0,
      };
    }
    return { units, expiring, expired, priced, value, total: rows.length };
  }, [rows, days, summary]);

  // The server already searched, filtered and sorted this page.
  const visible = rows;
  /** A search or a view is narrowing the list, so an empty page is not "no batches". */
  const narrowed = !!search || view !== 'all';
  const clearFilters = () => { setFilter(''); setSearch(''); setView('all'); };

  /**
   * This view, as a CSV. Goes through the shared client CSV path so the
   * quoting, the UTF-8 BOM and the spreadsheet formula guard are the ones
   * every other export in the admin uses (lib/csv.ts) — this page used to
   * carry its own copy of all three.
   */
  const exportView = () => downloadCsv(
    `batches-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      { key: 'product_name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'batch_number', label: 'Batch Number' },
      { key: 'qty_on_hand', label: 'Qty In Batch' },
      { key: 'purchase_date', label: 'Purchase Date' },
      { key: 'purchase_ref', label: 'Purchase Ref' },
      { key: 'mfg_date', label: 'Mfg Date' },
      { key: 'expiry_date', label: 'Expiry Date' },
      { key: 'days_to_expiry', label: 'Days To Expiry' },
      { key: 'mrp', label: 'Batch MRP' },
      { key: 'selling_price', label: 'Batch Retail Price' },
      { key: 'b2b_price', label: 'Batch B2B Price' },
      { key: 'catalogue_mrp', label: 'Catalogue MRP' },
      { key: 'catalogue_selling_price', label: 'Catalogue Retail Price' },
      { key: 'catalogue_b2b_price', label: 'Catalogue B2B Price' },
      { key: 'status', label: 'Status' },
    ],
    visible,
  );

  const expiryClass = (d: number | null) =>
    d == null ? '' : d < 0 ? 'bg-red-50' : d <= 30 ? 'bg-red-50/50' : d <= 90 ? 'bg-amber-50/50' : '';

  const mode: PricingMode = pricing?.mode ?? 'off';
  const copy = MODE_COPY[mode];

  const batchChips: ChipGroup[] = [
    {
      key: 'view', label: 'Show', value: view === 'all' ? '' : view,
      onChange: (v: string) => setView((v || 'all') as any),
      options: [
        { value: 'expiring', label: 'Expiring soon' },
        { value: 'expired', label: 'Expired' },
        { value: 'unpriced', label: 'No price of their own' },
      ],
    },
    {
      key: 'shape', label: 'Group', value: shape === 'flat' ? '' : shape,
      onChange: (v: string) => setShape((v || 'flat') as any),
      help: 'One medicine can have lots in several pack sizes.',
      options: [{ value: 'grouped', label: 'By product and SKU' }],
    },
    {
      key: 'sort', label: 'Sort', value: shape === 'grouped' ? '' : (sort === 'expiry' ? '' : sort),
      onChange: (v: string) => setSort((v || 'expiry') as any),
      options: shape === 'grouped' ? [] : [
        { value: 'qty', label: 'Largest quantity first' },
        { value: 'product', label: 'Product A to Z' },
      ],
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Batches & Expiry"
        description="Each batch is a physical lot with its own quantity and dates and, when batch pricing is on, its own printed MRP and selling price. Stock is always sold first-to-expire."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" onClick={exportView} disabled={!visible.length}>
              Export this view (CSV)
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
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">{copy.title}</span>
              <InfoTip text={copy.body} />
              {mode !== 'off' && (
                <span className="text-xs text-gray-600">
                  {pricing?.priced_batches ?? 0} batch(es) across {pricing?.priced_skus ?? 0} SKU(s) carry a price of their own.
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SelectInput
              value={mode}
              disabled={!canConfigure || savingPricing}
              onChange={(e) => setMode(e.target.value as PricingMode)}
              className="w-56"
              aria-label="Batch pricing mode"
            >
              <option value="off">Off: catalogue prices only</option>
              <option value="mrp_only">Show the batch's printed MRP</option>
              <option value="full">Bill from the batch's own price</option>
            </SelectInput>
            {mode !== 'off' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={!!pricing?.neverExceedBatchMrp}
                  disabled={!canConfigure || savingPricing} onChange={toggleCeiling} />
                Never charge above the printed MRP
              </label>
            )}
            {!canConfigure && <span className="text-[11px] text-gray-500">Needs the manage settings permission.</span>}
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
        <StatCard label="Stock value" value={money(stats.value) ?? '-'} icon={PackageCheck}
          sub="at batch price, else batch MRP" />
      </StatGrid>

      <InventoryLockBanner />

      <SheetsBar here="batches" />

      {bulkOpen && <BatchBulkBar onImported={() => { load(); loadPricing(); }} />}

      {createOpen && canAdjust && (
        <AddBatchCard onDone={() => { setCreateOpen(false); load(); loadPricing(); }} />
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <TextInput value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Search product, SKU, batch or bill ref" aria-label="Search batches"
          data-testid="batches-search" className="w-72" />
        <FilterChips
          groups={batchChips}
          onClearAll={() => { setView('all'); setShape('flat'); setSort('expiry'); }}
        >
          {(view === 'expiring' || view === 'all') && (
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              within
              <TextInput type="number" min={0} value={days} className="h-8 w-16 text-right"
                aria-label="Days to expiry"
                onChange={(e) => setDays(parseInt(e.target.value) || 0)} />
              days
            </label>
          )}
        </FilterChips>
        <span className="ml-auto text-sm text-gray-500">
          {loading ? 'Loading…' : total === 0
            ? (narrowed && stats.total > 0 ? `0 of ${stats.total.toLocaleString('en-IN')} batches` : '0 batches')
            : `${(offset + 1).toLocaleString('en-IN')} to ${(offset + rows.length).toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} batch(es)`}
        </span>
        {shape === 'flat' && total > PAGE_SIZE && (
          <span className="flex items-center gap-1">
            <Btn variant="ghost" disabled={loading || offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Previous</Btn>
            <Btn variant="ghost" disabled={loading || offset + PAGE_SIZE >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}>Next</Btn>
          </span>
        )}
      </div>

      {shape === 'grouped' ? (
        <GroupedBatches
          products={grouped}
          filter={filter}
          open={openProducts}
          onToggle={(id) => setOpenProducts((o) => ({ ...o, [id]: !o[id] }))}
          onPick={(b) => setEditing(b as BatchRecord)}
          loading={loading}
          lotsInAll={stats.total}
        />
      ) : (
      <TableShell>
        <div className="w-0 min-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <THead>
              <Th>Product</Th><Th>SKU</Th><Th>Batch</Th><Th num>Qty in batch</Th>
              <Th>Purchased</Th><Th>Expiry</Th><Th num>Days left</Th><Th>On sale</Th>
              <Th num>Batch MRP</Th><Th num>Batch retail</Th><Th num>Batch B2B</Th><Th num>Catalogue</Th>
              <Th>Status</Th><Th> </Th>
            </THead>
            <TBody>
              {!loading && visible.length === 0 && (
                <EmptyRow colSpan={14}>
                  {narrowed ? (
                    <>
                      {stats.total > 0
                        ? `None of the ${stats.total.toLocaleString('en-IN')} batches match these filters.`
                        : 'No batches match these filters.'}{' '}
                      <button type="button" className="font-medium text-blue-700 underline-offset-2 hover:underline" onClick={clearFilters}>
                        Clear the filters
                      </button>
                    </>
                  ) : stats.total > 0 ? (
                    <>
                      The figures above count {stats.total.toLocaleString('en-IN')} batches, but the list came back empty.{' '}
                      <button type="button" className="font-medium text-blue-700 underline-offset-2 hover:underline" onClick={() => load()}>
                        Load it again
                      </button>
                    </>
                  ) : (
                    'No batches yet. Receive goods in Purchasing, add one above, or load them all at once with the Excel sheet.'
                  )}
                </EmptyRow>
              )}
              {visible.map((b: any) => (
                <tr key={b.id} className={`${expiryClass(b.days_to_expiry)} cursor-pointer hover:bg-gray-50`}
                    onClick={() => setEditing(b as BatchRecord)}>
                  <Td className="max-w-[22rem] truncate">
                    {b.product_name ?? <span className="text-amber-700" title="This lot points at a product or SKU that no longer exists. It still counts as stock.">Product no longer in the catalogue</span>}
                  </Td>
                  <Td className="font-mono text-xs">{b.sku ?? '-'}</Td>
                  <Td className="font-mono font-medium">{b.batch_number}</Td>
                  <Td num>{b.qty_on_hand}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-600">{b.purchase_date ?? '-'}</Td>
                  <Td className="whitespace-nowrap">{b.expiry_date ?? '-'}</Td>
                  <Td num className={b.days_to_expiry != null && b.days_to_expiry < 0 ? 'font-semibold text-red-700' : ''}>
                    {b.days_to_expiry ?? '-'}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {(() => {
                      const sale = lotSaleText(b);
                      if (!sale) return <span className="text-gray-400">-</span>;
                      return <span className={sale.held ? 'font-medium text-red-700' : 'text-gray-700'}
                                   title={typeof b.stop_days === 'number' ? `${b.stop_days} days before expiry${b.sell_stop_days != null ? " (this lot's own)" : ' (store setting)'}` : undefined}>
                        {sale.text}
                      </span>;
                    })()}
                  </Td>
                  <Td num>{money(b.mrp) ?? <span className="text-gray-400">-</span>}</Td>
                  <Td num>
                    {money(b.selling_price) ?? <span className="text-gray-400">-</span>}
                  </Td>
                  <Td num>
                    {money(b.b2b_price) ?? <span className="text-gray-400" title="No B2B price of its own: the SKU's B2B price applies.">-</span>}
                  </Td>
                  <Td num className="text-xs text-gray-500"
                      title={`Catalogue retail ${money(b.catalogue_selling_price) ?? money(b.catalogue_mrp) ?? 'not set'}, catalogue B2B ${money(b.catalogue_b2b_price) ?? 'not set'}`}>
                    {money(b.catalogue_selling_price) ?? money(b.catalogue_mrp) ?? '-'}
                    {b.catalogue_b2b_price != null && <span className="block text-[10px]">B2B {money(b.catalogue_b2b_price)}</span>}
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
      )}

      <p className="text-xs leading-relaxed text-gray-500">
        A line whose quantity spans two batches is priced from the first-to-expire one, because an order
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

/* ── Product -> variations -> batches ───────────────────────────────────────
 * The flat list is one row per batch and cannot express "this medicine, across
 * its 30ml and 100ml packs, has these lots". This view is that question.
 *
 * It also shows WHERE each batch sits. A batch has no warehouse column on
 * purpose: `bin_stock` records placement at (location, variation, batch), which
 * can represent one lot split across bins — or warehouses — that a single
 * column never could. Anything not yet put away is shown as "unplaced", which
 * is a real state, not an error.                                            */
const GroupedBatches: React.FC<{
  products: any[];
  filter: string;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onPick: (b: any) => void;
  loading: boolean;
  /** Every lot with stock, from the figures: the tree lists only lots on a live product. */
  lotsInAll: number;
}> = ({ products, filter, open, onToggle, onPick, loading, lotsInAll }) => {
  const q = filter.trim().toLowerCase();
  const visible = q
    ? products.filter((p: any) =>
        String(p.product_name ?? '').toLowerCase().includes(q) ||
        p.variations.some((v: any) =>
          String(v.sku ?? '').toLowerCase().includes(q) ||
          v.batches.some((b: any) => String(b.batch_number ?? '').toLowerCase().includes(q))))
    : products;

  if (loading) return <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">Loading…</div>;
  if (!visible.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        {products.length
          ? `No product matches "${filter}".`
          : lotsInAll > 0
            ? `${lotsInAll.toLocaleString('en-IN')} batches hold stock, but none belongs to a product in the catalogue. Turn off the grouping to see them.`
            : 'No batches yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((p: any) => {
        const isOpen = open[p.product_id] ?? true;
        return (
          <div key={p.product_id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                    onClick={() => onToggle(p.product_id)}>
              <span className="w-4 shrink-0 text-gray-400">{isOpen ? '\u25be' : '\u25b8'}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{p.product_name}</span>
              <span className="shrink-0 text-xs text-gray-500">
                {p.variations.length} of {p.variation_count} SKU{p.variation_count === 1 ? '' : 's'} batched
                {', '}{p.batch_count} batch{p.batch_count === 1 ? '' : 'es'}
                {', '}<strong className="text-gray-700">{p.batched_qty}</strong> units
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100">
                {p.variations.map((v: any) => (
                  <div key={v.variation_id} className="border-b border-gray-100 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50/70 px-4 py-1.5 text-xs">
                      <span className="font-mono font-medium text-gray-800">{v.sku}</span>
                      <span className="truncate text-gray-600">{v.variation_name}</span>
                      <span className="ml-auto text-gray-500">
                        <strong className="text-gray-700">{v.batched_qty}</strong> in batches of {v.sku_stock} in stock
                      </span>
                      {v.batched_qty < v.sku_stock && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
                              title="Stock of this SKU that is not attached to any batch.">
                          {v.sku_stock - v.batched_qty} un-batched
                        </span>
                      )}
                      {!v.dims_confirmed && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                              title="No pack size on record, so warehouse volume/weight limits cannot be checked for this SKU.">
                          size not set
                        </span>
                      )}
                    </div>

                    <table className="w-full text-sm">
                      <tbody>
                        {v.batches.map((b: any) => (
                          <tr key={b.id} className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                              onClick={() => onPick({ ...b, sku: v.sku, product_name: p.product_name,
                                                      catalogue_mrp: v.catalogue_mrp,
                                                      catalogue_selling_price: v.catalogue_selling_price,
                                                      catalogue_b2b_price: v.catalogue_b2b_price })}>
                            <td className="py-1.5 pl-8 pr-3 font-mono font-medium">{b.batch_number}</td>
                            <td className="px-3 text-right tabular-nums">{b.qty_on_hand}</td>
                            <td className="whitespace-nowrap px-3 text-gray-600">{b.expiry_date ?? '-'}</td>
                            <td className={`px-3 text-right tabular-nums ${b.days_to_expiry != null && b.days_to_expiry < 0 ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                              {b.days_to_expiry != null ? `${b.days_to_expiry}d` : '-'}
                            </td>
                            <td className="px-3 text-right tabular-nums">{b.mrp != null ? `\u20b9${Number(b.mrp).toFixed(2)}` : '-'}</td>
                            <td className="px-3 text-right tabular-nums" title="Batch retail price">{b.selling_price != null ? `\u20b9${Number(b.selling_price).toFixed(2)}` : '-'}</td>
                            <td className="px-3 text-right tabular-nums" title="Batch B2B price">{b.b2b_price != null ? `\u20b9${Number(b.b2b_price).toFixed(2)}` : '-'}</td>
                            <td className="px-3 py-1.5">
                              {/* Where it physically is. Several bins is normal. */}
                              {b.placements?.length ? (
                                <span className="flex flex-wrap gap-1">
                                  {b.placements.map((pl: any) => (
                                    <span key={pl.location_id}
                                          className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-800"
                                          title={pl.warehouse_name ?? ''}>
                                      {pl.location_code}: {pl.qty}
                                    </span>
                                  ))}
                                  {b.unplaced_qty > 0 && (
                                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
                                          title="Received but not yet put away into a bin.">
                                      {b.unplaced_qty} unplaced
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px] text-gray-400">not put away</span>
                              )}
                            </td>
                            <td className="px-3"><StatusChip status={b.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
    mrp: '', sellingPrice: '', b2bPrice: '', cost: '', supplierBatchRef: '',
  });
  const [mode, setMode] = useState<'receive' | 'assign'>('receive');
  // Receiving moves stock and is locked with the inventory (DEC-069); labelling stock already held is not.
  const stockLock = useInventoryLock();
  const receiveLocked = stockLock.locked && mode === 'receive';
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
      setErr('This product has no variations. Batches attach to a variation (SKU).'); return;
    }
    if (!f.batchNumber.trim() || !q || q <= 0) { setErr('Batch number and a quantity above 0 are required.'); return; }
    if (f.mrp && f.sellingPrice && Number(f.sellingPrice) > Number(f.mrp)) {
      setErr(`Retail price ₹${f.sellingPrice} is above this batch's own MRP ₹${f.mrp}.`); return;
    }
    if (f.mrp && f.b2bPrice && Number(f.b2bPrice) > Number(f.mrp)) {
      setErr(`B2B price ₹${f.b2bPrice} is above this batch's own MRP ₹${f.mrp}.`); return;
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
        b2bPrice: f.b2bPrice || undefined,
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
                placeholder="Type at least 3 characters of a name or SKU" className="w-full" />
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
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Retail price</span>
            <input className={inputCls} type="number" step="0.01" min="0" value={f.sellingPrice} onChange={set('sellingPrice')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">B2B price</span>
            <input className={inputCls} type="number" step="0.01" min="0" value={f.b2bPrice} onChange={set('b2bPrice')}
              title="What a wholesale account pays for this lot. Blank = the SKU's B2B price." /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Purchase date</span>
            <input className={inputCls} type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Manufactured</span>
            <input className={inputCls} type="date" value={f.mfg} onChange={set('mfg')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Expiry</span>
            <input className={inputCls} type="date" value={f.expiry} onChange={set('expiry')} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Purchase / bill ref</span>
            <input className={inputCls} value={f.purchaseRef} onChange={set('purchaseRef')} placeholder="INV-4471" /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Supplier's batch code</span>
            <input className={inputCls} value={f.supplierBatchRef} onChange={set('supplierBatchRef')} /></label>
          {mode === 'receive' && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Unit cost</span>
              <input className={inputCls} type="number" step="0.01" value={f.cost} onChange={set('cost')}
                title="Optional. Folds into the average cost (WAC)." /></label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === 'receive'} onChange={() => setMode('receive')} />
            New stock: adds the quantity to hand (recorded in the stock ledger)
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" checked={mode === 'assign'} onChange={() => setMode('assign')} />
            Label stock you already hold: no quantity change
          </label>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        {receiveLocked && <p className="text-sm text-amber-800">🔒 {stockLock.message} You can still label stock you already hold.</p>}
        <Btn onClick={submit} disabled={busy || receiveLocked} title={receiveLocked ? stockLock.why : undefined}>{busy ? 'Saving…' : 'Save batch'}</Btn>
      </div>
    </SectionCard>
  );
};

export default Batches;
