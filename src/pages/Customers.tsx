import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, Mail, ShoppingBag, Building2, Link2, Copy, Check, Loader2, Users2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination, ExportMenu, type CsvColumn } from '@/components/erp';
import { FilterChip, MenuChip, SearchBox, ListHeader } from '../components/sales/ListChrome';
import InfoTip from '../components/common/InfoTip';
import { exportsAPI } from '../services/api';
import { fmtRupees } from '@/lib/money';
import { localeDate } from '../utils/date';

interface StoreCustomer {
  customer_id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  order_count?: number;
  total_spent?: number | string;
  last_order_at?: string | null;
  is_b2b?: boolean;
  b2b_tier?: string | null;
}

const fmtDate = (v?: string | null) => (v ? localeDate(v, { day: '2-digit', month: 'short', year: 'numeric' }, 'en-IN') : '—');

/** The directory as a file — the columns this page already holds, nothing invented. */
const CUSTOMER_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'order_count', label: 'Orders' },
  { key: 'total_spent', label: 'Total spent' },
  { key: 'last_order_at', label: 'Last order', format: (c: any) => fmtDate(c.last_order_at) },
  { key: 'is_b2b', label: 'Type', format: (c: any) => (c.is_b2b ? 'Wholesale' : 'Retail') },
  { key: 'b2b_tier', label: 'Tier' },
];

