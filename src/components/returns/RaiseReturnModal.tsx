import React, { useRef, useState } from 'react';
import { X, Loader2, AlertTriangle, Search, Camera, Trash2, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inrMinor } from '../../components/erp';
import { formatDate } from '../../utils/date';
import { ReturnTermsLine, outcomeOf, type EligibleLine as EligLine } from './ReturnTerms';

/**
 * RAISE A RETURN FOR A CUSTOMER: the desk's half of the shopper's return form, for a customer who
 * phoned, wrote or walked in (`POST /api/v2/commerce/returns`, `returns.manage`).
 *
 * It reads the same eligibility the shop's form reads (one resolver on the server: each item's
 * return policy and window, units still returnable, the line's net price) and never computes money
 * or windows: every amount and date shown is the server's. A request the policy refuses (DEC-086:
 * an item not returnable, replaceable or refundable, or past its window) can still be raised, but
 * only as a recorded exception with a reason, which the server keeps on the return and on the
 * order's activity with the person who raised it.
 *
 * RET-PICKUP-2 (owner 17 Nov 2026: "add option to select iteams ... add option to add photos for return, make it
 * mandatory"): every line of the order is listed; the desk ticks the ones coming back, sets how many (1 to the
 * line's `qty_returnable`) and the reason for each. A line with nothing returnable is shown, greyed, with the
 * server's reason. Photos follow the store's photo rule (`photo_policy` on the eligibility answer, else
 * `/returns/meta`): while it is required, the return cannot be raised with fewer than `min_photos`.
 */

interface Photo { url: string; mime?: string | null; type?: string | null; bytes?: number | null }

interface Props {
  meta: any;
  onClose: () => void;
  onRaised: (doc: any) => void;
}

const MAX_PHOTOS_FALLBACK = 8;

