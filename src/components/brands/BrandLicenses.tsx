import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ScrollText, AlertTriangle } from 'lucide-react';
import { brandLicensesAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import CompanyPicker from './CompanyPicker';

/**
 * Who else is allowed to use this brand. (migration 165)
 *
 * A brand is intellectual property: its owner can license manufacturing,
 * distribution or trademark use to other companies, for a term and a territory.
 * Expired and terminated licences stay on the list deliberately — they are the
 * record you need when a chain is later disputed, which is the whole reason
 * this is a table and not a field.
 */

const LICENSE_TYPES: Array<[string, string]> = [
  ['manufacturing', 'Manufacturing'],
  ['distribution', 'Distribution'],
  ['exclusive_distribution', 'Exclusive distribution'],
  ['private_label', 'Private label'],
  ['trademark_use', 'Trademark use'],
  ['import', 'Import'],
  ['other', 'Other'],
];

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  expired: 'bg-amber-100 text-amber-800 border-amber-200',
  terminated: 'bg-rose-100 text-rose-800 border-rose-200',
};

const emptyDraft = {
  licensee_party_id: '' as string | null,
  license_type: 'distribution',
  territory: '',
  is_exclusive: false,
  starts_on: '',
  ends_on: '',
  royalty_pct: '',
  agreement_ref: '',
  notes: '',
};

export default function BrandLicenses({
  brandId, ownerPartyId, canManage,
}: { brandId: string | null; ownerPartyId: string | null; canManage: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ ...emptyDraft });

  const load = useCallback(async () => {
    if (!brandId) { setRows([]); return; }
    setLoading(true);
    try {
      const r = await brandLicensesAPI.list(brandId);
      setRows(Array.isArray(r) ? r : []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  // A licence needs a brand to hang off, and a brand needs saving first.
  if (!brandId) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        Save the brand first — a licence is granted on a brand that exists.
      </p>
    );
  }

  const save = async () => {
    if (!draft.licensee_party_id) { setError('Choose the company being granted the rights'); return; }
    setBusy(true); setError('');
    try {
      await brandLicensesAPI.create(brandId, {
        ...draft,
        // Default the licensor to the brand's owner: that is who normally grants
        // it, but it is stored explicitly because a sub-licence is granted by a
        // licensee and "who granted this" is the disputed question later.
        licensor_party_id: ownerPartyId || null,
        royalty_pct: draft.royalty_pct === '' ? null : Number(draft.royalty_pct),
      });
      setDraft({ ...emptyDraft });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save that licence');
    } finally { setBusy(false); }
  };

  const setStatus = async (id: string, status: string) => {
    setBusy(true);
    try { await brandLicensesAPI.update(id, { status }); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not update the licence'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this licence record?\n\nTerminating it instead keeps the history, which is usually what you want.')) return;
    setBusy(true);
    try { await brandLicensesAPI.remove(id); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not delete the licence'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading licences…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No licences recorded. Add one when another company is allowed to manufacture,
          distribute or use this brand.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((l) => (
            <div key={l.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{l.licensee_name || 'Unknown company'}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {LICENSE_TYPES.find(([v]) => v === l.license_type)?.[1] ?? l.license_type}
                  </Badge>
                  {l.is_exclusive && <Badge variant="outline" className="text-[10px]">Exclusive</Badge>}
                  <Badge className={`text-[10px] ${STATUS_STYLE[l.status] ?? ''}`} variant="outline">{l.status}</Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    {l.status === 'active' && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        disabled={busy} onClick={() => setStatus(l.id, 'terminated')}>
                        Terminate
                      </Button>
                    )}
                    {l.status !== 'active' && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        disabled={busy} onClick={() => setStatus(l.id, 'active')}>
                        Reactivate
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                      disabled={busy} onClick={() => remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {[
                  l.territory,
                  l.starts_on || l.ends_on ? `${l.starts_on || '—'} → ${l.ends_on || 'open'}` : null,
                  l.royalty_pct != null ? `${Number(l.royalty_pct)}% royalty` : null,
                  l.agreement_ref,
                  l.licensor_name ? `granted by ${l.licensor_name}` : null,
                ].filter(Boolean).join(' · ') || 'No terms recorded'}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && !adding && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" />Add a licence
        </Button>
      )}

      {canManage && adding && (
        <div className="space-y-3 rounded-md border p-3">
          <CompanyPicker
            label="Licensed to"
            hint="The company being granted rights to this brand."
            createRole="licensee"
            value={draft.licensee_party_id}
            onChange={(id) => setDraft({ ...draft, licensee_party_id: id })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rights granted</Label>
              <Select value={draft.license_type} onValueChange={(v) => setDraft({ ...draft, license_type: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LICENSE_TYPES.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Territory</Label>
              <Input className="h-9" placeholder="e.g. Karnataka & Kerala"
                value={draft.territory} onChange={(e) => setDraft({ ...draft, territory: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Starts</Label>
              <Input type="date" className="h-9" value={draft.starts_on}
                onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ends</Label>
              <Input type="date" className="h-9" value={draft.ends_on}
                onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Royalty %</Label>
              <Input type="number" step="0.001" min="0" className="h-9" placeholder="optional"
                value={draft.royalty_pct} onChange={(e) => setDraft({ ...draft, royalty_pct: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Agreement reference</Label>
              <Input className="h-9" placeholder="e.g. AGR/2026/001"
                value={draft.agreement_ref} onChange={(e) => setDraft({ ...draft, agreement_ref: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="lic-excl" checked={draft.is_exclusive}
              onCheckedChange={(v) => setDraft({ ...draft, is_exclusive: v })} />
            <Label htmlFor="lic-excl" className="text-xs">Exclusive in this territory</Label>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save licence
            </Button>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => { setAdding(false); setDraft({ ...emptyDraft }); setError(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