const Customers: React.FC = () => {
  const { hasPerm } = useAuth();
  // Backend (routes/customers.ts) has no delete route for individual customers — only
  // customers.read (list/detail) and customers.manage (duplicates merge, portal-token mint).
  // This page's only write-type action is "Portal link" (mintPortalToken -> customers.manage);
  // it had ZERO client-side gating before (only a reactive alert on 403).
  const canManageCustomers = hasPerm('customers.manage');
  const [customers, setCustomers] = useState<StoreCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  /**
   * Who is on screen. Applied to the page the server returned — the directory
   * is paged, so this narrows what you can see rather than running a new
   * search, and the strip says so rather than letting a count look like a
   * total.
   */
  const [kind, setKind] = useState<'all' | 'b2b' | 'retail'>('all');
  const [activity, setActivity] = useState<'all' | 'ordered' | 'never'>('all');
  /** Where the store first met them (acquisition_channel) — a SERVER filter, `?origin=`. */
  const [origin, setOrigin] = useState<string>('all');
  const [originOptions, setOriginOptions] = useState<Array<readonly [string, string]>>([]);
  const [templateBusy, setTemplateBusy] = useState(false);

  // Customer-portal share link (B2B statements) — mirrors the Vendors page.
  const [portalLink, setPortalLink] = useState<{ name: string; url: string } | null>(null);
  const [portalLoadingId, setPortalLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openDuplicates, setOpenDuplicates] = useState(0);

  useEffect(() => {
    customersAPI.listDuplicates('open').then((d: any[]) => setOpenDuplicates(d.length)).catch(() => {});
  }, []);

  const handlePortalLink = async (c: StoreCustomer) => {
    const id = String(c.customer_id);
    setPortalLoadingId(id);
    try {
      const res = await customersAPI.mintPortalToken(id);
      const path = res?.path || (res?.token ? `/customer/${res.token}` : '');
      if (!path) { alert('Could not create a portal link.'); return; }
      setCopied(false);
      setPortalLink({ name: c.name || 'this customer', url: `${window.location.origin}${path}` });
    } catch {
      alert('Could not create a portal link. You need the "customers.manage" permission.');
    } finally {
      setPortalLoadingId(null);
    }
  };

  const copyPortalLink = async () => {
    if (!portalLink) return;
    try { await navigator.clipboard.writeText(portalLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await customersAPI.getAll({ page, limit, search: debounced || undefined, ...(origin !== 'all' ? { origin } : {}) } as any);
        if (!alive) return;
        // The axios interceptor unwraps { success, data, total } → the array itself
        // (with `total` preserved as a non-enumerable prop). Reading res.data on an
        // array yields undefined, which silently emptied the list. Read res directly.
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCustomers(list);
        setTotal((res as any)?.total ?? list.length);
        // The origin vocabulary rides the envelope — never a second list of labels.
        const ch = (res as any)?.channels;
        if (Array.isArray(ch) && ch.length) {
          setOriginOptions([...ch.map((c: any) => [String(c.code), String(c.label)] as const), ['unrecorded', 'Not recorded'] as const]);
        }
      } catch (err: any) {
        if (!alive) return;
        // A disabled 'customers' module (unlikely — default on) returns 403.
        setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to load customers');
        setCustomers([]);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, debounced, origin]);

  const shown = customers.filter((c) => {
    if (kind === 'b2b' && !c.is_b2b) return false;
    if (kind === 'retail' && c.is_b2b) return false;
    const orders = Number(c.order_count ?? 0);
    if (activity === 'ordered' && orders < 1) return false;
    if (activity === 'never' && orders > 0) return false;
    return true;
  });
  const hiddenHere = customers.length - shown.length;
  const anyFilter = kind !== 'all' || activity !== 'all' || origin !== 'all' || !!search;
  const clearFilters = () => { setKind('all'); setActivity('all'); setOrigin('all'); setSearch(''); setPage(1); };

  /**
   * The blank sheet for a bulk load — through `data_jobs`, the ONE download
   * queue, so a big file never holds a request open (#333). The IMPORT itself
   * lives in Books ▸ Migrate, which already runs the dry-run/apply pass; a
   * second importer here would be the duplication this platform keeps curing.
   */
  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await exportsAPI.request('migration_customers_template');
      alert('The customer template is being prepared. It appears under Downloads when it is ready.');
    } catch {
      alert('The template could not be requested. It is also available in Books ▸ Migrate.');
    } finally { setTemplateBusy(false); }
  };

  return (
    <div className="space-y-4">
      <ListHeader
        title="Customers"
        purpose="Everyone who has registered or bought from this store, what they have spent, and which of them buy at wholesale."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu filename="customers" columns={CUSTOMER_CSV_COLUMNS} rows={shown} canExport />
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={templateBusy}>
              {templateBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Import template
            </Button>
            <Link to="/customers/duplicates">
              <Button variant="outline" size="sm">
                <Users2 className="mr-1.5 h-3.5 w-3.5" /> Duplicate accounts
                {openDuplicates > 0 && <Badge variant="destructive" className="ml-1.5">{openDuplicates}</Badge>}
              </Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search name, phone or email"
            label="Search customers"
          />
          <span className="text-sm tabular-nums text-ink-soft">
            {total.toLocaleString('en-IN')} customer{total === 1 ? '' : 's'}
            {hiddenHere > 0 && <span className="ml-1 text-warn-ink">· {hiddenHere} on this page hidden by a filter</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip on={kind === 'all' && activity === 'all'} onClick={clearFilters}>Everyone</FilterChip>
          <FilterChip on={kind === 'b2b'} onClick={() => setKind(kind === 'b2b' ? 'all' : 'b2b')}>Wholesale</FilterChip>
          <FilterChip on={kind === 'retail'} onClick={() => setKind(kind === 'retail' ? 'all' : 'retail')}>Retail</FilterChip>
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={activity === 'ordered'} tone="good"
            onClick={() => setActivity(activity === 'ordered' ? 'all' : 'ordered')}>Has ordered</FilterChip>
          <FilterChip on={activity === 'never'}
            onClick={() => setActivity(activity === 'never' ? 'all' : 'never')}>Never ordered</FilterChip>
          <InfoTip text="Wholesale / Retail / ordered narrow the customers on THIS page. Search and Origin ask the server and cover every page." />
          {originOptions.length > 0 && (
            <MenuChip name="Origin" value={originOptions.find(([k]) => k === origin)?.[1]}
              options={originOptions} current={origin}
              onPick={(v) => { setOrigin(v ?? 'all'); setPage(1); }}
              hint="Where the store first met this customer. Orders imported from an old system count as Imported history." />
          )}
          {anyFilter && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft" onClick={clearFilters}>Clear all</Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive border border-destructive/20 p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </TableCell></TableRow>
              ) : shown.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center">
                  <p className="text-sm font-medium text-ink">
                    {total === 0 ? 'No customers yet' : 'Nothing matches those filters'}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {total === 0
                      ? 'Somebody registering or placing an order is what puts them here.'
                      : 'Clear a chip, or search by name, phone or email.'}
                  </p>
                  {total > 0 && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={clearFilters}>Clear the filters</Button>
                  )}
                </TableCell></TableRow>
              ) : (
                shown.map((c) => (
                  <TableRow key={c.customer_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col">
                          <Link
                            to={`/customers/${c.customer_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {c.name || 'Guest / unnamed'}
                          </Link>
                          <span className="text-xs text-muted-foreground">ID: {String(c.customer_id).slice(-8)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {c.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}
                        {c.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" />{c.email}</div>}
                        {!c.phone && !c.email && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <ShoppingBag className="h-3.5 w-3.5 text-ink-mute" />{c.order_count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtRupees(c.total_spent)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(c.last_order_at)}</TableCell>
                    <TableCell>
                      {c.is_b2b ? (
                        <Badge variant="default" className="gap-1"><Building2 className="h-3 w-3" />B2B{c.b2b_tier ? ` · ${c.b2b_tier}` : ''}</Badge>
                      ) : (
                        <Badge variant="secondary">Retail</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageCustomers && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePortalLink(c)}
                          disabled={portalLoadingId === String(c.customer_id)}
                          title="A link the customer opens with no password, showing what they owe, every invoice and their statement"
                        >
                          {portalLoadingId === String(c.customer_id)
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Link2 className="h-3.5 w-3.5 mr-1" />}
                          Portal link
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Customer-portal share link modal (B2B statements) */}
      {portalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPortalLink(null)}>
          <div className="w-full max-w-lg rounded-lg bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Portal link for {portalLink.name}</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Send this link to the customer (WhatsApp, email — anything). No password needed:
              they open it, see what they owe, view every invoice and payment, and download their statement PDF.
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
              Anyone with this link can view this customer's balance and statement. You can revoke it later if needed.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={() => setPortalLink(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={limit} total={total} onPage={setPage} />
    </div>
  );
};

export default Customers;
