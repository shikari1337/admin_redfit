import React from 'react';
import {
  X, Check, Ban, Flag, EyeOff, Trash2, Star, ShieldCheck, MessageSquare,
  ExternalLink, Loader2, AlertTriangle, Pencil, Save,
} from 'lucide-react';
import { reviewsAPI, type AdminReview, type ReviewStatus, type ReviewMedia as Asset } from '@/services/api';
import { Btn, StatusChip } from '@/components/erp';
import { StarRating } from './StarRating';
import { MediaStrip, MediaLightbox, MediaEditor } from './ReviewMedia';
import { ProductPicker, type PickedProduct } from './ProductPicker';
import { cn } from '@/lib/utils';
import { localeDate, localeDateTime } from '../../utils/date';

/**
 * The review workspace's detail panel.
 *
 * Everything a moderator needs is on ONE surface — read the review, watch the
 * video, see why it was auto-flagged, act on it, reply publicly, and fix a wrong
 * product link — because the previous page made each of those a different mode
 * of a single always-open form at the top of the list.
 */

const STATUS_ACTIONS: Array<{
  status: ReviewStatus; label: string; icon: React.ComponentType<{ className?: string }>; tone: string; hint: string;
}> = [
  { status: 'approved', label: 'Approve', icon: Check,   tone: 'bg-emerald-600 hover:bg-emerald-700 text-white', hint: 'Publish on the storefront' },
  { status: 'rejected', label: 'Reject',  icon: Ban,     tone: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300', hint: 'Not published; author can see why' },
  { status: 'spam',     label: 'Spam',    icon: Flag,    tone: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300', hint: 'Treat as abuse' },
  { status: 'hidden',   label: 'Hide',    icon: EyeOff,  tone: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300', hint: 'Keep the record, remove from the storefront' },
];

const FLAG_LABEL: Record<string, string> = {
  link_spam: 'Contains a link',
  contact_details: 'Contains a phone or email',
  all_caps: 'Written in all caps',
  repeated_chars: 'Repeated characters',
  very_short: 'Very short',
};

export const ReviewDetailDrawer: React.FC<{
  review: AdminReview | null;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
  canDelete: boolean;
}> = ({ review, onClose, onChanged, canManage, canDelete }) => {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const [replyText, setReplyText] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reports, setReports] = React.useState<any[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Partial<AdminReview>>({});
  const [relink, setRelink] = React.useState<PickedProduct | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReplyText(review?.reply_body || '');
    setReason('');
    setEditing(false);
    setError(null);
    setRelink(null);
    setDraft(review ? {
      rating: review.rating, title: review.title, review: review.review,
      customer_name: review.customer_name, media: review.media,
    } : {});
    if (review?.reported_count) {
      reviewsAPI.reports(review.id).then(setReports).catch(() => setReports([]));
    } else {
      setReports([]);
    }
  }, [review?.id, review?.reported_count]);

  if (!review) return null;

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); onChanged(); }
    catch (e: any) { setError(e?.response?.data?.message || 'That action could not be completed.'); }
    finally { setBusy(null); }
  };

  const moderate = (status: ReviewStatus) =>
    run(status, () => reviewsAPI.moderate([review.id], status, reason || undefined));

  const saveEdits = () => run('save', async () => {
    const patch: Record<string, any> = { ...draft };
    if (relink) { patch.product_id = relink.product_id; patch.variation_id = relink.variation_id; }
    await reviewsAPI.update(review.id, patch);
    setEditing(false);
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-gray-900/30" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Review details"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StarRating value={review.rating} size={16} />
              <StatusChip status={review.status} />
              {review.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                  <ShieldCheck className="h-3 w-3" /> Verified purchase
                </span>
              )}
              {review.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-600/20">
                  <Star className="h-3 w-3 fill-current" /> Pinned
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm text-gray-500">
              {review.customer_name}
              {(review.customer_email || review.customer_email_masked) &&
                ` · ${review.customer_email || review.customer_email_masked}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          {/* Product it belongs to */}
          <section className="rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Product</p>
            <div className="flex items-center gap-3">
              {review.product_image ? (
                <img src={review.product_image} alt="" className="h-11 w-11 rounded object-cover" />
              ) : (
                <span className="h-11 w-11 rounded bg-gray-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {review.variation_name || review.product_name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {review.product_sku ? `SKU ${review.product_sku}` : 'No SKU'}
                </p>
              </div>
              {review.product_slug && (
                <a
                  href={`/products?search=${encodeURIComponent(review.product_sku || review.product_name || '')}`}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Open in catalog"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {editing && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <ProductPicker
                  value={relink}
                  onChange={setRelink}
                  label="Move this review to a different product"
                />
              </div>
            )}
          </section>

          {/* Content */}
          <section className="space-y-2">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Rating</label>
                  <StarRating value={draft.rating ?? 5} onChange={(v) => setDraft({ ...draft, rating: v })} size={22} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Reviewer name</label>
                  <input
                    value={draft.customer_name ?? ''}
                    onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                  <input
                    value={draft.title ?? ''}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Review</label>
                  <textarea
                    rows={5}
                    value={draft.review ?? ''}
                    onChange={(e) => setDraft({ ...draft, review: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Photos & video</label>
                  <MediaEditor
                    media={(draft.media as Asset[]) ?? []}
                    onChange={(m) => setDraft({ ...draft, media: m })}
                  />
                </div>
              </div>
            ) : (
              <>
                {review.title && <h3 className="font-medium text-gray-900">{review.title}</h3>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{review.review}</p>
                {review.media?.length > 0 && (
                  <div className="pt-1">
                    <MediaStrip media={review.media} max={8} size={64} onOpen={setLightbox} />
                  </div>
                )}
              </>
            )}
          </section>

          {/* Signals */}
          {(review.auto_flags?.length || review.reported_count > 0) && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Needs a look
              </p>
              <ul className="space-y-1 text-sm text-amber-900">
                {review.auto_flags?.map((f) => <li key={f}>• {FLAG_LABEL[f] || f}</li>)}
                {review.reported_count > 0 && (
                  <li>• Reported by {review.reported_count} shopper{review.reported_count === 1 ? '' : 's'}</li>
                )}
                {reports.map((r) => (
                  <li key={r.id} className="pl-3 text-xs text-amber-800/80">
                    – {r.reason}{r.note ? `: ${r.note}` : ''}
                  </li>
                ))}
              </ul>
              {review.reported_count > 0 && canManage && (
                <button
                  onClick={() => run('reports', () => reviewsAPI.resolveReports(review.id, 'dismissed'))}
                  className="mt-2 text-xs font-medium text-amber-900 underline"
                >
                  Dismiss these reports
                </button>
              )}
            </section>
          )}

          {/* Store reply */}
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" /> Your public reply
            </p>
            <textarea
              rows={3}
              value={replyText}
              disabled={!canManage}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Thanks for the feedback — we're glad it helped…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50"
            />
            {canManage && (
              <div className="mt-2 flex items-center gap-2">
                <Btn
                  size="sm"
                  disabled={busy === 'reply'}
                  onClick={() => run('reply', () => reviewsAPI.reply(review.id, replyText.trim() || null))}
                >
                  {busy === 'reply' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {review.reply_body ? 'Update reply' : 'Post reply'}
                </Btn>
                {review.reply_body && (
                  <button
                    onClick={() => { setReplyText(''); run('reply', () => reviewsAPI.reply(review.id, null)); }}
                    className="text-xs text-gray-500 underline"
                  >
                    Remove reply
                  </button>
                )}
              </div>
            )}
            {review.reply_at && (
              <p className="mt-1.5 text-xs text-gray-400">
                Replied {localeDate(review.reply_at)} by {review.reply_by || 'Store'}
                {review.reply_published === false && ' · not visible to shoppers'}
              </p>
            )}
          </section>

          {/* Meta */}
          <section className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
            <span>Submitted</span>
            <span className="text-gray-700">{localeDateTime(review.created_at)}</span>
            <span>Source</span>
            <span className="text-gray-700 capitalize">{review.source || 'storefront'}</span>
            <span>Helpful votes</span>
            <span className="text-gray-700">{review.helpful_count} up · {review.not_helpful_count} down</span>
            <span>Customer account</span>
            <span className="text-gray-700">{review.has_customer_account ? 'Signed in' : 'Guest'}</span>
            {review.moderated_at && (
              <>
                <span>Last moderated</span>
                <span className="text-gray-700">
                  {localeDateTime(review.moderated_at)}
                  {review.moderation_reason ? ` · ${review.moderation_reason}` : ''}
                </span>
              </>
            )}
          </section>
        </div>

        {/* Footer actions */}
        {canManage && (
          <footer className="space-y-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
            {editing ? (
              <div className="flex gap-2">
                <Btn onClick={saveEdits} disabled={busy === 'save'} className="flex-1">
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </Btn>
                <Btn variant="outline" onClick={() => setEditing(false)}>Cancel</Btn>
              </div>
            ) : (
              <>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional note (shown to the reviewer if you reject)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <div className="flex flex-wrap gap-2">
                  {STATUS_ACTIONS.filter((a) => a.status !== review.status).map((a) => (
                    <button
                      key={a.status}
                      title={a.hint}
                      disabled={busy === a.status}
                      onClick={() => moderate(a.status)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60',
                        a.tone,
                      )}
                    >
                      {busy === a.status ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <a.icon className="h-3.5 w-3.5" />}
                      {a.label}
                    </button>
                  ))}
                  <span className="flex-1" />
                  <button
                    onClick={() => run('feature', () => reviewsAPI.feature([review.id], !review.is_featured))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    title="Pinned reviews show first on the product page"
                  >
                    <Star className={cn('h-3.5 w-3.5', review.is_featured && 'fill-amber-400 text-amber-400')} />
                    {review.is_featured ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (confirm('Delete this review permanently? This cannot be undone.')) {
                          run('delete', async () => { await reviewsAPI.delete(review.id); onClose(); });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </footer>
        )}
      </aside>

      {lightbox !== null && (
        <MediaLightbox media={review.media} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
};

export default ReviewDetailDrawer;
