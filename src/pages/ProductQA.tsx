import React from 'react';
import {
  MessageCircleQuestion, Search, Check, Ban, Trash2, RefreshCw, X, Loader2,
  AlertTriangle, ShieldCheck, ThumbsUp, Inbox, Clock, MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  productQuestionsAPI, type AdminQuestion, type QuestionCounts, type QuestionStatus,
} from '@/services/api';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, StatusChip, TabBar,
  TableShell, THead, Th, TBody, Tr, Td, EmptyState, Pagination,
} from '@/components/erp';
import { ProductPicker, type PickedProduct } from '@/components/reviews/ProductPicker';
import { QuestionDetailDrawer } from '@/components/qa/QuestionDetailDrawer';
import { cn } from '@/lib/utils';

/**
 * PRODUCT Q&A WORKSPACE
 *
 * The job here is different from Reviews. A review is already written and only
 * needs a verdict; a question is a customer WAITING for the store to say
 * something, and it stays invisible on the storefront until it is answered.
 * So the queue is ordered by that debt — "Unanswered" is the landing tab, and
 * the row action is a composer, not an approve button.
 *
 * Backend: routes/productQuestions.ts. `status` is canonical (`is_published` is
 * a trigger-maintained mirror); answering publishes by default.
 *
 * Permissions: reading needs content.read, answering/moderating content.manage,
 * deleting content.delete — a separate permission because deletes here are
 * permanent (COMMON_MISTAKES #49).
 */

const TABS = [
  { key: 'unanswered', label: 'Unanswered', status: undefined as QuestionStatus | undefined, unanswered: true },
  { key: 'pending',    label: 'Pending',    status: 'pending' as QuestionStatus,   unanswered: false },
  { key: 'published',  label: 'Published',  status: 'published' as QuestionStatus, unanswered: false },
  { key: 'rejected',   label: 'Rejected',   status: 'rejected' as QuestionStatus,  unanswered: false },
  { key: 'all',        label: 'All',        status: undefined as QuestionStatus | undefined, unanswered: false },
] as const;

type TabKey = typeof TABS[number]['key'];

const relative = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
};

