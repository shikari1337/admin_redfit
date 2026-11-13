import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clapperboard, ExternalLink, Instagram, RefreshCw, Tag, X } from 'lucide-react';
import { Btn, Page, PageHeader, SectionCard, StatusChip, TabBar } from '@/components/erp';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { ErrorNote, Loading, Notice, ReasonDialog, whyDisabled } from '@/pages/panels/erp/shared';
import { useTabParam } from '@/components/messaging/common';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/date';
import { approveFeedItem, codeLabel, getFeedQueue, refuseFeedItem, type FeedItem } from '@/lib/v2/appSettings';

/**
 * APP FEED QUEUE (HMAPP design 60, AD07; HMAPP-3 point 10): a person approves every item before it
 * shows in the app's feed (plan 5.12: AI may propose, a person approves). The website's own video
 * feed and Instagram block are not touched.
 *
 * Two sources: the store's reels (HMAPP-T4b; a change of video, poster, title or product sends one
 * back here) and, from HMAPP-3 lane BC, the store's Instagram posts and reels from the cached feed
 * (refreshed every 30 minutes by the backend), with the picture (a video's poster), the video and the
 * product tags, each named and pictured by the server from the catalogue (`FeedReviewTagView` `name`,
 * `image`). Tags are edited on the Instagram page (Marketing, Meta), the one editor for them.
 *
 * Server: `GET /api/v2/commerce/app/feed/review?state&kind&cursor&limit` (`content.read`; `kind`
 * `instagram` for the Instagram queue, nothing for reels), `POST .../reels/{id}/approve`,
 * `.../instagram/{media_id}/approve`, `.../refuse` {reason 1 to 300} (`content.manage`, a person).
 * Approving an Instagram item copies its picture and video into the store's own storage first
 * (Marketing, tenant 461); nothing is approved when a file cannot be copied.
 *
 * The two sources are the queue's own words (`reel`, `instagram`); the server serves no list of them.
 */
const TABS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'refused', label: 'Refused' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const isInstagram = (i: FeedItem) => i.kind.startsWith('instagram');

const SOURCES = [
  { key: 'reel', label: 'Store reels' },
  { key: 'instagram', label: 'Instagram' },
] as const;
type SourceKey = (typeof SOURCES)[number]['key'];

/** A source as people read it; the kinds themselves come from the queue. */
function sourceLabel(kind: string): string {
  if (kind === 'reel') return 'Store reels';
  if (kind.startsWith('instagram')) return kind === 'instagram' ? 'Instagram' : `Instagram ${codeLabel(kind.replace(/^instagram[_-]?/, '')).toLowerCase()}`;
  return codeLabel(kind);
}

function itemTitle(i: FeedItem): string {
  if (i.title) return i.title;
  if (i.caption) return i.caption.length > 80 ? `${i.caption.slice(0, 80).trimEnd()} (more below)` : i.caption;
  return isInstagram(i) ? 'Instagram post without a caption' : 'Untitled reel';
}

