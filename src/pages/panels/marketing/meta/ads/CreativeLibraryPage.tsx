/**
 * Marketing > Ads > Creative library (`/panel/marketing/ads/library`, lane META-15A, contract META-W2 section B).
 *
 * The pictures and videos uploaded to the Meta ad account, ready to reuse in any ad. It leads with uploads that
 * failed and videos still processing (the page checks again every few seconds while any are), then the grid.
 * New items come from the store's own media (the shared `MediaLibraryBrowser`, the same one every image field
 * opens), never from a second upload path.
 *
 * META-19 (ADS-11): a second tab lists the Instant Experiences (`?tab=canvases`), made from the same store media.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MediaLibraryBrowser, { type MediaFile } from '@/components/common/MediaLibraryBrowser';
import { Segmented } from '@/components/panelAnalytics/Kit';
import { useToast } from '@/hooks/use-toast';
import { metaAdsApi, type LibraryItem } from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import MetaHeader from '../MetaHeader';
import { Lead, LoadFailure, Section, StateChip, plural, useLoad, writeError } from '../common';
import { useMetaCtx } from '../useMetaCtx';
import { LibThumb } from './pieces';
import { NeedsAdAccount, adAccountOf } from './shared';
import { CanvasesSection } from './canvases';

const STATE: Record<string, { text: string; tone: 'good' | 'info' | 'bad' | 'neutral' }> = {
  ready: { text: 'Ready', tone: 'good' }, uploading: { text: 'Uploading', tone: 'info' }, processing: { text: 'Processing', tone: 'info' }, error: { text: 'Failed', tone: 'bad' },
};

const tabFromUrl = (): 'media' | 'canvases' => {
  try { return new URLSearchParams(window.location.search).get('tab') === 'canvases' ? 'canvases' : 'media'; } catch { return 'media'; }
};

const CreativeLibraryPage: React.FC = () => {
  const ctx = useMetaCtx();
  const [tab, setTab] = useState<'media' | 'canvases'>(tabFromUrl);
  return (
    <div className="space-y-5">
      <MetaHeader title="Creative library" setup={ctx.setup} description="Pictures and videos on your Meta ad account, and the Instant Experiences your ads can open. Everything comes from your store's media." />
      {!adAccountOf(ctx) && ctx.setup ? <NeedsAdAccount ctx={ctx} /> : (
        <>
          <Segmented label="Library" value={tab} onChange={(k) => setTab(k as typeof tab)} options={[{ key: 'media', label: 'Pictures and videos' }, { key: 'canvases', label: 'Instant Experiences' }]} />
          {tab === 'media' ? <Library canAct={ctx.can.ads} /> : <CanvasesSection canAct={ctx.can.ads} />}
        </>
      )}
    </div>
  );
};

const Library: React.FC<{ canAct: boolean }> = ({ canAct }) => {
  const { toast } = useToast();
  const [type, setType] = useState<'all' | 'image' | 'video'>('all');
  const q = useLoad(() => metaAdsApi.library(type === 'all' ? undefined : type), [type]);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const items = q.data ?? [];
  const failed = items.filter((i) => i.status === 'error');
  const working = items.filter((i) => i.status === 'processing' || i.status === 'uploading');

  // Check again while Meta is still working on something.
  useEffect(() => {
    if (!working.length) return;
    const t = setTimeout(() => { q.reload(); }, 5000);
    return () => clearTimeout(t);
  }, [working.length, q.data, q.reload]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await metaAdsApi.deleteFromLibrary(deleting.id); toast({ title: `${deleting.name} removed` }); setDeleting(null); await q.reload(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'It was not removed.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {failed.length > 0 ? (
        <Lead tone="bad" title={`${plural(failed.length, 'upload')} failed`}>
          <ul className="list-disc space-y-0.5 pl-5">{failed.map((i) => <li key={i.id}><b>{i.name}:</b> {i.error ?? 'Meta did not accept the file.'}</li>)}</ul>
          <p className="mt-1">Fix the file in your media and add it again, or remove it here.</p>
        </Lead>
      ) : working.length > 0 ? (
        <Lead tone="info" title={`${plural(working.length, 'file')} still with Meta`}>Videos are processed before they can be used; this page checks again every few seconds.</Lead>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Show" value={type} onChange={(k) => setType(k as typeof type)} options={[{ key: 'all', label: 'All' }, { key: 'image', label: 'Pictures' }, { key: 'video', label: 'Videos' }]} />
        {canAct && <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}><Plus /> Add from store media</Button>}
      </div>

      {q.error && !q.data ? <LoadFailure failure={q.error} what="The creative library (GET /api/v2/marketing/meta/ads/library) is not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading...</p> : (
          <Section title={type === 'video' ? 'Videos' : type === 'image' ? 'Pictures' : 'Everything'} hint={plural(items.length, 'file')}>
            {!items.length ? <p className="text-sm text-gray-600">Nothing here yet. Add pictures or videos from your store's media.</p> : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((i) => {
                  const st = STATE[i.status] ?? { text: i.status, tone: 'neutral' as const };
                  return (
                    <li key={i.id} className="min-w-0 overflow-hidden rounded-lg border bg-white">
                      <div className="relative">
                        <LibThumb l={i} className={i.status === 'ready' ? '' : 'opacity-60'} />
                        {i.status === 'processing' && i.progress != null && (
                          <span className="absolute inset-x-2 top-2 h-1.5 rounded-full bg-white/70" aria-label={`Processing, ${i.progress}%`}>
                            <span className="block h-1.5 rounded-full bg-gray-900" style={{ width: `${Math.max(4, i.progress)}%` }} />
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="truncate text-xs font-medium text-gray-900" title={i.name}>{i.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StateChip tone={st.tone}>{st.text}{i.status === 'processing' && i.progress != null ? ` ${i.progress}%` : ''}</StateChip>
                          {i.width && i.height ? <span className="text-[11px] text-gray-500">{i.width} by {i.height}</span> : null}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                          <span>{i.used_in ? `In ${plural(i.used_in, 'ad')}` : 'Not used yet'}</span>
                          {canAct && <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setDeleting(i)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                        {i.created_at && <p className="text-[11px] text-gray-400">Added {localeDate(i.created_at, { day: 'numeric', month: 'short' })}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

      {adding && <AddFromMedia onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await q.reload(); }} />}
      {deleting && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleting(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Remove from the library?</DialogTitle><DialogDescription className="break-words">{deleting.name}</DialogDescription></DialogHeader>
            <p className="text-sm text-gray-800">{deleting.used_in ? `It is in ${plural(deleting.used_in, 'ad')}; those ads keep running with it. ` : ''}Your store's own copy stays in your media.</p>
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Remove</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

/** Pick files from the store's media (the shared browser); each click adds or removes one. */
const AddFromMedia: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const { toast } = useToast();
  const [picked, setPicked] = useState<MediaFile[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (f: MediaFile) => setPicked((p) => (p.some((x) => x.key === f.key) ? p.filter((x) => x.key !== f.key) : [...p, f]));
  const add = async () => {
    setBusy(true);
    try { await metaAdsApi.addToLibrary(picked.map((f) => f.key)); toast({ title: `${plural(picked.length, 'file')} sent to Meta`, description: 'Videos take a few minutes to process.' }); onDone(); }
    catch (e) { toast({ title: 'Meta refused', description: writeError(e, 'Nothing was uploaded.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader><DialogTitle>Add from store media</DialogTitle><DialogDescription>Pick pictures and videos; each is uploaded to your Meta ad account.</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <MediaLibraryBrowser mode="picker" accept="all" selected={picked[picked.length - 1]?.key ?? null} onSelect={toggle} height="55vh" />
        </div>
        {picked.length > 0 && <p className="truncate text-xs text-gray-600">Picked: {picked.map((f) => f.name).join(', ')}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={add} disabled={busy || !picked.length}>{busy && <Loader2 className="animate-spin" />} Upload {picked.length ? plural(picked.length, 'file') : ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreativeLibraryPage;
