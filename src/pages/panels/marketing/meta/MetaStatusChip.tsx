/**
 * CAT-08 on the product edit page (lane META-15B): one chip saying how this product stands on the Meta catalog, from
 * the product status route META-9C is adding (`productMetaStatus`, mock until it lands). Clicking it lists each
 * variation's state and Meta's messages, with a link to the Catalog page. Shown only to people who may read marketing
 * on stores with connectors; on a server without the route, or a product not on the catalog, it shows nothing.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { productMetaStatus } from '@/lib/v2/areas/meta';
import { StateChip, ago, linkCls, plural, useLoad, type Tone } from './common';
import { META_ROUTES, metaHref } from './routes';

const ITEM: Record<string, { label: string; tone: Tone }> = {
  synced: { label: 'On Meta', tone: 'good' }, pending: { label: 'Waiting', tone: 'info' }, warning: { label: 'On Meta, with advice', tone: 'warn' },
  error: { label: 'Refused', tone: 'bad' }, excluded: { label: 'Left out', tone: 'neutral' }, deleted: { label: 'Removed', tone: 'neutral' },
};

const Chip: React.FC<{ productId: string; className?: string }> = ({ productId, className }) => {
  const q = useLoad(() => productMetaStatus(productId).catch(() => null), [productId]);
  const [open, setOpen] = useState(false);
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  const errors = items.filter((i) => i.status === 'error').length;
  const warns = items.filter((i) => i.status === 'warning').length;
  const live = items.filter((i) => i.status === 'synced' || i.status === 'warning').length;
  const tone: Tone = errors ? 'bad' : warns ? 'warn' : live ? 'good' : 'neutral';
  const text = errors ? `Meta refused ${plural(errors, 'variation')}` : warns ? `Meta: ${plural(warns, 'warning')}` : live ? 'On Meta' : 'Not on Meta';
  return (
    <>
      <button type="button" className={`shrink-0 ${className ?? ''}`} aria-label={`${text}. Show details`} onClick={() => setOpen(true)}><StateChip tone={tone}>{text}</StateChip></button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>On the Meta catalog</DialogTitle>
          <DialogDescription>{plural(live, 'variation')} on Meta of {items.length}. Fix a refused one on its own fields; it goes back to Meta on save.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-auto rounded-md border">
          {items.map((i) => {
            const st = ITEM[String(i.status)] ?? { label: String(i.status), tone: 'neutral' as Tone };
            return (
              <li key={i.retailer_id} className="px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{i.title ?? i.retailer_id}</span><span className="block font-mono text-xs text-gray-500">{i.retailer_id}</span></span>
                  <StateChip tone={st.tone}>{st.label}</StateChip>
                </div>
                {i.messages.map((m) => <p key={m.code} className={`mt-1 text-xs ${m.level === 'error' ? 'text-red-700' : 'text-amber-800'}`}>{m.text}</p>)}
                <p className="mt-0.5 text-[11px] text-gray-500">Sent {ago(i.pushed_at)}{i.meta_review_status ? `, Meta review: ${i.meta_review_status}` : ''}</p>
              </li>
            );
          })}
        </ul>
        <Link className={`${linkCls} text-sm`} to={metaHref(META_ROUTES.catalog)} onClick={() => setOpen(false)}>Open the Meta catalog</Link>
      </DialogContent>
      </Dialog>
    </>
  );
};

/** `className` places the chip (the product header hides it on phones, where the header has no room). */
const MetaStatusChip: React.FC<{ productId: string | null | undefined; className?: string }> = ({ productId, className }) => {
  const { hasPerm, canAccess } = useAuth();
  if (!productId || !hasPerm('marketing.read') || !canAccess('connectors')) return null;
  return <Chip productId={productId} className={className} />;
};

export default MetaStatusChip;
