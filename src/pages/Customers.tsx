import React, { useEffect, useState } from 'react';
import { customersAPI } from '../services/api';
import { User, Phone, Mail, Search, ShoppingBag, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

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

const money = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<StoreCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

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

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Shoppers who registered or ordered on your store.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{total}</span>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
                          <span className="font-medium">{c.name || 'Guest / unnamed'}</span>
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
                    <TableCell className="font-medium">{money(c.total_spent)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{fmtDate(c.last_order_at)}</TableCell>
                    <TableCell>
                      {c.is_b2b ? (
                        <Badge variant="default" className="gap-1"><Building2 className="h-3 w-3" />B2B{c.b2b_tier ? ` · ${c.b2b_tier}` : ''}</Badge>
                      ) : (
                        <Badge variant="secondary">Retail</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Page {page} of {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
