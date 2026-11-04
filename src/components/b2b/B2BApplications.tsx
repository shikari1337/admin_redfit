import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { b2bAPI, customersAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Loader2, Inbox, Check, X, Eye, Phone, ExternalLink } from 'lucide-react';
import { localeDate, localeDateTime } from '../../utils/date';
import { FilterChip, SearchBox } from '../sales/ListChrome';
import { ExportMenu, type CsvColumn } from '@/components/erp';

/** The applications on screen as a file. */
const APPLICATION_CSV: CsvColumn<any>[] = [
  { key: 'company_name', label: 'Company' },
  { key: 'business_type', label: 'Type' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'contact_phone', label: 'Phone' },
  { key: 'created_at', label: 'Applied' },
  { key: 'status', label: 'Status' },
  { key: 'tier_assigned', label: 'Tier' },
];

interface B2BApplication {
  id: string;
  customer_id: string;
  company_name: string;
  business_type?: string;
  gstin?: string;
  contact_phone?: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  tier_assigned?: string | null;
  credit_limit?: number;
  credit_days?: number;
  review_note?: string;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
  is_b2b?: boolean;
  current_tier?: string | null;
  current_credit_limit?: number | null;
}

/** The applicant's own account (GET /customers/:id), shown beside what they typed into the form. */
interface Applicant { name?: string; email?: string; phone?: string; dial_code?: string }

const STATUS_VARIANT: Record<string, string> = { pending: 'default', approved: 'success', rejected: 'destructive' };

