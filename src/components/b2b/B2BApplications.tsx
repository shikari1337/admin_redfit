import { useEffect, useState } from 'react';
import { b2bAPI } from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Inbox, Check, X } from 'lucide-react';
import { localeDate } from '../../utils/date';

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
  created_at?: string;
  is_b2b?: boolean;
  current_tier?: string | null;
}

const STATUS_VARIANT: Record<string, string> = { pending: 'default', approved: 'success', rejected: 'destructive' };

export default function B2BApplications() {
  const [apps, setApps] = useState<B2BApplication[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tiers, setTiers] = useState<string[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [approving, setApproving] = useState<B2BApplication | null>(null);
  const [form, setForm] = useState({ tier: '', credit_limit: '0', credit_days: '0', note: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await b2bAPI.getApplications(filter === 'all' ? undefined : filter);
      // The admin axios interceptor unwraps { success, data } → the array, so
      // `res` is the applications array itself (with `counts` preserved as a
      // non-enumerable property). Fall back to res.data for the un-unwrapped shape.
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setApps(list);
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
      .then((r) => setTiers(Object.keys(r?.data?.tiers ?? {})))
      .catch(() => setTiers([]));
  }, []);

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
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to approve');
    } finally { setSaving(false); }
  };

  const doReject = async (a: B2BApplication) => {
    const note = window.prompt(`Reject ${a.company_name}? Optional reason:`);
    if (note === null) return;
    try {
      await b2bAPI.rejectApplication(a.id, note || undefined);
      setSuccess('Application rejected.');
      setTimeout(() => setSuccess(null), 3000);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reject');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <Button key={s} size="sm" variant={filter === s ? 'default' : 'outline'} onClick={() => setFilter(s)} className="capitalize">
            {s}{s !== 'all' && counts[s] != null ? ` (${counts[s]})` : ''}
          </Button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={load}>Refresh</Button>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-md text-sm">{success}</div>}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
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
              {apps.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.company_name}</div>
                    {a.message && <div className="text-xs text-muted-foreground max-w-xs truncate">{a.message}</div>}
                  </TableCell>
                  <TableCell className="capitalize">{a.business_type ?? '—'}</TableCell>
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
                  <TableCell className="text-right space-x-2">
                    {a.status === 'pending' ? (
                      <>
                        <Button size="sm" onClick={() => openApprove(a)}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => doReject(a)}><X className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : a.status === 'rejected' ? (
                      // A reject can be reconsidered — approving here flips the SAME
                      // application row back to approved (backend has no status guard,
                      // same call as a fresh pending approval).
                      <Button size="sm" variant="outline" onClick={() => openApprove(a)}>
                        <Check className="h-3.5 w-3.5 mr-1" />Approve anyway
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.is_b2b ? 'B2B active' : '—'}</span>
                    )}
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
    </div>
  );
}
