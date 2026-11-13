import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { vendorsAPI } from '../services/api';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { Pencil, Loader2, Link2, Archive, RotateCcw, AlertTriangle, X } from 'lucide-react';
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
import VendorPortalLinks from '../components/vendor/VendorPortalLinks';

// Was a local palette; the same colors now live in
// components/order/StatusBadge.tsx's 'vendor' domain (2026-09-04).

/** The licences of a row the server flagged (expired first, then running out), each with its `status`. */
const flagged = (v: any): any[] => (Array.isArray(v?.licences_expiring) ? v.licences_expiring : []);
const hasLicence = (v: any, status: 'expired' | 'expiring') => flagged(v).some((l: any) => l.status === status);

// Vendor master CSV: the rows the page already holds (client-side export).
const VENDOR_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'business_name', label: 'Vendor' },
  { key: 'slug', label: 'Slug' },
  { key: 'gst_number', label: 'GST' },
  { key: 'pan_number', label: 'PAN' },
  { key: 'commission_pct', label: 'Commission %' },
  { key: 'status', label: 'Status' },
  { key: 'is_active', label: 'Active', format: (v) => (v.is_active ? 'Active' : 'Inactive') },
  // The list answers the terms nested (`terms.payment_due_days`); the old flat column is read as a fallback.
  { key: 'payment_terms_days', label: 'Terms (days)', format: (v: any) => String(v.terms?.payment_due_days ?? v.payment_terms_days ?? '') },
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
const STATUSES = ['approved', 'pending', 'suspended', 'rejected'] as const;
type Status = typeof STATUSES[number];