const money = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
/** `retailer`, `dental_clinic` → "Retailer", "Dental clinic": the storefront form's value, readable. */
const humanize = (v?: string | null) => (v ? v.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

/** One label/value line of the detail panel. */
function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words text-ink ${mono ? 'font-mono text-xs leading-5' : ''}`}>{children ?? '—'}</dd>
    </div>
  );
}

export default function B2BApplications() {
  const [apps, setApps] = useState<B2BApplication[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tiers, setTiers] = useState<string[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [approving, setApproving] = useState<B2BApplication | null>(null);
  const [form, setForm] = useState({ tier: '', credit_limit: '0', credit_days: '0', note: '' });
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState<B2BApplication | null>(null);
  const [applicant, setApplicant] = useState<{ loading: boolean; data: Applicant | null; error: string | null }>({ loading: false, data: null, error: null });
  const [rejecting, setRejecting] = useState<B2BApplication | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await b2bAPI.getApplications(filter === 'all' ? undefined : filter);
      // src/lib/v2 hands the inbox over as the applications array with `counts` on it
      // (non-enumerable); `.items` / `.data` cover an unconverted `{items, counts}` answer.
      const list = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      setApps(Array.isArray(list) ? list : []);
      setCounts((res as any)?.counts ?? {});
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load applications');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  // Tier names come from the store B2B settings — the same list the pricing
  // waterfall (P4) reads, so an approved tier always resolves to a discount.
  useEffect(() => {
    b2bAPI.getSettings()
      .then((r) => setTiers(Object.keys(r?.tiers ?? r?.data?.tiers ?? {})))
      .catch(() => setTiers([]));
  }, []);

  // The form carries only what the applicant typed; who they are (name, email, login phone)
  // is their customer account.
  useEffect(() => {
    if (!viewing?.customer_id) { setApplicant({ loading: false, data: null, error: null }); return; }
    let live = true;
    setApplicant({ loading: true, data: null, error: null });
    customersAPI.getById(viewing.customer_id)
      .then((c: any) => { if (live) setApplicant({ loading: false, data: c?.customer ?? c ?? null, error: null }); })
      .catch((e: any) => {
        if (live) setApplicant({ loading: false, data: null, error: e?.response?.status === 403 ? 'Needs the Customers permission' : 'Could not load the account' });
      });
    return () => { live = false; };
  }, [viewing?.customer_id]);

  const openApprove = (a: B2BApplication) => {
    setApproving(a);
    setForm({
      tier: a.tier_assigned ?? a.current_tier ?? '',
      credit_limit: String(a.credit_limit ?? 0),
      credit_days: String(a.credit_days ?? 0),
      note: '',
    });
  };

  const doApprove = async () => {
    if (!approving) return;
    setSaving(true); setError(null);
    try {
      await b2bAPI.approveApplication(approving.id, {
        tier: form.tier || undefined,
        credit_limit: Number(form.credit_limit) || 0,
        credit_days: Number(form.credit_days) || 0,
        note: form.note || undefined,
      });
      setSuccess(`${approving.company_name} approved — B2B pricing is now live for them.`);
      setTimeout(() => setSuccess(null), 4000);
      setApproving(null);
      setViewing(null);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to approve');
    } finally { setSaving(false); }
  };

  const openReject = (a: B2BApplication) => { setRejecting(a); setRejectNote(''); };

  const doReject = async () => {
    if (!rejecting) return;
    setSaving(true); setError(null);
    try {
      await b2bAPI.rejectApplication(rejecting.id, rejectNote.trim() || undefined);
      setSuccess(`${rejecting.company_name}: application rejected.`);
      setTimeout(() => setSuccess(null), 3000);
      setRejecting(null);
      setViewing(null);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reject');
    } finally { setSaving(false); }
  };

  /** The actions an application allows in its state (table row and detail panel share them). */
  const actions = (a: B2BApplication, size: 'sm' | 'default' = 'sm') => (
    a.status === 'pending' ? (
      <>
        <Button size={size} onClick={() => openApprove(a)}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
        <Button size={size} variant="outline" onClick={() => openReject(a)}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
      </>
    ) : a.status === 'rejected' ? (
      // A reject can be reconsidered: approving flips the SAME application row to approved
      // (the backend has no status guard; same call as a fresh pending approval).
      <Button size={size} variant="outline" onClick={() => openApprove(a)}>
        <Check className="h-3.5 w-3.5 mr-1" />Approve anyway
      </Button>
    ) : null
  );

  const q = search.trim().toLowerCase();
  const shownApps = apps.filter((a) => !q || [a.company_name, a.gstin, a.contact_phone, a.business_type]
    .filter(Boolean).join(' ').toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Company, GSTIN or phone" label="Search applications" />
        <span className="text-sm tabular-nums text-ink-soft">{shownApps.length} of {apps.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu filename="b2b-applications" columns={APPLICATION_CSV} rows={shownApps} canExport />
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
          <FilterChip key={st} on={filter === st} tone={st === 'pending' ? 'warn' : st === 'rejected' ? 'bad' : undefined}
            count={st !== 'all' ? counts[st] : undefined} onClick={() => setFilter(st)}>
            <span className="capitalize">{st === 'all' ? 'All' : st}</span>
          </FilterChip>
        ))}
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shownApps.length === 0 && apps.length > 0 ? (
        <div className="rounded-md border border-dashed border-line p-10 text-center">
          <p className="text-sm font-medium text-ink">Nothing matches that search</p>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No {filter === 'all' ? '' : filter} applications.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Customers apply from the storefront at <code>/b2b-register</code>.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownApps.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setViewing(a)}>
                  <TableCell>
                    <div className="font-medium">{a.company_name}</div>
                    {a.message && <div className="text-xs text-muted-foreground max-w-xs truncate">{a.message}</div>}
                  </TableCell>
                  <TableCell>{humanize(a.business_type)}</TableCell>
                  <TableCell className="font-mono text-xs">{a.gstin || '—'}</TableCell>
                  <TableCell>{a.contact_phone || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {a.created_at ? localeDate(a.created_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={(STATUS_VARIANT[a.status] ?? 'outline') as any} className="capitalize">{a.status}</Badge>
                    {a.status === 'approved' && a.tier_assigned && (
                      <span className="ml-2 text-xs text-muted-foreground">tier: {a.tier_assigned}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(a)} aria-label={`View ${a.company_name}`}>
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      {actions(a) ?? <span className="text-xs text-muted-foreground">{a.is_b2b ? 'B2B active' : '—'}</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve {approving?.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Approving grants this customer B2B pricing for this store. The tier decides their
              discount when no product slab or contract applies.
            </p>
            <div className="space-y-2">
              <Label>Pricing tier</Label>
              <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                className="w-full h-9 px-2 border rounded-md text-sm bg-background">
                <option value="">— No tier (store default discount) —</option>
                {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {tiers.length === 0 && (
                <p className="text-xs text-amber-600">No tiers defined yet — add them in the “Tiers &amp; Plans” tab.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Credit limit (₹)</Label>
                <Input type="number" min="0" value={form.credit_limit}
                  onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Credit days</Label>
                <Input type="number" min="0" value={form.credit_days}
                  onChange={(e) => setForm((f) => ({ ...f, credit_days: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Internal note (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
            <Button onClick={doApprove} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Approve &amp; grant B2B
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {rejecting?.company_name}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="b2b-reject-note">Reason (optional)</Label>
            <Textarea id="b2b-reject-note" rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. GSTIN does not match the company name" />
            <p className="text-xs text-muted-foreground">Kept on the application. A rejected application can still be approved later.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doReject} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {viewing.company_name}
                  <Badge variant={(STATUS_VARIANT[viewing.status] ?? 'outline') as any} className="capitalize">{viewing.status}</Badge>
                </SheetTitle>
                <SheetDescription>
                  B2B application{viewing.created_at ? ` · applied ${localeDateTime(viewing.created_at)}` : ''}
                </SheetDescription>
              </SheetHeader>

              {actions(viewing, 'default') && (
                <div className="mt-4 flex flex-wrap gap-2">{actions(viewing, 'default')}</div>
              )}

              <div className="mt-5 space-y-5">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Form details</h3>
                  <dl className="divide-y divide-line">
                    <Field label="Company / practice">{viewing.company_name}</Field>
                    <Field label="Business type">{humanize(viewing.business_type)}</Field>
                    <Field label="GSTIN" mono>{viewing.gstin || '—'}</Field>
                    <Field label="Contact phone">
                      {viewing.contact_phone ? (
                        <a href={`tel:${viewing.contact_phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3.5 w-3.5" />{viewing.contact_phone}
                        </a>
                      ) : '—'}
                    </Field>
                    <Field label="Message">
                      {viewing.message ? <span className="whitespace-pre-wrap">{viewing.message}</span> : '—'}
                    </Field>
                    <Field label="Applied">{viewing.created_at ? localeDateTime(viewing.created_at) : '—'}</Field>
                    {viewing.updated_at && viewing.updated_at !== viewing.created_at && (
                      <Field label="Last updated">{localeDateTime(viewing.updated_at)}</Field>
                    )}
                  </dl>
                </section>

                <Separator />

                <section>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applicant account</h3>
                    <Link to={`/customers/${viewing.customer_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Open customer <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  {applicant.loading ? (
                    <div className="py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : applicant.error ? (
                    <p className="py-2 text-sm text-muted-foreground">{applicant.error}</p>
                  ) : (
                    <dl className="divide-y divide-line">
                      <Field label="Name">{applicant.data?.name || '—'}</Field>
                      <Field label="Email">{applicant.data?.email || '—'}</Field>
                      <Field label="Login phone">
                        {applicant.data?.phone ? `${applicant.data.dial_code ? `${applicant.data.dial_code} ` : ''}${applicant.data.phone}` : '—'}
                      </Field>
                    </dl>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Decision</h3>
                  {viewing.status === 'pending' ? (
                    <p className="py-2 text-sm text-muted-foreground">Waiting for a decision.</p>
                  ) : (
                    <dl className="divide-y divide-line">
                      <Field label="Status"><span className="capitalize">{viewing.status}</span></Field>
                      {viewing.status === 'approved' && (
                        <>
                          <Field label="Tier">{viewing.tier_assigned || 'Store default discount'}</Field>
                          <Field label="Credit limit">{money(viewing.credit_limit)}</Field>
                          <Field label="Credit days">{viewing.credit_days ?? 0}</Field>
                        </>
                      )}
                      <Field label="Note">{viewing.review_note ? <span className="whitespace-pre-wrap">{viewing.review_note}</span> : '—'}</Field>
                      <Field label="Decided">{viewing.reviewed_at ? localeDateTime(viewing.reviewed_at) : '—'}</Field>
                    </dl>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">B2B standing now</h3>
                  <dl className="divide-y divide-line">
                    <Field label="B2B pricing">{viewing.is_b2b ? 'Active' : 'Not active'}</Field>
                    <Field label="Current tier">{viewing.current_tier || '—'}</Field>
                    <Field label="Current credit">{viewing.current_credit_limit != null ? money(viewing.current_credit_limit) : '—'}</Field>
                  </dl>
                </section>

              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
