import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Eye, EyeOff, Pin, PinOff, MessageSquare, ExternalLink,
  AlertTriangle, Loader2, Plug, Send, Trash2, X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, StatusChip, SectionCard,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState,
  FilterBar, Field, SelectInput, SearchInput, Pagination,
} from '@/components/erp';
import { StarRating } from '@/components/reviews/StarRating';
import { cn } from '@/lib/utils';

/**
 * GOOGLE REVIEWS WORKSPACE
 *
 * The store's own Google Business Profile reviews — synced over the OAuth
 * identity from Platform Connections, published to the storefront, and
 * answerable in place.
 *
 * What this page is NOT: a second product-reviews moderation queue. A Google
 * review is already public on Google whatever this page does, so "hide" here
 * means "stop showing it on OUR storefront", never "suppress it" — the copy
 * says so, because staff who think they are deleting a 1-star review from
 * Google will be very surprised later.
 *
 * A REPLY, by contrast, is genuinely public: it posts to Google under the
 * business's name and everyone searching the business sees it. That one is
 * confirmed before it sends.
 *
 * Permissions mirror the backend exactly: content.read to look, content.manage
 * to sync, curate and reply.
 */

interface GoogleReviewRow {
  id: string;
  review_id: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
  reviewer_is_anonymous: boolean;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
  reply_comment: string | null;
  reply_update_time: string | null;
  is_published: boolean;
  is_featured: boolean;
  synced_at: string | null;
}

interface Summary {
  connected: boolean;
  location?: {
    name: string; title: string | null; address: string | null;
    placeId: string | null; mapUri: string | null; newReviewUri: string | null;
    lastSyncedAt: string | null; lastError: string | null;
  };
  rating?: number | null;
  reviewCount?: number;
  local?: {
    shownCount: number; shownAverage: number; withCommentCount: number;
    publishedCount: number; unrepliedCount: number;
    distribution: Record<string, number>;
  };
}

