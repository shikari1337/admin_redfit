import React from 'react';
import { Link } from 'react-router-dom';
import {
  Heart, Search, RefreshCw, Download, X, AlertTriangle, PackageX, Users,
  TrendingUp, Bookmark, Boxes,
} from 'lucide-react';
import {
  wishlistAdminAPI, type WishlistSummary, type WishlistDemandRow, type WishlistSaverRow,
} from '@/services/api';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, TabBar, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyState, Pagination, inr,
} from '@/components/erp';
import { cn } from '@/lib/utils';
import { localeDate } from '../utils/date';

/**
 * WISHLIST WORKSPACE
 *
 * A wishlist belongs to the SHOPPER — the store does not edit someone's saved
 * items, and this page deliberately offers no way to. What the store manages is
 * the DEMAND those saves represent, which is a merchandising job:
 *
 *   "37 people saved ARNICA MONTANA 30C 30 ML SBL and it is out of stock"
 *
 * is a restock decision; "1,204 people want Arnica" is not. So the default grain
 * is the SKU (the variation a shopper actually saved), because the parent
 * product in this catalogue is a remedy family of up to 50+ packs
 * (COMMON_MISTAKES #58).
 *
 * Backend: routes/wishlist.ts /admin/* — reads need `reports.read` and the
 * `wishlist` module. Saves against deactivated products are excluded, matching
 * the customer-facing list.
 */

const TABS = [
  { key: 'out', label: 'Out of stock' },
  { key: 'all', label: 'All demand' },
  { key: 'low', label: 'Running low' },
  { key: 'savers', label: 'Top savers' },
] as const;

type TabKey = typeof TABS[number]['key'];

const PERIODS = [
  { v: '', l: 'All time' },
  { v: '7', l: 'Last 7 days' },
  { v: '30', l: 'Last 30 days' },
  { v: '90', l: 'Last 90 days' },
];

const fmtDate = (d?: string | null) =>
  d ? localeDate(d, { day: 'numeric', month: 'short', year: '2-digit' }, undefined) : '—';