const RaiseReturnModal: React.FC<Props> = ({ meta, onClose, onRaised }) => {
  const [orderRef, setOrderRef] = useState('');
  const [checking, setChecking] = useState(false);
  const [elig, setElig] = useState<any>(null);
  /** Units coming back per ticked line (a line is ticked while it is above 0). */
  const [qty, setQty] = useState<Record<string, number>>({});
  /** The reason per ticked line (`/returns/meta` return_reasons codes). */
  const [lineReason, setLineReason] = useState<Record<string, string>>({});
  /** A stricter photo minimum the server named when it refused (422 `photos_required`). */
  const [serverMinPhotos, setServerMinPhotos] = useState(0);
  const [resolution, setResolution] = useState('');
  const [mode, setMode] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** The server refused the request in words this screen did not foresee: the desk may still raise it as an exception. */
  const [serverRefusal, setServerRefusal] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reasons: any[] = meta?.returnReasons ?? meta?.return_reasons ?? [];
  const allResolutions: any[] = meta?.resolutions ?? [];
  const modes: any[] = meta?.modes ?? [];
  const maxPhotos = Number(meta?.limits?.photosPerRequest ?? meta?.limits?.photos_per_request ?? MAX_PHOTOS_FALLBACK);

  const reasonOf = (code?: string | null) => reasons.find((r) => r.code === code) ?? null;

  const lines: EligLine[] = elig?.lines ?? [];
  const returnable = lines.filter((l) => Number(l.qty_returnable) > 0);
  const chosen = returnable.filter((l) => (qty[l.order_item_id] ?? 0) > 0);
  const chosenReasons = chosen.map((l) => reasonOf(lineReason[l.order_item_id]));
  const reasonCode = chosen.map((l) => lineReason[l.order_item_id]).find((c) => !!c) ?? '';
  // The outcomes the chosen reasons offer first (the server's lists), else every outcome.
  const offeredCodes = new Set<string>(chosenReasons.flatMap((r) => (Array.isArray(r?.resolutions) ? r.resolutions : [])));
  const offered = offeredCodes.size
    ? allResolutions.filter((o) => offeredCodes.has(o.code) || o.code === 'undecided')
    : allResolutions;

  // Photos: the store's rule for this order (the strictest of its items' policies), else the store default;
  // a reason that asks for a photo needs at least one; the server's own minimum when it refused.
  const policy = elig?.photo_policy ?? elig?.photoPolicy ?? meta?.photo_policy ?? meta?.photoPolicy ?? null;
  const policyMin = policy?.required ? Math.max(0, Number(policy.min_photos ?? policy.minPhotos ?? 1) || 0) : 0;
  const reasonNeedsPhoto = chosenReasons.some((r) => !!(r?.photo_required ?? r?.photoRequired));
  const minPhotos = Math.max(policyMin, reasonNeedsPhoto ? 1 : 0, serverMinPhotos);
  const photosShort = Math.max(0, minPhotos - photos.length);
  // What the server will refuse, in its own words: the order's reason, then each chosen item's
  // for the outcome asked (left open = decided after checking the goods). The server judges again
  // when the return is raised; this only lets the desk give its reason first.
  const asked = resolution || 'undecided';
  const lineRefusals = chosen
    .map((l) => {
      const o = outcomeOf(l, asked);
      return o && !o.open && o.reason ? `${l.name ?? l.sku ?? 'Item'}: ${o.reason}` : null;
    })
    .filter((x): x is string => !!x);
  const orderRefused = !!elig && elig.eligible === false;
  const refused = orderRefused || lineRefusals.length > 0 || !!serverRefusal;

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const ref = orderRef.trim();
    if (!ref) { setError('Enter the order number.'); return; }
    setChecking(true); setError(''); setServerRefusal(''); setElig(null); setQty({}); setLineReason({}); setServerMinPhotos(0);
    setOverride(false); setOverrideReason('');
    try {
      const d = payload<any>(await api.get(`/returns/eligibility/${encodeURIComponent(ref)}`));
      setElig(d);
      // One line: it is the one coming back. Several: the desk ticks.
      const open = (d?.lines ?? []).filter((l: EligLine) => Number(l.qty_returnable) > 0);
      if (open.length === 1) setQty({ [open[0].order_item_id]: Number(open[0].qty_returnable) });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not find that order.');
    } finally { setChecking(false); }
  };

  /** A ticked line keeps 1 to its returnable units; unticking is the checkbox. */
  const setLineQty = (l: EligLine, n: number) =>
    setQty((q) => ({ ...q, [l.order_item_id]: Math.max(1, Math.min(Number(l.qty_returnable), n)) }));

  /** Tick: every returnable unit is coming back (the usual case), with the reason last chosen; untick: none. */
  const toggleLine = (l: EligLine, on: boolean) => {
    const id = l.order_item_id;
    setQty((q) => ({ ...q, [id]: on ? Number(l.qty_returnable) : 0 }));
    if (on && !lineReason[id]) {
      const last = chosen.map((c) => lineReason[c.order_item_id]).filter(Boolean).pop();
      if (last) setLineReason((r) => ({ ...r, [id]: last }));
    }
  };

  const pickReason = (l: EligLine, code: string) => {
    setLineReason((r) => ({ ...r, [l.order_item_id]: code }));
    // The reason's first outcome, while the desk has not chosen one.
    const first = Array.isArray(reasonOf(code)?.resolutions) ? reasonOf(code).resolutions[0] : '';
    if (first && !resolution) setResolution(first);
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true); setError('');
    try {
      const room = Math.max(0, maxPhotos - photos.length);
      const added: Photo[] = [];
      for (const f of Array.from(files).slice(0, room)) {
        const fd = new FormData();
        fd.append('file', f);
        const p = payload<any>(await api.post('/returns/photos', fd));
        if (p?.url) added.push({ url: p.url, mime: p.mime ?? null, type: p.type ?? 'image', bytes: p.bytes ?? null });
      }
      setPhotos((ps) => [...ps, ...added]);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'That photo could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** "Add 2 more photos of the item. This store asks for at least 3 on a return." */
  const photoSentence = photosShort > 0
    ? `Add ${photosShort} more photo${photosShort === 1 ? '' : 's'} of the item. ${
      minPhotos === policyMin || minPhotos === serverMinPhotos
        ? `This store asks for at least ${minPhotos} on a return.`
        : 'The reason chosen needs a photo.'}`
    : '';

  const problems: string[] = [];
  if (elig) {
    if (chosen.length === 0) problems.push('Tick at least one item and say how many are coming back.');
    if (chosen.some((l) => !lineReason[l.order_item_id])) problems.push('Choose the reason for each ticked item.');
    if (photoSentence) problems.push(photoSentence);
    if (refused && !override) problems.push('The policy refuses this return. Raise it as an exception, with the reason, or close.');
    if (refused && override && !overrideReason.trim()) problems.push('Say why this exception is being made.');
  }

  const submit = async () => {
    if (problems.length > 0) { setError(problems[0]); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/returns', {
        order: elig?.order_id || elig?.order_number || orderRef.trim(),
        // The return's own reason: the first ticked item's; each item carries its own below.
        reasonCode,
        // Left open is said as such: an absent outcome is read by the server as a refund.
        resolution: resolution || 'undecided',
        returnMode: mode || undefined,
        notes: notes.trim() || undefined,
        photos: photos.length ? photos : undefined,
        items: chosen.map((l) => ({
          orderItemId: l.order_item_id,
          quantity: qty[l.order_item_id],
          reasonCode: lineReason[l.order_item_id],
        })),
        overrideWindow: refused && override ? true : undefined,
        overrideReason: refused && override ? overrideReason.trim() : undefined,
      });
      onRaised(payload<any>(res));
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data?.message || err?.message || 'Could not raise this return.';
      // 422 `photos_required` (RET-PICKUP-2 §1): fewer photos than the store's rule. Said in words, never
      // taken for a policy refusal (that one the desk may override as an exception).
      const photosRefused = data?.details?.code === 'photos_required' || /photos_required$/.test(String(data?.code ?? ''));
      if (err?.response?.status === 422 && photosRefused) {
        const n = Number(data?.details?.min_photos ?? data?.details?.minPhotos);
        if (Number.isFinite(n) && n > 0) setServerMinPhotos(n);
        setError(Number.isFinite(n) && n > 0
          ? `The return was not raised: this store needs at least ${n} photo${n === 1 ? '' : 's'} of the item, and ${photos.length} ${photos.length === 1 ? 'is' : 'are'} attached. Add the rest and raise it again.`
          : msg);
        return;
      }
      // 422: the policy refuses it (DEC-086). The desk can raise it as an exception, with its reason.
      if (err?.response?.status === 422 && !(refused && override)) setServerRefusal(msg);
      setError(msg);
    } finally { setBusy(false); }
  };

  const windowLine = (() => {
    if (!elig) return null;
    const closes = elig.window_closes_at ? formatDate(elig.window_closes_at, 'dd MMM yyyy') : null;
    if (elig.window_state === 'within' && closes) return `The order's last return window is open until ${closes} (${elig.window_days} days from delivery). Each item's own terms are below.`;
    if (elig.window_state === 'expired' && closes) return `Every return window on this order closed by ${closes} (${elig.window_days} days from delivery).`;
    return 'Not delivered yet, so no return window has started.';
  })();

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" /> Raise a return
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              For a customer who asked by phone, message or at the counter.
            </p>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground hover:text-foreground p-1" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Which order */}
          <form onSubmit={check} className="flex gap-2">
            <input
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              placeholder="Order number"
              aria-label="Order number"
              autoFocus
              className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button type="submit" disabled={checking || !orderRef.trim()}
                    className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Check
            </button>
          </form>

          {elig && (
            <>
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">
                  Order <span className="font-mono">{elig.order_number}</span>
                  <span className="text-muted-foreground font-normal">, {String(elig.order_status ?? '').replace(/_/g, ' ')}</span>
                </p>
                {windowLine && <p className="text-xs text-muted-foreground mt-1">{windowLine}</p>}
                {(elig.existing_returns ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Already raised on this order: {(elig.existing_returns as any[]).map((r) => r.return_number ?? String(r.id ?? '').slice(0, 8)).join(', ')}.
                  </p>
                )}
              </div>

              {/* What is coming back: every line of the order; tick the ones coming back, how many, and why. */}
              <div>
                <p className="text-sm font-medium mb-2">What is coming back?</p>
                {returnable.length === 0 && (
                  <p className="text-sm text-muted-foreground mb-2">Nothing on this order can still be returned.</p>
                )}
                {lines.length > 0 && (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {lines.map((l) => {
                      const id = l.order_item_id;
                      const canTick = Number(l.qty_returnable) > 0;
                      const n = qty[id] ?? 0;
                      const ticked = canTick && n > 0;
                      const why = l.reason
                        ?? (Number(l.qty_already_returned) >= Number(l.qty_ordered)
                          ? 'Every unit of this item is already in a return.'
                          : 'Nothing on this line can be returned.');
                      return (
                        <div key={id} className={`p-2.5 ${canTick ? '' : 'opacity-60'}`}>
                          <div className="flex items-start gap-3 flex-wrap">
                            <input type="checkbox" checked={ticked} disabled={!canTick}
                                   onChange={(e) => toggleLine(l, e.target.checked)}
                                   aria-label={`Return ${l.name ?? l.sku ?? 'this item'}`}
                                   className="h-4 w-4 mt-0.5 accent-primary disabled:cursor-not-allowed" />
                            <span className="flex-1 min-w-[10rem]">
                              <span className="block text-sm">{l.name ?? l.sku ?? 'Item'}</span>
                              <span className="block text-xs text-muted-foreground">
                                <span className="font-mono">{l.sku}</span>
                                {' '}{l.qty_returnable} of {l.qty_ordered} not yet in a return
                                {canTick && l.eligible_amount_minor != null && <>, worth up to {inrMinor(Number(l.eligible_amount_minor))}</>}
                              </span>
                              {canTick
                                ? <span className="block mt-1.5"><ReturnTermsLine line={l} /></span>
                                : <span className="block mt-1 text-xs text-amber-700 dark:text-amber-300">{why}</span>}
                            </span>
                            {ticked && (
                              <span className="inline-flex items-center gap-1">
                                <button type="button" aria-label="Fewer" onClick={() => setLineQty(l, n - 1)} disabled={n <= 1}
                                        className="h-8 w-8 rounded-md border border-border hover:bg-muted disabled:opacity-40">-</button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums">{n}</span>
                                <button type="button" aria-label="More" onClick={() => setLineQty(l, n + 1)} disabled={n >= Number(l.qty_returnable)}
                                        className="h-8 w-8 rounded-md border border-border hover:bg-muted disabled:opacity-40">+</button>
                              </span>
                            )}
                          </div>
                          {ticked && (
                            <label className="block mt-2 ml-7 text-sm">
                              <span className="sr-only">Reason for {l.name ?? l.sku ?? 'this item'}</span>
                              <select value={lineReason[id] ?? ''} onChange={(e) => pickReason(l, e.target.value)}
                                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                                <option value="">Why is it coming back?</option>
                                {reasons.map((r) => (
                                  <option key={r.code} value={r.code}>
                                    {r.label}{(r.photo_required ?? r.photoRequired) ? ' (photo needed)' : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* What they want, and how it comes back */}
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm sm:col-span-2">
                  <span className="block font-medium mb-1">They want</span>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                    <option value="">Decide after checking the goods</option>
                    {offered.filter((o) => o.code !== 'undecided').map((o) => (
                      <option key={o.code} value={o.code}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block font-medium mb-1">How it comes back</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                    <option value="">Not decided yet</option>
                    {modes.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                  </select>
                </label>
              </div>

              {refused && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 text-sm space-y-2">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium">The return policy refuses this request.</p>
                      {orderRefused && elig.reason && <p>{elig.reason}</p>}
                      {lineRefusals.map((r) => <p key={r}>{r}</p>)}
                      {serverRefusal && lineRefusals.length === 0 && !orderRefused && <p>{serverRefusal}</p>}
                    </div>
                  </div>
                  {returnable.length > 0 && (
                    <>
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)}
                               className="h-3.5 w-3.5 mt-0.5 accent-primary" />
                        <span>
                          Raise it anyway as an exception. The reason is kept on the return, and the order&apos;s
                          activity records that you raised it.
                        </span>
                      </label>
                      {override && (
                        <textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                                  placeholder="Why this exception is being made (required)"
                                  aria-label="Why this exception is being made"
                                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none text-foreground
                                             focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-medium block mb-1.5" htmlFor="raise-notes">What the customer said (optional)</label>
                <textarea id="raise-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                          placeholder="In their words, as told to you"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                                     focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>

              {/* Evidence */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium">
                    Photos {minPhotos > 0
                      ? <span className="text-destructive">(at least {minPhotos} needed)</span>
                      : <span className="text-muted-foreground font-normal">(optional)</span>}
                  </span>
                  {photos.length < maxPhotos && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50">
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      Add photo
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
                         onChange={(e) => upload(e.target.files)} />
                </div>
                {photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {photos.map((p, i) => (
                      <span key={p.url} className="relative">
                        <img src={p.url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-md object-cover border border-border" />
                        <button type="button" aria-label="Remove photo"
                                onClick={() => setPhotos((ps) => ps.filter((x) => x.url !== p.url))}
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border border-border inline-flex items-center justify-center hover:bg-muted">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {photoSentence && <p className="text-xs text-destructive mt-1.5">{photoSentence}</p>}
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end items-center gap-2 p-5 border-t border-border bg-muted/30 sticky bottom-0 flex-wrap">
          {/* Why the button is off, in the open (the photos still needed, an item without a reason ...). */}
          {elig && problems.length > 0 && (
            <p className="mr-auto text-xs text-muted-foreground max-w-sm">{problems[0]}</p>
          )}
          <button onClick={onClose} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !elig || problems.length > 0}
                  title={problems[0]}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium
                             hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Raise return
          </button>
        </div>
      </div>
    </div>
  );
};

export default RaiseReturnModal;
