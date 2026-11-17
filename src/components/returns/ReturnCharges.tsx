import React, { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { inrMinor } from '../../components/erp';
import { formatDateTime } from '../../utils/date';
import { majorToMinor } from '../../lib/v2/money';

/**
 * WHAT THE CUSTOMER BEARS ON A RETURN (RET-PICKUP-2, owner 17 Nov 2026: "add to manually add return charges from
 * customer"). Each charge is a label, an amount in paise and a note, kept on the return with who added it and when;
 * settling refunds or credits the goods credit less the charges (`POST /returns/{id}/settle/preview` shows it).
 * The labels offered are the store's (`/returns/meta` `charge_labels`, Settings: returnsDesk.chargeLabels); staff may
 * type another. Once the return is settled the list is read only.
 */

export interface ReturnCharge {
  id: string;
  label: string;
  amount_minor: number;
  note?: string | null;
  added_by?: string | null;
  added_at?: string | null;
  tax_treatment?: string | null;
}

interface Props {
  returnId: string;
  charges?: ReturnCharge[] | null;
  totalMinor?: number | null;
  /** The store's labels (`charge_labels`). */
  labels?: string[] | null;
  /** Add and remove are offered (returns.manage, return not settled or closed). */
  editable: boolean;
  /** A charge was added or removed: read the return again. */
  onChanged?: () => void;
  /** Said under the list when nothing can be changed (settled, closed). */
  lockedNote?: string;
}

const OTHER = '__other__';
const MAX_LABEL = 80;

const ReturnCharges: React.FC<Props> = ({ returnId, charges, totalMinor, labels, editable, onChanged, lockedNote }) => {
  const list = (charges ?? []).filter((c) => c && c.id);
  const offered = (labels ?? []).filter((l) => typeof l === 'string' && l.trim());
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [typed, setTyped] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const label = (pick === OTHER || offered.length === 0 ? typed : pick).trim();
  const minor = majorToMinor(amount);
  const problem = !label ? 'Choose or type what the charge is for.'
    : label.length > MAX_LABEL ? `Keep the label to ${MAX_LABEL} characters.`
    : minor === null || minor <= 0 ? 'Enter an amount above zero, in rupees.'
    : '';

  const reset = () => { setOpen(false); setPick(''); setTyped(''); setAmount(''); setNote(''); setError(''); };

  const add = async () => {
    if (problem) { setError(problem); return; }
    setBusy('add'); setError('');
    try {
      await api.post(`/returns/${returnId}/charges`, { label, amount_minor: minor, note: note.trim() || undefined });
      reset();
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not add this charge.');
    } finally { setBusy(''); }
  };

  const remove = async (c: ReturnCharge) => {
    if (!confirm(`Remove the charge "${c.label}" of ${inrMinor(c.amount_minor)}?`)) return;
    setBusy(c.id); setError('');
    try {
      await api.post(`/returns/${returnId}/charges/${c.id}/delete`, {});
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not remove this charge.');
    } finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No charges on this return.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {list.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium break-words">{c.label}</p>
                {c.note && <p className="text-xs text-muted-foreground mt-0.5 break-words">{c.note}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {[c.added_by ? `Added by ${c.added_by}` : 'Added', c.added_at ? formatDateTime(c.added_at) : null].filter(Boolean).join(', ')}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums whitespace-nowrap">{inrMinor(c.amount_minor)}</span>
              {editable && (
                <button type="button" onClick={() => remove(c)} disabled={!!busy} aria-label={`Remove ${c.label}`}
                        className="h-7 w-7 rounded-md border border-border hover:bg-muted inline-flex items-center justify-center disabled:opacity-50">
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/40">
            <span className="text-sm font-medium">Total charges</span>
            <span className="text-sm font-semibold tabular-nums">
              {inrMinor(totalMinor ?? list.reduce((s, c) => s + Number(c.amount_minor || 0), 0))}
            </span>
          </div>
        </div>
      )}

      {editable && !open && (
        <button type="button" onClick={() => setOpen(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add a charge
        </button>
      )}
      {editable && open && (
        <div className="rounded-lg border border-border p-3 grid sm:grid-cols-2 gap-2">
          {offered.length > 0 && (
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="What the charge is for"
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">What is it for?</option>
              {offered.map((l) => <option key={l} value={l}>{l}</option>)}
              <option value={OTHER}>Something else (type it)</option>
            </select>
          )}
          {(pick === OTHER || offered.length === 0) && (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={MAX_LABEL}
                   placeholder="What the charge is for" aria-label="What the charge is for"
                   className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          )}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                 placeholder="Amount in rupees" aria-label="Amount in rupees"
                 className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Note (optional)" aria-label="Note"
                 className="sm:col-span-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
            <button type="button" onClick={add} disabled={busy === 'add' || !!problem}
                    className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">
              {busy === 'add' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add charge
            </button>
            <button type="button" onClick={reset} className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted">
              Cancel
            </button>
            {problem && <span className="text-xs text-muted-foreground">{problem}</span>}
          </div>
        </div>
      )}
      {!editable && lockedNote && <p className="text-xs text-muted-foreground">{lockedNote}</p>}
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</p>
      )}
    </div>
  );
};

export default ReturnCharges;