/** The picture or video of an item, as large as the queue shows it. */
const ItemMedia: React.FC<{ item: FeedItem }> = ({ item }) => {
  const video = item.video_url || (item.media_type === 'VIDEO' ? item.media_url : null);
  // An Instagram video's picture is its poster (lane BC: `image_url`, the store's copy once approved).
  const still = item.thumbnail_url || (item.media_url && item.media_url !== video ? item.media_url : null);
  const label = `Media of ${itemTitle(item)}`;
  return (
    <div className="shrink-0 space-y-2">
      {video ? (
        <video src={video} poster={still ?? undefined} controls preload="none" className="h-64 w-36 rounded-lg bg-black object-cover" aria-label={label} />
      ) : still ? (
        <img src={still} alt={label} className="h-64 w-48 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="flex h-64 w-36 items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-xs text-gray-500">No picture was given</div>
      )}
      {item.children.length > 1 && (
        <div className="flex max-w-[12rem] flex-wrap gap-1" aria-label={`${item.children.length} pictures in this post`}>
          {item.children.map((c, n) => {
            const src = c.thumbnail_url || c.url;
            return src ? (
              <a key={n} href={c.url ?? src} target="_blank" rel="noreferrer" title={`Picture ${n + 1} of ${item.children.length}`}>
                <img src={src} alt={`Picture ${n + 1} of ${item.children.length}`} className="h-11 w-11 rounded object-cover" loading="lazy" />
              </a>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
};

const TagList: React.FC<{ item: FeedItem; canEditTags: boolean }> = ({ item, canEditTags }) => (
  <div className="space-y-1.5">
    <p className="flex items-center gap-1.5 font-medium text-gray-900"><Tag className="h-4 w-4" aria-hidden />Products tagged ({item.tags.length})</p>
    {item.tags.length === 0 ? (
      <p className="text-amber-700">No product is tagged, so the app cannot link this post to the shop.</p>
    ) : (
      <ul className="space-y-1">
        {item.tags.map((t, n) => (
          <li key={`${t.product_id ?? ''}-${t.variation_id ?? ''}-${n}`} className="flex items-center gap-2">
            {t.image ? <img src={t.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="h-8 w-8 shrink-0 rounded bg-gray-100" aria-hidden />}
            {t.product_id ? (
              <Link to={`/products/${t.product_id}/edit`} className="min-w-0 truncate text-blue-700 underline">{t.name || 'Open the product'}</Link>
            ) : <span className="min-w-0 truncate">{t.name || 'A product the server did not name'}</span>}
          </li>
        ))}
      </ul>
    )}
    {canEditTags && (
      <Link to="/panel/marketing/meta/instagram" className="inline-block text-xs text-blue-700 underline">Change the tags on the Instagram page</Link>
    )}
  </div>
);

const AppFeedReview: React.FC = () => {
  const { hasPerm } = useAuth();
  const canDecide = hasPerm('content.manage');
  const canEditTags = hasPerm('marketing.read');
  const [tab, setTab] = useTabParam<TabKey>(TABS.map((t) => t.key), 'pending');
  const [rows, setRows] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [refusing, setRefusing] = useState<FeedItem | null>(null);
  const [source, setSource] = useState<SourceKey>('reel');

  const load = useCallback(async (more: string | null) => {
    setLoading(true); setError(null);
    if (!more) setRows([]);
    try {
      const page = await getFeedQueue({ state: tab, kind: source, cursor: more });
      setRows((cur) => (more ? [...cur, ...page.items] : page.items));
      setCursor(page.next_cursor);
      if (page.pending !== null) setPending(page.pending);
    } catch (e) {
      setError(e);
      if (!more) setRows([]);
    } finally { setLoading(false); }
  }, [tab, source]);

  useEffect(() => { void load(null); }, [load]);
  useEffect(() => { setPending(null); }, [source]);
  const shown = rows;

  const key = (r: FeedItem) => `${r.kind}:${r.id}`;
  const decided = (r: FeedItem) => {
    // A decided item leaves this tab's list.
    setRows((cur) => cur.filter((x) => key(x) !== key(r)));
    setPending((n) => (n !== null && tab === 'pending' ? Math.max(0, n - 1) : n));
  };
  const approve = async (r: FeedItem) => {
    setBusy(key(r)); setActError(null);
    try { await approveFeedItem(r); decided(r); } catch (e) { setActError(e); } finally { setBusy(null); }
  };
  const refuse = async (reason: string) => {
    if (!refusing) return;
    setBusy(key(refusing)); setActError(null);
    try { await refuseFeedItem(refusing, reason); decided(refusing); setRefusing(null); } catch (e) { setActError(e); } finally { setBusy(null); }
  };

  const off = whyDisabled(canDecide, [], 'Manage content');
  const tabs = TABS.map((t) => (t.key === 'pending' && pending !== null ? { ...t, label: `${t.label} (${pending})` } : t));
  const noun = (r: FeedItem) => (isInstagram(r) ? 'post' : 'reel');

  return (
    <Page>
      <PageHeader
        icon={Clapperboard}
        title="App feed"
        description="Every reel and Instagram post waits here for a person before the app shows it. The website's video feed and Instagram block are not affected."
        actions={<Btn variant="outline" size="sm" onClick={() => void load(null)}><RefreshCw className="h-4 w-4" />Refresh</Btn>}
      />
      <Notice tone="info">
        Before approving, check the words and the caption: no disease or cure claims, prices as the shop shows them, the product tagged is the one shown.
      </Notice>
      <TabBar tabs={tabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
      <Segmented label="Show items from" value={source} onChange={(k) => setSource(k as SourceKey)} options={SOURCES} />
      {actError && !refusing ? <ErrorNote error={actError} /> : null}
      {error ? <ErrorNote error={error} what="The app feed queue" onRetry={() => void load(null)} /> : (
        <div className="space-y-4">
          {!loading && shown.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
              {tab === 'pending' ? 'Nothing is waiting.' : `Nothing ${tab}.`}
            </p>
          )}
          {shown.map((r) => (
            <SectionCard key={key(r)}
              title={(
                <span className="flex flex-wrap items-center gap-2">
                  {isInstagram(r) ? <Instagram className="h-4 w-4 text-gray-500" aria-hidden /> : null}
                  <span className="min-w-0 break-words">{itemTitle(r)}</span>
                  <StatusChip status={r.state} label={codeLabel(r.state)} />
                </span>
              )}
              description={`${sourceLabel(r.kind)}${r.media_type ? `, ${codeLabel(r.media_type).toLowerCase()}` : ''}, ${isInstagram(r) ? 'posted' : 'added'} ${formatDateTime(r.created_at, 'at an unknown time')}`}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <ItemMedia item={r} />
                <div className="min-w-0 flex-1 space-y-3 text-sm">
                  {r.caption && (
                    <div>
                      <p className="font-medium text-gray-900">Caption</p>
                      <p className="whitespace-pre-line break-words text-gray-700">{r.caption}</p>
                    </div>
                  )}
                  {isInstagram(r) ? (
                    <>
                      <TagList item={r} canEditTags={canEditTags} />
                      {r.copied !== null && (
                        <p className="text-gray-600">
                          {r.copied ? 'Its files are in the store\'s own storage, so the app\'s links never break.' : 'Its files are copied into the store\'s own storage when a person approves it.'}
                        </p>
                      )}
                      {r.permalink && (
                        <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />Open on Instagram
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      <p>Tagged product: {r.product_id ? <Link to={`/products/${r.product_id}/edit`} className="text-blue-700 underline">open the product</Link> : 'none'}</p>
                      <p>On the website's video feed: {r.is_active ? 'yes' : 'no'}</p>
                    </>
                  )}
                  {r.approved_at && <p className="text-gray-600">Approved {formatDateTime(r.approved_at, '')}</p>}
                  {r.refused_at && <p className="text-gray-600">Refused {formatDateTime(r.refused_at, '')}: {r.refused_reason}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.state !== 'approved' && (
                      <Btn variant="success" disabled={!!off || busy === key(r)} title={off ?? undefined} onClick={() => void approve(r)}>
                        <Check className="h-4 w-4" />Approve
                      </Btn>
                    )}
                    {r.state !== 'refused' && (
                      <Btn variant="dangerOutline" disabled={!!off || busy === key(r)} title={off ?? undefined} onClick={() => { setActError(null); setRefusing(r); }}>
                        <X className="h-4 w-4" />{r.state === 'approved' ? 'Withdraw' : 'Refuse'}
                      </Btn>
                    )}
                  </div>
                  {off && <p className="text-xs text-gray-500">{off}</p>}
                </div>
              </div>
            </SectionCard>
          ))}
          {loading && <Loading label="Reading the queue" />}
          {cursor && !loading && <Btn variant="outline" onClick={() => void load(cursor)}>Load more</Btn>}
        </div>
      )}

      <ReasonDialog
        open={!!refusing}
        title={refusing?.state === 'approved' ? `Take this ${refusing ? noun(refusing) : 'item'} out of the app` : `Refuse this ${refusing ? noun(refusing) : 'item'}`}
        confirmLabel={refusing?.state === 'approved' ? 'Withdraw' : 'Refuse'}
        min={1}
        max={300}
        danger
        busy={!!busy}
        error={actError}
        onClose={() => setRefusing(null)}
        onConfirm={(reason) => void refuse(reason)}
      >
        <p>{refusing && isInstagram(refusing)
          ? 'The post leaves the app\'s feed. Instagram and the website are not changed.'
          : 'The reel leaves the app\'s feed. The website\'s video feed is not changed.'}</p>
      </ReasonDialog>
    </Page>
  );
};

export default AppFeedReview;
