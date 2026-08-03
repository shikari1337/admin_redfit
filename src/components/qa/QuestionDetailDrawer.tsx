import React from 'react';
import { Link } from 'react-router-dom';
import {
  X, Send, Check, Ban, Trash2, ShieldCheck, ThumbsUp, ExternalLink,
  AlertTriangle, Loader2, Clock, User,
} from 'lucide-react';
import { productQuestionsAPI, type AdminQuestion } from '@/services/api';
import { Btn, StatusChip } from '@/components/erp';
import { cn } from '@/lib/utils';

/**
 * One question, everything you can do to it.
 *
 * The primary action is ANSWERING, not approving: a question is invisible to
 * shoppers until it is answered and published, and `POST /:id/answer` publishes
 * by default — so the useful gesture is "type the reply and send", with
 * publish-later as the exception. Reject is for spam and questions the store
 * will not answer publicly.
 *
 * The asker's email is shown because it is already in the moderator field-set
 * (`FIELD_SETS.moderator`, db/queries/productQuestions.ts) and answering by mail
 * is often the right call for a stock or dosage question — but it is never
 * echoed to the storefront.
 */

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const QuestionDetailDrawer: React.FC<{
  question: AdminQuestion | null;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
  canDelete: boolean;
}> = ({ question, onClose, onChanged, canManage, canDelete }) => {
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Re-seed the composer whenever a DIFFERENT question opens. Keying on id (not
  // the object) keeps a half-typed answer alive when the list refreshes under
  // the drawer after an action.
  React.useEffect(() => {
    setDraft(question?.answer ?? '');
    setError(null);
  }, [question?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!question) return null;
  const q = question;

  const run = async (key: string, fn: () => Promise<any>, close = false) => {
    setBusy(key); setError(null);
    try {
      await fn();
      onChanged();
      if (close) onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'That action could not be completed.');
    } finally {
      setBusy(null);
    }
  };

  const answerChanged = draft.trim() !== (q.answer ?? '').trim();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-gray-900/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Question detail"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {q.variation_name || q.product_name || 'Product'}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {q.variation_sku && <span className="font-mono">{q.variation_sku}</span>}
              <StatusChip status={q.status} />
              {(q.variation_sku || q.product_name) && (
                <Link
                  to={`/products?search=${encodeURIComponent(q.variation_sku || q.product_name || '')}`}
                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  Open product <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          {/* Who asked */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
              <User className="h-3.5 w-3.5 text-gray-400" />
              {q.asker_name}
              {q.verified_buyer && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> Bought this
                </span>
              )}
              {q.helpful_count > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <ThumbsUp className="h-3 w-3" /> {q.helpful_count}
                </span>
              )}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmt(q.created_at)}</span>
              {q.asker_email && <span className="truncate">{q.asker_email}</span>}
            </p>
            {(q.auto_flags?.length ?? 0) > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                Flagged automatically: {q.auto_flags!.join(', ')}
              </p>
            )}
          </div>

          {/* The question */}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Question</p>
            <p className="whitespace-pre-wrap rounded-lg bg-white text-[15px] leading-relaxed text-gray-800">
              {q.question}
            </p>
          </div>

          {/* Answer composer */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Your answer {q.answer && <span className="normal-case text-gray-400">· by {q.answered_by || 'Store'}, {fmt(q.answered_at)}</span>}
              </p>
              <span className={cn('text-[11px] tabular-nums', draft.length > 4000 ? 'text-red-600' : 'text-gray-400')}>
                {draft.length}/4000
              </span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!canManage}
              rows={7}
              placeholder="Answer in the store's voice — this is published on the product page for every future shopper with the same question."
              className="w-full resize-y rounded-lg border border-gray-300 p-3 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 read-only:bg-gray-50"
            />
            {canManage && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Btn
                  disabled={!draft.trim() || draft.length > 4000 || busy !== null}
                  onClick={() => run('answer', () => productQuestionsAPI.answer(q.id, draft.trim(), { publish: true }))}
                >
                  {busy === 'answer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {q.answer ? 'Update & publish' : 'Answer & publish'}
                </Btn>
                <Btn
                  variant="outline"
                  disabled={!draft.trim() || draft.length > 4000 || busy !== null}
                  onClick={() => run('draft', () => productQuestionsAPI.answer(q.id, draft.trim(), { publish: false }))}
                  title="Save the answer without showing it on the storefront yet"
                >
                  Save as draft
                </Btn>
                {answerChanged && q.answer && (
                  <button onClick={() => setDraft(q.answer ?? '')} className="text-xs text-gray-500 hover:underline">
                    Revert
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Moderation footer */}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
            {q.status !== 'published' && (
              <Btn variant="outline" disabled={busy !== null} onClick={() => run('publish', () => productQuestionsAPI.publish(q.id, true))}>
                <Check className="h-4 w-4" /> Publish
              </Btn>
            )}
            {q.status === 'published' && (
              <Btn variant="outline" disabled={busy !== null} onClick={() => run('unpublish', () => productQuestionsAPI.publish(q.id, false))}>
                Unpublish
              </Btn>
            )}
            {q.status !== 'rejected' && (
              <Btn variant="outline" disabled={busy !== null} onClick={() => run('reject', () => productQuestionsAPI.reject(q.id))}>
                <Ban className="h-4 w-4" /> Reject
              </Btn>
            )}
            <span className="flex-1" />
            {canDelete && (
              <Btn
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  if (confirm('Delete this question permanently? This cannot be undone.')) {
                    run('delete', () => productQuestionsAPI.delete(q.id), true);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Btn>
            )}
          </div>
        )}
      </aside>
    </>
  );
};

export default QuestionDetailDrawer;
