import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { connectionsHref } from './meta/routes';
import { Lead } from './meta/common';
import {
  RefreshCw, Eye, EyeOff, Pin, PinOff, MessageSquare, ExternalLink,
  AlertTriangle, Loader2, Plug, Search, Send, Trash2, X,
} from 'lucide-react';
import { api } from '../../../services/api';
import { payload } from '../../../lib/unwrap';
import { googleBusinessV2 } from '../../../lib/v2/areas/marketing';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, StatusChip, SectionCard,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState,
  FilterBar, Field, SelectInput, SearchInput, Pagination,
} from '@/components/erp';
import { StarRating } from '@/components/reviews/StarRating';
import { cn } from '@/lib/utils';
import { fmtNumber } from '@/lib/money';
import { localeDate, localeDateTime } from '../../../utils/date';

/**
 * GOOGLE REVIEWS WORKSPACE
 *
 * The store's own Google Business Profile reviews: synced over the Google
 * connection from Platform Connections, shown on the storefront, and answerable
 * in place.
 *
 * What this page is NOT: a second product-reviews moderation queue. A Google
 * review is already public on Google whatever this page does, so "hide" here
 * means "stop showing it on OUR storefront", never "suppress it". The copy says
 * so, because staff who think they are deleting a 1-star review from Google
 * will be very surprised later.
 *
 * A REPLY, by contrast, is genuinely public: it posts to Google under the
 * business's name and everyone searching the business sees it. That one is
 * confirmed before it sends, and so is removing it.
 *
 * On v2 (lane MENU-1 social) the calls go through the route table
 * (`lib/v2/areas/marketing.ts`): the list is the reviews app's Google resource,
 * the counts are `GET /reviews/google/curation`, and a store whose locations were
 * never fetched from Google can fetch them here ("Find my locations").
 *
 * Permissions mirror the backend exactly: content.read to look, content.manage
 * to sync, curate and reply.
 */

interface GoogleReviewRow {
  id: string;
  location_name?: string | null;
  /** Null when Google hides the reviewer. */
  reviewer_name: string | null;
  reviewer_photo_url?: string | null;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
  reply_comment: string | null;
  is_published: boolean;
  is_featured: boolean;
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
  locations?: unknown[];
  local?: {
    shownCount: number; shownAverage: number; withCommentCount: number;
    publishedCount: number; unrepliedCount: number; featuredCount?: number;
    distribution: Record<string, number>;
  };
}

/** Rows per page (a screen choice, not a store setting). */
const PAGE_SIZE = 25;
const STARS = [5, 4, 3, 2, 1];

const fmtDate = (s: string | null | undefined) =>
  s ? localeDate(s, { day: '2-digit', month: 'short', year: 'numeric' }, undefined) : 'Not given';

const fmtDateTime = (s: string | null | undefined) =>
  s ? localeDateTime(s, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }, undefined) : 'never';

const errText = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || fallback;

