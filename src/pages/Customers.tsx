import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { customersAPI, type CustomerListParams, type CustomerSummary } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, Mail, ShoppingBag, Building2, Link2, Copy, Check, Loader2, Users2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination, ExportMenu, StatCard, StatGrid, type CsvColumn } from '@/components/erp';
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
  tags?: string[];
}

type Kind = 'all' | 'b2b' | 'retail';
type Activity = 'all' | NonNullable<CustomerListParams['activity']>;

const fmtDate = (v?: string | null) => (v ? localeDate(v, { day: '2-digit', month: 'short', year: 'numeric' }, 'en-IN') : '');

/** The directory as a file: the columns this page already holds, nothing invented. */
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
  { key: 'tags', label: 'Tags', format: (c: any) => (Array.isArray(c.tags) ? c.tags.join('; ') : '') },
];

const Customers: React.FC = () => {
  const { hasPerm } = useAuth();
  // A link may open the list already narrowed (the customer page's tags link to `?tag=`).
  const [searchParams] = useSearchParams();
  // customers.read lists and opens; customers.manage mints portal links, merges duplicates and
  // edits the store's own tags and note (customer page).
  const canManageCustomers = hasPerm('customers.manage');
  const [customers, setCustomers] = useState<StoreCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  /** Every filter is a SERVER filter: the total and the pages are the filtered directory's. */
  const [kind, setKind] = useState<Kind>('all');
  const [activity, setActivity] = useState<Activity>('all');
  /** Where the store first met them (acquisition_channel), `?origin=`. */
  const [origin, setOrigin] = useState<string>('all');
  const [tag, setTag] = useState<string>(() => searchParams.get('tag')?.trim() || 'all');
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  // Customer-portal share link (B2B statements), mirrors the Vendors page.
  const [portalLink, setPortalLink] = useState<{ name: string; url: string } | null>(null);
  const [portalLoadingId, setPortalLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openDuplicates, setOpenDuplicates] = useState(0);

  useEffect(() => {
    // The duplicate queue needs customers.manage; a read-only role simply sees no badge.
    if (canManageCustomers) customersAPI.listDuplicates('open').then((d: any[]) => setOpenDuplicates(d.length)).catch(() => {});
    customersAPI.summary().then(setSummary).catch(() => setSummaryFailed(true));
  }, [canManageCustomers]);

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
        const params: CustomerListParams = { page, limit, search: debounced || undefined };
        if (kind !== 'all') params.kind = kind;
        if (activity !== 'all') params.activity = activity;
        if (origin !== 'all') params.origin = origin;
        if (tag !== 'all') params.tag = tag;
        const res = await customersAPI.getAll(params);
        if (!alive) return;
        // The axios interceptor unwraps { success, data, total } into the array itself
        // (with `total` preserved as a non-enumerable prop). Read res directly.
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCustomers(list);
        setTotal((res as any)?.total ?? list.length);
      } catch (err: any) {
        if (!alive) return;
        // A disabled 'customers' module (unlikely, default on) returns 403.
        setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to load customers');
        setCustomers([]);
        setTotal(0);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, debounced, kind, activity, origin, tag]);

  const anyFilter = kind !== 'all' || activity !== 'all' || origin !== 'all' || tag !== 'all' || !!search;
  const clearFilters = () => { setKind('all'); setActivity('all'); setOrigin('all'); setTag('all'); setSearch(''); setPage(1); };
  const pick = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const pickKind = pick(setKind);
  const pickActivity = pick(setActivity);
  /** One tile = one filter: clicking a lit tile clears it, clicking another narrows to it alone. */
  const cohort = (a: Activity, k: Kind) => {
    const lit = activity === a && kind === k;
    setActivity(lit ? 'all' : a);
    setKind(lit ? 'all' : k);
    setPage(1);
  };

  // Origin and tag choices come from the server's vocabulary and the tags in use, never a local list.
  const originOptions: Array<readonly [string, string]> = summary
    ? [
        ...summary.channels.filter((c) => c.customers > 0).map((c) => [c.code, `${c.label} (${c.customers.toLocaleString('en-IN')})`] as const),
        ...(summary.unrecorded > 0 ? [['unrecorded', `Not recorded (${summary.unrecorded.toLocaleString('en-IN')})`] as const] : []),
      ]
    : [];
  const originLabel = origin === 'unrecorded'
    ? 'Not recorded'
    : summary?.channels.find((c) => c.code === origin)?.label ?? (origin !== 'all' ? origin : undefined);
  const tagOptions: Array<readonly [string, string]> = (summary?.tags ?? []).map((t) => [t.tag, `${t.tag} (${t.customers.toLocaleString('en-IN')})`] as const);

  /**
   * The blank sheet for a bulk load, through `data_jobs`, the ONE download
   * queue, so a big file never holds a request open (#333). The IMPORT itself
   * lives in Books, Migrate, which already runs the dry-run and apply pass; a
   * second importer here would be the duplication this platform keeps curing.
   */
  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await exportsAPI.request('migration_customers_template');
      alert('The customer template is being prepared. It appears under Downloads when it is ready.');
    } catch {
      alert('The template could not be requested. It is also available in Books, Migrate.');
    } finally { setTemplateBusy(false); }
  };

  const n = (v?: number) => (v ?? 0).toLocaleString('en-IN');
  const once = summary ? Math.max(0, summary.ordered - summary.repeat) : 0;
  const tiles: Array<{ key: string; label: string; value: number; sub: string; tone: 'default' | 'warn' | 'good' | 'info'; a: Activity; k: Kind }> = summary ? [
    { key: 'once', label: 'Bought once', value: once, sub: 'Not back yet: worth a reorder nudge', tone: once > 0 ? 'warn' : 'default', a: 'once', k: 'all' },
    { key: 'never', label: 'Never ordered', value: summary.never_ordered, sub: 'Signed up, no order yet', tone: 'default', a: 'never', k: 'all' },
    { key: 'repeat', label: 'Repeat buyers', value: summary.repeat, sub: 'Two or more orders', tone: 'good', a: 'repeat', k: 'all' },
    { key: 'b2b', label: 'Wholesale', value: summary.wholesale, sub: 'Buy at trade prices', tone: 'info', a: 'all', k: 'b2b' },
  ] : [];

  return (
    <div className="space-y-4">
      <ListHeader
        title="Customers"
        purpose="Everyone who has registered or bought from this store, what they have spent, and which of them buy at wholesale."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu filename="customers" columns={CUSTOMER_CSV_COLUMNS} rows={customers} canExport />
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={templateBusy}>
              {templateBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Import template
            </Button>
            {canManageCustomers && (
              <Link to="/customers/duplicates">
                <Button variant="outline" size="sm">
                  <Users2 className="mr-1.5 h-3.5 w-3.5" /> Duplicate accounts
                  {openDuplicates > 0 && <Badge variant="destructive" className="ml-1.5">{openDuplicates}</Badge>}
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* What to act on first: each tile is a filter over the whole directory. */}
      {summary ? (
        <StatGrid cols={4}>
          {tiles.map((t) => {
            const lit = activity === t.a && kind === t.k;
            return (
              <button key={t.key} type="button" onClick={() => cohort(t.a, t.k)} aria-pressed={lit}
                className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <StatCard label={t.label} value={n(t.value)} sub={lit ? 'Showing these. Click again to clear.' : t.sub}
                  tone={t.tone} className={lit ? 'ring-2 ring-brand' : 'hover:border-line-strong'} />
              </button>
            );
          })}
        </StatGrid>
      ) : !summaryFailed ? (
        <StatGrid cols={4}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-xl bg-surface-2" />)}
        </StatGrid>
      ) : null}

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
            {summary && anyFilter && <span className="ml-1">of {n(summary.customers)}</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip on={!anyFilter} onClick={clearFilters}>Everyone</FilterChip>
          <FilterChip on={kind === 'b2b'} onClick={() => pickKind(kind === 'b2b' ? 'all' : 'b2b')}>Wholesale</FilterChip>
          <FilterChip on={kind === 'retail'} onClick={() => pickKind(kind === 'retail' ? 'all' : 'retail')}>Retail</FilterChip>
          <span className="mx-1 h-4 w-px bg-line" />
          <FilterChip on={activity === 'ordered'} tone="good"
            onClick={() => pickActivity(activity === 'ordered' ? 'all' : 'ordered')}>Has ordered</FilterChip>
          <FilterChip on={activity === 'never'}
            onClick={() => pickActivity(activity === 'never' ? 'all' : 'never')}>Never ordered</FilterChip>
          {originOptions.length > 0 && (
            <MenuChip name="Origin" value={originLabel}
              options={originOptions} current={origin}
              onPick={(v) => { setOrigin(v ?? 'all'); setPage(1); }}
              hint="Where the store first met this customer. Orders imported from an old system count as Imported history." />
          )}
          {(tagOptions.length > 0 || tag !== 'all') && (
            <MenuChip name="Tag" value={tag !== 'all' ? tag : undefined}
              options={tagOptions} current={tag}
              onPick={(v) => { setTag(v ?? 'all'); setPage(1); }}
              hint="The store's own labels on a customer, set on the customer's page." />
          )}
          <InfoTip text="Every chip and tile filters the whole directory, not just this page." />
          {anyFilter && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-ink-soft" onClick={clearFilters}>Clear all</Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/15 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto rounded-md border">
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
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
                </TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-32 text-center">
                  <p className="text-sm font-medium text-ink">
                    {error ? 'The customers could not be loaded' : anyFilter ? 'Nothing matches those filters' : 'No customers yet'}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {error
                      ? 'Try again in a moment.'
                      : anyFilter
                        ? 'Clear a chip, or search by name, phone or email.'
                        : 'Somebody registering or placing an order is what puts them here.'}
                  </p>
                  {anyFilter && !error && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={clearFilters}>Clear the filters</Button>
                  )}
                </TableCell></TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.customer_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <Link
                            to={`/customers/${c.customer_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {c.name || 'Guest, no name'}
                          </Link>
                          {Array.isArray(c.tags) && c.tags.length > 0 ? (
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map((t) => (
                                <button key={t} type="button" onClick={() => { setTag(t); setPage(1); }}
                                  className="rounded border border-line bg-surface-2 px-1.5 text-[11px] text-ink-soft hover:border-line-strong"
                                  title={`Show everyone tagged ${t}`}>{t}</button>
                              ))}
                              {c.tags.length > 3 && <span className="text-[11px] text-ink-mute">+{c.tags.length - 3}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">ID {String(c.customer_id).slice(-8)}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {c.phone && <div className="flex items-center gap-2 whitespace-nowrap"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>}
                        {c.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" />{c.email}</div>}
                        {!c.phone && !c.email && <span className="text-xs text-ink-mute">No contact</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <ShoppingBag className="h-3.5 w-3.5 text-ink-mute" />{c.order_count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{fmtRupees(c.total_spent)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {c.last_order_at ? fmtDate(c.last_order_at) : <span className="text-xs text-ink-mute">No orders</span>}
                    </TableCell>
                    <TableCell>
                      {c.is_b2b ? (
                        <Badge variant="default" className="gap-1 whitespace-nowrap"><Building2 className="h-3 w-3" />Wholesale{c.b2b_tier ? `, ${c.b2b_tier}` : ''}</Badge>
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
                            : <Link2 className="mr-1 h-3.5 w-3.5" />}
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
              Send this link to the customer by WhatsApp, email or any other way. No password needed:
              they open it, see what they owe, view every invoice and payment, and download their statement PDF.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                readOnly
                value={portalLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm"
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
