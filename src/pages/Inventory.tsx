import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { inventoryAPI, exportsAPI, blobErrorMessage, type InventoryHealth, type ImportResponse } from '../services/api';
import { Pagination } from '@/components/erp';
import MarketPricesBulkBar from '../components/inventory/MarketPricesBulkBar';
import AvailabilityBulkBar from '../components/inventory/AvailabilityBulkBar';
import DownloadsPanel from '../components/inventory/DownloadsPanel';
import WhichSheetStrip from '../components/inventory/WhichSheetStrip';
import StockDetailDrawer from '../components/inventory/StockDetailDrawer';
import UpdateStockDialog from '../components/inventory/UpdateStockDialog';

interface Valuation {
  grand_total?: number;
  total_units?: number;
  items?: any[];
}


/** One lot (batch) of a SKU, as the list attaches it with `includeLots`. */
interface InventoryLot {
  id: string;
  batch_number: string;
  qty_on_hand: number;
  mrp: number | null;
  selling_price: number | null;
  /** This lot's own wholesale price (mig 228); null = the SKU's B2B price applies. */
  b2b_price?: number | null;
  mfg_date: string | null;
  expiry_date: string | null;
  purchase_date: string | null;
  purchase_ref: string | null;
  days_to_expiry: number | null;
  placed_qty: number;
}

interface InventoryItem {
  _id: string;
  name: string;
  productId?: string;
  productSlug?: string | null;
  /** This product's page on the store's own website (server-resolved; null = unknown). */
  productUrl?: string | null;
  lots?: InventoryLot[];
  productName?: string;
  variationName?: string | null;
  sku?: string;
  slug?: string;
  stock?: number;
  reservedStock?: number;
  availableStock?: number;
  /** The ledger-preferred figure — what this page now shows (see api.ts). */
  onHand?: number;
  ledgerOnHand?: number | null;
  stockSource?: 'ledger' | 'legacy';
  batchedQty?: number;
  unbatchedQty?: number;
  lotCount?: number;
  mrpCount?: number;
  nearestExpiry?: string | null;
  expiredQty?: number;
  stockMismatch?: boolean;
  mrp?: number;
  sellingPrice?: number;
  salePrice?: number | null;
  b2bPrice?: number | null;
  hsnCode?: string | null;
  variations?: Array<{
    _id?: string;
    attributes?: Record<string, string>;
    stock?: number;
    reservedStock?: number;
    sku?: string;
  }>;
  images?: string[];
  category?: { name?: string } | string;
  isActive?: boolean;
}

