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
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await vendorsAPI.list();
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

  const filtered = vendors.filter((v) => {
    const matchSearch = !search || v.business_name?.toLowerCase().includes(search.toLowerCase()) || v.slug?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || v.status === statusFilter;
    return matchSearch && matchStatus;
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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
        <div className="flex items-center gap-2">
          <ExportMenu filename="vendors" columns={VENDOR_CSV_COLUMNS} rows={filtered} canExport={hasPerm('purchasing.read')} />
          {canManage && (
            <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link to="/vendors/new"><FaPlus className="mr-2" /> Add Vendor</Link>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-60"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-input rounded-md bg-background"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} vendor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>GST / PAN</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No vendors found.
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
                      <div className="text-sm">{vendor.gst_number || '—'}</div>
                      <div className="text-xs text-muted-foreground">{vendor.pan_number || ''}</div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{vendor.commission_pct ?? 0}%</span>
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
