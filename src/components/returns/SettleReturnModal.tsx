import React, { useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, RefreshCw, Wallet, PackagePlus } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { inr } from '../../components/erp';

/**
 * SETTLE A RETURN — the one screen where a return turns into money or goods.
 *
 * Its job is to make the consequence legible BEFORE the button is pressed,
 * because all three outcomes are hard to walk back: a credit note is issued
 * (gapless number, GST reversed, posted), a refund request opens against the
 * store's real gateway account, and a replacement is a real order that will be
 * picked and shipped.
 *
 * It never computes money. Every figure shown comes from the return document's
 * own server-derived `eligible_amount_minor` — the customer's asking price is
 * displayed separately, and never as the payable amount.
 */

export type Resolution = 'refund' | 'replacement' | 'store_credit';

interface Line {
  id: string;
  sku?: string | null;
  name?: string | null;
  qty_received: number;
  qty_expected: number;
  resolution?: string | null;
  eligible_amount_minor?: string | number | null;
  variation_id?: string | null;
}

interface Props {
  returnDoc: any;
  onClose: () => void;
  onSettled: (result: any) => void;
}

const OPTIONS: Array<{
  code: Resolution; label: string; icon: React.ElementType; blurb: string; consequence: string;
}> = [
  {
    code: 'refund', label: 'Refund the customer', icon: RefreshCw,
    blurb: 'Send the money back to how they paid.',
    consequence:
      'A credit note is issued against the order and a refund request is opened. ' +
      'The money does not move until that refund is approved and sent.',
  },
  {
    code: 'replacement', label: 'Send a replacement', icon: PackagePlus,
    blurb: 'Ship the same goods again, at no charge.',
    consequence:
      'A credit note is issued against the original order and a NEW order is placed for the ' +
      'same items, already marked paid. Nothing is charged and no refund goes out.',
  },
  {
    code: 'store_credit', label: 'Keep it as store credit', icon: Wallet,
    blurb: 'Hold the value against their account.',
    consequence: 'A credit note is issued and held as credit. No cash moves and no refund opens.',
  },
];

const SettleReturnModal: React.FC<Props> = ({ returnDoc, onClose, onSettled }) => {
  const receivedLines: Line[] = useMemo(
    () => (returnDoc?.lines ?? []).filter((l: Line) => Number(l.qty_received) > 0),
    [returnDoc]);

  const [resolution, setResolution] = useState<Resolution>(
    ['refund', 'replacement', 'store_credit'].includes(returnDoc?.resolution)
      ? returnDoc.resolution : 'refund');
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(receivedLines.map((l) => [l.id, true])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chosenIds = receivedLines.filter((l) => selected[l.id]).map((l) => l.id);
  const chosenValue = receivedLines
    .filter((l) => selected[l.id])
    .reduce((s, l) => s + Number(l.eligible_amount_minor ?? 0), 0);

  const opt = OPTIONS.find((o) => o.code === resolution)!;
  const alreadySettled = !!returnDoc?.credit_note_id;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.post(`/returns/${returnDoc.id}/settle`, {
        resolution,
        lineIds: chosenIds.length === receivedLines.length ? null : chosenIds,
        settlement: resolution === 'refund' ? 'bank' : undefined,
        note: note.trim() || undefined,
      }, {
        // One credit note and possibly one order — a double-submit is the
        // expensive mistake here, so the request carries its own key.
        headers: { 'X-Idempotency-Key': `settle-${returnDoc.id}-${resolution}` },
      });
      onSettled(payload<any>(res));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not settle this return.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold">Settle this return</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {returnDoc?.return_number ?? returnDoc?.id?.slice(0, 8)} · order {returnDoc?.order_number ?? '—'}
            </p>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {alreadySettled && (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This return has already been settled (credit note raised). Settling again will be
                refused — raise a further credit note from the order itself if more is owed.
              </span>
            </div>
          )}

          {receivedLines.length === 0 ? (
            <div className="flex gap-2 p-3 rounded-lg bg-muted border border-border text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <span>
                No goods have been booked in against this return yet. Receive them first —
                nothing is owed for a parcel that has not arrived.
              </span>
            </div>
          ) : (
            <>
              {/* What the customer gets */}
              <div>
                <p className="text-sm font-medium mb-2">What does the customer get?</p>
                <div className="grid gap-2">
                  {OPTIONS.map((o) => {
                    const Icon = o.icon;
                    const on = resolution === o.code;
                    return (
                      <button
                        key={o.code}
                        type="button"
                        onClick={() => setResolution(o.code)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left transition
                          ${on ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                               : 'border-border hover:border-muted-foreground/40'}`}
                      >
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${on ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="flex-1">
                          <span className="block text-sm font-medium">{o.label}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{o.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Which lines */}
              <div>
                <p className="text-sm font-medium mb-2">
                  Which received items? <span className="text-muted-foreground font-normal">
                    ({chosenIds.length} of {receivedLines.length})
                  </span>
                </p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {receivedLines.map((l) => (
                    <label key={l.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={!!selected[l.id]}
                        onChange={() => setSelected((s) => ({ ...s, [l.id]: !s[l.id] }))}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{l.name ?? l.sku ?? 'Item'}</span>
                        <span className="block text-xs text-muted-foreground font-mono">{l.sku}</span>
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {l.qty_received} received
                      </span>
                      <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                        {inr(Number(l.eligible_amount_minor ?? 0))}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* The consequence, in words, before the button */}
              <div className="p-3 rounded-lg bg-muted/60 border border-border">
                <div className="flex items-baseline justify-between gap-4 mb-1.5">
                  <span className="text-sm font-medium">What will happen</span>
                  <span className="text-base font-semibold tabular-nums">{inr(chosenValue)}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.consequence}</p>
                {returnDoc?.claimed_amount_minor != null
                  && Number(returnDoc.claimed_amount_minor) !== chosenValue && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    The customer asked for{' '}
                    <span className="font-medium">{inr(Number(returnDoc.claimed_amount_minor))}</span>.
                    The figure above is what this order actually recorded for these items.
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Note (optional)</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the accounts team should know…"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border bg-muted/30 sticky bottom-0">
          <button onClick={onClose} disabled={busy}
                  className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || receivedLines.length === 0 || chosenIds.length === 0 || alreadySettled}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium
                       hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {resolution === 'replacement' ? 'Credit & send replacement'
              : resolution === 'store_credit' ? 'Issue store credit' : 'Credit & refund'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettleReturnModal;