const ProductQA: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('content.manage');
  const canDelete = hasPerm('content.delete');

  const [tab, setTab] = React.useState<TabKey>('unanswered');
  const [rows, setRows] = React.useState<AdminQuestion[]>([]);
  const [total, setTotal] = React.useState(0);
  const [counts, setCounts] = React.useState<QuestionCounts | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [product, setProduct] = React.useState<PickedProduct | null>(null);
  // The API has no free-text search on the inbox, so this filters the loaded
  // page client-side. Labelled honestly ("filter this page") rather than
  // pretending to search the whole queue.
  const [filter, setFilter] = React.useState('');

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [active, setActive] = React.useState<AdminQuestion | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    const def = TABS.find((t) => t.key === tab)!;
    try {
      const [list, c] = await Promise.all([
        productQuestionsAPI.list({
          status: def.status,
          unanswered: def.unanswered || undefined,
          product_id: product?.product_id,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        productQuestionsAPI.counts().catch(() => null),
      ]);
      setRows(list.rows);
      setTotal(list.total);
      if (c) setCounts(c);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load questions.');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, product?.product_id, page, pageSize]);

  React.useEffect(() => { load(); }, [load]);

  // Keep the drawer on fresh data after an action refreshes the list.
  React.useEffect(() => {
    if (active) setActive(rows.find((r) => r.id === active.id) ?? null);
  }, [rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bulk = async (fn: () => Promise<any>) => {
    setBulkBusy(true);
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'That action could not be completed.'); }
    finally { setBulkBusy(false); }
  };

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.question.toLowerCase().includes(q)
      || (r.answer ?? '').toLowerCase().includes(q)
      || r.asker_name.toLowerCase().includes(q)
      || (r.product_name ?? '').toLowerCase().includes(q)
      || (r.variation_name ?? '').toLowerCase().includes(q)
      || (r.variation_sku ?? '').toLowerCase().includes(q));
  }, [rows, filter]);

  const ids = [...selected];
  const allOnPageSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(visible.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const oldestUnanswered = React.useMemo(() => {
    const pendingRows = rows.filter((r) => !r.answer && r.status !== 'rejected');
    if (!pendingRows.length) return null;
    return pendingRows.reduce((a, b) => (new Date(a.created_at) < new Date(b.created_at) ? a : b));
  }, [rows]);

  return (
    <Page>
      <PageHeader
        title="Questions & Answers"
        icon={MessageCircleQuestion}
        description="Answer what shoppers ask about your products. An answer is published on the product page, so it works for every future shopper with the same question."
        actions={
          <Btn variant="outline" onClick={load} title="Refresh">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Btn>
        }
      />

      <StatGrid>
        <StatCard
          label="Waiting for an answer"
          value={counts?.unanswered ?? '—'}
          sub={counts?.unanswered
            ? (oldestUnanswered ? `Oldest asked ${relative(oldestUnanswered.created_at)}` : 'Shoppers are waiting')
            : 'Nothing outstanding'}
          tone={counts?.unanswered ? 'warn' : 'default'}
          icon={Inbox}
        />
        <StatCard
          label="Live on product pages"
          value={counts?.published ?? '—'}
          sub={`${counts?.total ?? 0} asked in total`}
          icon={Check}
        />
        <StatCard
          label="Pending"
          value={counts?.pending ?? '—'}
          sub="Not visible to shoppers yet"
          icon={Clock}
        />
        <StatCard
          label="Rejected"
          value={counts?.rejected ?? '—'}
          sub={counts?.rejected ? 'Spam or not answered publicly' : 'Nothing rejected'}
          icon={Ban}
        />
      </StatGrid>

      <TabBar
        active={tab}
        onChange={(k) => { setTab(k as TabKey); setPage(1); }}
        tabs={TABS.map((t) => {
          const n = !counts ? null
            : t.key === 'unanswered' ? counts.unanswered
            : t.key === 'pending' ? counts.pending
            : t.key === 'published' ? counts.published
            : t.key === 'rejected' ? counts.rejected
            : counts.total;
          return {
            key: t.key,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {n != null && n > 0 && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    t.key === 'unanswered' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600',
                  )}>{n}</span>
                )}
              </span>
            ),
          };
        })}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter this page — question, answer, asker, SKU…"
            className="h-9 w-full rounded-lg border border-gray-300 pl-9 pr-8 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="min-w-[18rem] flex-1">
          <ProductPicker
            value={product}
            onChange={(p) => { setProduct(p); setPage(1); }}
            label=""
            placeholder="All products — pick one to narrow the queue"
          />
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && canManage && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-gray-900/10 bg-gray-900 px-3 py-2 text-white shadow-lg">
          <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-white/20" />
          {([
            { a: 'publish', label: 'Publish', icon: Check },
            { a: 'pending', label: 'Move to pending', icon: Clock },
            { a: 'reject',  label: 'Reject',  icon: Ban },
          ] as const).map((x) => (
            <button
              key={x.a}
              disabled={bulkBusy}
              onClick={() => bulk(() => productQuestionsAPI.bulk(ids, x.a))}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              <x.icon className="h-3.5 w-3.5" /> {x.label}
            </button>
          ))}
          {canDelete && (
            <button
              disabled={bulkBusy}
              onClick={() => {
                if (confirm(`Delete ${ids.length} question(s) permanently? This cannot be undone.`)) {
                  bulk(() => productQuestionsAPI.bulk(ids, 'delete'));
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

      {/* Queue */}
      {loading && !rows.length ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title={
            filter ? 'Nothing on this page matches'
              : tab === 'unanswered' ? 'No one is waiting'
              : 'No questions here yet'
          }
          description={
            filter ? 'Try a different word, or clear the filter.'
              : tab === 'unanswered' ? 'Every question has been answered. New ones land here first.'
              : 'Questions shoppers ask on your product pages arrive here. They stay hidden until you answer and publish them.'
          }
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
              <Th>Question</Th>
              <Th>Answer</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-24">Asked</Th>
            </THead>
            <TBody>
              {visible.map((r) => (
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
                        aria-label={`Select question from ${r.asker_name}`}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </Td>
                  )}

                  <Td>
                    <span className="block max-w-[13rem] truncate font-medium text-gray-900">
                      {r.variation_name || r.product_name}
                    </span>
                    {r.variation_sku && (
                      <span className="block truncate font-mono text-xs text-gray-400">{r.variation_sku}</span>
                    )}
                  </Td>

                  <Td>
                    <span className="block max-w-sm">
                      <span className="block truncate text-gray-800">{r.question}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span>{r.asker_name}</span>
                        {r.verified_buyer && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> bought this
                          </span>
                        )}
                        {r.helpful_count > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <ThumbsUp className="h-3 w-3" /> {r.helpful_count}
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

                  <Td>
                    {r.answer ? (
                      <span className="block max-w-sm">
                        <span className="block truncate text-gray-600">{r.answer}</span>
                        <span className="text-[11px] text-gray-400">by {r.answered_by || 'Store'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        <MessageSquare className="h-3 w-3" /> Needs an answer
                      </span>
                    )}
                  </Td>

                  <Td><StatusChip status={r.status} /></Td>

                  <Td muted>{relative(r.created_at)}</Td>
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

      <QuestionDetailDrawer
        question={active}
        onClose={() => setActive(null)}
        onChanged={load}
        canManage={canManage}
        canDelete={canDelete}
      />
    </Page>
  );
};

export default ProductQA;
