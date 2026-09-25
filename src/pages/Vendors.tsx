import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { vendorsAPI } from '../services/api';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { Pencil, Loader2, Link2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { ExportMenu, Pagination, type CsvColumn } from '@/components/erp';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { FilterChip, SearchBox, ListHeader } from '../components/sales/ListChrome';

// Was a local palette — same colors now centralized in
// components/order/StatusBadge.tsx's 'vendor' domain (2026-09-04).

// Vendor master CSV — the row the page already holds (client-side export).
const VENDOR_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'business_name', label: 'Vendor' },
  { key: 'slug', label: 'Slug' },
  { key: 'gst_number', label: 'GST' },
  { key: 'pan_number', label: 'PAN' },
  { key: 'commission_pct', label: 'Commission %' },
  { key: 'status', label: 'Status' },
  { key: 'is_active', label: 'Active', format: (v) => (v.is_active ? 'Active' : 'Inactive') },
  { key: 'payment_terms_days', label: 'Terms (days)' },
  { key: 'msme_classification', label: 'MSME class' },
  { key: 'udyam_number', label: 'Udyam' },
  { key: 'cin', label: 'CIN' },
  // Every licence on one line, so the export answers "who can ship what" too.
  {
    key: 'licences', label: 'Licences',
    format: (v: any) => (Array.isArray(v.licences) ? v.licences : [])
      .map((l: any) => `${l.title ?? l.type} ${l.number}${l.valid_till ? ` (to ${l.valid_till})` : ''}`)
      .join(' | '),
  },
];

const PAGE_SIZE = 20;

