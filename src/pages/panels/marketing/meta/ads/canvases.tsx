/**
 * Instant Experiences (lane META-19, ADS-11; `growcord-rs/apps/marketing/core/src/meta_ads/canvas.rs`): a full screen
 * landing an ad opens, made of the store's own pictures, videos, words and buttons, and the collection ad without a
 * catalog. One editor (blank or from one of Meta's templates, elements in the order they show, every picture and video
 * from the store's media through the shared `MediaLibraryBrowser`), Meta's preview, the Creative library's list and
 * the Create ad step's picker. Element types, Meta's style words, templates and limits all come from
 * `GET /meta/ads/canvases/options`; nothing of Meta's vocabulary is typed here. Saving makes it on Meta unpublished;
 * a person publishes it (here, or by creating a campaign that opens it).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Eye, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import MediaLibraryBrowser, { type MediaFile } from '@/components/common/MediaLibraryBrowser';
import { useToast } from '@/hooks/use-toast';
import { readImageDimensions } from '@/lib/imageSpecs';
import { cn } from '@/lib/utils';
import {
  metaCanvasApi, type Canvas, type CanvasElement, type CanvasInput, type CanvasMedia, type CanvasOptions, type CanvasPreview,
} from '@/lib/v2/areas/meta';
import { localeDate } from '@/utils/date';
import { Lead, LoadFailure, StateChip, linkCls, plural, useLoad, writeError } from '../common';
import { humanize } from './shared';

/* Small helpers */