const Wishlist: React.FC = () => {
  const [tab, setTab] = React.useState<TabKey>('out');
  const [summary, setSummary] = React.useState<WishlistSummary | null>(null);
  const [rows, setRows] = React.useState<WishlistDemandRow[]>([]);
  const [savers, setSavers] = React.useState<WishlistSaverRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [grain, setGrain] = React.useState<'sku' | 'product'>('sku');
  const [days, setDays] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = React.useMemo(() => ({
    grain,
    stock: (tab === 'out' ? 'out' : tab === 'low' ? 'low' : 'all') as 'out' | 'low' | 'all',
    days: days ? Number(days) : undefined,
    search: debounced || undefined,
  }), [grain, tab, days, debounced]);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, rest] = await Promise.all([
        wishlistAdminAPI.summary().catch(() => null),
        tab === 'savers'
          ? wishlistAdminAPI.savers(pageSize).then((d) => ({ kind: 'savers' as const, d }))
          : wishlistAdminAPI.demand({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
              .then((d) => ({ kind: 'demand' as const, d })),
      ]);
      if (s) setSummary(s);
      if (rest.kind === 'savers') { setSavers(rest.d); setTotal(rest.d.length); }
      else { setRows(rest.d.rows); setTotal(rest.d.total); }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load wishlist data.');
      setRows([]); setSavers([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, params, page, pageSize]);

  React.useEffect(() => { load(); }, [load]);

  const isSavers = tab === 'savers';
  const empty = isSavers ? !savers.length : !rows.length;

  return (
    <Page>
      <PageHeader
        title="Wishlists"
        icon={Heart}
        description="What shoppers saved but have not bought yet. Use it to decide what to restock, what to discount, and who to win back."
        actions={
          <>
            <Btn variant="outline" onClick={load} title="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Btn>
            {!isSavers && (
              <Btn variant="outline" onClick={() => wishlistAdminAPI.exportCsv(params)}>
                <Download className="h-4 w-4" /> Export
              </Btn>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="Saved but out of stock"
          value={summary?.out_of_stock_saves ?? '—'}
          sub={summary?.out_of_stock_saves ? 'Demand you cannot fill today' : 'Everything saved is buyable'}
          tone={summary?.out_of_stock_saves ? 'bad' : 'good'}
          icon={PackageX}
        />
        <StatCard
          label="Items saved"
          value={summary?.saves ?? '—'}
          sub={`${summary?.skus ?? 0} distinct SKUs`}
          icon={Bookmark}
        />
        <StatCard
          label="Shoppers saving"
          value={summary?.customers ?? '—'}
          sub="People with at least one saved item"
          icon={Users}
        />
        <StatCard
          label="Saved recently"
          value={summary?.saves_30d ?? '—'}
          sub={`${summary?.saves_7d ?? 0} in the last 7 days`}
          icon={TrendingUp}
        />
      </StatGrid>

      <TabBar active={tab} onChange={(k) => { setTab(k as TabKey); setPage(1); }} tabs={TABS as any} />

      {/* Filters */}
      {!isSavers && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved items by name or SKU…"
              className="h-9 w-full rounded-lg border border-gray-300 pl-9 pr-8 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <SelectInput value={grain} onChange={(e) => { setGrain(e.target.value as any); setPage(1); }} className="h-9 w-auto">
            <option value="sku">Per SKU (pack)</option>
            <option value="product">Per product (family)</option>
          </SelectInput>

          <SelectInput value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }} className="h-9 w-auto">
            {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </SelectInput>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {loading && empty ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : empty ? (
        <EmptyState
          icon={Heart}
          title={
            debounced ? 'Nothing matches that search'
              : tab === 'out' ? 'Nothing saved is out of stock'
              : tab === 'low' ? 'Nothing saved is running low'
              : isSavers ? 'No one has saved anything yet'
              : 'No saved items yet'
          }
          description={
            debounced ? 'Try a different word, or clear the search.'
              : tab === 'out' ? 'Every item shoppers saved is currently buyable — nothing to restock.'
              : 'When shoppers tap the heart on a product, it shows up here as demand you can act on.'
          }
        />
      ) : isSavers ? (
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Customer</Th>
              <Th className="w-24 text-right">Items</Th>
              <Th className="w-28 text-right">Products</Th>
              <Th className="w-32 text-right">Saved value</Th>
              <Th className="w-32 text-right">Out of stock</Th>
              <Th className="w-28">Last saved</Th>
            </THead>
            <TBody>
              {savers.map((s) => (
                <Tr key={s.customer_id}>
                  <Td>
                    {/* Name/contact arrive only when this account also holds
                        customers.read — a reports-only role sees the demand
                        numbers against an opaque id, which is the point. */}
                    {s.name || s.email || s.phone ? (
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{s.name || 'Customer'}</span>
                        <span className="block truncate text-xs text-gray-400">{s.phone || s.email}</span>
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-gray-500" title={s.customer_id}>
                        {s.customer_id.slice(0, 8)}…
                      </span>
                    )}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{s.items}</Td>
                  <Td className="text-right tabular-nums">{s.products}</Td>
                  <Td className="text-right tabular-nums">{inr(s.saved_value)}</Td>
                  <Td className="text-right tabular-nums">
                    {s.out_of_stock > 0
                      ? <span className="font-medium text-red-600">{s.out_of_stock}</span>
                      : <span className="text-gray-400">—</span>}
                  </Td>
                  <Td muted>{fmtDate(s.last_added)}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Item</Th>
              <Th className="w-24 text-right">Saves</Th>
              <Th className="w-28 text-right">Shoppers</Th>
              <Th className="w-28 text-right">Stock</Th>
              <Th className="w-28 text-right">Price</Th>
              <Th className="w-28">Last saved</Th>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={`${r.product_id}:${r.variation_id ?? '-'}`}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {r.image ? (
                        <img src={r.image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100">
                          <Boxes className="h-4 w-4 text-gray-300" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <Link
                          to={`/products?search=${encodeURIComponent(r.sku || r.name)}`}
                          className="block max-w-[22rem] truncate font-medium text-gray-900 hover:text-indigo-600 hover:underline"
                        >
                          {r.name}
                        </Link>
                        <span className="block truncate font-mono text-xs text-gray-400">{r.sku ?? '—'}</span>
                      </span>
                    </div>
                  </Td>
                  <Td className="text-right font-medium tabular-nums">{r.wish_count}</Td>
                  <Td className="text-right tabular-nums">{r.customers}</Td>
                  <Td className="text-right tabular-nums">
                    {r.stock <= 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                        <PackageX className="h-3 w-3" /> Out
                      </span>
                    ) : r.stock <= 5 ? (
                      <span className="font-medium text-amber-600">{r.stock}</span>
                    ) : (
                      <span className="text-gray-600">{r.stock}</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.selling_price != null ? inr(r.selling_price) : '—'}
                  </Td>
                  <Td muted>{fmtDate(r.last_added)}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}

      {!isSavers && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      )}
    </Page>
  );
};

export default Wishlist;
