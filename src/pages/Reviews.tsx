import React from 'react';
import {
  Star, Plus, Upload, Download, Search, Check, Ban, Flag, EyeOff, Trash2,
  ShieldCheck, MessageSquare, Image as ImageIcon, RefreshCw, X, Loader2, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { reviewsAPI, type AdminReview, type ReviewCounts, type ReviewStatus } from '@/services/api';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, StatusChip, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyState, Pagination, SelectInput,
} from '@/components/erp';
import { StarRating } from '@/components/reviews/StarRating';
import { MediaStrip, MediaLightbox } from '@/components/reviews/ReviewMedia';
import { ReviewDetailDrawer } from '@/components/reviews/ReviewDetailDrawer';
import { ReviewEditorModal } from '@/components/reviews/ReviewEditorModal';
import { ReviewImportModal } from '@/components/reviews/ReviewImportModal';
import { cn } from '@/lib/utils';

/**
 * REVIEWS WORKSPACE
 *
 * Built around the job the store owner actually has — "clear the queue, then
 * curate" — instead of the old page's single always-open form.
 *
 *   Tabs      = the moderation queue, with live counts so you can see the work.
 *   Row click = a detail drawer (read, watch, moderate, reply, re-link).
 *   Selection = a bulk action bar; approving 50 reviews is one request.
 *   Import    = preview + validate before anything is written.
 *
 * Permissions: reading needs content.read, acting needs content.manage, and
 * deleting needs content.delete — which is a SEPARATE permission because deletes
 * in this codebase are permanent (COMMON_MISTAKES #49).
 */

const TABS = [
  { key: 'pending',  label: 'Needs review', status: 'pending' },
  { key: 'approved', label: 'Published',    status: 'approved' },
  { key: 'reported', label: 'Reported',     status: '' },
  { key: 'rejected', label: 'Rejected',     status: 'rejected,spam' },
  { key: 'all',      label: 'All',          status: '' },
] as const;

type TabKey = typeof TABS[number]['key'];

const SORTS = [
  { v: 'newest', l: 'Newest first' },
  { v: 'oldest', l: 'Oldest first' },
  { v: 'highest', l: 'Highest rated' },
  { v: 'lowest', l: 'Lowest rated' },
  { v: 'helpful', l: 'Most helpful' },
  { v: 'media', l: 'With photos & video' },
  { v: 'reported', l: 'Most reported' },
];

