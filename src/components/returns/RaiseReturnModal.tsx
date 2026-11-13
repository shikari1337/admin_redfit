import React, { useMemo, useRef, useState } from 'react';
import { X, Loader2, AlertTriangle, Search, Camera, Trash2, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inrMinor } from '../../components/erp';
import { formatDate } from '../../utils/date';

/**
 * RAISE A RETURN FOR A CUSTOMER: the desk's half of the shopper's return form, for a customer who
 * phoned, wrote or walked in (`POST /api/v2/commerce/returns`, `returns.manage`).
 *
 * It reads the same eligibility the shop's form reads (one resolver on the server: window, units
 * still returnable, the line's net price) and never computes money: every amount shown is the
 * server's. A request the policy refuses can still be raised, but only as a recorded exception with
 * a reason, which the server keeps on the return.
 */

interface EligLine {
  order_item_id: string;
  sku?: string | null;
  name?: string | null;
  qty_ordered: number;
  qty_already_returned: number;
  qty_returnable: number;
  eligible_amount_minor?: number | null;
}

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
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState('');
  const [resolution, setResolution] = useState('');
  const [mode, setMode] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reasons: any[] = meta?.returnReasons ?? meta?.return_reasons ?? [];
  const allResolutions: any[] = meta?.resolutions ?? [];
  const modes: any[] = meta?.modes ?? [];
  const maxPhotos = Number(meta?.limits?.photosPerRequest ?? meta?.limits?.photos_per_request ?? MAX_PHOTOS_FALLBACK);

  const reason = reasons.find((r) => r.code === reasonCode) ?? null;
  const photoRequired = !!(reason?.photo_required ?? reason?.photoRequired);
  // The outcomes this reason offers first (the server's list), else every outcome.
  const offered = useMemo(() => {
    const codes: string[] | null = Array.isArray(reason?.resolutions) && reason.resolutions.length ? reason.resolutions : null;
    return codes ? allResolutions.filter((o) => codes.includes(o.code) || o.code === 'undecided') : allResolutions;
  }, [reason, allResolutions]);

  const lines: EligLine[] = elig?.lines ?? [];
  const returnable = lines.filter((l) => Number(l.qty_returnable) > 0);
  const chosen = returnable.filter((l) => (qty[l.order_item_id] ?? 0) > 0);
  const refused = !!elig && elig.eligible === false;

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const ref = orderRef.trim();
    if (!ref) { setError('Enter the order number.'); return; }
    setChecking(true); setError(''); setElig(null); setQty({}); setOverride(false); setOverrideReason('');
    try {
      const d = payload<any>(await api.get(`/returns/eligibility/${encodeURIComponent(ref)}`));
      setElig(d);
      // One line: it is the one coming back. Several: the desk picks.
      const open = (d?.lines ?? []).filter((l: EligLine) => Number(l.qty_returnable) > 0);
      if (open.length === 1) setQty({ [open[0].order_item_id]: Number(open[0].qty_returnable) });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not find that order.');
    } finally { setChecking(false); }
  };

  const setLineQty = (l: EligLine, n: number) =>
    setQty((q) => ({ ...q, [l.order_item_id]: Math.max(0, Math.min(Number(l.qty_returnable), n)) }));

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

  const problems: string[] = [];
  if (elig) {
    if (chosen.length === 0) problems.push('Choose at least one item and how many are coming back.');
    if (!reasonCode) problems.push('Choose the reason.');
    if (photoRequired && photos.length === 0) problems.push('This reason needs at least one photo of the item.');
    if (refused && !override) problems.push('The policy refuses this return. Raise it as an exception, with the reason, or close.');
    if (refused && override && !overrideReason.trim()) problems.push('Say why this exception is being made.');
  }

  const submit = async () => {
    if (problems.length > 0) { setError(problems[0]); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/returns', {
        order: elig?.order_id || elig?.order_number || orderRef.trim(),
        reasonCode,
        // Left open is said as such: an absent outcome is read by the server as a refund.
        resolution: resolution || 'undecided',
        returnMode: mode || undefined,
        notes: notes.trim() || undefined,
        photos: photos.length ? photos : undefined,
        items: chosen.map((l) => ({ orderItemId: l.order_item_id, quantity: qty[l.order_item_id] })),
        overrideWindow: refused && override ? true : undefined,
        overrideReason: refused && override ? overrideReason.trim() : undefined,
      });
      onRaised(payload<any>(res));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not raise this return.');
    } finally { setBusy(false); }
  };

  const windowLine = (() => {
    if (!elig) return null;
    const closes = elig.window_closes_at ? formatDate(elig.window_closes_at, 'dd MMM yyyy') : null;
    if (elig.window_state === 'within' && closes) return `Return window open until ${closes} (${elig.window_days} days from delivery).`;
    if (elig.window_state === 'expired' && closes) return `Return window closed on ${closes} (${elig.window_days} days from delivery).`;
    return `Not delivered yet, so the ${elig.window_days}-day window has not started.`;
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

              {refused && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 text-sm space-y-2">
                  <p className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{elig.reason}</span>
                  </p>
                  {returnable.length > 0 && (
                    <>
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)}
                               className="h-3.5 w-3.5 mt-0.5 accent-primary" />
                        <span>Raise it anyway as an exception. The reason is kept on the return.</span>
                      </label>
                      {override && (
                        <textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                                  placeholder="Why this exception is being made"
                                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none text-foreground
                                             focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* What is coming back */}
              <div>
                <p className="text-sm font-medium mb-2">What is coming back?</p>
                {returnable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing on this order can still be returned.</p>
                ) : (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {returnable.map((l) => {
                      const n = qty[l.order_item_id] ?? 0;
                      return (
                        <div key={l.order_item_id} className="flex items-center gap-3 p-2.5 flex-wrap">
                          <span className="flex-1 min-w-[10rem]">
                            <span className="block text-sm">{l.name ?? l.sku ?? 'Item'}</span>
                            <span className="block text-xs text-muted-foreground">
                              <span className="font-mono">{l.sku}</span>
                              {' '}{l.qty_returnable} of {l.qty_ordered} returnable
                              {l.eligible_amount_minor != null && <>, worth up to {inrMinor(Number(l.eligible_amount_minor))}</>}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <button type="button" aria-label="Fewer" onClick={() => setLineQty(l, n - 1)}
                                    className="h-8 w-8 rounded-md border border-border hover:bg-muted">-</button>
                            <span className="w-8 text-center text-sm font-semibold tabular-nums">{n}</span>
                            <button type="button" aria-label="More" onClick={() => setLineQty(l, n + 1)}
                                    className="h-8 w-8 rounded-md border border-border hover:bg-muted">+</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Why, and what they want */}
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block font-medium mb-1">Reason</span>
                  <select value={reasonCode}
                          onChange={(e) => {
                            setReasonCode(e.target.value);
                            const def = reasons.find((r) => r.code === e.target.value);
                            const first = Array.isArray(def?.resolutions) ? def.resolutions[0] : '';
                            if (first) setResolution(first);
                          }}
                          className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
                    <option value="">Choose a reason</option>
                    {reasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}{(r.photo_required ?? r.photoRequired) ? ' (photo needed)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
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
                    Photos {photoRequired ? <span className="text-destructive">(needed for this reason)</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
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
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border bg-muted/30 sticky bottom-0">
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