const PAGE_SIZE = 25;

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const GoogleReviews: React.FC = () => {
  const { hasPerm } = useAuth();
  const canRead = hasPerm?.('content.read') ?? true;
  const canManage = hasPerm?.('content.manage') ?? false;

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<GoogleReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [rating, setRating] = useState('');
  const [replied, setReplied] = useState('');
  const [published, setPublished] = useState('');
  const [search, setSearch] = useState('');

  // Reply composer — one open at a time, keyed by row id.
  const [replyFor, setReplyFor] = useState<GoogleReviewRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(payload<Summary>(await api.get('/connectors/google/business-profile/summary')));
    } catch (e: any) {
      // A store that has not connected Google is not an error state — the page
      // renders its own "connect first" call to action below.
      setSummary({ connected: false });
    }
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (rating) { params.set('minRating', rating); params.set('maxRating', rating); }
      if (replied) params.set('replied', replied);
      if (published === 'true') params.set('published', 'true');
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get(`/connectors/google/business-profile/reviews?${params}`);
      setRows(payload<GoogleReviewRow[]>(res) ?? []);
      // `total` rides the envelope alongside `data`; the axios interceptor
      // unwraps `{success,data}` but keeps siblings, so it lands on res.data
      // (same read as wishlistAdminAPI.demand and the Reviews workspace).
      setTotal(Number((res as any)?.data?.total ?? 0));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not load Google reviews');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, rating, replied, published, search]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadReviews(); }, [loadReviews]);
  // Any filter change goes back to page 1 — otherwise a narrower filter can
  // land on an offset past the end and render a confusing empty table.
  useEffect(() => { setPage(1); }, [rating, replied, published, search]);

  const sync = async () => {
    setSyncing(true); setError(null); setNotice(null);
    try {
      const r = payload<any>(await api.post('/connectors/google/business-profile/sync', {}));
      setNotice(
        `Synced ${r.fetched} review${r.fetched === 1 ? '' : 's'} — ` +
        `${r.inserted} new, ${r.updated} updated${r.removed ? `, ${r.removed} removed` : ''}` +
        (r.truncated ? '. Hit the page cap — run it again to continue.' : '.'));
      await Promise.all([loadSummary(), loadReviews()]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const patch = async (row: GoogleReviewRow, body: Record<string, any>) => {
    // Optimistic: these are single-boolean toggles and a failure re-loads.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...mapPatch(body) } : r)));
    try {
      await api.patch(`/connectors/google/business-profile/reviews/${row.id}`, body);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not update the review');
      void loadReviews();
    }
  };

  const sendReply = async () => {
    if (!replyFor || !replyText.trim()) return;
    setSendingReply(true); setError(null);
    try {
      const updated = payload<GoogleReviewRow>(
        await api.post(`/connectors/google/business-profile/reviews/${replyFor.id}/reply`,
          { comment: replyText.trim() }));
      setRows((prev) => prev.map((r) => (r.id === replyFor.id ? { ...r, ...updated } : r)));
      setNotice('Reply posted to Google. It is public on the business listing.');
      setReplyFor(null); setReplyText('');
      void loadSummary();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Google refused the reply');
    } finally {
      setSendingReply(false);
    }
  };

  const removeReply = async (row: GoogleReviewRow) => {
    if (!window.confirm('Delete this reply from Google? The public listing will no longer show it.')) return;
    try {
      const updated = payload<GoogleReviewRow>(
        await api.delete(`/connectors/google/business-profile/reviews/${row.id}/reply`));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not delete the reply');
    }
  };

  const loc = summary?.location;
  const localAgg = summary?.local;

  const distribution = useMemo(() => {
    const d = localAgg?.distribution ?? {};
    const max = Math.max(1, ...[5, 4, 3, 2, 1].map((n) => d[String(n)] ?? 0));
    return [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: d[String(n)] ?? 0, pct: ((d[String(n)] ?? 0) / max) * 100 }));
  }, [localAgg]);

  if (!canRead) {
    return (
      <Page>
        <EmptyState title="No access" description="You need the content.read permission to view Google reviews." />
      </Page>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (summary && !summary.connected) {
    return (
      <Page>
        <PageHeader title="Google Reviews" description="Your Google Business Profile reviews, on your storefront" />
        <SectionCard>
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Plug className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Connect Google Business Profile</h3>
              <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
                Sign in with Google once in Platform Connections, enable{' '}
                <strong>Business Profile</strong>, and choose your location. Your reviews then sync
                here — all of them, not the five the older Places API key could return — and you can
                reply to each one publicly on Google.
              </p>
            </div>
            <Link to="/panel/marketing/connections">
              <Btn variant="primary"><Plug className="mr-1.5 h-4 w-4" />Go to Platform Connections</Btn>
            </Link>
          </div>
        </SectionCard>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Google Reviews"
        description={loc?.title ? `${loc.title}${loc.address ? ` · ${loc.address}` : ''}` : 'Google Business Profile'}
        actions={
          <div className="flex items-center gap-2">
            {loc?.mapUri && (
              <a href={loc.mapUri} target="_blank" rel="noreferrer noopener">
                <Btn variant="outline"><ExternalLink className="mr-1.5 h-4 w-4" />View on Google</Btn>
              </a>
            )}
            {canManage && (
              <Btn variant="primary" onClick={sync} disabled={syncing}>
                {syncing
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Syncing…</>
                  : <><RefreshCw className="mr-1.5 h-4 w-4" />Sync from Google</>}
              </Btn>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-green-600 hover:text-green-800"><X className="h-4 w-4" /></button>
        </div>
      )}
      {loc?.lastError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Last sync reported a problem</p>
            <p className="mt-0.5">{loc.lastError}</p>
            <p className="mt-1 text-amber-700">
              The reviews below are from the last successful sync and are still being shown on the storefront.
            </p>
          </div>
        </div>
      )}

      <StatGrid className="mb-4">
        <StatCard
          label="Google rating"
          value={summary?.rating != null ? summary.rating.toFixed(1) : '—'}
          sub={`${summary?.reviewCount ?? 0} reviews on Google`}
          tone="info"
        />
        <StatCard
          label="Synced here"
          value={localAgg?.shownCount ?? 0}
          sub={`${localAgg?.withCommentCount ?? 0} with written text`}
        />
        <StatCard
          label="On the storefront"
          value={localAgg?.publishedCount ?? 0}
          sub="Published reviews"
          tone="good"
        />
        <StatCard
          label="Awaiting a reply"
          value={localAgg?.unrepliedCount ?? 0}
          sub="Unanswered on Google"
          tone={(localAgg?.unrepliedCount ?? 0) > 0 ? 'warn' : 'default'}
        />
      </StatGrid>

      {/*
        Google's total vs ours is a genuine, permanent difference worth naming
        rather than hiding: Google counts star-only ratings that carry no text,
        and this table only ever holds reviews the API returned.
      */}
      {summary?.reviewCount != null && localAgg && summary.reviewCount > localAgg.shownCount && (
        <p className="mb-4 text-xs text-gray-500">
          Google reports {summary.reviewCount} reviews but {localAgg.shownCount} are stored here.
          That gap is normal — Google's total includes star-only ratings left without any written
          review, which have nothing to display.
        </p>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard title="Rating spread">
          <div className="space-y-1.5 p-4">
            {distribution.map((d) => (
              <div key={d.stars} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 tabular-nums text-gray-600">{d.stars}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn('h-full rounded-full', d.stars >= 4 ? 'bg-green-500' : d.stars === 3 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums text-gray-500">{d.count}</span>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-gray-400">
              Last synced {fmtDateTime(loc?.lastSyncedAt)}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Storefront">
          <div className="space-y-2 p-4 text-sm text-gray-600">
            <p>
              Published reviews appear on your homepage testimonial section, the{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">/reviews</code> page and the
              rating badge.
            </p>
            <p className="text-xs text-gray-500">
              Hiding a review only removes it from <strong>your storefront</strong>. It stays public
              on Google — nothing here can change what Google shows.
            </p>
            {loc?.newReviewUri && (
              <a
                href={loc.newReviewUri} target="_blank" rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                Your "write a review" link <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </SectionCard>
      </div>

      <FilterBar>
        <Field label="Rating">
          <SelectInput value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
          </SelectInput>
        </Field>
        <Field label="Reply">
          <SelectInput value={replied} onChange={(e) => setReplied(e.target.value)}>
            <option value="">All</option>
            <option value="false">Awaiting a reply</option>
            <option value="true">Replied</option>
          </SelectInput>
        </Field>
        <Field label="Storefront">
          <SelectInput value={published} onChange={(e) => setPublished(e.target.value)}>
            <option value="">All</option>
            <option value="true">Published only</option>
          </SelectInput>
        </Field>
        <Field label="Search" className="min-w-[220px] flex-1">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reviewer name or review text…"
          />
        </Field>
      </FilterBar>

      <TableShell className="mt-4">
        <table className="w-full text-sm">
          {/* THead renders its OWN <tr> — pass <Th> straight in. Wrapping these
              in another <tr> nests one inside the other and React reports it as
              a hydration error. */}
          <THead>
            <Th>Reviewer</Th>
            <Th>Rating</Th>
            <Th>Review</Th>
            <Th>Date</Th>
            <Th>Storefront</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <TBody>
            {loading ? (
              <EmptyRow colSpan={6}>
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading…
                </span>
              </EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                {total === 0 && !rating && !replied && !published && !search
                  ? 'No reviews synced yet — click "Sync from Google".'
                  : 'No reviews match these filters.'}
              </EmptyRow>
            ) : rows.map((r) => (
              <React.Fragment key={r.id}>
                <Tr className={cn(!r.is_published && 'bg-gray-50/60')}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {r.reviewer_photo_url ? (
                        <img
                          src={r.reviewer_photo_url} alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                          {r.reviewer_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{r.reviewer_name}</p>
                        {r.is_featured && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Featured</span>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td><StarRating value={r.star_rating} size={13} /></Td>
                  <Td>
                    {r.comment
                      ? <p className="max-w-md text-gray-700 line-clamp-3">{r.comment}</p>
                      : <span className="text-xs italic text-gray-400">Rating only — no written review</span>}
                    {r.reply_comment && (
                      <div className="mt-2 rounded-md border-l-2 border-blue-300 bg-blue-50/60 px-2.5 py-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          Your public reply
                        </p>
                        <p className="mt-0.5 max-w-md text-xs text-gray-700 line-clamp-2">{r.reply_comment}</p>
                      </div>
                    )}
                  </Td>
                  <Td muted className="whitespace-nowrap">{fmtDate(r.create_time)}</Td>
                  <Td>
                    <StatusChip
                      status={r.is_published ? 'shown' : 'hidden'}
                      tone={r.is_published ? 'green' : 'neutral'}
                      label={r.is_published ? 'Shown' : 'Hidden'}
                    />
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <button
                            title={r.is_published ? 'Hide from your storefront' : 'Show on your storefront'}
                            onClick={() => patch(r, { isPublished: !r.is_published })}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          >
                            {r.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <button
                            title={r.is_featured ? 'Unpin' : 'Pin to the top'}
                            onClick={() => patch(r, { isFeatured: !r.is_featured })}
                            className={cn('rounded p-1.5 hover:bg-gray-100',
                              r.is_featured ? 'text-amber-600' : 'text-gray-500 hover:text-gray-800')}
                          >
                            {r.is_featured ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          </button>
                          <button
                            title={r.reply_comment ? 'Edit your Google reply' : 'Reply on Google'}
                            onClick={() => { setReplyFor(r); setReplyText(r.reply_comment ?? ''); }}
                            className={cn('rounded p-1.5 hover:bg-gray-100',
                              r.reply_comment ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800')}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          {r.reply_comment && (
                            <button
                              title="Delete your Google reply"
                              onClick={() => removeReply(r)}
                              className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              </React.Fragment>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination
        page={page} pageSize={PAGE_SIZE} total={total}
        onPage={setPage} className="mt-3"
      />

      {/* ── Reply composer ──────────────────────────────────────────────── */}
      {replyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {replyFor.reply_comment ? 'Edit your reply on Google' : 'Reply on Google'}
              </h3>
              <button onClick={() => setReplyFor(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <StarRating value={replyFor.star_rating} size={13} />
                  <span className="text-xs font-medium text-gray-700">{replyFor.reviewer_name}</span>
                </div>
                <p className="mt-1.5 text-sm text-gray-600">
                  {replyFor.comment || <em className="text-gray-400">Rating only — no written review</em>}
                </p>
              </div>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                maxLength={4096}
                autoFocus
                placeholder="Thanks for taking the time to review us…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-700">
                  This posts publicly on Google under your business name.
                </span>
                <span className="tabular-nums text-gray-400">{replyText.length}/4096</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Btn variant="outline" onClick={() => setReplyFor(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={sendReply} disabled={sendingReply || !replyText.trim()}>
                {sendingReply
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Posting…</>
                  : <><Send className="mr-1.5 h-4 w-4" />Post to Google</>}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

/** Translate the API's camelCase patch body back onto the snake_case row. */
function mapPatch(body: Record<string, any>): Partial<GoogleReviewRow> {
  const out: Partial<GoogleReviewRow> = {};
  if ('isPublished' in body) out.is_published = body.isPublished;
  if ('isFeatured' in body) out.is_featured = body.isFeatured;
  return out;
}

export default GoogleReviews;