const Reviews: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('content.manage');
  const canDelete = hasPerm('content.delete');

  const [tab, setTab] = React.useState<TabKey>('pending');
  const [rows, setRows] = React.useState<AdminReview[]>([]);
  const [total, setTotal] = React.useState(0);
  const [counts, setCounts] = React.useState<ReviewCounts | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [rating, setRating] = React.useState('');
  const [mediaOnly, setMediaOnly] = React.useState(false);
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [sort, setSort] = React.useState('newest');

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [active, setActive] = React.useState<AdminReview | null>(null);
  const [lightbox, setLightbox] = React.useState<{ media: any[]; index: number } | null>(null);
  const [showEditor, setShowEditor] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    const def = TABS.find((t) => t.key === tab)!;
    try {
      const [list, c] = await Promise.all([
        reviewsAPI.list({
          status: def.status || undefined,
          reported: tab === 'reported' || undefined,
          rating: rating || undefined,
          hasMedia: mediaOnly || undefined,
          verified: verifiedOnly || undefined,
          search: debounced || undefined,
          sort,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        reviewsAPI.counts().catch(() => null),
      ]);
      setRows(list.rows);
      setTotal(list.total);
      if (c) setCounts(c);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load reviews.');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, rating, mediaOnly, verifiedOnly, debounced, sort, page, pageSize]);

  React.useEffect(() => { load(); }, [load]);

  // Keep the drawer showing fresh data after an action refreshes the list.
  React.useEffect(() => {
    if (active) setActive(rows.find((r) => r.id === active.id) ?? null);
  }, [rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bulk = async (fn: () => Promise<any>) => {
    setBulkBusy(true);
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'That action could not be completed.'); }
    finally { setBulkBusy(false); }
  };

  const ids = [...selected];
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () =>
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Page>
      <PageHeader
        title="Reviews"
        icon={Star}
        description="Moderate what shoppers say, reply publicly, and curate what shows on your product pages."
        actions={
          <>
            <Btn variant="outline" onClick={load} title="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Btn>
            {canManage && (
              <>
                <Btn variant="outline" onClick={() => reviewsAPI.exportCsv({
                  status: TABS.find((t) => t.key === tab)!.status || undefined,
                  search: debounced || undefined,
                })}>
                  <Download className="h-4 w-4" /> Export
                </Btn>
                <Btn variant="outline" onClick={() => setShowImport(true)}>
                  <Upload className="h-4 w-4" /> Import
                </Btn>
                <Btn onClick={() => setShowEditor(true)}>
                  <Plus className="h-4 w-4" /> Add review
                </Btn>
              </>
            )}
          </>
        }
      />

      {/* Health at a glance */}
      <StatGrid>
        <StatCard
          label="Average rating"
          value={counts ? Number(counts.avg_rating || 0).toFixed(1) : '—'}
          sub={<StarRating value={Math.round(Number(counts?.avg_rating || 0))} size={12} />}
          icon={Star}
        />
        <StatCard
          label="Awaiting moderation"
          value={counts?.pending ?? '—'}
          sub={counts?.pending ? 'Shoppers cannot see these yet' : 'Queue is clear'}
          tone={counts?.pending ? 'warn' : 'default'}
          icon={MessageSquare}
        />
        <StatCard
          label="Published"
          value={counts?.approved ?? '—'}
          sub={`${counts?.total ?? 0} total collected`}
          icon={Check}
        />
        <StatCard
          label="Reported"
          value={counts?.reported ?? '—'}
          sub={counts?.reported ? 'Flagged by shoppers' : 'Nothing flagged'}
          tone={counts?.reported ? 'bad' : 'default'}
          icon={Flag}
        />
      </StatGrid>

      <TabBar
        active={tab}
        onChange={(k) => { setTab(k as TabKey); setPage(1); }}
        tabs={TABS.map((t) => {
          const n = !counts ? null
            : t.key === 'pending' ? counts.pending
            : t.key === 'approved' ? counts.approved
            : t.key === 'reported' ? counts.reported
            : t.key === 'rejected' ? counts.rejected + counts.spam
            : counts.total;
          return {
            key: t.key,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {n != null && n > 0 && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    t.key === 'pending' ? 'bg-amber-100 text-amber-700'
                      : t.key === 'reported' ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600',
                  )}>{n}</span>
                )}
              </span>
            ),
          };
        })}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews, reviewers, product names…"
            className="h-9 w-full rounded-lg border border-gray-300 pl-9 pr-8 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <SelectInput value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} className="h-9 w-auto">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
          <option value="1,2">Critical (1–2)</option>
        </SelectInput>

        <SelectInput value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 w-auto">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </SelectInput>

        {[
          { on: mediaOnly, set: setMediaOnly, icon: ImageIcon, label: 'With media' },
          { on: verifiedOnly, set: setVerifiedOnly, icon: ShieldCheck, label: 'Verified' },
        ].map((f) => (
          <button
            key={f.label}
            onClick={() => { f.set(!f.on); setPage(1); }}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition',
              f.on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            <f.icon className="h-3.5 w-3.5" /> {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Bulk action bar — appears only when something is selected */}
      {selected.size > 0 && canManage && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-gray-900/10 bg-gray-900 px-3 py-2 text-white shadow-lg">
          <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-white/20" />
          {([
            { s: 'approved', label: 'Approve', icon: Check },
            { s: 'rejected', label: 'Reject', icon: Ban },
            { s: 'spam', label: 'Spam', icon: Flag },
            { s: 'hidden', label: 'Hide', icon: EyeOff },
          ] as Array<{ s: ReviewStatus; label: string; icon: any }>).map((a) => (
            <button
              key={a.s}
              disabled={bulkBusy}
              onClick={() => bulk(() => reviewsAPI.moderate(ids, a.s))}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          ))}
          <button
            disabled={bulkBusy}
            onClick={() => bulk(() => reviewsAPI.feature(ids, true))}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
          >
            <Star className="h-3.5 w-3.5" /> Pin
          </button>
          {canDelete && (
            <button
              disabled={bulkBusy}
              onClick={() => {
                if (confirm(`Delete ${ids.length} review(s) permanently? This cannot be undone.`)) {
                  bulk(() => reviewsAPI.bulkDelete(ids));
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <span className="flex-1" />
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}
          <button onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1 text-sm hover:bg-white/15">
            Clear
          </button>
        </div>
      )}

      {/* List */}
      {loading && !rows.length ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon={Star}
          title={debounced ? 'No reviews match your search' : tab === 'pending' ? 'Nothing waiting for you' : 'No reviews yet'}
          description={
            debounced ? 'Try a different word, or clear the filters.'
              : tab === 'pending' ? 'Every review has been moderated. New ones will land here.'
              : 'Reviews shoppers leave on your product pages appear here. You can also add or import existing ones.'
          }
          action={canManage && !debounced ? (
            <div className="flex gap-2">
              <Btn onClick={() => setShowEditor(true)}><Plus className="h-4 w-4" /> Add review</Btn>
              <Btn variant="outline" onClick={() => setShowImport(true)}><Upload className="h-4 w-4" /> Import CSV</Btn>
            </div>
          ) : undefined}
        />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              {canManage && (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all on this page"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </Th>
              )}
              <Th>Product</Th>
              <Th className="w-28">Rating</Th>
              <Th>Review</Th>
              <Th className="w-36">Media</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-28">Date</Th>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr
                  key={r.id}
                  onClick={() => setActive(r)}
                  className={cn('cursor-pointer', selected.has(r.id) && 'bg-indigo-50/60')}
                >
                  {canManage && (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select review by ${r.customer_name}`}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </Td>
                  )}

                  <Td>
                    <div className="flex items-center gap-2">
                      {r.product_image ? (
                        <img src={r.product_image} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded bg-gray-100" />
                      )}
                      <span className="min-w-0">
                        <span className="block max-w-[13rem] truncate font-medium text-gray-900">
                          {r.variation_name || r.product_name}
                        </span>
                        <span className="block truncate text-xs text-gray-400">{r.product_sku}</span>
                      </span>
                    </div>
                  </Td>

                  <Td>
                    <StarRating value={r.rating} size={13} />
                    {r.is_verified && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-700">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    )}
                  </Td>

                  <Td>
                    <span className="block max-w-md">
                      {r.title && <span className="block truncate font-medium text-gray-900">{r.title}</span>}
                      <span className="block truncate text-gray-600">{r.review}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span>{r.customer_name}</span>
                        {r.helpful_count > 0 && <span>· {r.helpful_count} found helpful</span>}
                        {r.reply_body && (
                          <span className="inline-flex items-center gap-0.5 text-indigo-600">
                            <MessageSquare className="h-3 w-3" /> replied
                          </span>
                        )}
                        {r.reported_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-red-600">
                            <Flag className="h-3 w-3" /> {r.reported_count}
                          </span>
                        )}
                        {(r.auto_flags?.length ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> check
                          </span>
                        )}
                      </span>
                    </span>
                  </Td>

                  <Td onClick={(e) => e.stopPropagation()}>
                    <MediaStrip
                      media={r.media}
                      onOpen={(i) => setLightbox({ media: r.media, index: i })}
                    />
                  </Td>

                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusChip status={r.status} />
                      {r.is_featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                    </div>
                    {canManage && r.status === 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); bulk(() => reviewsAPI.moderate([r.id], 'approved')); }}
                        className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                    )}
                  </Td>

                  <Td muted>
                    {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(n) => { setPageSize(n); setPage(1); }}
      />

      <ReviewDetailDrawer
        review={active}
        onClose={() => setActive(null)}
        onChanged={load}
        canManage={canManage}
        canDelete={canDelete}
      />
      <ReviewEditorModal open={showEditor} onClose={() => setShowEditor(false)} onSaved={load} />
      <ReviewImportModal open={showImport} onClose={() => setShowImport(false)} onImported={load} />
      {lightbox && (
        <MediaLightbox
          media={lightbox.media}
          index={lightbox.index}
          onIndex={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox(null)}
        />
      )}
    </Page>
  );
};

export default Reviews;
