import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, Mail, Search, ShoppingBag, Building2, Link2, Copy, Check, Loader2, Users2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/erp';
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
        const res = await customersAPI.getAll({ page, limit, search: debounced || undefined });
        if (!alive) return;
        // The axios interceptor unwraps { success, data, total } → the array itself
        // (with `total` preserved as a non-enumerable prop). Reading res.data on an
        // array yields undefined, which silently emptied the list. Read res directly.
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCustomers(list);
        setTotal((res as any)?.total ?? list.length);
      } catch (err: any) {
        if (!alive) return;
        // A disabled 'customers' module (unlikely — default on) returns 403.
        setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to load customers');
        setCustomers([]);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, debounced]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Shoppers who registered or ordered on your store.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/customers/duplicates">
            <Button variant="outline" size="sm">
              <Users2 className="mr-1.5 h-3.5 w-3.5" /> Duplicate Accounts
              {openDuplicates > 0 && <Badge variant="destructive" className="ml-1.5">{openDuplicates}</Badge>}
            </Button>
          </Link>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{total}</span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

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
                <TableHead>Orders</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No customers yet. They appear here once someone registers or places an order on your store.
                </TableCell></TableRow>
              ) : (
                customers.map((c) => (
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
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />{c.order_count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{fmtRupees(c.total_spent)}</TableCell>
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
                          title="Create a no-login portal link the customer can open to see their balance & statement"
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
