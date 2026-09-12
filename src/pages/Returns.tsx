import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RotateCcw, PackagePlus, Wallet, Clock, Search, RefreshCw, Camera,
  AlertTriangle, ExternalLink, Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { payload } from '@/lib/unwrap';
import { useAuth } from '../contexts/AuthContext';
import { inr, Chip } from '../components/erp';
import { formatDate } from '../utils/date';
import ReturnDetailPanel from '../components/returns/ReturnDetailPanel';

/**
 * THE RETURNS DESK.
 *
 * The page this replaces listed a status and dumped the `items` JSONB through
 * `JSON.stringify`. It showed no line items, no photos, no exception flags, and
 * had no way to book goods in or decide their condition — so the whole physical
 * half of migration 154 had no screen at all, and the money half (credit note /
 * refund / replacement, migration 167) did not exist yet.
 *
 * The queue is ordered by what needs a human: a return waiting on a decision,
 * then goods waiting to be booked in, then units sitting in quarantine, then
 * money that has not been settled.
 */

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Needs a decision' },
  { key: 'approved',  label: 'Awaiting the parcel' },
  { key: 'received',  label: 'Goods in' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'cancelled', label: 'Withdrawn' },
] as const;

const STATUS_TONE: Record<string, any> = {
  pending: 'amber', approved: 'blue', received: 'green',
  completed: 'green', rejected: 'red', cancelled: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Needs a decision', approved: 'Awaiting parcel', received: 'Goods in',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Withdrawn',
};

const RESOLUTION_META: Record<string, { label: string; icon: React.ElementType; tone: any }> = {
  refund:       { label: 'Refund',       icon: RotateCcw,   tone: 'blue' },
  replacement:  { label: 'Replacement',  icon: PackagePlus, tone: 'green' },
  store_credit: { label: 'Store credit', icon: Wallet,      tone: 'amber' },
  undecided:    { label: 'Undecided',    icon: Clock,       tone: 'neutral' },
};

const PAGE_SIZE = 50;

const Returns: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('returns.manage');
  const canAdjustStock = hasPerm('inventory.adjust');
  const canManageStock = hasPerm('inventory.manage');
  const canSettle = canManage && hasPerm('orders.manage');
  const canShip = hasPerm('shipments.manage');

  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [resolution, setResolution] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    api.get('/returns/meta').then((r) => setMeta(payload<any>(r))).catch(() => setMeta(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, any> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (tab !== 'all') params.status = tab;
      if (resolution !== 'all') params.resolution = resolution;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/returns', { params });
      const data = payload<any[]>(res) ?? [];
      setRows(Array.isArray(data) ? data : []);
      // `total` and `counts` ride the envelope as non-enumerable siblings —
      // the admin interceptor preserves them only for ARRAY payloads.
      setTotal(Number((data as any)?.total ?? (res as any)?.data?.total ?? data.length));
      setCounts(((data as any)?.counts ?? {}) as Record<string, number>);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load returns.');
      setRows([]);
    } finally { setLoading(false); }
  }, [tab, page, search, resolution]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [tab, search, resolution]);

  const openRow = async (row: any) => {
    try { setSelected(payload<any>(await api.get(`/returns/${row.id}`))); }
    catch { setSelected(row); }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            What is coming back, what condition it arrived in, and what the customer gets —
            a refund, a replacement, or store credit.
          </p>
        </div>
        <button onClick={load} disabled={loading}
                className="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted inline-flex items-center gap-2 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tabs with live counts */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
            {counts[t.key === 'all' ? 'all' : t.key] !== undefined && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({counts[t.key === 'all' ? 'all' : t.key] ?? 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Return number, order, customer, SKU…"
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">Any outcome</option>
          <option value="refund">Refund</option>
          <option value="replacement">Replacement</option>
          <option value="store_credit">Store credit</option>
          <option value="undecided">Undecided</option>
        </select>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-background">
        <div className="w-0 min-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Return</th>
                <th className="text-left font-medium px-4 py-3">Order</th>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-left font-medium px-4 py-3">Reason</th>
                <th className="text-left font-medium px-4 py-3">Outcome</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Value</th>
                <th className="text-left font-medium px-4 py-3">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="h-40 text-center">
                  <Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="h-40 text-center text-muted-foreground">
                  <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">Nothing here</p>
                  <p className="text-xs mt-1">
                    {tab === 'all'
                      ? 'No return requests yet. Customers raise these from their order page.'
                      : `No returns in "${TABS.find((t) => t.key === tab)?.label}".`}
                  </p>
                </td></tr>
              ) : rows.map((r) => {
                const res = RESOLUTION_META[r.resolution] ?? RESOLUTION_META.undecided;
                const ResIcon = res.icon;
                const photoCount = (r.photos?.length ?? 0);
                return (
                  <tr key={r.id}
                      onClick={() => openRow(r)}
                      className="hover:bg-muted/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium">
                        {r.return_number ?? r.id?.slice(0, 8)}
                      </span>
                      <div className="flex gap-1 mt-1 items-center">
                        {r.is_exception && (
                          <span title={r.exception_reason}>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          </span>
                        )}
                        {photoCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Camera className="h-3.5 w-3.5" />{photoCount}
                          </span>
                        )}
                        {r.line_count != null && (
                          <span className="text-xs text-muted-foreground">
                            · {r.line_count} item{r.line_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.order_number ? (
                        <Link to={`/orders/${r.order_uuid ?? r.order_number}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline font-mono text-xs inline-flex items-center gap-1">
                          {r.order_number}<ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{r.customer_name || '—'}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {r.customer_email || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[180px] truncate"
                        title={r.reason ?? ''}>
                      {meta?.returnReasons?.find((x: any) => x.code === r.reason_code)?.label
                        ?? r.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={res.tone}>
                        <ResIcon className="h-3 w-3 mr-1 inline" />{res.label}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={STATUS_TONE[r.status] ?? 'neutral'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-medium">
                      {r.eligible_amount_minor != null ? inr(Number(r.eligible_amount_minor)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at ? formatDate(r.created_at, 'dd MMM yyyy') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                      className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted">
                Previous
              </button>
              <span className="px-2 py-1.5 text-muted-foreground">Page {page + 1} of {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <ReturnDetailPanel
          doc={selected}
          meta={meta}
          canManage={canManage}
          canAdjustStock={canAdjustStock}
          canManageStock={canManageStock}
          canSettle={canSettle}
          hasShipPerm={canShip}
          onClose={() => { setSelected(null); load(); }}
          onChanged={(d) => { setSelected(d); load(); }}
        />
      )}
    </div>
  );
};

export default Returns;
