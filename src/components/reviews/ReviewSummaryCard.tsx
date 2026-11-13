import React from 'react';
import { Sparkles, Loader2, Check, EyeOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { Btn, StatusChip } from '@/components/erp';
import { reviewsV2, reviewsError, type ReviewSummary } from '@/lib/v2/areas/reviews';

/**
 * "What buyers say" for one product: a short summary of its approved reviews, with what buyers like and
 * what they do not. The AI only PROPOSES it (`POST /moderation/summaries`); nothing reaches the product
 * page until a person reads it here and presses Publish (`products/reviews.md` section 3, AI proposes and
 * a person approves). There is one summary per product and language: a new proposal replaces the old one
 * and takes a published one off the product page until it is published again, so the card asks first.
 */
export const ReviewSummaryCard: React.FC<{ productId: string; canManage: boolean }> = ({ productId, canManage }) => {
  const [summary, setSummary] = React.useState<ReviewSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setSummary(null);
    reviewsV2.summaryOf(productId)
      .then((s) => { if (alive) setSummary(s); })
      .catch((e) => { if (alive) setError(reviewsError(e, 'The summary could not be loaded.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);

  const act = async (key: string, fn: () => Promise<ReviewSummary>) => {
    setBusy(key); setError(null);
    try { setSummary(await fn()); }
    catch (e) { setError(reviewsError(e, 'That action could not be completed.')); }
    finally { setBusy(null); }
  };

  const propose = () => {
    if (summary?.status === 'published'
      && !confirm('A new proposal takes the live summary off the product page until you publish it. Continue?')) return;
    act('propose', () => reviewsV2.proposeSummary(productId));
  };

  return (
    <section className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Sparkles className="h-3.5 w-3.5" /> What buyers say
        </p>
        {summary && <StatusChip status={summary.status} />}
      </div>

      {error && (
        <p className="mb-2 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {loading ? (
        <div className="h-12 animate-pulse rounded bg-gray-100" />
      ) : !summary ? (
        <p className="text-sm text-gray-500">
          No summary yet. One can be proposed from this product's approved reviews; you read it and publish it.
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="leading-relaxed text-gray-700">{summary.summary}</p>
          {(summary.pros.length > 0 || summary.cons.length > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.pros.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-emerald-800">
                  {summary.pros.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
              {summary.cons.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                  {summary.cons.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            From {summary.review_count} approved review{summary.review_count === 1 ? '' : 's'}
            {summary.status === 'published' ? ', live on the product page' : ', not shown to shoppers'}
          </p>
        </div>
      )}

      {canManage && !loading && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summary && summary.status !== 'published' && (
            <Btn size="sm" disabled={busy !== null} onClick={() => act('publish', () => reviewsV2.setSummary(summary.id, 'published'))}>
              {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Publish
            </Btn>
          )}
          {summary && summary.status === 'published' && (
            <Btn size="sm" variant="outline" disabled={busy !== null} onClick={() => act('withdraw', () => reviewsV2.setSummary(summary.id, 'withdrawn'))}>
              {busy === 'withdraw' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />} Take down
            </Btn>
          )}
          <Btn size="sm" variant="outline" disabled={busy !== null} onClick={propose}>
            {busy === 'propose' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : summary ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summary ? 'Propose again' : 'Propose a summary'}
          </Btn>
        </div>
      )}
    </section>
  );
};

export default ReviewSummaryCard;
