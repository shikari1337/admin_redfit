import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Tax Rules: the store's named GST rates, each with its HSN or SAC code.
 *
 * What the tax engine actually does with a rule (growcord-rs `apps/gst/core/src/rates.rs`): a line is
 * taxed at its variation's rule, else its product's rule, else the store default rate on GST Display.
 * Within the store's state the rate splits into CGST and SGST, half each; across states it is IGST.
 * A rule linked to an official rate code (Rate codes panel) follows the rate in force on the document's
 * date. Nothing else on a rule changes the tax, so this page edits only the name, rate, HSN or SAC and
 * whether it is in use (v2 `/api/v2/books/tax-rules`, Resource TAX_RULES).
 */

interface TaxRule {
  id: string;
  name: string;
  rate: number | string;
  is_active: boolean;
  hsn_code?: string | null;
  rule_code?: string | null;
  meta?: { hsn_code?: string | null } | null;
  /** On the record only (GET /tax/:id). */
  product_count?: number | string | null;
  variation_count?: number | string | null;
}

/**
 * The store's GST switch as the engine reads it (`apps/gst/core/src/settings.rs load`): an explicit
 * `enabled` wins, else GST is on when a default rate is set; and GST is never charged without a
 * positive default rate.
 */
interface GstDefaults { switchedOn: boolean; collecting: boolean; defaultRate: number | null }

const RATE_CODES_PATH = '/panel/accounting/rate-codes';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 5 as "5%", 2.5 as "2.5%", "18.00" as "18%". */
const pct = (v: unknown): string => {
  const n = num(v);
  return n === null ? 'Not set' : `${Math.round(n * 100) / 100}%`;
};

const hsnOf = (r: TaxRule): string => String(r.hsn_code ?? '').trim();

/** The split the engine computes from one rate. */
const splitText = (rate: unknown) => {
  const n = num(rate);
  if (n === null) return { within: 'Not set', across: 'Not set' };
  return { within: `CGST ${pct(n / 2)} + SGST ${pct(n / 2)}`, across: `IGST ${pct(n)}` };
};

const errText = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.message || fallback;

interface FormState { name: string; rate: string; hsn: string; isActive: boolean }
const EMPTY_FORM: FormState = { name: '', rate: '', hsn: '', isActive: true };

