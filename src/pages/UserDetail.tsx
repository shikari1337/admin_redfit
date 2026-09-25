/**
 * Customer detail — profile, order history and saved addresses for ONE customer.
 *
 * Everything here comes from a single `GET /customers/:id`, which already
 * returns the customer, their last 100 orders, their addresses and lifetime
 * totals. It previously called four `/users/:id/...` endpoints that do not
 * exist (all 404), because it predates customers becoming global: `/users` is
 * the STAFF table (staff.read/manage/delete), managed at Settings ▸ Staff.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { customersAPI } from '../services/api';
import { fmtRupees } from '../lib/money';
import {
  User,
  Mail,
  Phone,
  ShoppingCart,
  MapPin,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { formatDate } from '../utils/date';
import InfoTip from '../components/common/InfoTip';
import { ListHeader } from '../components/sales/ListChrome';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => {
    if (id) fetchCustomer();
  }, [id]);

  // ONE request: /customers/:id returns profile + orders + addresses + totals.
  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customersAPI.getById(id!);
      const c = data?.data ?? data;
      setUser(c);
      setOrders(Array.isArray(c?.orders) ? c.orders : []);
      setAddresses(Array.isArray(c?.addresses) ? c.addresses : []);
      setTotalSpent(Number(c?.total_spent ?? c?.totalSpent ?? 0));
    } catch (e: any) {
      setError(e?.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  // Was a coarse switch returning non-standard Badge variants ('warning'/
  // 'success' aren't real shadcn variants — hence the `as any` cast at the
  // call site) — now sources real per-status colors from the same 'order'
  // palette components/order/StatusBadge.tsx centralizes elsewhere.

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">{error || 'Customer not found'}</p>
        <Button variant="outline" asChild>
          <Link to="/customers">Back to Customers</Link>
        </Button>
      </div>
    );
  }

  const b2b = user.b2b ?? {};
  const ORIGIN_LABEL: Record<string, string> = {
    online_store: 'Website', pos: 'Counter (POS)', offline: 'Manual / phone', bulk_order: 'Bulk Order Platform',
    books: 'Books', imported: 'Imported history',
  };
  const avgOrder = orders.length ? totalSpent / orders.length : 0;
  const capped = orders.length >= 100;
  const lastOrder = orders[0]?.created_at ?? null;
  const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-3 h-7 w-fit text-ink-soft" asChild>
        <Link to="/customers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Customers</Link>
      </Button>
      <ListHeader
        title={user.displayName || user.name || 'Unnamed customer'}
        purpose="Who they are, what they have bought, where they ship to and the wholesale terms they buy on."
        action={
          <Button size="sm" asChild>
            <Link to={`/orders/new?customer=${encodeURIComponent(String(id))}`}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New order for them
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Identity */}
        <Card className="lg:col-span-1">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <User className="h-5 w-5 text-ink-soft" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {b2b.is_b2b
                    ? <Badge variant="outline" className="border-info bg-info-bg text-info-ink">Wholesale{b2b.b2b_tier ? ` · ${b2b.b2b_tier}` : ''}</Badge>
                    : <Badge variant="outline" className="border-line text-ink-soft">Retail</Badge>}
                  {b2b.acquisition_channel && (
                    <Badge variant="outline" className="border-line text-ink-soft" title="Where the store first met this customer">
                      From {ORIGIN_LABEL[b2b.acquisition_channel] ?? b2b.acquisition_channel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <dl className="space-y-1.5 text-sm">
              {user.email && <div className="flex items-center gap-2 text-ink"><Mail className="h-3.5 w-3.5 text-ink-mute" />{user.email}</div>}
              {user.phone && <div className="flex items-center gap-2 tabular-nums text-ink"><Phone className="h-3.5 w-3.5 text-ink-mute" />{user.dial_code ? `${user.dial_code} ` : ''}{user.phone}</div>}
              {user.gstin && <div className="font-mono text-xs text-ink-soft">GSTIN {user.gstin}</div>}
              {!user.email && !user.phone && <div className="text-xs text-ink-mute">No contact recorded</div>}
            </dl>
          </CardContent>
        </Card>

        {/* Numbers */}
        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              { label: 'Orders', value: capped ? '100+' : String(orders.length), tip: capped ? 'This page reads the latest 100 orders, so the true count is at least 100.' : undefined },
              { label: 'Lifetime value', value: money(totalSpent), tip: 'The total of the orders listed below, as each order recorded it.' },
              { label: 'Average order', value: orders.length ? money(avgOrder) : '—' },
              { label: 'Last order', value: lastOrder ? formatDate(lastOrder, 'dd MMM yyyy') : '—' },
            ].map((k) => (
              <div key={k.label}>
                <div className="flex items-center gap-1 text-xs text-ink-soft">{k.label}{k.tip && <InfoTip text={k.tip} />}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{k.value}</div>
              </div>
            ))}
            {b2b.is_b2b && (
              <div className="col-span-2 rounded-md border border-line bg-surface-2 p-3 text-sm sm:col-span-4">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
                  Wholesale terms <InfoTip text="Set on the Wholesale (B2B) page ▸ Customers. Prices on a new order follow this tier or pinned price list." />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums text-ink">
                  {b2b.company_name && <span>{b2b.company_name}</span>}
                  <span>Tier: {b2b.b2b_tier || 'store default'}</span>
                  {Number(b2b.credit_limit) > 0 && <span>Credit {money(Number(b2b.credit_limit))} · {b2b.credit_days ?? 0} days</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="addresses" className="gap-2">
            <MapPin className="h-4 w-4" />
            Saved Addresses ({addresses.length})
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-6">
            <TabsContent value="orders" className="m-0 border-0 p-0">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShoppingCart className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium text-ink">No orders yet</p>
                  <p className="mt-1 text-xs text-ink-soft">Use “New order for them” above to key one in.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">{order.order_id}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtRupees(order.total || 0)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize border-transparent ${getStatusColorClass('order', order.order_status)}`}>
                            {order.order_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {order.created_at ? formatDate(order.created_at, 'MMM dd, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/orders/${order.id}`} className="text-primary hover:text-primary/80">
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="addresses" className="m-0 border-0 p-0">
              {addresses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MapPin className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No saved addresses found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <Card key={address.id} className={address.is_default ? 'border-primary bg-primary/5' : ''}>
                      <CardContent className="p-4">
                        {address.is_default && (
                          <Badge className="mb-2">Default</Badge>
                        )}
                        <div className="font-semibold mb-2">{address.full_name}</div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>{address.line1}</p>
                          {address.line2 && <p>{address.line2}</p>}
                          {address.landmark && <p>{address.landmark}</p>}
                          <p>
                            {address.district && `${address.district}, `}
                            {address.state} - {address.pincode}
                          </p>
                          {address.mobile && (
                            <p className="pt-2">
                              <span className="font-medium text-foreground">Phone:</span> {address.mobile}
                            </p>
                          )}
                          {address.email && (
                            <p>
                              <span className="font-medium text-foreground">Email:</span> {address.email}
                            </p>
                          )}
                          {address.label && (
                            <Badge variant="secondary" className="mt-2">{address.label}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default UserDetail;


