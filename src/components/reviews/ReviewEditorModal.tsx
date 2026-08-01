import React from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { reviewsAPI } from '@/services/api';
import { Btn } from '@/components/erp';
import { StarRating } from './StarRating';
import { MediaEditor } from './ReviewMedia';
import { ProductPicker, type PickedProduct } from './ProductPicker';
import type { ReviewMedia as Asset } from '@/services/api';

/**
 * Add a review by hand — seeding a new store, entering a testimonial that
 * arrived by email, or recording one collected offline.
 *
 * This is a MODAL, not the always-open form that used to sit above the list.
 * That form made the page confusing: it was permanently visible, doubled as the
 * edit surface, and its "Add Review" button only cleared the editing state.
 */
export const ReviewEditorModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, onClose, onSaved }) => {
  const [product, setProduct] = React.useState<PickedProduct | null>(null);
  const [rating, setRating] = React.useState(5);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [media, setMedia] = React.useState<Asset[]>([]);
  const [verified, setVerified] = React.useState(false);
  const [featured, setFeatured] = React.useState(false);
  const [publish, setPublish] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setProduct(null); setRating(5); setName(''); setEmail(''); setTitle('');
    setBody(''); setMedia([]); setVerified(false); setFeatured(false);
    setPublish(true); setError(null);
  };

  const save = async () => {
    if (!product) { setError('Choose which product this review is about.'); return; }
    if (body.trim().length < 2) { setError('Write the review text.'); return; }
    setBusy(true); setError(null);
    try {
      await reviewsAPI.create({
        product_id: product.product_id,
        variation_id: product.variation_id,
        customer_name: name.trim() || 'Anonymous',
        customer_email: email.trim() || null,
        rating,
        title: title.trim() || null,
        review: body.trim(),
        media,
        is_verified: verified,
        is_featured: featured,
        status: publish ? 'approved' : 'pending',
      });
      reset();
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save this review.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add a review</h2>
            <p className="text-sm text-gray-500">For testimonials or reviews collected outside the store.</p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          <ProductPicker value={product} onChange={setProduct} autoFocus />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Rating</label>
            <StarRating value={rating} onChange={setRating} size={26} showValue />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Reviewer name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Anonymous"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email <span className="font-normal text-gray-400">(never shown publicly)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Review</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did the customer say?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Photos & video</label>
            <MediaEditor media={media} onChange={setMedia} />
          </div>

          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            {[
              { v: publish, set: setPublish, label: 'Publish immediately', hint: 'Otherwise it waits in Pending' },
              { v: verified, set: setVerified, label: 'Mark as verified purchase', hint: 'Only tick if you know they bought it' },
              { v: featured, set: setFeatured, label: 'Pin to the top', hint: 'Shows first on the product page' },
            ].map((o) => (
              <label key={o.label} className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={o.v}
                  onChange={(e) => o.set(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-medium text-gray-700">{o.label}</span>
                  <span className="block text-xs text-gray-500">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <Btn variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save review
          </Btn>
        </footer>
      </div>
    </div>
  );
};

export default ReviewEditorModal;
