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
  IndianRupee,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusColorClass } from '../components/order/StatusBadge';
import { formatDate } from '../utils/date';
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="w-fit -ml-4" asChild>
          <Link to="/customers" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Customer</h1>
      </div>

      {/* User Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">{user.displayName || user.name || 'No name'}</h2>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {user.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {user.email}
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {user.dial_code ? `${user.dial_code} ` : ''}{user.phone}
                    </div>
                  )}
                  {user.gstin && (
                    <div className="text-xs">GSTIN: {user.gstin}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:items-end gap-2 text-sm">
              <div className="flex items-center gap-1 text-lg font-semibold">
                <IndianRupee className="h-4 w-4" />
                {totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className="text-muted-foreground">
                lifetime across {orders.length} order{orders.length === 1 ? '' : 's'}
              </div>
              {user.b2b?.is_b2b && (
                <Badge variant="secondary" className="w-fit">B2B account</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <p className="text-muted-foreground">No orders found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_id}</TableCell>
                        <TableCell>{fmtRupees(order.total || 0)}</TableCell>
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


