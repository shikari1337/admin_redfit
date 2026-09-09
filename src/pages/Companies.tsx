import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Plus, Search, Building2, BadgeCheck, AlertTriangle, ArrowLeft, Archive, Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { companiesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ENTITY_TYPE_LABEL } from '../components/brands/CompanyPicker';

/**
 * Companies — admin ▸ Products ▸ Companies. (migration 165)
 *
 * The register of the legal entities behind the catalogue: brand owners,
 * manufacturers, licensees. A company here is a `parties` row with `kind='company'`
 * plus its `party_company` facet — the SAME row the CRM uses — so a brand owner
 * that later becomes a client or a seller gains a role rather than a second
 * record. That is the point of the whole design.
 */

const ROLE_LABEL: Record<string, string> = {
  brand_owner: 'Brand owner', manufacturer: 'Manufacturer', licensee: 'Licensee',
  vendor: 'Vendor', client: 'Client', customer: 'Customer', partner: 'Partner',
  prospect: 'Prospect', other: 'Other',
};

const emptyDraft = {
  display_name: '', legal_name: '', entity_type: '', cin: '', llpin: '', pan: '', tan: '',
  gstin: '', incorporation_date: '', roc_code: '', registry_status: '',
  website: '', authorised_signatory: '', phone: '', email: '', notes: '',
  is_verified: false,
  address_line: '', city: '', state: '', pincode: '',
};