/** Hand a blob to the browser as a file. Used only by the direct-download fallback. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const money = (n?: number | null) =>
  n == null || n === 0 ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'mismatch' | 'expiring'>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // The Update-stock dialog: which SKU, and optionally which tab/lot to open on.
  const [stockDialog, setStockDialog] = useState<{ id: string; name: string; tab?: any; lotId?: string } | null>(null);
  // The store's own website (server-resolved per store — the admin is one build
  // serving every store, so this can never be a build-time constant).
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  // Lots shown under every row, or only under rows opened one by one.
  const [showAllLots, setShowAllLots] = useState<boolean>(() => {
    try { return localStorage.getItem('inv_show_all_lots') === '1'; } catch { return false; }
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chainCheck, setChainCheck] = useState<any>(null);
  const [chainBusy, setChainBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Bumped whenever a job is queued, so the Downloads panel starts polling at
  // once instead of waiting for its next idle refresh.
  const [downloadsToken, setDownloadsToken] = useState(0);
  const [health, setHealth] = useState<InventoryHealth | null>(null);
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const LIMIT = 20;

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryAPI.list({
        page,
        limit: LIMIT,
        search: search || undefined,
        lowStock: filter === 'low',
        outOfStock: filter === 'out',
        mismatch: filter === 'mismatch',
        // "Expiring" means a lot dated within 90 days — the window the batch
        // screen also uses, so the two pages can never mean different things.
        expiringDays: filter === 'expiring' ? 90 : undefined,
        // Each row's lots, fetched for the whole page in ONE query server-side.
        includeLots: true,
      });
      const list = Array.isArray(data) ? data : data?.products ?? data?.data ?? [];
      setItems(list);
      setTotal(data?.total ?? data?.pagination?.total ?? list.length);
      setSiteUrl((data as any)?.site_url ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const loadValuation = useCallback(async () => {
    try {
      const data = await inventoryAPI.getValuation();
      setValuation(data?.data ?? data ?? null);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadValuation(); }, [loadValuation]);

  // Loaded separately from the table: it is one scan over 44k SKUs (~2.5s) and
  // must never hold up the rows a merchant came to look at.
  const loadHealth = useCallback(async () => {
    try { setHealth(await inventoryAPI.health()); }
    catch { /* tiles degrade to the table's own counts */ }
  }, []);
  useEffect(() => { loadHealth(); }, [loadHealth]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInventory();
  };

  /**
   * Ask for the export instead of waiting for it.
   *
   * This used to be a single GET that held the connection while the server
   * built a ~31MB, 44,000-row workbook (6.8s locally, 10.5s against
   * production) — and navigating away lost the lot. Now the server queues it,
   * builds it in the background and keeps it in Downloads, so leaving this
   * page is harmless and nothing is pinned waiting.
   */
  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      await exportsAPI.request('inventory', search ? { search } : {});
      setDownloadsToken((n) => n + 1);
      setSuccess('Building your export — it will appear under Downloads when it is ready. You can carry on working.');
      setTimeout(() => setSuccess(null), 6000);
    } catch (err: any) {
      // The download queue arrives with a migration, and a store it has not
      // reached yet must still be able to export — so fall back to the direct
      // download rather than telling the merchant their export is broken.
      if (err?.response?.status === 503 || err?.response?.data?.code === 'queue_unavailable') {
        try {
          setSuccess('Preparing your export… this one downloads directly, so please stay on this page.');
          const blob = await inventoryAPI.exportExcel(search || undefined);
          downloadBlob(blob, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
          setSuccess(null);
        } catch (e2: any) {
          setSuccess(null);
          setError(await blobErrorMessage(e2, 'Failed to export inventory.'));
        }
      } else {
        setError(err?.response?.data?.message || 'Could not start the export.');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    try {
      setError(null);
      await exportsAPI.request('inventory_template');
      setDownloadsToken((n) => n + 1);
      setSuccess('Preparing the template — it will appear under Downloads in a moment.');
      setTimeout(() => setSuccess(null), 6000);
    } catch (err: any) {
      if (err?.response?.status === 503 || err?.response?.data?.code === 'queue_unavailable') {
        try { downloadBlob(await inventoryAPI.downloadTemplate(), 'inventory-import-template.xlsx'); }
        catch (e2: any) { setError(await blobErrorMessage(e2, 'Failed to download template.')); }
      } else {
        setError(err?.response?.data?.message || 'Could not prepare the template.');
      }
    }
  };

  /**
   * Send whatever file was chosen — the ONE import door.
   *
   * The server names the sheet from its header row, so a batches file dropped
   * here is applied by the batch importer rather than refused. A big sheet
   * comes back as a queued job (202) and is applied in the background; a small
   * one still answers with its real counts.
   */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    try {
      setImporting(true);
      setError(null);
      const r: ImportResponse = await inventoryAPI.importAny(file);
      const what = r?.sheet_label ?? 'sheet';

      if (r?.queued) {
        // Nothing has been applied yet, so there are no counts to report — say
        // where they will appear instead of inventing a number.
        setDownloadsToken((n) => n + 1);
        setSuccess(r.message ?? `${what} accepted — it is being applied in the background.`);
        return;
      }

      // `failed` from the backend already folds in parse errors; fall back to the
      // separate arrays for older responses.
      const failed = Array.isArray(r?.failed) ? r.failed.length : ((r?.failed ?? 0) + (r?.parse_errors?.length ?? 0));
      // The one door means this can be ANY sheet's answer, so read the one the
      // server actually sent rather than assuming the SKU shape and printing
      // "Updated 0 SKU(s)" for a file that did plenty.
      const bits: string[] = [];
      if (r?.message) {
        // The warehouse sheets write their own sentence — do not paraphrase it.
        setSuccess(`${what}: ${r.message}`);
      } else if (r?.sheet === 'batches') {
        if (r.batches_created) bits.push(`${r.batches_created} lot(s) created`);
        if (r.batches_updated) bits.push(`${r.batches_updated} updated`);
        if (r.units_added) bits.push(`+${r.units_added} units`);
        if (r.units_removed) bits.push(`−${r.units_removed} units`);
        setSuccess(`${what}: ${bits.join(', ') || 'nothing changed'}${failed ? `, ${failed} not applied` : ''}.`);
      } else if (r?.updated !== undefined) {
        if (r?.price_updated) bits.push(`${r.price_updated} price${r.price_updated > 1 ? 's' : ''}`);
        if (r?.b2b_updated) bits.push(`${r.b2b_updated} wholesale`);
        setSuccess(
          `Updated ${r.updated ?? 0} SKU(s)${bits.length ? ` (${bits.join(', ')})` : ''}${failed ? `, ${failed} skipped` : ''}.`
        );
      } else {
        // Market prices and availability report `processed`, not `updated`.
        setSuccess(`${what}: ${r?.processed ?? 0} row(s) applied${failed ? `, ${failed} not applied` : ''}.`);
      }
      // Every run is a job row, so a failure has a line number waiting under
      // Downloads — say so rather than leaving "12 skipped" as the whole story.
      if (failed) {
        setSuccess((prev) => `${prev ?? ''} Open “Line by line” under Downloads & imports`
          + ' to see which rows, and why.');
      }
      setTimeout(() => setSuccess(null), 10000);
      if (r?.job_id) setDownloadsToken((n) => n + 1);
      // Stock is no longer written from this sheet. A row that ASKED to change
      // it is reported rather than silently dropped — the round-trip case is
      // quiet, because the exported figure already matches what is stored.
      const ignored = Array.isArray(r?.stock_ignored) ? r.stock_ignored : [];
      if (ignored.length) {
        setError(
          `${ignored.length} row(s) tried to set Stock, which this sheet no longer changes — `
          + `quantity belongs to a batch. Use the Batches sheet. First: ${ignored[0].ref}.`
        );
      }
      loadInventory();
      loadValuation();
    } catch (err: any) {
      // 409 = another import is still being applied. That is a "wait a moment",
      // not a failure, and the running job's progress is right below.
      if (err?.response?.status === 409) {
        setDownloadsToken((n) => n + 1);
        setSuccess(err?.response?.data?.message || 'Another import is still being applied.');
        return;
      }
      setError(err?.response?.data?.message || 'Failed to import file.');
    } finally {
      setImporting(false);
    }
  };

  const toggleShowAll = () => {
    setShowAllLots((v) => {
      try { localStorage.setItem('inv_show_all_lots', v ? '0' : '1'); } catch { /* per-viewer convenience only */ }
      return !v;
    });
  };
  const toggleRow = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** Verify every SKU's stock-ledger chain — the same check the monitor runs. */
  const verifyChain = async () => {
    try {
      setChainBusy(true);
      setChainCheck(await inventoryAPI.verifyLedgerChain());
    } catch (err: any) {
      setChainCheck({ error: err?.response?.data?.message || 'Could not verify the ledger.' });
    } finally {
      setChainBusy(false);
    }
  };

  const openStock = (item: InventoryItem, tab?: string, lotId?: string) =>
    setStockDialog({ id: item._id, name: item.productName ?? item.name, tab, lotId });

  const getAvailableStock = (item: InventoryItem): number => {
    const s = item.availableStock ?? (item.stock ?? 0) - (item.reservedStock ?? 0);
    return Math.max(0, s);
  };

  const getStockStatus = (item: InventoryItem) => {
    const avail = getAvailableStock(item);
    if (avail <= 0) return { label: 'Out of Stock', color: 'var(--d-600)', bg: 'var(--d-50)' };
    if (avail <= 5) return { label: 'Low Stock', color: 'var(--w-600)', bg: 'var(--w-50)' };
    return { label: 'In Stock', color: 'var(--g-600)', bg: 'var(--g-50)' };
  };

  const getCategoryName = (cat: any): string => {
    if (!cat) return '—';
    if (typeof cat === 'string') return cat;
    return cat.name ?? '—';
  };

  return (
    <div className="inv-page">
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p className="subtitle">Manage retail &amp; B2B pricing across all SKUs. Ask for an export, edit it, and send it back — blank cells are left unchanged. Downloads are prepared in the background, so you can leave this page.</p>

        </div>
        <div className="header-actions">
          {siteUrl && (
            <a className="btn btn-secondary" href={siteUrl} target="_blank" rel="noopener noreferrer"
               title="Open this store's website in a new tab" data-testid="inv-view-website">
              View website ↗
            </a>
          )}
          <button className="btn btn-secondary" onClick={verifyChain} disabled={chainBusy} data-testid="inv-verify-chain"
            title="Check that every stock movement is still exactly as recorded and linked to the one before it">
            {chainBusy ? 'Verifying…' : '⛓ Verify ledger'}
          </button>
          <button className="btn btn-secondary" onClick={handleTemplate}>Template</button>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Requesting…' : '⬇ Export to Excel'}
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={importing}
            title="Send back a filled-in sheet. Either sheet — it is routed to the right importer.">
            {importing ? 'Sending…' : '⬆ Import Excel'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      </div>

      {/* Which of the two sheets does what, in the same words on both pages. */}
      <WhichSheetStrip here="inventory" />

      {/* Files the user asked for, and every import run. Present above
          everything else because it is where an export now arrives — the
          button no longer hands back a file — and where a queued import
          reports its progress. */}
      <DownloadsPanel refreshToken={downloadsToken} />

      {/* ── THE TILES STATE THE ACCURATE FIGURE ────────────────────────────
          `units_on_hand` is the LEDGER-preferred total (644,672 live), not
          Σ pv.stock (639,569) and not Σ batches (616,767). Those three have
          never agreed; showing one of them silently was the bug. */}
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Inventory value</span>
          <span className="stat-value">₹{Math.round(valuation?.grand_total ?? 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Units on hand</span>
          <span className="stat-value">{Number(health?.units_on_hand ?? 0).toLocaleString('en-IN')}</span>
          <span className="stat-sub">
            {health ? `${Number(health.units_batched).toLocaleString('en-IN')} in batches` : '—'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">SKUs</span>
          <span className="stat-value">{(health?.skus ?? total).toLocaleString('en-IN')}</span>
          <span className="stat-sub">{health ? `${health.batch_tracked.toLocaleString('en-IN')} batch-tracked` : '—'}</span>
        </div>
        <button className={`stat stat-btn ${filter === 'out' ? 'active' : ''}`}
          onClick={() => { setFilter('out'); setPage(1); }}>
          <span className="stat-label">Out of stock</span>
          <span className="stat-value">{(health?.out_of_stock ?? 0).toLocaleString('en-IN')}</span>
          <span className="stat-sub">{health ? `${health.low_stock.toLocaleString('en-IN')} running low` : '—'}</span>
        </button>
        {/* The reconciliation queue. A tile rather than a buried filter because
            6,494 live SKUs are in it and nothing surfaced that before. */}
        <button className={`stat stat-btn ${filter === 'mismatch' ? 'active' : ''} ${health && health.needs_reconciling > 0 ? 'warn' : ''}`}
          onClick={() => { setFilter('mismatch'); setPage(1); }}>
          <span className="stat-label">Needs reconciling</span>
          <span className="stat-value">{(health?.needs_reconciling ?? 0).toLocaleString('en-IN')}</span>
          <span className="stat-sub">
            {health && health.over_batched > 0 ? `${health.over_batched.toLocaleString('en-IN')} over-batched` : 'figures disagree'}
          </span>
        </button>
      </div>

      {health && health.not_ledgered > 0 && (
        <div className="notice">
          <strong>{health.not_ledgered.toLocaleString('en-IN')} SKUs have no stock-ledger record.</strong>{' '}
          Their quantity comes from the older per-product column instead. That is not an error — it
          means those SKUs have never moved through the ledger — but it is why a few rows below are
          marked <em>older column</em> rather than <em>ledger</em>.
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      {/* The stock ledger is a hash chain (migration 215): every movement carries
          a fingerprint of itself AND of the movement before it, so an entry that
          was changed, removed or re-ordered afterwards shows up here. */}
      {chainCheck && (
        <div className={`chain-banner ${chainCheck.error || chainCheck.present === false ? 'muted' : chainCheck.ok ? 'good' : 'bad'}`}
             data-testid="inv-chain-result">
          <span>
            {chainCheck.error
              ? chainCheck.error
              : chainCheck.present === false
                ? (chainCheck.reason || 'The stock ledger is not chained on this store yet.')
                : chainCheck.ok
                  ? <>⛓ <strong>Ledger intact.</strong> {Number(chainCheck.entries).toLocaleString('en-IN')} stock movements across {Number(chainCheck.skus).toLocaleString('en-IN')} SKUs verified — each unchanged since it was recorded and linked to the one before it ({chainCheck.ms} ms).</>
                  : <>⚠ <strong>The ledger does not verify.</strong>{' '}
                      {[
                        chainCheck.bad_hash ? `${chainCheck.bad_hash} movement(s) changed after they were recorded` : '',
                        chainCheck.bad_seq ? `${chainCheck.bad_seq} gap(s) where a movement is missing` : '',
                        chainCheck.bad_link ? `${chainCheck.bad_link} broken link(s)` : '',
                        chainCheck.bad_head ? `${chainCheck.bad_head} SKU(s) whose latest movements were removed` : '',
                        chainCheck.unchained ? `${chainCheck.unchained} movement(s) written with the safeguards off` : '',
                        chainCheck.headless ? `${chainCheck.headless} SKU(s) with no chain anchor` : '',
                      ].filter(Boolean).join(' · ')}. Open an affected SKU to see where.</>}
          </span>
          <button onClick={() => setChainCheck(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        <div className="filter-group">
          {([
            ['all', 'All'],
            ['low', 'Low stock'],
            ['out', 'Out of stock'],
            ['mismatch', 'Needs reconciling'],
            ['expiring', 'Expiring ≤ 90d'],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {label}
            </button>
          ))}
          <label className="lots-toggle" title="Show every SKU's batches under it">
            <input type="checkbox" checked={showAllLots} onChange={toggleShowAll} data-testid="inv-show-all-lots" />
            Show batches
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>No products found.</p>
          {filter !== 'all' && (
            <button className="btn btn-secondary" onClick={() => setFilter('all')}>Show all</button>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th className="num">On hand</th>
                  <th className="num">In batches</th>
                  <th className="num">Loose</th>
                  <th className="num">Avail.</th>
                  <th>Lots</th>
                  <th>Nearest expiry</th>
                  <th className="num">MRP</th>
                  <th className="num">Selling</th>
                  <th className="num">B2B</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const status = getStockStatus(item);
                  const onHand = item.onHand ?? item.stock ?? 0;
                  const lots = item.lotCount ?? 0;
                  const loose = item.unbatchedQty ?? 0;
                  const exp = item.nearestExpiry ?? null;
                  const expDays = exp ? Math.round((new Date(exp).getTime() - Date.now()) / 86400000) : null;
                  const rowLots = item.lots ?? [];
                  const isOpen = showAllLots || expanded.has(item._id);
                  const siteHref = item.productUrl ?? siteUrl;
                  return (
                    <Fragment key={item._id}>
                    <tr className={`${item.stockMismatch ? 'row-warn' : ''} ${isOpen && lots ? 'row-open' : ''}`}
                        onClick={() => setOpenSku(item._id)} style={{ cursor: 'pointer' }} data-testid="inv-row">
                      <td onClick={(e) => e.stopPropagation()}>
                        {lots > 0 && (
                          <button className="expander" aria-expanded={isOpen} data-testid="inv-row-expand"
                            title={isOpen ? 'Hide batches' : `Show ${lots} batch(es)`}
                            onClick={() => (showAllLots ? toggleShowAll() : toggleRow(item._id))}>
                            {isOpen ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="product-cell">
                          {item.images?.[0] && (
                            <img src={item.images[0]} alt="" className="product-thumb" />
                          )}
                          <span className="product-names">
                            {/* The name opens the product on the store's own website.
                                A product with no known page falls back to the site's
                                homepage rather than a guessed link. */}
                            {siteHref ? (
                              <a className="product-name-main site-link" href={siteHref} target="_blank" rel="noopener noreferrer"
                                 onClick={(e) => e.stopPropagation()} data-testid="inv-site-link"
                                 title={item.productUrl ? 'Open this product on your website' : 'Open your website'}>
                                {item.productName ?? item.name} <span className="ext">↗</span>
                              </a>
                            ) : (
                              <span className="product-name-main">{item.productName ?? item.name}</span>
                            )}
                            {item.variationName && item.variationName !== item.productName && (
                              <span className="product-name-sub">{item.variationName}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="mono">{item.sku ?? '—'}</td>
                      <td>{getCategoryName(item.category)}</td>

                      {/* On hand, and WHERE THE NUMBER CAME FROM. A figure whose
                          source is unstated is how "0 in stock" was shown for a
                          SKU the ledger says holds 214 units. */}
                      <td className="num">
                        <strong>{onHand.toLocaleString('en-IN')}</strong>
                        {item.stockSource === 'legacy' && (
                          <span className="src-tag" title="No stock-ledger record for this SKU — this is the older per-product column.">older</span>
                        )}
                        {item.stockMismatch && (
                          <span className="src-tag warn" title="The stock figures for this SKU disagree. Open it to see all three.">⚠</span>
                        )}
                      </td>
                      <td className="num">{lots ? (item.batchedQty ?? 0).toLocaleString('en-IN') : <span className="dim">—</span>}</td>
                      <td className="num">
                        {/* Loose stock is NOT noise — it is units with no expiry
                            and no printed price. Only zero is dimmed; a negative
                            means the batches claim more than the pool holds. */}
                        {lots
                          ? <span className={loose < 0 ? 'neg' : loose === 0 ? 'dim' : ''}>{loose.toLocaleString('en-IN')}</span>
                          : <span className="dim">—</span>}
                      </td>
                      <td className="num">{getAvailableStock(item).toLocaleString('en-IN')}</td>
                      <td>
                        {lots
                          ? <span style={{ whiteSpace: 'nowrap' }}>
                              {lots}
                              {(item.mrpCount ?? 0) > 1 && (
                                <span className="src-tag" title={`${item.mrpCount} different printed MRPs across this SKU's lots`}>
                                  {item.mrpCount} MRPs
                                </span>
                              )}
                            </span>
                          : <span className="dim">none</span>}
                      </td>
                      <td>
                        {exp
                          ? <span className={expDays != null && expDays < 90 ? 'warnText' : ''}>{exp}</span>
                          : <span className="dim">—</span>}
                        {(item.expiredQty ?? 0) > 0 && (
                          <span className="src-tag warn" title={`${item.expiredQty} unit(s) already past expiry`}>{item.expiredQty} expired</span>
                        )}
                      </td>
                      <td className="num">{money(item.mrp)}</td>
                      <td className="num">{money(item.sellingPrice)}</td>
                      <td className="num">{money(item.b2bPrice)}</td>
                      <td>
                        <span className="status-pill" style={{ background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" data-testid="inv-update-stock"
                          onClick={(e) => { e.stopPropagation(); openStock(item); }}>
                          Update stock
                        </button>
                      </td>
                    </tr>
                    {/* ── The SKU's lots, right under it ───────────────────── */}
                    {isOpen && lots > 0 && (
                      <tr className="lot-row" data-testid="inv-lot-row">
                        <td></td>
                        <td colSpan={14}>
                          <table className="lot-table">
                            <thead>
                              <tr>
                                <th>Batch</th>
                                <th className="num">Qty</th>
                                <th className="num">Batch MRP</th>
                                <th className="num">Batch retail</th>
                                <th className="num">Batch B2B</th>
                                <th>Mfg</th>
                                <th>Expiry</th>
                                <th>Purchased</th>
                                <th className="num">In bins</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowLots.map((l) => {
                                const d = l.days_to_expiry == null ? null : Number(l.days_to_expiry);
                                const unplaced = Number(l.qty_on_hand) - Number(l.placed_qty || 0);
                                return (
                                  <tr key={l.id} data-testid="inv-lot">
                                    <td className="mono">{l.batch_number}</td>
                                    <td className="num"><strong>{Number(l.qty_on_hand).toLocaleString('en-IN')}</strong></td>
                                    <td className="num">{money(l.mrp)}</td>
                                    <td className="num">{l.selling_price == null ? <span className="dim" title="Sells at the catalogue retail price">catalogue</span> : money(l.selling_price)}</td>
                                    <td className="num">{l.b2b_price == null ? <span className="dim" title="Wholesale accounts pay the SKU's B2B price">catalogue</span> : money(l.b2b_price)}</td>
                                    <td>{l.mfg_date ?? <span className="dim">—</span>}</td>
                                    <td className={d == null ? '' : d < 0 ? 'neg' : d < 90 ? 'warnText' : ''}>
                                      {l.expiry_date ?? <span className="dim">—</span>}
                                      {d != null && <span className="days"> {d < 0 ? `expired ${-d}d ago` : `${d}d`}</span>}
                                    </td>
                                    <td>
                                      {l.purchase_date ?? <span className="dim">—</span>}
                                      {l.purchase_ref && <span className="days"> · {l.purchase_ref}</span>}
                                    </td>
                                    <td className="num">
                                      {Number(l.placed_qty || 0).toLocaleString('en-IN')}
                                      {unplaced > 0 && Number(l.placed_qty || 0) > 0 && <span className="days"> ({unplaced} not put away)</span>}
                                    </td>
                                    <td className="lot-actions" onClick={(e) => e.stopPropagation()}>
                                      <button onClick={() => openStock(item, 'count', l.id)}>Count</button>
                                      <button onClick={() => openStock(item, 'remove', l.id)}>Write off</button>
                                      <button onClick={() => openStock(item, 'edit', l.id)}>Edit</button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {loose !== 0 && (
                                <tr className="loose-line">
                                  <td className="dim">Not in a batch</td>
                                  <td className={`num ${loose < 0 ? 'neg' : ''}`}>{loose.toLocaleString('en-IN')}</td>
                                  <td colSpan={6} className="dim">
                                    {loose < 0
                                      ? 'The lots claim more units than are on hand — count the lots to correct it.'
                                      : 'No expiry and no printed price of their own.'}
                                  </td>
                                  <td className="lot-actions" onClick={(e) => e.stopPropagation()}>
                                    {loose > 0 && <button onClick={() => openStock(item, 'label')}>Label as lot</button>}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={LIMIT} total={total} onPage={setPage} />
        </>
      )}

      {/* ── Secondary bulk tools ──────────────────────────────────────────
          Below the table and collapsed by default. They are occasional jobs;
          leaving them open pushed the stock a merchant came to read off the
          first screen entirely. */}
      <div style={{ marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={() => setBulkOpen((o) => !o)}>
          {bulkOpen ? '▾' : '▸'} More bulk tools — market prices &amp; availability
        </button>
        {bulkOpen && (
          <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
            {/* Explicit prices for the other markets (homeo.med etc.) — retail +
                B2B per SKU in the market currency, optionally per country.
                Rupee prices stay on the SKU sheet above. */}
            <MarketPricesBulkBar />
            {/* Who may buy a SKU (B2B-only) and where it may be sold. */}
            <AvailabilityBulkBar />
          </div>
        )}
      </div>

      <StockDetailDrawer
        variationId={openSku}
        onClose={() => setOpenSku(null)}
        onUpdate={(id, name) => { setOpenSku(null); setStockDialog({ id, name }); }}
      />

      <UpdateStockDialog
        variationId={stockDialog?.id ?? null}
        name={stockDialog?.name}
        initialTab={stockDialog?.tab}
        initialLotId={stockDialog?.lotId ?? null}
        onClose={() => setStockDialog(null)}
        onDone={(msg) => {
          setSuccess(msg);
          setTimeout(() => setSuccess(null), 6000);
          loadInventory();
          loadHealth();
          loadValuation();
        }}
      />

      <style>{`
        .inv-page { padding: 20px 24px; max-width: 100%; margin: 0; }
        /* Lots under their SKU. Indented and tinted so they read as PART of the row above. */
        .expander { border: 1px solid var(--n-200); background: var(--surface); border-radius: 6px; width: 22px; height: 22px;
                    cursor: pointer; color: var(--n-600); font-size: 11px; line-height: 1; padding: 0; }
        .expander:hover { border-color: var(--n-400); }
        .table-wrap tr.row-open td { border-bottom-color: transparent; }
        .table-wrap tr.lot-row > td { background: var(--n-50); padding: 4px 12px 12px; }
        .table-wrap tr.lot-row:hover > td { background: var(--n-50); }
        .lot-table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: var(--surface);
                     border: 1px solid var(--n-200); border-radius: 8px; overflow: hidden; }
        .lot-table th { background: var(--n-100); padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--n-600);
                        border-bottom: 1px solid var(--n-200); text-transform: uppercase; letter-spacing: .2px; }
        .lot-table td { padding: 6px 10px; border-bottom: 1px solid var(--n-100); }
        .lot-table tr:last-child td { border-bottom: none; }
        .lot-table .days { font-size: 11px; color: var(--n-400); }
        .lot-table .loose-line td { background: var(--n-50); font-style: italic; }
        .lot-actions { white-space: nowrap; text-align: right; }
        .lot-actions button { border: 1px solid var(--n-200); background: var(--surface); border-radius: 6px; padding: 2px 8px;
                              font-size: 11.5px; color: var(--n-700); cursor: pointer; margin-left: 4px; }
        .lot-actions button:hover { border-color: var(--accent); color: var(--accent); }
        .lots-toggle { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; font-size: 0.8rem;
                       color: var(--n-700); cursor: pointer; user-select: none; }
        .site-link { color: var(--n-900); text-decoration: none; }
        .site-link:hover { color: var(--i-600); text-decoration: underline; }
        .site-link .ext { font-size: 11px; color: var(--n-400); }
        a.btn { text-decoration: none; display: inline-flex; align-items: center; }
        .chain-banner { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
                        padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem; }
        .chain-banner.good { background: var(--g-50); border: 1px solid var(--g-300); color: var(--g-800); }
        .chain-banner.bad { background: var(--d-50); border: 1px solid var(--d-300); color: var(--d-800); }
        .chain-banner.muted { background: var(--n-50); border: 1px solid var(--n-200); color: var(--n-600); }
        .chain-banner button { background: none; border: none; cursor: pointer; font-size: 1rem; color: inherit; }
        /* Accurate-figure tiles. The stat-btn ones are filters, so they look pressable. */
        .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--n-200);
                border-radius: 10px; background: var(--surface); text-align: left; }
        .stat-btn { cursor: pointer; font: inherit; transition: border-color .15s, background .15s; }
        .stat-btn:hover { border-color: var(--n-400); background: var(--n-50); }
        .stat-btn.active { border-color: var(--accent); background: var(--g-50); }
        .stat-btn.warn .stat-value { color: var(--w-700); }
        .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: var(--n-500); }
        .stat-value { font-size: 22px; font-weight: 700; color: var(--n-900); font-variant-numeric: tabular-nums; }
        .stat-sub { font-size: 11px; color: var(--n-400); }
        .notice { border: 1px solid var(--n-200); background: var(--n-50); color: var(--n-600); border-radius: 10px;
                  padding: 10px 14px; font-size: 12.5px; margin-bottom: 16px; }
        /* Table: money and counts right-aligned and tabular so a column can be scanned. */
        .table-wrap th.num, .table-wrap td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .table-wrap td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        .table-wrap tr.row-warn { background: var(--w-50); }
        .table-wrap tr:hover { background: var(--n-50); }
        .dim { color: var(--n-300); }
        .neg { color: var(--d-700); font-weight: 600; }
        .warnText { color: var(--w-700); }
        .src-tag { display: inline-block; margin-left: 6px; padding: 1px 5px; border-radius: 999px;
                   background: var(--n-100); color: var(--n-500); font-size: 10px; vertical-align: middle; }
        .src-tag.warn { background: var(--w-100); color: var(--w-800); }
        .table-wrap .status-pill { white-space: nowrap; }
        .modal-warn { margin-top: 10px; padding: 9px 11px; border-radius: 8px; background: var(--w-50);
                      color: var(--w-800); font-size: 12.5px; line-height: 1.45; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .subtitle { margin: 0; color: var(--n-500); font-size: 0.875rem; }
        .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .summary-card { background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
        .summary-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--n-500); font-weight: 600; }
        .summary-value { font-size: 1.35rem; font-weight: 700; color: var(--n-900); }
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .search-form { display: flex; gap: 8px; flex: 1; min-width: 200px; max-width: 400px; }
        .search-form input { flex: 1; padding: 8px 12px; border: 1px solid var(--n-300); border-radius: 6px; font-size: 0.875rem; }
        .filter-group { display: flex; gap: 4px; }
        .filter-btn { padding: 6px 14px; border: 1px solid var(--n-300); border-radius: 6px; background: var(--surface); cursor: pointer; font-size: 0.8rem; color: var(--n-700); }
        .filter-btn.active { background: var(--accent); color: var(--surface); border-color: var(--accent); }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-sm { padding: 4px 12px; font-size: 0.8rem; }
        .btn-primary { background: var(--accent); color: var(--surface); }
        .btn-secondary { background: var(--n-100); color: var(--n-700); border: 1px solid var(--n-300); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: var(--d-50); border: 1px solid var(--d-300); color: var(--d-600); }
        .alert-success { background: var(--g-50); border: 1px solid var(--g-300); color: var(--g-600); }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; }
        .loading, .empty { text-align: center; padding: 60px 20px; color: var(--n-500); }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--n-200); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        th { padding: 10px 12px; text-align: left; font-weight: 600; color: var(--n-700); background: var(--n-50); border-bottom: 2px solid var(--n-200); white-space: nowrap; }
        td { padding: 10px 12px; border-bottom: 1px solid var(--n-100); vertical-align: middle; }
        tr:hover td { background: var(--n-50); }
        .product-cell { display: flex; align-items: center; gap: 10px; }
        .product-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid var(--n-200); flex-shrink: 0; }
        .product-names { display: flex; flex-direction: column; line-height: 1.3; }
        .product-name-main { font-weight: 500; }
        .product-name-sub { font-size: 12px; color: var(--n-500); }
        .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
        .modal-overlay { position: fixed; inset: 0; background: var(--scrim); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--surface); border-radius: 12px; width: 100%; max-width: 420px; overflow: hidden; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px 0; }
        .modal-header h2 { margin: 0; font-size: 1.1rem; }
        .close-btn { background: none; border: none; cursor: pointer; font-size: 1.4rem; color: var(--n-500); }
        .modal-body { padding: 20px 24px; }
        .product-name { font-weight: 600; margin: 0 0 8px; }
        .current-stock { font-size: 0.875rem; color: var(--n-500); margin-bottom: 16px; }
        .reserved-note { color: var(--w-500); }
        .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .form-row label { font-size: 0.8rem; font-weight: 500; color: var(--n-700); }
        .form-row input { padding: 8px 12px; border: 1px solid var(--n-300); border-radius: 6px; font-size: 0.875rem; }
        .form-row input:focus { outline: none; border-color: var(--accent); }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--n-100); }
      `}</style>
    </div>
  );
}