const Vendors: React.FC = () => {
  // Gate on the permission the backend checks (`purchasing.manage`), never on a role name: a purchasing
  // officer holds it and must see the write actions.
  const { hasPerm } = useAuth();
  const canManage = hasPerm('purchasing.manage');

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | Status>('');
  /** Licence health: the buyer's real question before raising an order. */
  const [licenceFilter, setLicenceFilter] = useState<'' | 'expiring' | 'expired'>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  /** The store's licence warning window (Settings, Goods coming in); said on the chip so "running out" means something. */
  const [licenceDays, setLicenceDays] = useState<number | null>(null);
  /** The supplier whose portal links are open. */
  const [linksFor, setLinksFor] = useState<{ id: string; name: string } | null>(null);

  const loadVendors = async () => {
    setLoading(true);
    setError('');
    try {
      // Every supplier (the server answers 200 at most a call): the counts below and the search must see all of
      // them. The licence standing is composed by the server's one reader into `licences_expiring` on each row,
      // so filtering on it here is not a second reading of the three places a licence can live.
      setVendors(await vendorsAPI.listAll());
    } catch (e: any) {
      setVendors([]);
      setError(e?.response?.data?.message ?? e?.message ?? 'Could not load the suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVendors();
    vendorsAPI.termsMeta()
      .then((m: any) => { const d = Number(m?.licenceWarningDays ?? m?.licence_warning_days); if (Number.isFinite(d)) setLicenceDays(d); })
      .catch(() => { /* the chip then reads without a number */ });
  }, []);

  const idOf = (v: any) => String(v?.id || v?._id || '');

  const handleStatusChange = async (id: string, status: Status) => {
    setUpdatingId(id);
    setNotice('');
    try {
      await vendorsAPI.updateStatus(id, status);
      setVendors((prev) => prev.map((v) => (idOf(v) === id ? { ...v, status } : v)));
    } catch (e: any) {
      setError(e?.message || 'Could not change the supplier status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const setActive = async (vendor: any, active: boolean) => {
    const id = idOf(vendor);
    setUpdatingId(id);
    setNotice('');
    try {
      await vendorsAPI.update(id, { is_active: active });
      setVendors((prev) => prev.map((v) => (idOf(v) === id ? { ...v, is_active: active } : v)));
      setNotice(active ? `${vendor.business_name} is active again.` : `${vendor.business_name} is now inactive. Its history stays on record.`);
    } catch (e: any) {
      setError(e?.message || 'Could not change the supplier.');
    } finally {
      setUpdatingId(null);
    }
  };

  /**
   * Delete only a supplier with no history. The server refuses one that any order, bill, receipt, deduction or
   * register still names (409, COMPLIANCE.md rule 3: a party of the books is archived, never deleted) and says
   * where; the page then offers to mark it inactive, which keeps every record and hides it from new orders.
   */
  const handleDelete = async (vendor: any) => {
    const id = idOf(vendor);
    if (!confirm(`Delete ${vendor.business_name}? This works only for a supplier with no orders, bills or deductions, and cannot be undone.`)) return;
    setNotice('');
    try {
      await vendorsAPI.delete(id);
      setVendors((prev) => prev.filter((v) => idOf(v) !== id));
      setNotice(`${vendor.business_name} was deleted.`);
    } catch (e: any) {
      if (e?.status === 409) {
        if (vendor.is_active !== false && confirm(`${e.message}\n\nMark ${vendor.business_name} inactive now?`)) {
          await setActive(vendor, false);
          return;
        }
        setNotice(e.message);
        return;
      }
      setError(e?.message || 'Could not delete the supplier.');
    }
  };

  const counts = useMemo(() => ({
    expired: vendors.filter((v) => hasLicence(v, 'expired')).length,
    expiring: vendors.filter((v) => hasLicence(v, 'expiring')).length,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, vendors.filter((v) => (v.status || 'pending') === s).length])) as Record<Status, number>,
    active: vendors.filter((v) => v.is_active !== false).length,
    inactive: vendors.filter((v) => v.is_active === false).length,
  }), [vendors]);

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
    const matchStatus = !statusFilter || (v.status || 'pending') === statusFilter;
    const matchActive = !activeFilter || (activeFilter === 'active' ? v.is_active !== false : v.is_active === false);
    const matchLicence = !licenceFilter || hasLicence(v, licenceFilter);
    return matchSearch && matchStatus && matchActive && matchLicence;
  });
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const pick = (fn: () => void) => { fn(); setPage(1); };
  const withinDays = licenceDays != null ? ` within ${licenceDays} days` : '';

  /** What needs a person, most urgent first: the page opens with these, then the numbers. */
  const actions: { key: string; tone: 'bad' | 'warn' | 'plain'; text: string; on: boolean; apply: () => void }[] = [];
  if (counts.expired) actions.push({ key: 'expired', tone: 'bad', on: licenceFilter === 'expired', text: `${counts.expired} supplier${counts.expired === 1 ? ' has' : 's have'} an expired licence: do not order from them until it is renewed.`, apply: () => pick(() => { setLicenceFilter('expired'); setStatusFilter(''); }) });
  if (counts.expiring) actions.push({ key: 'expiring', tone: 'warn', on: licenceFilter === 'expiring', text: `${counts.expiring} supplier${counts.expiring === 1 ? ' has' : 's have'} a licence ending${withinDays}: ask for the renewal.`, apply: () => pick(() => { setLicenceFilter('expiring'); setStatusFilter(''); }) });
  if (counts.byStatus.pending) actions.push({ key: 'pending', tone: 'plain', on: statusFilter === 'pending', text: `${counts.byStatus.pending} supplier${counts.byStatus.pending === 1 ? ' is' : 's are'} waiting for approval.`, apply: () => pick(() => { setStatusFilter('pending'); setLicenceFilter(''); }) });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading suppliers…" />
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
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <div className="flex shrink-0 items-center gap-2">
            {!vendors.length && <Button size="sm" variant="outline" onClick={() => void loadVendors()}>Try again</Button>}
            <button type="button" aria-label="Dismiss" onClick={() => setError('')}><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* What to act on first. Each line applies its own filter below. */}
      {vendors.length > 0 && (
        actions.length ? (
          <div className="space-y-1.5">
            {actions.map((a) => (
              <button key={a.key} type="button" onClick={a.apply} aria-pressed={a.on}
                className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  a.tone === 'bad' ? 'border-bad bg-bad-bg text-bad-ink'
                    : a.tone === 'warn' ? 'border-warn bg-warn-bg text-warn-ink'
                      : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{a.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Nothing needs you: every recorded licence is in date and every supplier is decided.</p>
        )
      )}

      {/* Toolbar: search, then the filters as chips with their counts, then what is on screen */}
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
            onClick={() => pick(() => { setStatusFilter(''); setActiveFilter(''); setLicenceFilter(''); })}>All</FilterChip>
          {STATUSES.map((st) => (
            <FilterChip key={st} on={statusFilter === st} count={counts.byStatus[st]}
              onClick={() => pick(() => setStatusFilter(statusFilter === st ? '' : st))}>
              <span className="capitalize">{st}</span>
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={activeFilter === 'active'} count={counts.active}
            onClick={() => pick(() => setActiveFilter(activeFilter === 'active' ? '' : 'active'))}>Active</FilterChip>
          <FilterChip on={activeFilter === 'inactive'} count={counts.inactive}
            onClick={() => pick(() => setActiveFilter(activeFilter === 'inactive' ? '' : 'inactive'))}>Inactive</FilterChip>
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={licenceFilter === 'expiring'} tone="warn" count={counts.expiring}
            onClick={() => pick(() => setLicenceFilter(licenceFilter === 'expiring' ? '' : 'expiring'))}>
            Licence running out
          </FilterChip>
          <FilterChip on={licenceFilter === 'expired'} tone="bad" count={counts.expired}
            onClick={() => pick(() => setLicenceFilter(licenceFilter === 'expired' ? '' : 'expired'))}>
            Licence expired
          </FilterChip>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>GSTIN, PAN, CIN</TableHead>
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
                      : 'Add the first supplier and every purchase order and bill can be raised against them.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((vendor) => {
                const id = idOf(vendor);
                return (
                  <TableRow key={id} className={vendor.is_active === false ? 'opacity-70' : undefined}>
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
                      <div className="font-mono text-xs text-ink">{vendor.gst_number || <span className="font-sans text-ink-mute">No GSTIN</span>}</div>
                      {vendor.pan_number && <div className="font-mono text-xs text-ink-soft">{vendor.pan_number}</div>}
                      {vendor.cin && <div className="font-mono text-xs text-ink-soft">{vendor.cin}</div>}
                    </TableCell>
                    {/* How many, and whether any of them is a problem: the
                        question asked before a purchase order is raised. */}
                    <TableCell>
                      {Array.isArray(vendor.licences) && vendor.licences.length ? (
                        <>
                          <span className="text-sm tabular-nums text-ink">
                            {vendor.licences.length} on file
                          </span>
                          <div className="text-[11px] text-ink-soft">
                            {[...new Set(vendor.licences.map((l: any) => l.title ?? l.type))].slice(0, 3).join(', ')}
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
                          {vendor.terms_summary.join('; ')}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not recorded</span>
                      )}
                      {flagged(vendor).length > 0 && (
                        <div className="mt-1 text-xs font-medium">
                          {flagged(vendor).map((l: any) => {
                            const days = Number(l.daysLeft ?? l.days_left ?? 0);
                            const gone = l.status === 'expired' || days < 0;
                            return (
                              <div key={`${l.title ?? l.label}-${l.number}`} className={gone ? 'text-bad-ink' : 'text-warn-ink'}>
                                {l.title ?? l.label} {gone ? 'has expired' : `expires in ${days}d`}
                              </div>
                            );
                          })}
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
                                <DropdownMenuItem className="cursor-pointer" onClick={() => setLinksFor({ id, name: vendor.business_name })}>
                                  <Link2 className="mr-2 h-4 w-4" /> Portal links
                                </DropdownMenuItem>
                                {vendor.is_active === false ? (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setActive(vendor, true)}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Mark active
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem className="cursor-pointer" onClick={() => setActive(vendor, false)}>
                                    <Archive className="mr-2 h-4 w-4" /> Mark inactive
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={() => handleDelete(vendor)}>
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

      {/* A supplier's portal links: hand one out, see them all, revoke one */}
      {linksFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setLinksFor(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Portal links for ${linksFor.name}`}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-card p-5 shadow-xl sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Portal links for {linksFor.name}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setLinksFor(null)}><X className="h-5 w-5" /></button>
            </div>
            <VendorPortalLinks vendorId={linksFor.id} vendorName={linksFor.name} canManage={canManage} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