const Vendors: React.FC = () => {
  // DEFECT FIX: vendor writes were gated on `user.role === 'admin'`, so a
  // purchasing_officer (who holds `purchasing.manage`, which the backend
  // authorises) saw a read-only page. Gate on the actual permission instead.
  const { hasPerm } = useAuth();
  const canManage = hasPerm('purchasing.manage');

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  /** Licence health — the buyer's real question before raising an order. */
  const [licenceFilter, setLicenceFilter] = useState<'' | 'expiring' | 'expired'>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Vendor-portal share link
  const [portalLink, setPortalLink] = useState<{ vendorName: string; url: string } | null>(null);
  const [portalLoadingId, setPortalLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePortalLink = async (vendor: any) => {
    const id = String(vendor.id || vendor._id || '');
    setPortalLoadingId(id);
    try {
      const res = await vendorsAPI.mintPortalToken(id);
      const path = res?.path || (res?.token ? `/vendor/${res.token}` : '');
      if (!path) { alert('Could not create a portal link.'); return; }
      setCopied(false);
      setPortalLink({ vendorName: vendor.business_name, url: `${window.location.origin}${path}` });
    } catch {
      alert('Could not create a portal link. You need the "Manage purchasing" permission.');
    } finally {
      setPortalLoadingId(null);
    }
  };

  const copyPortalLink = async () => {
    if (!portalLink) return;
    try { await navigator.clipboard.writeText(portalLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  useEffect(() => {
    loadVendors();
    // Licence expiry is not a column — it lives across three places and is
    // resolved by the server's one reader — so that filter is a re-fetch, not
    // a client-side test that would have to know all three.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenceFilter]);

  const loadVendors = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await vendorsAPI.list(licenceFilter ? { licence: licenceFilter } : undefined);
      setVendors(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setVendors([]);
      setError(e?.response?.data?.message ?? e?.message ?? 'Failed to load vendors.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'pending' | 'approved' | 'suspended' | 'rejected') => {
    setUpdatingId(id);
    try {
      await vendorsAPI.updateStatus(id, status);
      setVendors((prev) => prev.map((v) => v.id === id || v._id === id ? { ...v, status } : v));
    } catch {
      alert('Failed to update vendor status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vendor? This cannot be undone.')) return;
    try {
      await vendorsAPI.delete(id);
      setVendors((prev) => prev.filter((v) => (v.id || v._id) !== id));
    } catch {
      alert('Failed to delete vendor');
    }
  };

  const term = search.trim().toLowerCase();
  const filtered = vendors.filter((v) => {
    // Everything a buyer might paste into one box: name, code, GSTIN, PAN, CIN
    // and a licence number. Searching only name+slug meant a licence number
    // copied off a document found nothing.
    const hay = [
      v.business_name, v.slug, v.gst_number, v.pan_number, v.cin,
      ...(Array.isArray(v.licences) ? v.licences.map((l: any) => l.number) : []),
    ].filter(Boolean).join(' ').toLowerCase();
    const matchSearch = !term || hay.includes(term);
    const matchStatus = !statusFilter || v.status === statusFilter;
    const matchActive = !activeFilter || (activeFilter === 'active' ? v.is_active !== false : v.is_active === false);
    return matchSearch && matchStatus && matchActive;
  });
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading vendors…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListHeader
        title="Suppliers"
        purpose="Who you buy from, on what terms, and which licences let them ship it."
        aside={<ExportMenu filename="vendors" columns={VENDOR_CSV_COLUMNS} rows={filtered} canExport={hasPerm('purchasing.read')} />}
        action={canManage && (
          <Button asChild>
            <Link to="/vendors/new"><FaPlus className="mr-2" /> Add a supplier</Link>
          </Button>
        )}
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Toolbar — search, then the filters as chips, then what is on screen */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search name, code, GSTIN, PAN, CIN or a licence number"
            label="Search suppliers"
          />
          <span className="text-sm tabular-nums text-ink-soft">
            {filtered.length} of {vendors.length} supplier{vendors.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip on={!statusFilter && !activeFilter && !licenceFilter}
            onClick={() => { setStatusFilter(''); setActiveFilter(''); setLicenceFilter(''); setPage(1); }}>All</FilterChip>
          {(['approved', 'pending', 'suspended', 'rejected'] as const).map((st) => (
            <FilterChip key={st} on={statusFilter === st}
              onClick={() => { setStatusFilter(statusFilter === st ? '' : st); setPage(1); }}>
              <span className="capitalize">{st}</span>
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={activeFilter === 'active'}
            onClick={() => { setActiveFilter(activeFilter === 'active' ? '' : 'active'); setPage(1); }}>Active</FilterChip>
          <FilterChip on={activeFilter === 'inactive'}
            onClick={() => { setActiveFilter(activeFilter === 'inactive' ? '' : 'inactive'); setPage(1); }}>Inactive</FilterChip>
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={licenceFilter === 'expiring'} tone="warn"
            onClick={() => { setLicenceFilter(licenceFilter === 'expiring' ? '' : 'expiring'); setPage(1); }}>
            Licence running out
          </FilterChip>
          <FilterChip on={licenceFilter === 'expired'} tone="bad"
            onClick={() => { setLicenceFilter(licenceFilter === 'expired' ? '' : 'expired'); setPage(1); }}>
            Licence expired
          </FilterChip>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>GSTIN · PAN · CIN</TableHead>
              <TableHead>Licences</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center">
                  <p className="text-sm font-medium text-ink">
                    {vendors.length ? 'Nothing matches those filters' : 'No suppliers yet'}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {vendors.length
                      ? 'Clear a chip above, or search by name, GSTIN or a licence number.'
                      : 'Add the first supplier and every purchase order can be raised against them.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((vendor) => {
                const id = String(vendor.id || vendor._id || '');
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {vendor.logo_url ? (
                          <img src={vendor.logo_url} alt={vendor.business_name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                            {vendor.business_name?.charAt(0)?.toUpperCase() || 'V'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{vendor.business_name}</div>
                          <div className="text-xs text-muted-foreground">{vendor.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-ink">{vendor.gst_number || '—'}</div>
                      {vendor.pan_number && <div className="font-mono text-xs text-ink-soft">{vendor.pan_number}</div>}
                      {vendor.cin && <div className="font-mono text-xs text-ink-soft">{vendor.cin}</div>}
                    </TableCell>
                    {/* How many, and whether any of them is a problem — the
                        question asked before a purchase order is raised. */}
                    <TableCell>
                      {Array.isArray(vendor.licences) && vendor.licences.length ? (
                        <>
                          <span className="text-sm tabular-nums text-ink">
                            {vendor.licences.length} on file
                          </span>
                          <div className="text-[11px] text-ink-soft">
                            {[...new Set(vendor.licences.map((l: any) => l.title ?? l.type))].slice(0, 3).join(' · ')}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-ink-mute">None recorded</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium tabular-nums">{vendor.commission_pct ?? 0}%</span>
                    </TableCell>
                    {/* What was agreed with THIS supplier, and any licence about
                        to run out. Both come composed from the server so this
                        list and the vendor page can never word them differently. */}
                    <TableCell>
                      {Array.isArray(vendor.terms_summary) && vendor.terms_summary.length ? (
                        <div className="text-xs text-muted-foreground max-w-[22rem]">
                          {vendor.terms_summary.join(' · ')}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not recorded</span>
                      )}
                      {Array.isArray(vendor.licences_expiring) && vendor.licences_expiring.length > 0 && (
                        <div className="mt-1 text-xs font-medium">
                          {vendor.licences_expiring.map((l: any) => (
                            <div key={`${l.title ?? l.label}-${l.number}`}
                                 className={(l.daysLeft ?? 0) < 0 ? 'text-bad-ink' : 'text-warn-ink'}>
                              {l.title ?? l.label} {(l.daysLeft ?? 0) < 0 ? 'has expired' : `expires in ${l.daysLeft}d`}
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button disabled={updatingId === id} className="focus:outline-none">
                              {updatingId === id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Badge variant="outline" className={`cursor-pointer capitalize ${getStatusColorClass('vendor', vendor.status)}`}>
                                  {vendor.status || 'pending'}
                                </Badge>
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {(['pending', 'approved', 'suspended', 'rejected'] as const).map((s) => (
                              <DropdownMenuItem key={s} onClick={() => handleStatusChange(id, s)} disabled={vendor.status === s}>
                                <span className="capitalize">{s}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge variant="outline" className={`capitalize ${getStatusColorClass('vendor', vendor.status)}`}>
                          {vendor.status || 'pending'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vendor.is_active ? 'default' : 'destructive'} className={vendor.is_active ? 'bg-green-500/15 text-green-700 border-green-200' : ''}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/vendors/${id}/edit`}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Link>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <span className="sr-only">More</span>
                                  <span className="text-muted-foreground">⋮</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="cursor-pointer" onClick={() => handlePortalLink(vendor)} disabled={portalLoadingId === id}>
                                  {portalLoadingId === id
                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    : <Link2 className="mr-2 h-4 w-4" />} Portal link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={() => handleDelete(id)}>
                                  <FaTrash className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      {/* Vendor-portal share link modal */}
      {portalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPortalLink(null)}>
          <div className="w-full max-w-lg rounded-lg bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Portal link for {portalLink.vendorName}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Send this link to the supplier (WhatsApp, email — anything). No password needed:
              they open it, see their purchase orders, confirm them, and track which bills are paid.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={portalLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono"
              />
              <Button onClick={copyPortalLink} className="shrink-0">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Anyone with this link can view this vendor's orders and bills. You can revoke it later from the database if needed.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={() => setPortalLink(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