const TaxRules: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const { toast } = useToast();
  const canSeeRateCodes = canAccess('accounting') && hasPerm('gst.read');

  const [rules, setRules] = useState<TaxRule[]>([]);
  const [gst, setGst] = useState<GstDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit / create dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<TaxRule | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [toDelete, setToDelete] = useState<TaxRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rulesRes, gstRes] = await Promise.allSettled([
      api.get('/tax', { params: { limit: 200 } }),
      api.get('/settings/gst'),
    ]);
    if (rulesRes.status === 'fulfilled') {
      const d = rulesRes.value.data;
      setRules(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : []);
    } else {
      setError(errText(rulesRes.reason, 'The tax rules could not be loaded.'));
    }
    if (gstRes.status === 'fulfilled') {
      const g = gstRes.value.data ?? {};
      const rate = num(g.defaultRate);
      const switchedOn = typeof g.enabled === 'boolean' ? g.enabled : (rate ?? 0) > 0;
      setGst({ switchedOn, collecting: switchedOn && (rate ?? 0) > 0, defaultRate: rate });
    } else {
      setGst(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const active = rules.filter((r) => r.is_active);
    return {
      active: active.length,
      off: rules.length - active.length,
      noHsn: active.filter((r) => !hsnOf(r)).length,
    };
  }, [rules]);

  const openCreate = () => {
    setEditId(null);
    setDetail(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = async (rule: TaxRule) => {
    setEditId(rule.id);
    setDetail(null);
    setForm({ name: rule.name ?? '', rate: num(rule.rate) === null ? '' : String(num(rule.rate)), hsn: hsnOf(rule), isActive: rule.is_active !== false });
    setFormError(null);
    setOpen(true);
    setDetailLoading(true);
    try {
      const res = await api.get(`/tax/${rule.id}`);
      const d: TaxRule = res.data ?? {};
      setDetail(d);
      // A rule saved by the old screen kept its HSN in `meta`; offer it so the save moves it to the column.
      const fromMeta = String(d.meta?.hsn_code ?? '').replace(/\D/g, '');
      if (!hsnOf(rule) && fromMeta) setForm((f) => (f.hsn ? f : { ...f, hsn: fromMeta }));
    } catch {
      // The counts are a warning, not a requirement: the dialog still edits the rule.
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const usedBy = useMemo(() => {
    const p = num(detail?.product_count) ?? 0;
    const v = num(detail?.variation_count) ?? 0;
    return { products: p, variations: v, any: p + v > 0 };
  }, [detail]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const rate = num(form.rate);
    if (!name) { setFormError('Give the rule a name.'); return; }
    if (rate === null || rate < 0 || rate > 100) { setFormError('Enter the GST rate as a percentage between 0 and 100.'); return; }
    const hsn = form.hsn.replace(/\s+/g, '');
    const payload = { name, rate, hsn_code: hsn || null, is_active: form.isActive };
    setSaving(true);
    setFormError(null);
    try {
      if (editId) await api.put(`/tax/${editId}`, payload);
      else await api.post('/tax', payload);
      setOpen(false);
      toast({ title: editId ? 'Tax rule saved' : 'Tax rule added', description: `${name}: ${pct(rate)}` });
      void load();
    } catch (err: any) {
      setFormError(errText(err, 'The tax rule could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/tax/${toDelete.id}`);
      toast({ title: 'Tax rule deleted', description: toDelete.name });
      setToDelete(null);
      void load();
    } catch (err: any) {
      setDeleteError(errText(err, 'The tax rule could not be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  const formSplit = splitText(form.rate);
  const defaultRateText = gst?.defaultRate !== null && gst?.defaultRate !== undefined ? pct(gst.defaultRate) : null;

  const officialCell = (r: TaxRule) => (r.rule_code
    ? <span className="text-sm">Follows <span className="font-mono">{r.rule_code}</span></span>
    : <span className="text-sm text-muted-foreground">Rate as typed</span>);

  const statusBadge = (r: TaxRule) => (r.is_active
    ? <Badge className="border border-green-200 bg-green-100 text-xs text-green-800">In use</Badge>
    : <Badge variant="secondary" className="text-xs">Switched off</Badge>);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Tax Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each rule is a GST rate with its HSN or SAC code. Pick a rule on each product; a product with
            no rule is taxed at the default rate on <Link to="/settings/gst" className="font-medium text-primary underline underline-offset-2">GST Display</Link>.
          </p>
        </div>
        <Button onClick={openCreate} className="w-full flex-shrink-0 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Add tax rule
        </Button>
      </div>

      {/* What to act on first */}
      {!loading && gst && !gst.collecting && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            {gst.switchedOn
              ? 'GST is switched on but the default rate is not set, so no GST is charged on any order, even under these rules.'
              : 'GST is not being collected, so these rules change nothing on orders yet.'}{' '}
            <Link to="/settings/gst" className="font-medium underline underline-offset-2">
              {gst.switchedOn ? 'Set the default rate in GST Display' : 'Switch it on in GST Display'}
            </Link>.
          </div>
        </div>
      )}
      {!loading && summary.noHsn > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            {summary.noHsn} rule{summary.noHsn === 1 ? '' : 's'} in use {summary.noHsn === 1 ? 'has' : 'have'} no HSN or SAC code.
            A tax invoice and the HSN summary of GSTR-1 need one; edit the rule to add it.
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">In use</div><div className="mt-1 text-xl font-semibold">{summary.active}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Without HSN or SAC</div><div className={`mt-1 text-xl font-semibold ${summary.noHsn ? 'text-amber-700' : ''}`}>{summary.noHsn}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Switched off</div><div className="mt-1 text-xl font-semibold">{summary.off}</div></CardContent></Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">No rule on a product</div>
              <div className={`mt-1 text-xl font-semibold ${defaultRateText ? '' : 'text-amber-700'}`}>{defaultRateText ?? 'Not set'}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : !error && rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No tax rules yet. Every product is taxed at the default rate{defaultRateText ? ` (${defaultRateText})` : ''}.
              Add a rule for each GST rate and HSN or SAC code you sell under.
            </p>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add tax rule</Button>
          </CardContent>
        </Card>
      ) : !error && (
        <>
          {/* Phone: one card per rule */}
          <div className="space-y-3 md:hidden">
            {rules.map((r) => {
              const s = splitText(r.rate);
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="text-lg font-semibold">{pct(r.rate)}</div>
                      </div>
                      {statusBadge(r)}
                    </div>
                    <div className="text-xs text-muted-foreground">Within the state: {s.within}</div>
                    <div className="text-xs text-muted-foreground">Across states: {s.across}</div>
                    <div className="text-xs">
                      HSN or SAC: {hsnOf(r) ? <span className="font-mono">{hsnOf(r)}</span> : <span className="text-amber-700">Not set</span>}
                    </div>
                    <div className="text-xs">{officialCell(r)}</div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => void openEdit(r)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                      <Button variant="outline" size="sm" className="text-destructive" aria-label={`Delete ${r.name}`} onClick={() => { setDeleteError(null); setToDelete(r); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Wider screens: one table */}
          <Card className="hidden shadow-sm md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="px-4 py-3">Rule</TableHead>
                    <TableHead className="px-4 py-3">Rate</TableHead>
                    <TableHead className="px-4 py-3">Within the state</TableHead>
                    <TableHead className="px-4 py-3">Across states</TableHead>
                    <TableHead className="px-4 py-3">HSN or SAC</TableHead>
                    <TableHead className="px-4 py-3">Official rate</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => {
                    const s = splitText(r.rate);
                    return (
                      <TableRow key={r.id} className="align-top">
                        <TableCell className="px-4 py-3 font-medium">{r.name}</TableCell>
                        <TableCell className="px-4 py-3 font-semibold">{pct(r.rate)}</TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">{s.within}</TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">{s.across}</TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {hsnOf(r) ? <span className="font-mono">{hsnOf(r)}</span> : <span className="text-amber-700">Not set</span>}
                        </TableCell>
                        <TableCell className="px-4 py-3">{officialCell(r)}</TableCell>
                        <TableCell className="px-4 py-3">{statusBadge(r)}</TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => void openEdit(r)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive" aria-label={`Delete ${r.name}`}
                              onClick={() => { setDeleteError(null); setToDelete(r); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {canSeeRateCodes && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium">When the government changes a GST rate</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Link a rule to its official rate code and every document takes the rate in force on its own date,
                without editing a product.
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="flex-shrink-0">
              <Link to={RATE_CODES_PATH}>Rate codes <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add / edit */}
      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit tax rule' : 'Add tax rule'}</DialogTitle>
            <DialogDescription>The rate and the code printed on invoices for every product under this rule.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {formError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tax-name">Name</Label>
              <Input id="tax-name" value={form.name} maxLength={255} placeholder="GST 5%, medicines"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tax-rate">GST rate (%)</Label>
                <Input id="tax-rate" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax-hsn">HSN or SAC</Label>
                <Input id="tax-hsn" inputMode="numeric" maxLength={8} className="font-mono" value={form.hsn} placeholder="3004"
                  onChange={(e) => setForm((f) => ({ ...f, hsn: e.target.value.replace(/\D/g, '') }))} />
                <p className="text-[11px] text-muted-foreground">4 to 8 digits, as on your invoices.</p>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <div>Within your state: {formSplit.within}</div>
              <div>To another state: {formSplit.across}</div>
            </div>
            {detail?.rule_code && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Linked to the official rate code <span className="font-mono">{detail.rule_code}</span>. With date-effective
                  rates on, documents use the rate in force on their date instead of the rate typed here.
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <Label htmlFor="tax-active" className="cursor-pointer">In use</Label>
                {editId && (
                  <p className="text-[11px] text-muted-foreground">
                    {detailLoading
                      ? 'Counting the products under this rule.'
                      : detail
                        ? `Taxed under it: ${usedBy.products} product${usedBy.products === 1 ? '' : 's'}, ${usedBy.variations} variation${usedBy.variations === 1 ? '' : 's'}.`
                        : 'How many products use it could not be read.'}
                  </p>
                )}
              </div>
              <Switch id="tax-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
            {editId && !form.isActive && usedBy.any && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Switched off, these products are taxed at the default rate
                  {defaultRateText ? ` (${defaultRateText})` : ''} until you give them another rule.
                </span>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</> : editId ? 'Save rule' : 'Add rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v && !deleting) setToDelete(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              A rule still on a product cannot be deleted: give those products another rule first, or switch this one off.
              Orders and invoices already raised keep the rate they were charged.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>Keep it</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaxRules;
