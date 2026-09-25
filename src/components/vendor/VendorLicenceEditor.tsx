import React from 'react';
import { Plus, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InfoTip from '../common/InfoTip';

/**
 * EVERY LICENCE A SUPPLIER HOLDS — a list, because they hold more than one.
 *
 * Owner (Prompt 7, P7.5): *"CIN, drug licence (MULTIPLE), FSSAI, other
 * licences."* A distributor carries a separate state drug licence for each
 * state it ships from, and 20B (wholesale) and 21B (retail) are two documents,
 * not one — so a single "Drug licence number" box could never hold the truth
 * and the purchase order printed only the first of them.
 *
 * The licence kinds come from the SERVER (`GET /vendors/terms/meta` →
 * `licenceTypes`), never a list typed here, so this editor and the validator
 * that will accept the save cannot disagree about what a kind is.
 */

export interface LicenceRow {
  type: string;
  number: string;
  label?: string | null;
  issued_by?: string | null;
  state?: string | null;
  valid_from?: string | null;
  valid_till?: string | null;
  /** Server-computed, read-only: days until it runs out. */
  daysLeft?: number | null;
  status?: 'valid' | 'expiring' | 'expired' | 'no_expiry';
}

export interface LicenceType { code: string; label: string; help?: string }

interface Props {
  rows: LicenceRow[];
  types: LicenceType[];
  /** False when this store has not had the migration yet — the editor says so. */
  available: boolean;
  onChange: (rows: LicenceRow[]) => void;
}

const blank = (type = 'drug_licence'): LicenceRow => ({
  type, number: '', label: '', issued_by: '', state: '', valid_from: '', valid_till: '',
});

/** Amber inside 60 days, red once it has gone — computed here for a row being typed. */
function expiryTone(validTill?: string | null): { tone: 'warn' | 'bad' | null; words: string } {
  if (!validTill) return { tone: null, words: '' };
  const days = Math.round((Date.parse(`${validTill}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days)) return { tone: null, words: '' };
  if (days < 0) return { tone: 'bad', words: `expired ${-days} day${-days === 1 ? '' : 's'} ago` };
  if (days <= 60) return { tone: 'warn', words: `expires in ${days} day${days === 1 ? '' : 's'}` };
  return { tone: null, words: '' };
}

const VendorLicenceEditor: React.FC<Props> = ({ rows, types, available, onChange }) => {
  const patch = (i: number, p: Partial<LicenceRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, blank(types[0]?.code ?? 'other')]);

  const kinds = types.length ? types : [{ code: 'other', label: 'Licence' }];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-ink-soft" /> Licences
            <InfoTip text="Every drug licence, FSSAI registration and certificate this supplier holds. All of them print on the purchase order, and one running out inside 60 days is flagged on the supplier list." />
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            Add one row per document — a supplier shipping from three states has three drug licences.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!available}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a licence
        </Button>
      </div>

      {!available && (
        <p className="flex items-start gap-1.5 rounded-md border border-warn bg-warn-bg px-3 py-2 text-xs text-warn-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This store has not been upgraded for more than one licence per supplier yet, so nothing here can be saved.
          Everything else on the page saves as usual.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-soft">
          No licences recorded. Nothing is printed on the purchase order until one is added.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const exp = expiryTone(r.valid_till);
            const border = exp.tone === 'bad' ? 'border-bad' : exp.tone === 'warn' ? 'border-warn' : 'border-line';
            return (
              <div key={i} className={`rounded-md border ${border} bg-surface p-3`}>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-6">
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">Kind</span>
                    <select
                      value={r.type}
                      disabled={!available}
                      onChange={(e) => patch(i, { type: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                    </select>
                    {kinds.find((k) => k.code === r.type)?.help && (
                      <span className="mt-1 block text-[11px] leading-snug text-ink-mute">
                        {kinds.find((k) => k.code === r.type)!.help}
                      </span>
                    )}
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">Number</span>
                    <Input value={r.number} disabled={!available} maxLength={60} className="h-9 font-mono"
                      onChange={(e) => patch(i, { number: e.target.value })} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">State</span>
                    <Input value={r.state ?? ''} disabled={!available} maxLength={60} className="h-9"
                      placeholder="e.g. Maharashtra"
                      onChange={(e) => patch(i, { state: e.target.value })} />
                  </label>
                  <div className="flex items-end justify-end">
                    <Button type="button" size="icon" variant="ghost" disabled={!available}
                      aria-label={`Remove licence ${i + 1}`}
                      className="h-9 w-9 text-bad" onClick={() => remove(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">Issued by</span>
                    <Input value={r.issued_by ?? ''} disabled={!available} maxLength={120} className="h-9"
                      placeholder="e.g. FDA Maharashtra" onChange={(e) => patch(i, { issued_by: e.target.value })} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">
                      Label <span className="font-normal text-ink-mute">(optional)</span>
                    </span>
                    <Input value={r.label ?? ''} disabled={!available} maxLength={80} className="h-9"
                      placeholder="e.g. 20B wholesale" onChange={(e) => patch(i, { label: e.target.value })} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">Valid from</span>
                    <Input type="date" value={r.valid_from ?? ''} disabled={!available} className="h-9"
                      onChange={(e) => patch(i, { valid_from: e.target.value })} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-medium text-ink-soft">Valid till</span>
                    <Input type="date" value={r.valid_till ?? ''} disabled={!available} className="h-9"
                      onChange={(e) => patch(i, { valid_till: e.target.value })} />
                  </label>
                </div>
                {exp.tone && (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs ${exp.tone === 'bad' ? 'text-bad-ink' : 'text-warn-ink'}`}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    This licence {exp.words}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default VendorLicenceEditor;