/** A reviewer Google hides has no name; the row still needs one. */
const nameOf = (r: GoogleReviewRow) => (r.reviewer_name && r.reviewer_name.trim()) || 'A Google user';

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

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
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters. The v2 list filters by equality only: "awaiting a reply", shown or hidden, and words.
  const [replied, setReplied] = useState('');
  const [published, setPublished] = useState('');
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');

  // Reply composer: one open at a time.
  const [replyFor, setReplyFor] = useState<GoogleReviewRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const locationName = summary?.location?.name ?? '';

  const loadSummary = useCallback(async () => {
    try {
      setSummary(payload<Summary>(await api.get('/connectors/google/business-profile/summary')));
    } catch {
      // A store that has not connected Google is not an error state: the page
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
      if (locationName) params.set('location_name', locationName);
      if (replied) params.set('replied', replied);
      if (published) params.set('published', published);
      if (search) params.set('search', search);

      const res = await api.get(`/connectors/google/business-profile/reviews?${params}`);
      setRows(payload<GoogleReviewRow[]>(res) ?? []);
      // `total` rides the envelope alongside `data`; the axios interceptor
      // unwraps `{success,data}` but keeps siblings, so it lands on res.data
      // (same read as wishlistAdminAPI.demand and the Reviews workspace).
      setTotal(Number((res as any)?.data?.total ?? 0));
    } catch (e: any) {
      setError(errText(e, 'Could not load Google reviews.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, replied, published, search, locationName]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  // The list waits for the summary, so it is read for the location the counts describe.
  useEffect(() => { if (summary?.connected) void loadReviews(); }, [summary?.connected, loadReviews]);
  // Any filter change goes back to page 1, otherwise a narrower filter can
  // land on an offset past the end and render a confusing empty table.
  useEffect(() => { setPage(1); }, [replied, published, search]);

  const sync = async () => {
    setSyncing(true); setError(null); setNotice(null);
    try {
      const r = payload<any>(await api.post('/connectors/google/business-profile/sync', {}));
      const fetched = Number(r?.fetched ?? r?.pulled ?? 0);
      setNotice(`Synced ${plural(fetched, 'review')} from Google.`);
      await loadSummary();
      await loadReviews();
    } catch (e: any) {
      setError(errText(e, 'The sync did not finish.'));
      void loadSummary();
    } finally {
      setSyncing(false);
    }
  };

  /** No location is mirrored yet: ask the Google connection which ones it reaches. */
  const findLocations = async () => {
    setFinding(true); setError(null); setNotice(null);
    try {
      const list = await googleBusinessV2.refreshLocations();
      if (!list.length) {
        setError('Google lists no Business Profile location for this connection. Check that the Google account you connected manages the business, then try again.');
      } else {
        setNotice(`Found ${plural(list.length, 'location')}. Press "Sync from Google" to bring the reviews in.`);
        await loadSummary();
      }
    } catch (e: any) {
      setError(errText(e, 'Google did not answer. Connect Google with Business Profile on Platform Connections first.'));
    } finally {
      setFinding(false);
    }
  };

  const patch = async (row: GoogleReviewRow, body: { isPublished?: boolean; isFeatured?: boolean }) => {
    // Optimistic: these are single-boolean toggles and a failure re-loads.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...mapPatch(body) } : r)));
    try {
      await api.patch(`/connectors/google/business-profile/reviews/${row.id}`, body);
      void loadSummary();
    } catch (e: any) {
      setError(errText(e, 'Could not update the review.'));
      void loadReviews();
    }
  };

  const sendReply = async () => {
    const text = replyText.trim();
    if (!replyFor || !text) return;
    setSendingReply(true); setError(null);
    try {
      await api.post(`/connectors/google/business-profile/reviews/${replyFor.id}/reply`, { comment: text });
      // v2 answers an acknowledgement, not the row: the reply Google accepted is the text sent.
      setRows((prev) => prev.map((r) => (r.id === replyFor.id ? { ...r, reply_comment: text } : r)));
      setNotice('Reply posted to Google. It is public on the business listing.');
      setReplyFor(null); setReplyText('');
      void loadSummary();
      if (replied === 'false') void loadReviews();
    } catch (e: any) {
      setError(errText(e, 'Google refused the reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  const removeReply = async (row: GoogleReviewRow) => {
    if (!window.confirm('Remove this reply from Google? The public listing will no longer show it.')) return;
    setError(null);
    try {
      await api.delete(`/connectors/google/business-profile/reviews/${row.id}/reply`);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reply_comment: null } : r)));
      setNotice('Reply removed from Google.');
      void loadSummary();
    } catch (e: any) {
      setError(errText(e, 'Could not remove the reply.'));
    }
  };

  const loc = summary?.location;
  const localAgg = summary?.local;
  const unreplied = localAgg?.unrepliedCount ?? 0;

  const distribution = useMemo(() => {
    const d = localAgg?.distribution ?? {};
    const max = Math.max(1, ...STARS.map((n) => Number(d[String(n)] ?? 0)));
    return STARS.map((n) => {
      const count = Number(d[String(n)] ?? 0);
      return { stars: n, count, pct: (count / max) * 100 };
    });
  }, [localAgg]);

  if (!canRead) {
    return (
      <Page>
        <EmptyState title="No access" description="You need the content.read permission to view Google reviews." />
      </Page>
    );
  }

  const banners = (
    <>
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" aria-label="Close" onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <button type="button" aria-label="Close" onClick={() => setNotice(null)} className="text-green-600 hover:text-green-800"><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );

  // Loading the summary
  if (!summary) {
    return (
      <Page>
        <PageHeader title="Google Reviews" description="Your Google Business Profile reviews, on your storefront" />
        <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading...</p>
      </Page>
    );
  }

  // No location mirrored yet (Google not connected, or its locations never fetched)
  if (!summary.connected) {
    return (
      <Page>
        <PageHeader title="Google Reviews" description="Your Google Business Profile reviews, on your storefront" />
        {banners}
        <SectionCard>
          <div className="flex flex-col items-center gap-4 px-4 py-10 text-center sm:px-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Plug className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Connect Google Business Profile</h3>
              <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
                Sign in with Google once in Platform Connections and turn on <strong>Business Profile</strong>.
                Then find your locations here. Every review syncs, not only the five the older Places key
                could return, and you can reply to each one publicly on Google.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {canManage && (
                <Btn variant="primary" onClick={findLocations} disabled={finding}>
                  {finding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                  Find my locations
                </Btn>
              )}
              <Link to={connectionsHref('google')}>
                <Btn variant="outline"><Plug className="mr-1.5 h-4 w-4" />Go to Platform Connections</Btn>
              </Link>
            </div>
            {!canManage && <p className="text-xs text-gray-500">Ask someone who can manage content to find the locations.</p>}
          </div>
        </SectionCard>
      </Page>
    );
  }

  const count = (n: number | undefined) => (localAgg ? fmtNumber(n ?? 0) : 'Not counted');

  return (
    <Page>
      <PageHeader
        title="Google Reviews"
        description={loc?.title ? `${loc.title}${loc.address ? `, ${loc.address}` : ''}` : 'Google Business Profile'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {loc?.mapUri && (
              <a href={loc.mapUri} target="_blank" rel="noreferrer noopener">
                <Btn variant="outline"><ExternalLink className="mr-1.5 h-4 w-4" />View on Google</Btn>
              </a>
            )}
            {canManage && (
              <Btn variant="primary" onClick={sync} disabled={syncing}>
                {syncing
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Syncing...</>
                  : <><RefreshCw className="mr-1.5 h-4 w-4" />Sync from Google</>}
              </Btn>
            )}
          </div>
        }
      />

      {banners}

      {/* What to act on first */}
      <div className="mb-4">
        {loc?.lastError ? (
          <Lead tone="bad" title="The last sync did not finish">
            <p className="break-words">{loc.lastError}</p>
            <p className="mt-1">The reviews below are from the last sync that worked, and they still show on your storefront.</p>
          </Lead>
        ) : !loc?.lastSyncedAt ? (
          <Lead tone="info" title="Bring your reviews in">
            {canManage ? 'Press "Sync from Google" to copy your Business Profile reviews here.' : 'Ask someone who can manage content to sync the reviews from Google.'}
          </Lead>
        ) : unreplied > 0 ? (
          <Lead tone="warn" title={`${plural(unreplied, 'review')} ${unreplied === 1 ? 'waits' : 'wait'} for your reply`}
            actions={replied !== 'false'
              ? <Btn variant="outline" className="bg-white" onClick={() => setReplied('false')}>Show them</Btn>
              : undefined}>
            People read how a business answers. A reply shows on Google under your business name; answer the low ratings first.
          </Lead>
        ) : localAgg ? (
          <Lead tone="good" title="Every review has a reply">New reviews arrive with the next sync. Last synced {fmtDateTime(loc?.lastSyncedAt)}.</Lead>
        ) : null}
      </div>

      <StatGrid className="mb-4">
        <StatCard
          label="Google rating"
          value={summary.rating != null ? summary.rating.toFixed(1) : 'None yet'}
          sub={`${plural(summary.reviewCount ?? 0, 'review')} on Google`}
          tone="info"
        />
        <StatCard
          label="Awaiting a reply"
          value={count(localAgg?.unrepliedCount)}
          sub="Unanswered on Google"
          tone={unreplied > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="On the storefront"
          value={count(localAgg?.publishedCount)}
          sub="Shown to shoppers"
          tone="good"
        />
        <StatCard
          label="Synced here"
          value={count(localAgg?.shownCount)}
          sub={localAgg ? `${fmtNumber(localAgg.withCommentCount)} with written text` : 'Counts not available'}
        />
      </StatGrid>

      {/*
        Google's total vs ours is a genuine, permanent difference worth naming
        rather than hiding: Google counts star-only ratings that carry no text,
        and this table only ever holds reviews the API returned.
      */}
      {summary.reviewCount != null && localAgg && summary.reviewCount > localAgg.shownCount && (
        <p className="mb-4 text-xs text-gray-500">
          Google reports {fmtNumber(summary.reviewCount)} reviews and {fmtNumber(localAgg.shownCount)} are stored here.
          That gap is normal: Google's total includes star-only ratings left without a written review,
          which Google does not hand out.
        </p>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard title="Rating spread">
          <div className="space-y-1.5 p-4">
            {distribution.map((d) => (
              <div key={d.stars} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-gray-600">{d.stars} {d.stars === 1 ? 'star' : 'stars'}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn('h-full rounded-full', d.stars >= 4 ? 'bg-green-500' : d.stars === 3 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-gray-500">{fmtNumber(d.count)}</span>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-gray-500">
              Last synced {fmtDateTime(loc?.lastSyncedAt)}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Storefront">
          <div className="space-y-2 p-4 text-sm text-gray-600">
            <p>
              Shown reviews appear on your home page review section, the{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">/reviews</code> page, product pages and the
              rating badge. Pinned reviews come first.
            </p>
            <p className="text-xs text-gray-500">
              Hiding a review only removes it from <strong>your storefront</strong>. It stays public
              on Google; nothing here can change what Google shows.
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
        <Field label="Reply">
          <SelectInput value={replied} onChange={(e) => setReplied(e.target.value)}>
            <option value="">All</option>
            <option value="false">Awaiting a reply</option>
          </SelectInput>
        </Field>
        <Field label="Storefront">
          <SelectInput value={published} onChange={(e) => setPublished(e.target.value)}>
            <option value="">All</option>
            <option value="true">Shown only</option>
            <option value="false">Hidden only</option>
          </SelectInput>
        </Field>
        <Field label="Search" className="min-w-[200px] flex-1">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(term.trim()); }}>
            <SearchInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onBlur={() => setSearch(term.trim())}
              placeholder="Reviewer name or review text"
            />
          </form>
        </Field>
      </FilterBar>

      <TableShell className="mt-4">
        <table className="w-full text-sm">
          {/* THead renders its OWN <tr>: pass <Th> straight in. Wrapping these
              in another <tr> nests one inside the other and React reports it as
              a hydration error. */}
          <THead>
            <Th>Reviewer</Th>
            <Th>Rating</Th>
            <Th>Review</Th>
            <Th className="hidden sm:table-cell">Date</Th>
            <Th>Storefront</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <TBody>
            {loading ? (
              <EmptyRow colSpan={6}>
                <span className="inline-flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading...
                </span>
              </EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                {total === 0 && !replied && !published && !search
                  ? (loc?.lastSyncedAt ? 'Google has no written reviews for this location yet.' : 'No reviews synced yet. Press "Sync from Google".')
                  : replied === 'false' && !published && !search
                    ? 'Every review has a reply.'
                    : 'No reviews match these filters.'}
              </EmptyRow>
            ) : rows.map((r) => (
              <Tr key={r.id} className={cn(!r.is_published && 'bg-gray-50/60')}>
                <Td>
                  <div className="flex items-center gap-2">
                    {r.reviewer_photo_url ? (
                      <img
                        src={r.reviewer_photo_url} alt=""
                        className="h-7 w-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                        {nameOf(r).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="max-w-[10rem] truncate font-medium text-gray-900">{nameOf(r)}</p>
                      {r.is_featured && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Pinned</span>
                      )}
                      <p className="text-[11px] text-gray-500 sm:hidden">{fmtDate(r.create_time)}</p>
                    </div>
                  </div>
                </Td>
                <Td><StarRating value={r.star_rating} size={13} /></Td>
                <Td>
                  {r.comment
                    ? <p className="max-w-md text-gray-700 line-clamp-3">{r.comment}</p>
                    : <span className="text-xs italic text-gray-500">Rating only, no written review</span>}
                  {r.reply_comment ? (
                    <div className="mt-2 rounded-md border-l-2 border-blue-300 bg-blue-50/60 px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                        Your public reply
                      </p>
                      <p className="mt-0.5 max-w-md text-xs text-gray-700 line-clamp-2">{r.reply_comment}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">Awaiting your reply</p>
                  )}
                </Td>
                <Td muted className="hidden whitespace-nowrap sm:table-cell">{fmtDate(r.create_time)}</Td>
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
                          type="button"
                          title={r.is_published ? 'Hide from your storefront' : 'Show on your storefront'}
                          aria-label={r.is_published ? 'Hide from your storefront' : 'Show on your storefront'}
                          onClick={() => patch(r, { isPublished: !r.is_published })}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        >
                          {r.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title={r.is_featured ? 'Unpin' : 'Pin to the top'}
                          aria-label={r.is_featured ? 'Unpin' : 'Pin to the top'}
                          onClick={() => patch(r, { isFeatured: !r.is_featured })}
                          className={cn('rounded p-1.5 hover:bg-gray-100',
                            r.is_featured ? 'text-amber-600' : 'text-gray-500 hover:text-gray-800')}
                        >
                          {r.is_featured ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title={r.reply_comment ? 'Edit your Google reply' : 'Reply on Google'}
                          aria-label={r.reply_comment ? 'Edit your Google reply' : 'Reply on Google'}
                          onClick={() => { setReplyFor(r); setReplyText(r.reply_comment ?? ''); }}
                          className={cn('rounded p-1.5 hover:bg-gray-100',
                            r.reply_comment ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800')}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        {r.reply_comment && (
                          <button
                            type="button"
                            title="Remove your Google reply"
                            aria-label="Remove your Google reply"
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
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination
        page={page} pageSize={PAGE_SIZE} total={total}
        onPage={setPage} className="mt-3"
      />

      {/* Reply composer */}
      {replyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Reply on Google">
          <div className="max-h-full w-full max-w-lg overflow-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {replyFor.reply_comment ? 'Edit your reply on Google' : 'Reply on Google'}
              </h3>
              <button type="button" aria-label="Close" onClick={() => setReplyFor(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <StarRating value={replyFor.star_rating} size={13} />
                  <span className="text-xs font-medium text-gray-700">{nameOf(replyFor)}</span>
                </div>
                <p className="mt-1.5 text-sm text-gray-600">
                  {replyFor.comment || <em className="text-gray-500">Rating only, no written review</em>}
                </p>
              </div>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                maxLength={4096}
                autoFocus
                aria-label="Your reply"
                placeholder="Thanks for taking the time to review us."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-amber-700">
                  This posts publicly on Google under your business name.
                </span>
                <span className="tabular-nums text-gray-500">{replyText.length}/4096</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Btn variant="outline" onClick={() => setReplyFor(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={sendReply} disabled={sendingReply || !replyText.trim()}>
                {sendingReply
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Posting...</>
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
function mapPatch(body: { isPublished?: boolean; isFeatured?: boolean }): Partial<GoogleReviewRow> {
  const out: Partial<GoogleReviewRow> = {};
  if (body.isPublished !== undefined) out.is_published = body.isPublished;
  if (body.isFeatured !== undefined) out.is_featured = body.isFeatured;
  return out;
}

export default GoogleReviews;
