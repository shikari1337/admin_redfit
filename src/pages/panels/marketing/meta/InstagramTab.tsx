/**
 * Instagram: the store feed switch and its settings (the store's `instagram` setting, the same one Appearance
 * writes), the account's posts, and the tag editor: click the photo, pick a product, save. Tags always show on
 * the store's own feed; "Also tag on Instagram" is offered only when Meta says the account may (Instagram
 * Shopping approved and the catalog linked), otherwise it is off and says why.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Images, Loader2, RefreshCw, Search, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDayShort } from '@/utils/date';
import { metaApi, type IgFeedSettings, type IgPost, type IgShopping, type IgTag, type ProductHit } from '@/lib/v2/areas/meta';
import { useMetaCtx, type MetaCtx } from './useMetaCtx';
import MetaHeader from './MetaHeader';
import { Lead, LoadFailure, Section, linkCls, num, plural, useLoad, writeError, type Failure } from './common';

const InstagramTab: React.FC<{ ctx: MetaCtx }> = ({ ctx }) => {
  const { toast } = useToast();
  const feedQ = useLoad(() => metaApi.igFeedSettings(), []);
  const postsQ = useLoad(() => metaApi.igPosts(24), []);
  const shopQ = useLoad(() => metaApi.igShopping(), []);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const [editing, setEditing] = useState<IgPost | null>(null);
  const account = ctx.setup?.items.find((i) => i.key === 'instagram')?.picked?.name ?? null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await metaApi.igRefresh();
      await postsQ.reload();
      toast({ title: 'Posts refreshed from Instagram' });
    } catch (e) {
      toast({ title: 'Could not refresh', description: writeError(e, 'Instagram did not answer.'), variant: 'destructive' });
    } finally { setRefreshing(false); }
  };

  const posts = postsQ.data ?? [];
  const untagged = posts.filter((p) => !p.tags.length);
  const shown = onlyUntagged ? untagged : posts;
  const feed = feedQ.data;
  const shop = shopQ.data;

  return (
    <div className="space-y-5">
      {feed && !feed.isEnabled ? (
        <Lead tone="warn" title="The Instagram feed is off on your store">Turn it on below to show your latest posts, with their tagged products, on the store.</Lead>
      ) : postsQ.data && posts.length === 0 ? (
        <Lead tone="info" title="No posts yet">{account ? `Nothing has come in from ${account}. Press Refresh to ask Instagram again.` : 'Pick your Instagram account in Setup first.'}</Lead>
      ) : untagged.length > 0 ? (
        <Lead tone="warn" title={`${num(untagged.length)} of ${plural(posts.length, 'post')} have no products tagged`}
          actions={<Button size="sm" variant="outline" className="bg-white" onClick={() => setOnlyUntagged(true)}>Show them</Button>}>
          Tag the products in each post so shoppers can buy straight from your feed.
        </Lead>
      ) : postsQ.data ? (
        <Lead tone="good" title={`Every post has products tagged (${num(posts.length)})`}>Shoppers can buy from each post on your store.</Lead>
      ) : null}

      {shop && !shop.can_tag_on_instagram && (
        <p className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <b>Tags show on your store only.</b> {shop.reason || 'Tagging on Instagram itself needs Instagram Shopping and a linked catalog.'}
        </p>
      )}

      <Section
        title={account ? `Posts from ${account}` : 'Posts'}
        hint="Click a post to tag its products."
        actions={(
          <>
            <label className="flex items-center gap-2 text-sm text-gray-700"><Switch checked={onlyUntagged} onCheckedChange={setOnlyUntagged} /> Only untagged</label>
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh</Button>
          </>
        )}
      >
        {postsQ.error && !postsQ.data ? <LoadFailure failure={postsQ.error} what="Instagram posts for the admin (GET /api/v2/marketing/instagram/posts) are not served yet." onRetry={postsQ.reload} />
          : !postsQ.data ? <p className="text-sm text-gray-500">Loading posts...</p>
            : shown.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">{onlyUntagged ? 'Every post is tagged.' : 'No posts.'}</p>
              : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setEditing(p)} className="group block w-full text-left">
                        <div className="relative aspect-square overflow-hidden rounded-md border bg-gray-100">
                          {(p.thumbnail_url || p.media_url) && <img src={p.thumbnail_url || p.media_url || ''} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />}
                          {p.media_type !== 'IMAGE' && (
                            <span className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white" title={p.media_type === 'VIDEO' ? 'Reel' : 'Carousel'}>
                              {p.media_type === 'VIDEO' ? <Film className="h-3.5 w-3.5" /> : <Images className="h-3.5 w-3.5" />}
                            </span>
                          )}
                          <span className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${p.tags.length ? 'bg-emerald-600 text-white' : 'bg-white/90 text-gray-700'}`}>
                            <Tag className="h-3 w-3" />{p.tags.length ? plural(p.tags.length, 'product') : 'No products'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{formatDayShort(p.timestamp, '')}{p.tagged_on_instagram ? ', tagged on Instagram' : ''}</p>
                        <p className="line-clamp-2 text-xs text-gray-800">{p.caption}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
      </Section>

      <FeedSettings ctx={ctx} data={feedQ.data} error={feedQ.error} reload={feedQ.reload} />

      {editing && (
        <TagEditor post={editing} shopping={shop} canEdit={ctx.can.marketing} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await postsQ.reload(); }} />
      )}
    </div>
  );
};

const FeedSettings: React.FC<{ ctx: MetaCtx; data: IgFeedSettings | null; error: Failure | null; reload: () => Promise<void> }> = ({ ctx, data, error, reload }) => {
  const { toast } = useToast();
  const feedQ = { data, error, reload };
  const [form, setForm] = useState<IgFeedSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (feedQ.data) setForm(feedQ.data); }, [feedQ.data]);
  const dirty = !!(form && feedQ.data && JSON.stringify(form) !== JSON.stringify(feedQ.data));
  const disabled = !ctx.can.marketing;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await metaApi.saveIgFeedSettings(form);
      await feedQ.reload();
      toast({ title: form.isEnabled ? 'Instagram feed saved' : 'Instagram feed turned off' });
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The feed settings were not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Section title="Feed on your store" hint="Your latest posts, with their tagged products, on the store."
      actions={!disabled && <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>}>
      {feedQ.error && !feedQ.data ? <LoadFailure failure={feedQ.error} what="The store settings could not be read." onRetry={feedQ.reload} />
        : !form ? <p className="text-sm text-gray-500">Loading...</p> : (
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm({ ...form, isEnabled: v })} disabled={disabled} /> Show the Instagram feed on the store
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="ig-heading">Heading</Label>
                <Input id="ig-heading" value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} disabled={disabled} placeholder="Follow us on Instagram" />
              </div>
              <div>
                <Label htmlFor="ig-count">Posts shown</Label>
                <Input id="ig-count" type="number" min={1} max={50} value={form.count || ''} onChange={(e) => setForm({ ...form, count: Number(e.target.value) || 0 })} disabled={disabled} />
              </div>
              <div>
                <Label>Layout</Label>
                <Select value={form.layout || 'grid'} onValueChange={(v) => setForm({ ...form, layout: v })} disabled={disabled}>
                  <SelectTrigger className="mt-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid</SelectItem>
                    <SelectItem value="carousel">Carousel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Place it on the home page with the Instagram feed block in <Link className={linkCls} to="/appearance/pages">Pages</Link>; a block can set its own heading and count.
              The older username field is in <Link className={linkCls} to="/appearance/style">Appearance</Link>.
            </p>
          </div>
        )}
    </Section>
  );
};

/** Click the photo to drop a pin, pick the product for it, save. Pins can be dragged. */
const TagEditor: React.FC<{ post: IgPost; shopping: IgShopping | null; canEdit: boolean; onClose: () => void; onSaved: () => void }> = ({ post, shopping, canEdit, onClose, onSaved }) => {
  const { toast } = useToast();
  const [tags, setTags] = useState<IgTag[]>(post.tags);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [push, setPush] = useState(!!post.tagged_on_instagram && !!shopping?.can_tag_on_instagram);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canPush = !!shopping?.can_tag_on_instagram;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setHits(await metaApi.searchProducts(term)); } catch { setHits([]); } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const place = (e: React.MouseEvent) => {
    if (!canEdit || drag !== null) return;
    setPending(at(e));
    searchRef.current?.focus();
  };

  const pick = (h: ProductHit) => {
    const spot = pending ?? { x: 0.5, y: Math.min(0.9, 0.3 + tags.length * 0.12) };
    setTags([...tags, { product_id: h.product_id, variation_id: h.variation_id, x: spot.x, y: spot.y, name: h.name, image: h.image ?? null }]);
    setPending(null); setQ(''); setHits([]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await metaApi.igSaveTags(post.id, tags, canPush && push);
      toast({ title: 'Tags saved', description: canPush && push ? 'They show on your store and on Instagram.' : 'They show on your store\'s Instagram feed.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The tags were not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const image = post.media_url || post.thumbnail_url;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Tag products</DialogTitle>
          <DialogDescription className="line-clamp-2">{post.caption}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <div ref={box} onClick={place}
              onPointerMove={(e) => { if (drag !== null) { const p = at(e); setTags((ts) => ts.map((t, i) => (i === drag ? { ...t, ...p } : t))); } }}
              onPointerUp={() => setTimeout(() => setDrag(null), 0)}
              className={`relative aspect-square w-full touch-none select-none overflow-hidden rounded-md border bg-gray-100 ${canEdit ? 'cursor-crosshair' : ''}`}>
              {image && <img src={image} alt="" draggable={false} className="h-full w-full object-cover" />}
              {tags.map((t, i) => (
                <span key={i} onPointerDown={(e) => { if (!canEdit) return; e.stopPropagation(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(i); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
                  className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-gray-900 text-xs font-bold text-white shadow"
                  title={t.name ?? undefined}>{i + 1}</span>
              ))}
              {pending && (
                <span style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
                  className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-white bg-primary shadow" />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{canEdit ? (pending ? 'Now pick the product on the right.' : 'Click where a product is. Drag a number to move it.') : 'You can look, but not change tags.'}</p>
          </div>
          <div className="min-w-0 space-y-3">
            {canEdit && (
              <div>
                <Label htmlFor="ig-search">{pending ? 'Product for the new pin' : 'Find a product'}</Label>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input id="ig-search" ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, brand or SKU" className="pl-8" />
                  {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
                </div>
                {q.trim().length >= 3 && !searching && hits.length === 0 && <p className="mt-1 text-xs text-gray-500">No product matches.</p>}
                {hits.length > 0 && (
                  <ul className="mt-1 max-h-56 divide-y overflow-auto rounded-md border">
                    {hits.map((h) => (
                      <li key={`${h.product_id}:${h.variation_id ?? ''}`}>
                        <button type="button" onClick={() => pick(h)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50">
                          {h.image ? <img src={h.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="h-8 w-8 shrink-0 rounded bg-gray-100" />}
                          <span className="min-w-0"><span className="line-clamp-2 text-sm">{h.name}</span>{h.sku && <span className="block truncate font-mono text-[11px] text-gray-500">{h.sku}</span>}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">Tagged ({tags.length})</p>
              {tags.length === 0 ? <p className="mt-1 text-sm text-gray-500">None yet.</p> : (
                <ol className="mt-1 space-y-1">
                  {tags.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">{i + 1}</span>
                      {t.image && <img src={t.image} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
                      <span className="line-clamp-2 min-w-0 flex-1 text-sm">{t.name ?? t.variation_id ?? t.product_id}</span>
                      {canEdit && <button type="button" aria-label="Remove tag" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <label className={`flex items-start gap-2 text-sm ${canPush ? '' : 'text-gray-400'}`}>
              <input type="checkbox" className="mt-1" checked={canPush && push} disabled={!canPush || !canEdit} onChange={(e) => setPush(e.target.checked)} />
              <span>
                <span className="font-medium">Also tag on Instagram</span>
                <span className="block text-xs">{canPush ? 'The same tags appear on the post in Instagram.' : (shopping?.reason || 'Needs Instagram Shopping and a linked catalog.')}</span>
              </span>
            </label>
            {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className={`${linkCls} text-xs`}>Open the post on Instagram</a>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canEdit && <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save tags'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Route-ready: this tab as a page of its own (for a Marketing menu item). */
export const InstagramPage: React.FC = () => {
  const ctx = useMetaCtx();
  return (
    <div className="space-y-5">
      <MetaHeader title="Instagram" setup={ctx.setup} description="Your posts, the products tagged in them, and the Instagram feed on your store." />
      <InstagramTab ctx={ctx} />
    </div>
  );
};

export default InstagramTab;