/** Meta writes colours as AARRGGBB; the colour field takes #RRGGBB (the server turns it back). */
const hexOf = (c: string | null | undefined, fallback: string) => (c && /^[0-9A-Fa-f]{6,8}$/.test(c) ? `#${c.slice(-6)}` : c && c.startsWith('#') ? c : fallback);
const isLink = (v: string | null | undefined) => !!v && /^https?:\/\/\S+\.\S+/.test(v.trim());
const when = (v: string | number | null | undefined) => {
  if (v == null || v === '') return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : localeDate(d.toISOString(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const firstPicture = (c: Canvas): string | null => {
  for (const e of c.elements ?? []) {
    if (e.media?.url && e.media.kind !== 'video') return e.media.url;
    const item = (e.items ?? []).find((m) => m.url);
    if (item?.url) return item.url;
  }
  return null;
};

export const CanvasStatus: React.FC<{ c: Canvas }> = ({ c }) => (
  c.source === 'meta'
    ? <StateChip tone="neutral">{c.is_published ? 'Made in Meta, published' : 'Made in Meta, not published'}</StateChip>
    : c.status === 'published' ? <StateChip tone="good">Published</StateChip>
      : c.build_error ? <StateChip tone="bad">Not on Meta yet</StateChip>
        : <StateChip tone="info">Draft, not published</StateChip>
);

/* Preview */

export const CanvasPreviewDialog: React.FC<{ canvas: Canvas; onClose: () => void }> = ({ canvas, onClose }) => {
  const q = useLoad<CanvasPreview>(() => metaCanvasApi.preview(canvas.source === 'meta' ? (canvas.meta_canvas_id ?? canvas.id) : canvas.id), [canvas.id]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle className="break-words">{canvas.name}</DialogTitle>
          <DialogDescription>Meta's preview: what people see full screen after tapping the ad.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {q.error && !q.data ? <LoadFailure failure={q.error} what="Meta's preview (GET /api/v2/marketing/meta/ads/canvases/{id}/preview) is not served yet." onRetry={q.reload} />
            : !q.data ? <p className="text-sm text-gray-500">Asking Meta...</p>
              : q.data.html ? <iframe title={`Preview: ${canvas.name}`} srcDoc={q.data.html} sandbox="allow-scripts allow-popups" className="h-[60vh] w-full rounded-md border bg-white" />
                : <Lead tone={q.data.error ? 'warn' : 'info'} title={q.data.error ? 'Meta sent no preview' : 'No preview yet'}>{q.data.error ?? q.data.note ?? 'Meta sent nothing to show.'}</Lead>}
        </div>
        <DialogFooter className="gap-2">
          {canvas.canvas_link && <Button variant="outline" asChild><a href={canvas.canvas_link} target="_blank" rel="noreferrer"><ExternalLink /> Open on Meta</a></Button>}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* Media from the store's own library */

const PickMedia: React.FC<{ accept: 'image' | 'video'; onClose: () => void; onPick: (m: CanvasMedia) => void }> = ({ accept, onClose, onPick }) => {
  const [picked, setPicked] = useState<MediaFile | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async (f: MediaFile | null) => {
    if (!f) return;
    setBusy(true);
    // A picture's size: a collection thumbnail is a square crop of it.
    const size = f.kind === 'image' ? await readImageDimensions(f.url) : null;
    setBusy(false);
    onPick({ gallery_id: f.key, url: f.url, name: f.name, kind: f.kind, width: size?.width ?? null, height: size?.height ?? null });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Pick a {accept === 'video' ? 'video' : 'picture'} from store media</DialogTitle>
          <DialogDescription>Your store's own files; Meta fetches the one you pick when the Instant Experience is saved.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <MediaLibraryBrowser mode="picker" accept={accept} selected={picked?.key ?? null} onSelect={setPicked} onConfirm={confirm} height="55vh" />
        </div>
        {picked && <p className="truncate text-xs text-gray-600">Picked: {picked.name}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => confirm(picked)} disabled={!picked || busy}>{busy && <Loader2 className="animate-spin" />} Use this file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MediaThumb: React.FC<{ m: CanvasMedia | null | undefined; className?: string }> = ({ m, className }) => (
  <span className={cn('relative block aspect-square w-full overflow-hidden rounded border bg-gray-100', className)}>
    {m?.url && m.kind !== 'video' ? <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
      : <ImageIcon className="absolute inset-0 m-auto h-5 w-5 text-gray-400" />}
    {m?.kind === 'video' && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">Video</span>}
  </span>
);

const MediaField: React.FC<{ value: CanvasMedia | null | undefined; accept: 'image' | 'video'; onChange: (m: CanvasMedia | null) => void; disabled?: boolean }> = ({ value, accept, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="w-16 shrink-0"><MediaThumb m={value} /></div>
      <div className="min-w-0 flex-1 text-xs text-gray-600">
        <p className="truncate font-medium text-gray-900" title={value?.name ?? ''}>{value?.name ?? `No ${accept === 'video' ? 'video' : 'picture'} picked`}</p>
        {value?.width && value?.height ? <p>{value.width} by {value.height}</p> : value && accept === 'image' ? <p className="text-amber-700">Size not read: pick it again to use it as a collection picture.</p> : null}
        {!disabled && <Button type="button" size="sm" variant="outline" className="mt-1 bg-white" onClick={() => setOpen(true)}><Upload /> {value ? 'Change' : 'Pick from store media'}</Button>}
      </div>
      {open && <PickMedia accept={accept} onClose={() => setOpen(false)} onPick={(m) => { setOpen(false); onChange(m); }} />}
    </div>
  );
};

/* The editor */

/** What must be filled before saving, in words (the server checks again). */
function problemOf(c: CanvasInput, o: CanvasOptions): string {
  if (!c.name.trim()) return 'Give it a name.';
  if (!c.elements.length) return 'Add at least one element.';
  for (let i = 0; i < c.elements.length; i += 1) {
    const e = c.elements[i];
    const at = `Element ${i + 1} (${o.elements.find((x) => x.key === e.type)?.label ?? e.type})`;
    if (e.type === 'header' && i !== 0) return 'The header goes first.';
    if (e.type === 'footer' && i !== c.elements.length - 1) return 'The footer button goes last.';
    if (['header', 'photo', 'video'].includes(e.type) && !e.media) return `${at}: pick a file from store media.`;
    if (e.type === 'carousel' && (e.items ?? []).length < 2) return `${at}: a carousel takes at least 2 pictures.`;
    if (['text', 'button', 'footer'].includes(e.type) && !(e.text ?? '').trim()) return `${at}: write its words.`;
    if (['button', 'footer'].includes(e.type) && !isLink(e.link)) return `${at}: type the link it opens, starting with https://`;
    if (e.link && !isLink(e.link)) return `${at}: the link must start with https://`;
    if (e.type === 'product_set' && !(e.product_set_id ?? '').trim()) return `${at}: type the product set id.`;
  }
  return '';
}

const blank = (): CanvasInput => ({ name: '', template: null, background_color: null, elements: [] });
const inputOf = (c: Canvas): CanvasInput => ({
  name: c.name, template: c.template ?? null, background_color: c.background_color ?? null,
  elements: (c.elements ?? []).map(({ meta_id: _m, children: _c, ...e }) => e),
});

export const CanvasEditor: React.FC<{ initial?: Canvas | null; onClose: () => void; onSaved: (c: Canvas) => void }> = ({ initial, onClose, onSaved }) => {
  const { toast } = useToast();
  const optsQ = useLoad(() => metaCanvasApi.options(), []);
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [c, setC] = useState<CanvasInput>(initial ? inputOf(initial) : blank());
  const [addType, setAddType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refusal, setRefusal] = useState<string | null>(initial?.build_error ?? null);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplNote, setTplNote] = useState<string[]>([]);
  const o = optsQ.data;
  const readOnly = !!initial && (initial.status === 'published' || initial.source === 'meta');

  const set = (i: number, patch: Partial<CanvasElement>) => setC((cur) => ({ ...cur, elements: cur.elements.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const move = (i: number, by: -1 | 1) => setC((cur) => {
    const els = [...cur.elements];
    const j = i + by;
    if (j < 0 || j >= els.length) return cur;
    [els[i], els[j]] = [els[j], els[i]];
    return { ...cur, elements: els };
  });
  const remove = (i: number) => setC((cur) => ({ ...cur, elements: cur.elements.filter((_, j) => j !== i) }));
  const add = (type: string) => setC((cur) => {
    const e: CanvasElement = { type, items: type === 'carousel' ? [] : undefined };
    const els = [...cur.elements];
    if (type === 'header') return { ...cur, elements: [e, ...els.filter((x) => x.type !== 'header')] };
    if (type === 'footer') return { ...cur, elements: [...els.filter((x) => x.type !== 'footer'), e] };
    const footer = els.length && els[els.length - 1].type === 'footer';
    if (footer) els.splice(els.length - 1, 0, e); else els.push(e);
    return { ...cur, elements: els };
  });

  const applyTemplate = async (key: string) => {
    setC((cur) => ({ ...cur, template: key || null }));
    setTplNote([]);
    if (!key) return;
    setTplBusy(true);
    try {
      const t = await metaCanvasApi.template(key);
      if (t.elements.length) setC((cur) => ({ ...cur, template: key, elements: t.elements.map((e) => ({ type: e.type, name: e.name ?? null, items: e.type === 'carousel' ? [] : undefined })) }));
      setTplNote([
        ...(t.note ? [t.note] : []),
        ...(t.error ? [`Meta did not send the template's layout: ${t.error}`] : []),
        ...t.unsupported.map((u) => `${u.name ?? humanize(u.meta_type)} is left out: ${u.why ?? 'not made here.'}`),
      ]);
    } catch (e) { setTplNote([writeError(e, "Meta's layout of the template could not be read.")]); }
    finally { setTplBusy(false); }
  };

  const save = async () => {
    if (!o) return;
    const p = problemOf(c, o);
    if (p) { setError(p); return; }
    setBusy(true); setError('');
    try {
      const out = savedId ? await metaCanvasApi.update(savedId, c) : await metaCanvasApi.create(c);
      setSavedId(out.id);
      if (out.build_error) {
        setRefusal(`${out.build_failed_step ? `${humanize(out.build_failed_step)}: ` : ''}${out.build_error}`);
        return;
      }
      toast({ title: `${out.name} saved`, description: out.mock ? 'Sample mode: nothing was sent to Meta.' : 'On Meta, not published yet.' });
      onSaved(out);
    } catch (e) { setError(writeError(e, 'It was not saved.')); }
    finally { setBusy(false); }
  };

  const typeOf = (k: string) => o?.elements.find((x) => x.key === k);
  const styles = (type: string): string[] => {
    if (!o) return [];
    if (type === 'photo') return o.styles.photo;
    if (type === 'video') return o.styles.video;
    if (type === 'carousel') return o.styles.carousel;
    if (type === 'button' || type === 'footer') return o.styles.button;
    return [];
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{readOnly ? initial?.name : initial ? 'Change the Instant Experience' : 'New Instant Experience'}</DialogTitle>
          <DialogDescription>
            {readOnly ? 'Published: Meta keeps it as it is. Make a new one to change it.' : 'A full screen page that opens from your ad. It is made on your Facebook Page unpublished; it is published when you publish it or create a campaign that opens it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {optsQ.error && !o ? <LoadFailure failure={optsQ.error} what="The Instant Experience options (GET /api/v2/marketing/meta/ads/canvases/options) are not served yet." onRetry={optsQ.reload} />
            : !o ? <p className="text-sm text-gray-500">Loading...</p> : (
              <>
                {o.mock && <Lead tone="info" title="Sample mode">{o.mock_reason ?? 'Nothing is sent to Meta.'}</Lead>}
                {refusal && <Lead tone="bad" title="Meta refused it">{refusal} Fix it and save again.</Lead>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor="cv-name">Name</Label>
                    <Input id="cv-name" value={c.name} maxLength={o.limits.name} onChange={(e) => setC({ ...c, name: e.target.value })} className="mt-1" disabled={readOnly} placeholder="For example Diwali wellness hampers" />
                    <p className="mt-1 text-xs text-gray-500">Only you see it, in the list and in Meta's tools.</p>
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cv-tpl">Start from</Label>
                    <select id="cv-tpl" value={c.template ?? ''} disabled={readOnly || tplBusy} onChange={(e) => applyTemplate(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                      <option value="">Blank</option>
                      {o.templates.map((t) => <option key={t.key} value={t.key}>{t.label}{t.needs_catalog ? ' (needs the catalog)' : ''}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">{tplBusy ? "Reading Meta's layout..." : "A template of Meta's sets the elements in its order; you fill each one."}</p>
                  </div>
                </div>
                {tplNote.length > 0 && <Lead tone="info" title="About this template"><ul className="list-disc space-y-0.5 pl-5">{tplNote.map((t, i) => <li key={i}>{t}</li>)}</ul></Lead>}
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="cv-bg" className="shrink-0">Background colour</Label>
                  <input id="cv-bg" type="color" value={hexOf(c.background_color, '#ffffff')} disabled={readOnly} onChange={(e) => setC({ ...c, background_color: e.target.value })} className="h-8 w-12 rounded border bg-white" />
                  {c.background_color && !readOnly && <button type="button" className={`${linkCls} text-xs`} onClick={() => setC({ ...c, background_color: null })}>Meta's default (white)</button>}
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-900">Elements <span className="font-normal text-gray-500">({c.elements.length} of {o.limits.elements}, in the order they show)</span></p>
                  <p className="text-xs text-gray-500">{o.collection_rule}</p>
                  <ol className="mt-2 space-y-2">
                    {c.elements.map((e, i) => {
                      const t = typeOf(e.type);
                      const has = (f: string) => (t?.fields ?? []).includes(f);
                      return (
                        <li key={i} className="rounded-md border bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 text-sm font-medium text-gray-900"><span className="mr-1 text-gray-500">{i + 1}.</span>{t?.label ?? humanize(e.type)}{e.name ? <span className="font-normal text-gray-500">, {e.name}</span> : null}</p>
                            {!readOnly && (
                              <div className="flex items-center gap-1">
                                <button type="button" aria-label={`Move element ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                <button type="button" aria-label={`Move element ${i + 1} down`} disabled={i === c.elements.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                                <button type="button" aria-label={`Remove element ${i + 1}`} onClick={() => remove(i)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            )}
                          </div>
                          {t?.help && <p className="text-xs text-gray-500">{t.help}</p>}
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            {has('media') && <div className="sm:col-span-2"><MediaField value={e.media} accept={e.type === 'video' ? 'video' : 'image'} disabled={readOnly} onChange={(m) => set(i, { media: m })} /></div>}
                            {has('items') && (
                              <div className="sm:col-span-2">
                                <p className="text-xs font-medium text-gray-700">Pictures ({(e.items ?? []).length} of {o.limits.carousel_items})</p>
                                <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
                                  {(e.items ?? []).map((m, j) => (
                                    <li key={`${m.gallery_id}-${j}`} className="relative">
                                      <MediaThumb m={m} />
                                      {!readOnly && <button type="button" aria-label={`Remove picture ${j + 1}`} onClick={() => set(i, { items: (e.items ?? []).filter((_, k) => k !== j) })} className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-600 shadow hover:text-red-700"><X className="h-3 w-3" /></button>}
                                      {!(m.width && m.height) && <span className="absolute bottom-1 left-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">Size?</span>}
                                    </li>
                                  ))}
                                </ul>
                                {!readOnly && (e.items ?? []).length < o.limits.carousel_items && <CarouselAdd onAdd={(m) => set(i, { items: [...(e.items ?? []), m] })} />}
                              </div>
                            )}
                            {has('text') && (
                              <div className="sm:col-span-2">
                                <Label htmlFor={`cv-text-${i}`} className="text-xs">Words</Label>
                                {e.type === 'text'
                                  ? <Textarea id={`cv-text-${i}`} rows={3} value={e.text ?? ''} maxLength={o.limits.text} disabled={readOnly} onChange={(ev) => set(i, { text: ev.target.value })} className="mt-1" />
                                  : <Input id={`cv-text-${i}`} value={e.text ?? ''} maxLength={o.limits.button} disabled={readOnly} onChange={(ev) => set(i, { text: ev.target.value })} className="mt-1" placeholder="For example Shop the hampers" />}
                              </div>
                            )}
                            {has('link') && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-link-${i}`} className="text-xs">Link it opens{e.type === 'button' || e.type === 'footer' ? '' : ' (optional)'}</Label>
                                <Input id={`cv-link-${i}`} value={e.link ?? ''} inputMode="url" placeholder="https://" disabled={readOnly} onChange={(ev) => set(i, { link: ev.target.value || null })} className="mt-1" />
                              </div>
                            )}
                            {has('style') && styles(e.type).length > 0 && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-style-${i}`} className="text-xs">Style</Label>
                                <select id={`cv-style-${i}`} value={e.style ?? ''} disabled={readOnly} onChange={(ev) => set(i, { style: ev.target.value || null })} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                                  <option value="">Meta's default</option>
                                  {styles(e.type).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                                </select>
                              </div>
                            )}
                            {has('align') && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-align-${i}`} className="text-xs">Alignment</Label>
                                <select id={`cv-align-${i}`} value={e.align ?? ''} disabled={readOnly} onChange={(ev) => set(i, { align: ev.target.value || null })} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
                                  <option value="">Meta's default (centre)</option>
                                  {o.styles.align.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                                </select>
                              </div>
                            )}
                            {has('font_size') && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-size-${i}`} className="text-xs">Text size</Label>
                                <Input id={`cv-size-${i}`} type="number" min={8} max={72} value={e.font_size ?? ''} placeholder="15" disabled={readOnly} onChange={(ev) => set(i, { font_size: ev.target.value ? Number(ev.target.value) : null })} className="mt-1" />
                              </div>
                            )}
                            {(has('color') || has('text_color')) && (
                              <div className="flex min-w-0 flex-wrap items-end gap-3">
                                {has('color') && <ColourField id={`cv-color-${i}`} label={e.type === 'button' || e.type === 'footer' ? 'Button colour' : 'Background'} value={e.color} disabled={readOnly} onChange={(v) => set(i, { color: v })} />}
                                {has('text_color') && <ColourField id={`cv-tcolor-${i}`} label="Text colour" value={e.text_color} disabled={readOnly} onChange={(v) => set(i, { text_color: v })} />}
                              </div>
                            )}
                            {has('product_set_id') && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-ps-${i}`} className="text-xs">Product set id (Catalog on Meta, Product sets)</Label>
                                <Input id={`cv-ps-${i}`} value={e.product_set_id ?? ''} inputMode="numeric" disabled={readOnly} onChange={(ev) => set(i, { product_set_id: ev.target.value.trim() || null })} className="mt-1 font-mono" />
                              </div>
                            )}
                            {has('max_items') && (
                              <div className="min-w-0">
                                <Label htmlFor={`cv-max-${i}`} className="text-xs">Most products shown</Label>
                                <Input id={`cv-max-${i}`} type="number" min={1} max={50} value={e.max_items ?? ''} placeholder="50" disabled={readOnly} onChange={(ev) => set(i, { max_items: ev.target.value ? Number(ev.target.value) : null })} className="mt-1" />
                              </div>
                            )}
                            {has('show_in_feed') && (
                              <label className="flex items-center gap-2 text-sm"><Switch checked={!!e.show_in_feed} disabled={readOnly} onCheckedChange={(v) => set(i, { show_in_feed: v })} /> Show these products under the ad</label>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {!readOnly && c.elements.length < o.limits.elements && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select aria-label="Element to add" value={addType} onChange={(e) => setAddType(e.target.value)} className="h-9 min-w-0 rounded-md border bg-white px-2 text-sm">
                        <option value="">Add an element</option>
                        {o.elements.filter((t) => !(t.key === 'header' && c.elements.some((x) => x.type === 'header')) && !(t.key === 'footer' && c.elements.some((x) => x.type === 'footer')))
                          .map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <Button type="button" size="sm" variant="outline" disabled={!addType} onClick={() => { add(addType); setAddType(''); }}><Plus /> Add</Button>
                    </div>
                  )}
                </div>
              </>
            )}
        </div>
        <DialogFooter className="flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-red-700" role="alert">{error}</p>
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && <Button onClick={save} disabled={busy || !o}>{busy && <Loader2 className="animate-spin" />} {savedId ? 'Save changes' : 'Save'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CarouselAdd: React.FC<{ onAdd: (m: CanvasMedia) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="mt-2 bg-white" onClick={() => setOpen(true)}><Plus /> Add a picture</Button>
      {open && <PickMedia accept="image" onClose={() => setOpen(false)} onPick={(m) => { setOpen(false); onAdd(m); }} />}
    </>
  );
};

const ColourField: React.FC<{ id: string; label: string; value: string | null | undefined; disabled?: boolean; onChange: (v: string | null) => void }> = ({ id, label, value, disabled, onChange }) => (
  <div>
    <Label htmlFor={id} className="text-xs">{label}</Label>
    <div className="mt-1 flex items-center gap-1.5">
      <input id={id} type="color" value={hexOf(value, '#ffffff')} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border bg-white" />
      {value && !disabled && <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => onChange(null)}>Default</button>}
    </div>
  </div>
);

/* Creative library: the list */

export const CanvasesSection: React.FC<{ canAct: boolean }> = ({ canAct }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaCanvasApi.list(), []);
  const [editing, setEditing] = useState<Canvas | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<Canvas | null>(null);
  const [confirming, setConfirming] = useState<{ c: Canvas; act: 'publish' | 'discard' } | null>(null);
  const [busy, setBusy] = useState(false);
  const items = q.data?.items ?? [];
  const refused = items.filter((c) => c.build_error || c.publish_error);

  const act = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      if (confirming.act === 'publish') { await metaCanvasApi.publish(confirming.c.id); toast({ title: `${confirming.c.name} published` }); }
      else { await metaCanvasApi.discard(confirming.c.id); toast({ title: `${confirming.c.name} discarded` }); }
      setConfirming(null); await q.reload();
    } catch (e) { toast({ title: confirming.act === 'publish' ? 'Meta did not publish it' : 'Not discarded', description: writeError(e, 'Nothing changed.'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {q.data?.mock && <Lead tone="info" title="Sample mode">{q.data.mock_reason ?? 'Nothing is sent to Meta.'}</Lead>}
      {refused.length > 0 && (
        <Lead tone="bad" title={`Meta refused ${plural(refused.length, 'Instant Experience')}`}>
          <ul className="list-disc space-y-0.5 pl-5">{refused.map((c) => <li key={c.id} className="break-words"><b>{c.name}:</b> {c.build_error ?? c.publish_error}</li>)}</ul>
          <p className="mt-1">Open it, fix what Meta named and save again.</p>
        </Lead>
      )}
      {(q.data?.errors ?? []).map((e, i) => <Lead key={i} tone="warn" title="The Page's other Instant Experiences could not be read">{e.error}</Lead>)}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-gray-600">{q.data?.page ? <>Made on the Facebook Page <b>{q.data.page.name ?? q.data.page.id}</b>.</> : 'Made on the Facebook Page picked on the Meta connection.'} An ad to your site can open one instead of the page; a collection ad without the catalog needs one.</p>
        {canAct && <Button size="sm" onClick={() => setEditing('new')}><Plus /> New Instant Experience</Button>}
      </div>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Instant Experiences (GET /api/v2/marketing/meta/ads/canvases) are not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading...</p>
          : !items.length ? <p className="text-sm text-gray-600">None yet. Make one from your store's pictures, or start from one of Meta's templates.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => <CanvasCard key={c.id} c={c} canAct={canAct} onPreview={() => setPreviewing(c)} onEdit={() => setEditing(c)} onPublish={() => setConfirming({ c, act: 'publish' })} onDiscard={() => setConfirming({ c, act: 'discard' })} />)}
            </ul>
          )}
      {editing && <CanvasEditor initial={editing === 'new' ? null : editing} onClose={() => { setEditing(null); q.reload(); }} onSaved={() => { setEditing(null); q.reload(); }} />}
      {previewing && <CanvasPreviewDialog canvas={previewing} onClose={() => setPreviewing(null)} />}
      {confirming && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirming(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{confirming.act === 'publish' ? 'Publish it?' : 'Discard it?'}</DialogTitle>
              <DialogDescription className="break-words">{confirming.c.name}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-gray-800">{confirming.act === 'publish'
              ? 'Meta keeps a published Instant Experience as it is: it cannot be changed afterwards. Ads can open it once published. Publishing spends nothing.'
              : 'It is set aside here. Meta deletes no Instant Experience: the unpublished copy stays unused on your Page.'}</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button variant={confirming.act === 'discard' ? 'destructive' : 'default'} onClick={act} disabled={busy}>{busy && <Loader2 className="animate-spin" />} {confirming.act === 'publish' ? 'Publish' : 'Discard'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const CanvasCard: React.FC<{ c: Canvas; canAct: boolean; onPreview: () => void; onEdit: () => void; onPublish: () => void; onDiscard: () => void }> = ({ c, canAct, onPreview, onEdit, onPublish, onDiscard }) => {
  const pic = firstPicture(c);
  const ours = c.source !== 'meta';
  const draft = ours && c.status === 'draft';
  return (
    <li className="flex min-w-0 gap-3 rounded-lg border bg-white p-3">
      <div className="w-16 shrink-0 sm:w-20">
        <span className="relative block aspect-[4/5] w-full overflow-hidden rounded border bg-gray-100">
          {pic ? <img src={pic} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="absolute inset-0 m-auto h-5 w-5 text-gray-400" />}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words text-sm font-medium text-gray-900">{c.name}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <CanvasStatus c={c} />
          {c.collection_ready === true && <StateChip tone="good">Fits a collection</StateChip>}
        </div>
        <p className="text-[11px] text-gray-500">
          {ours ? `${plural((c.elements ?? []).length, 'element')}` : 'Made in Meta\'s tools'}
          {when(c.published_at ?? c.updated_at) ? `, ${c.published_at ? 'published' : 'saved'} ${when(c.published_at ?? c.updated_at)}` : ''}
        </p>
        {c.collection_ready === false && c.collection_note && <p className="text-[11px] text-amber-800">Not for a collection yet: {c.collection_note}</p>}
        <div className="flex flex-wrap gap-1 pt-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onPreview}><Eye /> Preview</Button>
          {canAct && ours && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}><Pencil /> {draft ? 'Edit' : 'View'}</Button>}
          {canAct && draft && c.meta_canvas_id && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onPublish}>Publish</Button>}
          {canAct && draft && <Button size="sm" variant="ghost" className="h-7 px-2 text-red-700" onClick={onDiscard}><Trash2 /> Discard</Button>}
          {c.canvas_link && <Button size="sm" variant="ghost" className="h-7 px-2" asChild><a href={c.canvas_link} target="_blank" rel="noreferrer"><ExternalLink /> Meta</a></Button>}
        </div>
      </div>
    </li>
  );
};

/* Create ad: the step's picker */

export const CanvasPicker: React.FC<{
  value: string;
  /** The collection format: the Instant Experience must fit a collection. */
  forCollection: boolean;
  /** No "open the page" choice (a collection without the catalog needs one). */
  required: boolean;
  /** The page the ad opens otherwise. */
  pageLink?: string;
  canAct: boolean;
  onChange: (id: string, c: Canvas | null) => void;
}> = ({ value, forCollection, required, pageLink, canAct, onChange }) => {
  const q = useLoad(() => metaCanvasApi.list(), []);
  const [editing, setEditing] = useState<Canvas | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<Canvas | null>(null);
  const items = useMemo(() => (q.data?.items ?? []).filter((c) => c.status !== 'discarded'), [q.data]);
  const usable = (c: Canvas) => !forCollection || c.collection_ready !== false;
  const picked = items.find((c) => c.id === value) ?? null;
  useEffect(() => { if (value && q.data && !picked) onChange('', null); }, [value, q.data, picked, onChange]);

  return (
    <div className="space-y-3">
      {q.data?.mock && <Lead tone="info" title="Sample mode">{q.data.mock_reason ?? 'Nothing is sent to Meta.'}</Lead>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-gray-700">{forCollection ? 'The collection opens this. Its first photo or video is the cover; four more of its pictures show under the cover.' : 'Optional: tapping the ad opens this full screen page on Facebook or Instagram instead of your web page.'}</p>
        {canAct && <Button size="sm" variant="outline" onClick={() => setEditing('new')}><Plus /> New Instant Experience</Button>}
      </div>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="Instant Experiences (GET /api/v2/marketing/meta/ads/canvases) are not served yet." onRetry={q.reload} />
        : !q.data ? <p className="text-sm text-gray-500">Loading...</p> : (
          <div className="space-y-2">
            {!required && (
              <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', !value && 'border-gray-900 ring-1 ring-gray-900')}>
                <input type="radio" className="mt-1" checked={!value} onChange={() => onChange('', null)} />
                <span className="min-w-0"><span className="block font-medium">No Instant Experience</span><span className="block break-all text-xs text-gray-600">The ad opens {pageLink || 'your web page'}.</span></span>
              </label>
            )}
            {!items.length && <p className="text-sm text-gray-600">None made yet. Make one from your store's pictures.</p>}
            {items.map((c) => {
              const ok = usable(c);
              return (
                <div key={c.id} className={cn('flex flex-wrap items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm', value === c.id && 'border-gray-900 ring-1 ring-gray-900', !ok && 'opacity-70')}>
                  <label className={cn('flex min-w-0 flex-1 items-start gap-2', ok ? 'cursor-pointer' : 'cursor-not-allowed')}>
                    <input type="radio" className="mt-1" disabled={!ok} checked={value === c.id} onChange={() => onChange(c.id, c)} />
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{c.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5"><CanvasStatus c={c} />{forCollection && c.collection_ready === true && <StateChip tone="good">Fits a collection</StateChip>}</span>
                      {!ok && c.collection_note && <span className="mt-0.5 block text-xs text-amber-800">{c.collection_note}</span>}
                      {forCollection && c.collection_ready === null && <span className="mt-0.5 block text-xs text-gray-500">{c.collection_note}</span>}
                      {c.source !== 'meta' && c.status === 'draft' && value === c.id && <span className="mt-0.5 block text-xs text-gray-600">Not published yet: creating the campaign publishes it, and Meta keeps it as it is from then on.</span>}
                    </span>
                  </label>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPreviewing(c)}><Eye /> Preview</Button>
                    {canAct && c.source !== 'meta' && c.status === 'draft' && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(c)}><Pencil /> Edit</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {editing && (
        <CanvasEditor initial={editing === 'new' ? null : editing} onClose={() => { setEditing(null); q.reload(); }}
          onSaved={async (c) => { setEditing(null); await q.reload(); if (!forCollection || c.collection_ready !== false) onChange(c.id, c); }} />
      )}
      {previewing && <CanvasPreviewDialog canvas={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
};