export default function Companies() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const canManage = hasPerm('products.manage');

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [detail, setDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await companiesAPI.list({ search: q || undefined, limit: 200 });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setTotal(list.length);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load companies');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const openNew = () => {
    setEditingId(null); setDetail(null); setDraft({ ...emptyDraft }); setError(''); setOpen(true);
  };

  const openEdit = async (id: string) => {
    setEditingId(id); setError(''); setOpen(true); setDetail(null);
    try {
      const c = await companiesAPI.get(id);
      setDetail(c);
      const addr = c.registered_address || {};
      setDraft({
        display_name: c.display_name || '', legal_name: c.legal_name || '',
        entity_type: c.entity_type || '', cin: c.cin || '', llpin: c.llpin || '',
        pan: c.pan || '', tan: c.tan || '', gstin: c.gstin || '',
        incorporation_date: c.incorporation_date || '', roc_code: c.roc_code || '',
        registry_status: c.registry_status || '', website: c.website || '',
        authorised_signatory: c.authorised_signatory || '',
        phone: c.phone || '', email: c.email || '', notes: c.company_notes || '',
        is_verified: !!c.is_verified,
        address_line: addr.line || '', city: addr.city || '', state: addr.state || '', pincode: addr.pincode || '',
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load that company');
    }
  };

  const save = async () => {
    if (!draft.display_name.trim()) { setError('A company needs a name'); return; }
    setSaving(true); setError('');
    const payload: Record<string, any> = {
      display_name: draft.display_name.trim(),
      legal_name: draft.legal_name.trim() || null,
      entity_type: draft.entity_type || null,
      cin: draft.cin.trim() || null, llpin: draft.llpin.trim() || null,
      pan: draft.pan.trim() || null, tan: draft.tan.trim() || null,
      gstin: draft.gstin.trim() || null,
      incorporation_date: draft.incorporation_date || null,
      roc_code: draft.roc_code.trim() || null,
      registry_status: draft.registry_status.trim() || null,
      website: draft.website.trim() || null,
      authorised_signatory: draft.authorised_signatory.trim() || null,
      phone: draft.phone.trim() || null, email: draft.email.trim() || null,
      notes: draft.notes.trim() || null,
      is_verified: draft.is_verified,
      registered_address: {
        line: draft.address_line.trim() || undefined, city: draft.city.trim() || undefined,
        state: draft.state.trim() || undefined, pincode: draft.pincode.trim() || undefined,
      },
    };
    try {
      if (editingId) {
        await companiesAPI.update(editingId, payload);
        flash('Company updated');
      } else {
        const res = await companiesAPI.create(payload);
        flash(res.created === false
          ? `Matched the existing “${res.data?.display_name}” and updated it`
          : 'Company created');
      }
      setOpen(false);
      await load(search);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save that company');
    } finally { setSaving(false); }
  };

  const archive = async () => {
    if (!editingId) return;
    if (!confirm('Archive this company?\n\nIt stays in the records; it just stops appearing in pickers.')) return;
    setSaving(true);
    try {
      await companiesAPI.archive(editingId);
      flash('Company archived');
      setOpen(false);
      await load(search);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not archive that company');
    } finally { setSaving(false); }
  };

  const field = (k: keyof typeof emptyDraft, label: string, props: Record<string, any> = {}) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" value={draft[k] as string}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} {...props} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/products/brands')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />Brands
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Companies</h1>
            <p className="text-xs text-muted-foreground">
              The legal entities behind your catalogue — brand owners, manufacturers and licensees.
              The same record becomes a client or a seller later by gaining a role, never by being retyped.
            </p>
          </div>
        </div>
        {canManage && <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Add company</Button>}
      </div>

      {error && !open && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{total} {total === 1 ? 'company' : 'companies'}</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-9 pl-8" placeholder="Search name, CIN or GSTIN…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No companies yet. Add one here, or create it straight from a brand's Ownership tab.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Acts as</TableHead>
                  <TableHead className="text-right">Brands</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openEdit(c.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{c.display_name}</span>
                            {c.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                            {c.is_active === false && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                          </div>
                          {c.legal_name && c.legal_name !== c.display_name && (
                            <div className="truncate text-[11px] text-muted-foreground">{c.legal_name}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-mono">{c.cin || c.gstin || '—'}</div>
                      {c.entity_type && (
                        <div className="text-[11px] text-muted-foreground">
                          {ENTITY_TYPE_LABEL[c.entity_type] ?? c.entity_type}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.roles ?? []).map((r: string) => (
                          <Badge key={r} variant="outline" className="text-[10px]">{ROLE_LABEL[r] ?? r}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Number(c.owned_brand_count) || 0}
                      {Number(c.manufactured_brand_count) > 0 && (
                        <span className="text-muted-foreground"> · makes {c.manufactured_brand_count}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit company' : 'Add company'}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {field('display_name', 'Known as *', { placeholder: 'Muller Homeopath' })}
              {field('legal_name', 'Registered name', { placeholder: 'Muller Homeopathic Pharmacy Pvt Ltd' })}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Entity type</Label>
              <Select value={draft.entity_type || 'none'}
                onValueChange={(v) => setDraft({ ...draft, entity_type: v === 'none' ? '' : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Not recorded" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not recorded</SelectItem>
                  {Object.entries(ENTITY_TYPE_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Registration</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('cin', 'CIN', { placeholder: 'U74999KA2015PTC080000', className: 'h-9 font-mono' })}
                {field('gstin', 'GSTIN', { placeholder: '29AAACM1234C1ZX', className: 'h-9 font-mono' })}
                {field('pan', 'PAN', { placeholder: 'AAACM1234C', className: 'h-9 font-mono' })}
                {field('tan', 'TAN')}
                {field('llpin', 'LLPIN')}
                {field('incorporation_date', 'Incorporated on', { type: 'date' })}
                {field('roc_code', 'ROC')}
                {field('registry_status', 'Register status', { placeholder: 'e.g. Active' })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Switch id="cmp-verified" checked={draft.is_verified}
                  onCheckedChange={(v) => setDraft({ ...draft, is_verified: v })} />
                <Label htmlFor="cmp-verified" className="text-xs">
                  Checked against the public register
                </Label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave this off until someone has actually verified the numbers — an unverified CIN is a claim, not a fact.
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Registered address</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('address_line', 'Address')}
                {field('city', 'City')}
                {field('state', 'State')}
                {field('pincode', 'PIN code')}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Contact</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('phone', 'Phone')}
                {field('email', 'Email', { type: 'email' })}
                {field('website', 'Website', { placeholder: 'https://' })}
                {field('authorised_signatory', 'Authorised signatory')}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={3} value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </div>

            {detail?.brands?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Brands</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.brands.map((b: any) => (
                    <Badge key={b.id} variant="outline" className="text-[11px]">
                      {b.nickname || b.name}
                      <span className="ml-1 text-muted-foreground">
                        {b.is_owner ? 'owns' : ''}{b.is_owner && b.is_manufacturer ? ' · ' : ''}{b.is_manufacturer ? 'makes' : ''}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {detail?.licenses?.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Licences</h4>
                <div className="space-y-1">
                  {detail.licenses.map((l: any) => (
                    <div key={l.id} className="rounded border px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium">{l.brand_name}</span> · {l.license_type}
                      {l.territory ? ` · ${l.territory}` : ''} · <span className="uppercase">{l.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex items-center justify-between gap-2 border-t pt-4">
                {editingId ? (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive"
                    onClick={archive} disabled={saving}>
                    <Archive className="mr-1.5 h-4 w-4" />Archive
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="button" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
